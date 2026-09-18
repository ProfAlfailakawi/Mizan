/*
 * سجلُّ الأختام — ليُعاد الختمُ نفسه لا ختمٌ ثانٍ.
 *
 * `sealResult` دالّةٌ بلا حالة، وتضع `sealedAt` في بصمتها. فنداءان بنفس المدخلات — وهو
 * ما يقع عند انقطاع شبكةٍ بعد نجاح الخادم، أو عند ضغطةٍ مزدوجة، أو عند إعادة محاولةٍ
 * تلقائية — يخرجان ببصمتَي ختمٍ مختلفتين لنفس الدرجة، ويكتبان صفَّي تدقيقٍ لحدثٍ واحد.
 *
 * ونتيجةُ ذلك ليست تجميلية: المدقّق يرى ختمين لنفس المشارك بنفس الرقم وببصمتين، فلا يعرف
 * أيّهما المعتمَد، ويبدو الأمرُ كأن النتيجة أُعيد ختمها لسببٍ لم يُذكر.
 *
 * فالسجلُّ هنا يميّز حالتين لا يجوز خلطهما:
 *   · **نفسُ المدخلات** ⇒ نفسُ الختم يُعاد حرفًا بحرف، بلا صفِّ تدقيقٍ ثانٍ.
 *   · **مدخلاتٌ تغيّرت** ⇒ ختمٌ جديد يعلن ما نسخه (`supersedes`) — وهو إعادةُ ختمٍ حقيقية.
 *
 * والتخزينُ خلف واجهة: الملفُّ المحلّي مهايئُ تطوير، والإنتاج متعدّدُ النسخ يحتاج تخزينًا
 * مشتركًا دائمًا. ولا يُبنى المنطق على أن التخزين محلّي.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface SealRegistryRecord {
  organizationId: string;
  competitionId: string;
  participantId: string;
  sessionId: string;
  /** بصمةُ المدخلات التي حُسب منها هذا الختم — هي مفتاح «هل هذا نفس الطلب؟». */
  inputsSha256: string;
  sealSha256: string;
  sealedBy: string;
  sealedAt: string;
  finalScore: number;
  /** الختم كما صدر، ليُعاد حرفًا بحرف. */
  sealed: Record<string, unknown>;
}

/** التخزين خلف واجهة، فلا يُبنى المنطق على أن السجلّ ملفٌّ محلّي. */
export interface SealRegistryStore {
  read(organizationId: string, competitionId: string): SealRegistryRecord[];
  append(record: SealRegistryRecord): void;
}

const safe = (value: string) => String(value || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

/**
 * مهايئ تطويرٍ على القرص المحلّي.
 *
 * لا يصلح وحده لإنتاجٍ متعدّد النسخ: نسختان خلف موازِن حِمل لا تريان ملفَّ بعضهما، فيقع
 * ختمان لنفس المدخلات. وهو مكتوبٌ هنا صراحةً حتى لا يُسلَّم على أنه كافٍ.
 */
export class FileSealRegistryStore implements SealRegistryStore {
  readonly durability = 'LOCAL_DISK_DEVELOPMENT_ADAPTER' as const;

  constructor(private readonly dir: string) {
    if (!dir) throw new Error('SEAL_REGISTRY_DIR_REQUIRED');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  private file(organizationId: string, competitionId: string) {
    return path.join(this.dir, `seals-${safe(organizationId)}-${safe(competitionId)}.jsonl`);
  }

  read(organizationId: string, competitionId: string): SealRegistryRecord[] {
    const file = this.file(organizationId, competitionId);
    if (!fs.existsSync(file)) return [];
    try {
      return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as SealRegistryRecord);
    } catch { throw new Error('SEAL_REGISTRY_CORRUPT'); }
  }

  append(record: SealRegistryRecord): void {
    fs.appendFileSync(this.file(record.organizationId, record.competitionId), `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

/** مهايئٌ في الذاكرة — للاختبار ولنسخةٍ واحدةٍ عابرة، لا للإنتاج. */
export class MemorySealRegistryStore implements SealRegistryStore {
  readonly durability = 'IN_MEMORY_TEST_ADAPTER' as const;
  private readonly rows: SealRegistryRecord[] = [];
  read(organizationId: string, competitionId: string) {
    return this.rows.filter(r => r.organizationId === organizationId && r.competitionId === competitionId);
  }
  append(record: SealRegistryRecord) { this.rows.push(record); }
}

export interface SealRecordOutcome {
  record: SealRegistryRecord;
  /** `true` = هذا النداء لم يُنشئ شيئًا؛ أُعيد ختمٌ قائم. فلا يُكتب أثرٌ ثانٍ. */
  idempotent: boolean;
}

export class ResultSealRegistry {
  constructor(private readonly store: SealRegistryStore) {}

  /** الختمُ القائم لنفس المدخلات بالضبط، أو `undefined`. */
  findByInputs(organizationId: string, competitionId: string, participantId: string, inputsSha256: string): SealRegistryRecord | undefined {
    return this.store.read(organizationId, competitionId)
      .find(r => r.participantId === participantId && r.inputsSha256 === inputsSha256);
  }

  /** آخرُ ختمٍ لهذا المشارك — يُقرأ لمعرفة من ختم، وعليه يقوم فصلُ المهامّ. */
  latestFor(organizationId: string, competitionId: string, participantId: string): SealRegistryRecord | undefined {
    return this.store.read(organizationId, competitionId)
      .filter(r => r.participantId === participantId)
      .sort((a, b) => a.sealedAt.localeCompare(b.sealedAt))
      .at(-1);
  }

  /** من ختم في هذه المسابقة — مجموعةٌ تُقرأ عند فحص فصل المهامّ على الخادم. */
  sealersOf(organizationId: string, competitionId: string): Set<string> {
    return new Set(this.store.read(organizationId, competitionId).map(r => r.sealedBy));
  }

  /**
   * يُسجّل ختمًا. نفسُ المدخلات تعيد القائم بلا كتابةٍ جديدة — وهذه هي الدلالة الصحيحة:
   * النداء الثاني يقول «تمّ» ولا يفعل شيئًا.
   */
  record(candidate: SealRegistryRecord): SealRecordOutcome {
    const existing = this.findByInputs(candidate.organizationId, candidate.competitionId, candidate.participantId, candidate.inputsSha256);
    if (existing) return { record: existing, idempotent: true };
    this.store.append(candidate);
    return { record: candidate, idempotent: false };
  }
}
