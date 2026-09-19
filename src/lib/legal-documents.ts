/*
 * الوثائقُ التي يوقّع عليها المتسابق — أو إعلانُ أنها غيرُ منشورة.
 *
 * صفحةُ التسجيل تعرض مربّعًا نصُّه: «أوافق على شروط المشاركة وسياسة الخصوصية». ويُسجَّل
 * قبولُه في `ConsentRecord` بنوعَي `terms` و`privacy`.
 *
 * ولا وجودَ لهاتين الوثيقتين في المنتج: لا صفحة، ولا رابط، ولا نصّ. والنسخةُ التي
 * تُكتب في الأثر هي `policy.version` — **نسخةُ لائحة المسابقة**، وهي شيءٌ آخر تمامًا.
 * فالسجلُّ يقول إن فلانًا وافق على «الشروط نسخة ٧»، ولا شروطَ ولا نسخةَ سبع.
 *
 * وهذا لا يُصلَح باختراع نصّ: الكيانُ القانونيّ الذي ينشر الشروط، ومضمونُها، قرارُ
 * مالكٍ ومسؤوليتُه. فالمعالجةُ أن يُعلَن الأمرُ على حقيقته:
 *
 *   · وثيقةٌ منشورةٌ ⇒ تُعرض بنسختها وتاريخِ سريانها وناشرها، وتُسجَّل الموافقةُ عليها هي.
 *   · غيرُ منشورة ⇒ `LEGAL_DOCUMENT_NOT_PUBLISHED` باسمه، والموافقةُ تُسجَّل بما هي عليه
 *     لا بنسخةٍ مستعارة، ويرفعه فحصُ ما قبل الانطلاق حاجزًا.
 *
 * فلا يُقال للمتسابق إنه وافق على ما لم يره، ولا يُقال للمالك إن الأمر مُعالَج.
 */

/** ما يُطلب من المتسابق التوقيع عليه عند التسجيل. */
export const CONSENT_BACKED_DOCUMENTS = ['terms', 'privacy'] as const;
export type LegalDocumentKind = (typeof CONSENT_BACKED_DOCUMENTS)[number];

/** النسخةُ التي تُكتب في الأثر حين لا وثيقةَ منشورة. صريحةٌ كي لا تُقرأ نسخةً حقيقية. */
export const UNPUBLISHED_CONSENT_VERSION = 'LEGAL_DOCUMENT_NOT_PUBLISHED';

export interface PublishedLegalDocument {
  kind: LegalDocumentKind;
  /** نسخةُ الوثيقة نفسها — لا نسخةُ لائحة المسابقة. */
  version: string;
  effectiveDate: string;
  /** الكيان الناشر كما أعلنه المالك. لا يُشتقّ ولا يُخمَّن. */
  publisher: string;
  url: string;
}

export type LegalDocumentState =
  | PublishedLegalDocument
  | { kind: LegalDocumentKind; code: 'LEGAL_DOCUMENT_NOT_PUBLISHED'; missing: string[] };

export interface LegalDocumentConfig {
  entityName?: string;
  documents?: Partial<Record<LegalDocumentKind, { version?: string; effectiveDate?: string; url?: string }>>;
}

const clean = (value: unknown) => String(value ?? '').trim();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * حالةُ وثيقةٍ بعينها.
 *
 * والنقصُ الجزئيّ ليس نشرًا: رابطٌ بلا نسخة، أو نسخةٌ بلا تاريخ سريان، لا يُحتجّ بها —
 * فلا يُعرف على أيِّ نصٍّ وقَّع الموقِّع ولا متى صار ساريًا. والناقصُ يُذكر بالاسم كي
 * يُعرف ما يُضبط.
 */
export function legalDocumentState(config: LegalDocumentConfig, kind: LegalDocumentKind): LegalDocumentState {
  const entry = config.documents?.[kind] || {};
  const version = clean(entry.version);
  const effectiveDate = clean(entry.effectiveDate);
  const url = clean(entry.url);
  const publisher = clean(config.entityName);

  const missing: string[] = [];
  if (!url) missing.push('url');
  if (!version) missing.push('version');
  if (!ISO_DATE.test(effectiveDate)) missing.push('effectiveDate');
  if (!publisher) missing.push('entityName');
  if (missing.length) return { kind, code: 'LEGAL_DOCUMENT_NOT_PUBLISHED', missing };

  return { kind, version, effectiveDate, publisher, url };
}

/** حارسُ نوعٍ صريح — التضييق على راية منطقية لا يعمل خارج الوضع الصارم. */
export const isPublished = (state: LegalDocumentState): state is PublishedLegalDocument => 'version' in state;

/**
 * النسخةُ التي تُكتب في أثر الموافقة.
 *
 * ولا تُستعار نسخةُ اللائحة: كتابتُها هنا تجعل الأثرَ يشهد بما لم يقع، وهو أسوأ من
 * أثرٍ يقول صراحةً إن الوثيقة لم تُنشر.
 */
export function consentVersionFor(config: LegalDocumentConfig, kind: LegalDocumentKind): string {
  const state = legalDocumentState(config, kind);
  return isPublished(state) ? consentVersionOf(kind, state.version) : UNPUBLISHED_CONSENT_VERSION;
}

/*
 * صيغةُ نسخةِ الموافقة في موضعٍ واحد.
 *
 * فالكاتبُ (التسجيل) والقارئُ (المدقّق) يقرآن الصيغةَ نفسها. ولو كُتبت الصيغةُ مرّتين
 * لافترقتا يومًا في نقطةٍ أو شرطة، فيقرأ المدقّقُ «terms:2.1» نسخةً غير التي كُتبت.
 */
export const consentVersionOf = (kind: LegalDocumentKind, version: string): string => `${kind}:${version}`;

