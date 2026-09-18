/*
 * نشرُ النتائج: قرارٌ يشهد به الخادم.
 *
 * النشرُ كان يقع في العميل وحده: هو يفحص فصلَ المهامّ، وهو يكتب حدثَ «نُشرت النتائج»
 * في السجلّ. وقواعدُ Firestore تحرس الكتابة نفسها — وهذا حقيقيّ — لكنّ **الأثر** الذي
 * يُحتجّ به عند النزاع كان يؤلّفه العميل. فعميلٌ مُعدَّل يكتب `RESULTS_PUBLISHED` لمسابقةٍ
 * لم تُنشر نتائجُها فيبدو أنها نُشرت، أو يسكت عن نشرٍ وقع.
 *
 * فالنشرُ يمرّ من هنا: الخادمُ يتحقّق من هويةِ الفاعل، ويطبّق فصلَ المهامّ بنفسه بدل أن
 * يأتمن فحصَ العميل، ثم يكتب الأثر باسمه. ولا تُقبل درجةٌ ولا قائمةُ أختامٍ من الطلب:
 * الأختامُ تُقرأ من سجلّ الأختام الذي كتبه الخادمُ حين ختم.
 *
 * والقرارُ منطقٌ نقيّ هنا ليُختبر بلا شبكةٍ ولا تخزين.
 */

export interface PublicationRecord {
  organizationId: string;
  competitionId: string;
  /** هويةُ الناشر المُصدَّقة، لا اسمًا يرسله العميل عن نفسه. */
  publishedBy: string;
  publishedAt: string;
  /** كم ختمًا شمله النشر — يُقرأ في التدقيق ويكشف نشرًا على سجلٍّ ناقص. */
  sealCount: number;
}

export type PublicationDecision =
  | { code: 'RESULT_PUBLICATION_NO_SEALED_RESULTS' }
  | { code: 'RESULT_PUBLICATION_SOD_BLOCKED' }
  /** نُشرت من قبل: يُعاد المسجَّل كما هو بلا أثرٍ ثانٍ ولا إشعارٍ ثانٍ. */
  | { publish: false; idempotent: true; record: PublicationRecord }
  | { publish: true; sealCount: number };

export interface PublicationRequest {
  /** الهويةُ المُصدَّقة للطلب. */
  actorUid: string;
  /** من ختم نتائجَ هذه المسابقة — من سجلّ الأختام، لا من الطلب. */
  sealers: ReadonlySet<string>;
  sealCount: number;
  existing?: PublicationRecord;
}

/**
 * يقرّر ما إذا كان هذا النشرُ يقع.
 *
 * فصلُ المهامّ هنا هو نفسُه الذي تفرضه قاعدةُ Firestore على كلِّ وثيقة: من ختم لا ينشر.
 * فإن كان الفاعلُ قد ختم **أيًّا** من نتائج هذه المسابقة رُفض النشرُ كلُّه، لأن نشرَه
 * سيخالف القاعدةَ على تلك الوثيقة بعينها.
 */
export function publicationDecision(request: PublicationRequest): PublicationDecision {
  if (request.existing) return { publish: false, idempotent: true, record: request.existing };
  // نشرٌ بلا ختمٍ واحد ليس نشرًا: هو إعلانُ نتائج لم تُحسم.
  if (request.sealCount <= 0) return { code: 'RESULT_PUBLICATION_NO_SEALED_RESULTS' };
  if (!request.actorUid) return { code: 'RESULT_PUBLICATION_SOD_BLOCKED' };
  if (request.sealers.has(request.actorUid)) return { code: 'RESULT_PUBLICATION_SOD_BLOCKED' };
  return { publish: true, sealCount: request.sealCount };
}

/** سجلُّ النشر — نفسُ نمط سجلّ الأختام: واجهةٌ، ومهايئٌ يعلن دوامَه. */
export interface PublicationStore {
  read(organizationId: string, competitionId: string): PublicationRecord | undefined;
  write(record: PublicationRecord): void;
}

export class MemoryPublicationStore implements PublicationStore {
  private readonly rows = new Map<string, PublicationRecord>();
  private key(o: string, c: string) { return `${o}::${c}`; }
  read(organizationId: string, competitionId: string) { return this.rows.get(this.key(organizationId, competitionId)); }
  write(record: PublicationRecord) { this.rows.set(this.key(record.organizationId, record.competitionId), record); }
}

/*
 * مهايئُ قرصٍ محلّي — نفسُ تحفّظ سجلّ الأختام: لا يصلح وحده لإنتاجٍ متعدّد النسخ،
 * ويقول ذلك عن نفسه بدل أن يُسلَّم على أنه كافٍ.
 */
export class FilePublicationStore implements PublicationStore {
  readonly durability = 'LOCAL_DISK_DEVELOPMENT_ADAPTER' as const;

  constructor(private readonly dir: string, private readonly fs: typeof import('node:fs'), private readonly path: typeof import('node:path')) {
    if (!dir) throw new Error('PUBLICATION_STORE_DIR_REQUIRED');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  private file(organizationId: string, competitionId: string) {
    const safe = (value: string) => String(value || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
    return this.path.join(this.dir, `published-${safe(organizationId)}-${safe(competitionId)}.json`);
  }

  read(organizationId: string, competitionId: string): PublicationRecord | undefined {
    try {
      const raw = this.fs.readFileSync(this.file(organizationId, competitionId), 'utf8');
      const parsed = JSON.parse(raw) as PublicationRecord;
      return parsed && parsed.competitionId === competitionId ? parsed : undefined;
    } catch { return undefined; }
  }

  write(record: PublicationRecord) {
    // كتابةٌ ذرّية: ملفٌّ مؤقّت ثم نقل، فلا يُقرأ نصفُ سجلّ نشرٍ عند انقطاع.
    const target = this.file(record.organizationId, record.competitionId);
    const temp = `${target}.${process.pid}.tmp`;
    this.fs.writeFileSync(temp, JSON.stringify(record), { mode: 0o600 });
    this.fs.renameSync(temp, target);
  }
}
