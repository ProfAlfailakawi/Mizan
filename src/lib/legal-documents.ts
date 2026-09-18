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
  return isPublished(state) ? `${kind}:${state.version}` : UNPUBLISHED_CONSENT_VERSION;
}

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