/** ما ينقص النشرةَ كي تجمع موافقةً يُحتجّ بها — فارغةٌ تعني أن كلَّ وثيقةٍ منشورة. */
export function unpublishedConsentDocuments(config: LegalDocumentConfig): LegalDocumentState[] {
  return CONSENT_BACKED_DOCUMENTS
    .map(kind => legalDocumentState(config, kind))
    .filter(state => !isPublished(state));
}

/** يقرأ الإعداد من بيئة التشغيل. لا قيمةَ افتراضية: الكيانُ القانونيّ لا يُخمَّن. */
export function legalConfigFromEnv(env: Record<string, string | undefined>): LegalDocumentConfig {
  return {
    entityName: env.MIZAN_LEGAL_ENTITY_NAME,
    documents: {
      terms: { version: env.MIZAN_LEGAL_TERMS_VERSION, effectiveDate: env.MIZAN_LEGAL_TERMS_EFFECTIVE, url: env.MIZAN_LEGAL_TERMS_URL },
      privacy: { version: env.MIZAN_LEGAL_PRIVACY_VERSION, effectiveDate: env.MIZAN_LEGAL_PRIVACY_EFFECTIVE, url: env.MIZAN_LEGAL_PRIVACY_URL },
    },
  };
}

/* ── سلسلةُ الناشرين: الجهة ← المشغّل ← المنصّة ─────────────────────────────── */

/*
 * ميزان يُباع على ثلاث طبقات: المنصّة، ومشغّلٌ يشتري ويسوّق لجهاته، وجهةٌ تنظّم
 * المسابقة. وكلُّ واحدةٍ تريد اسمَها على وثائقها.
 *
 * والمتسابق يوقّع مرّةً واحدة، فلا بدّ أن يُعرف **على وثيقة مَن** وقّع. فإن لم تنشر
 * الجهةُ وثيقتَها ونزلنا إلى وثيقة المشغّل، فذلك جائزٌ بشرطٍ واحد لا يُتنازل عنه:
 * أن يُعرض اسمُ الناشر الحقيقيّ للمتسابق، ويُكتب في الأثر. أمّا أن تُلبَس وثيقةُ
 * المشغّل اسمَ الجهة فهو عينُ ما نمنعه في النصّ القرآني: نسبةُ شيءٍ إلى غير أهله.
 *
 * ولذلك لا تُعيد هذه الدالّة وثيقةً بلا `publisher` و`level` — ومصدرُهما الحلقةُ
 * التي فازت لا الحلقةُ التي طُلبت.
 */

/** ترتيبُ البحث. الأولى هي مَن يسجّل المتسابقُ عندها. */
export const LEGAL_PUBLISHER_LEVELS = ['organization', 'operator', 'platform'] as const;
export type LegalPublisherLevel = (typeof LEGAL_PUBLISHER_LEVELS)[number];

export interface LegalChainLink {
  level: LegalPublisherLevel;
  config: LegalDocumentConfig;
}

export interface ResolvedLegalDocument extends PublishedLegalDocument {
  /** الطبقةُ التي نُشرت عندها الوثيقة فعلًا. */
  level: LegalPublisherLevel;
  /** صحيحةٌ حين تكون الوثيقةُ لطبقةٍ أعلى من التي يسجّل عندها المتسابق. */
  inherited: boolean;
}

export type LegalResolution =
  | ResolvedLegalDocument
  | {
      kind: LegalDocumentKind;
      code: 'LEGAL_DOCUMENT_NOT_PUBLISHED';
      /** ما ينقص أدنى الطبقات — وهو ما يُعرض للمالك ليضبطه. */
      missing: string[];
      levelsTried: LegalPublisherLevel[];
    };

/**
 * أوّلُ وثيقةٍ **منشورةٍ كاملةً** في السلسلة، ومعها ناشرُها وطبقتُه.
 *
 * والنقصُ الجزئيّ في طبقةٍ ليس نشرًا فيها، فيُمضى إلى ما بعدها؛ ولا تُخلط حقولُ
 * طبقتين في وثيقةٍ واحدة — رابطٌ من هنا ونسخةٌ من هناك وثيقةٌ لم تُنشر قطّ.
 */
export function resolveLegalDocument(chain: readonly LegalChainLink[], kind: LegalDocumentKind): LegalResolution {
  const ordered = [...chain].sort(
    (a, b) => LEGAL_PUBLISHER_LEVELS.indexOf(a.level) - LEGAL_PUBLISHER_LEVELS.indexOf(b.level),
  );
  const levelsTried: LegalPublisherLevel[] = [];
  let lowestMissing: string[] = [];

  for (const link of ordered) {
    levelsTried.push(link.level);
    const state = legalDocumentState(link.config, kind);
    if (isPublished(state)) {
      return { ...state, level: link.level, inherited: link.level !== ordered[0].level };
    }
    if (!lowestMissing.length) lowestMissing = state.missing;
  }

  return { kind, code: 'LEGAL_DOCUMENT_NOT_PUBLISHED', missing: lowestMissing, levelsTried };
}

/** حارسُ نوعٍ للسلسلة — كالذي قبله، وبالسبب نفسه. */
export const isResolved = (value: LegalResolution): value is ResolvedLegalDocument => 'version' in value;

/** ما لم يُنشر في أيّ طبقة. فارغةٌ تعني أن كلَّ وثيقةِ موافقةٍ لها ناشرٌ مُعلَن. */
export function unresolvedConsentDocuments(chain: readonly LegalChainLink[]): LegalResolution[] {
  return CONSENT_BACKED_DOCUMENTS.map(kind => resolveLegalDocument(chain, kind)).filter(state => !isResolved(state));
}
