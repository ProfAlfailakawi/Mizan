/*
 * الأحداثُ التي يؤلّفها الخادم وحده.
 *
 * مسارُ `/api/audit/events` موجودٌ لسببٍ صحيح: أحداثٌ يراها العميل ولا يراها الخادم
 * (فتحُ شاشة، تبديلُ جهاز، إقرارُ مشغّل) تُرفع منه ليُحفظ أثرُها.
 *
 * لكنّ قبولَ **كل** حدثٍ منه يفتح بابًا لا يُغلق: عميلٌ مُعدَّل يرسل `RESULT_PUBLISHED`
 * لنتيجةٍ لم تُنشَر، أو `SCORE_CORRECTED` لتصحيحٍ لم يقع — فيصير السجلُّ الذي يُحتجّ به
 * عند النزاع مؤلَّفًا ممّن يُحتجّ عليه.
 *
 * فالقاعدة: ما يستطيع الخادمُ أن يشهد به بنفسه لا يُقبل من غيره. وهذه قائمتُه، وهي
 * مقروءةٌ من مكانٍ واحد — يقرؤها المسارُ ليمنع، ويقرؤها الاختبار ليتحقّق، فلا يفترقان.
 */

/** ما لا يُقبل من العميل بحال. كلُّ واحدٍ منها يقع على الخادم فيكتبه الخادم. */
export const SERVER_AUTHORED_AUDIT_ACTIONS = [
  'RESULT_SEALED',
  'RESULT_PUBLISHED',
  'RESULT_REOPENED',
  'SCORE_CORRECTED',
  'QUESTION_INVALIDATED',
  'QUESTION_REDRAWN',
  'QUESTION_REPLACED_EMERGENCY',
  'QUESTION_REPLACEMENT_AUTHORIZED',
  'QUESTION_PLAINTEXT_EXPOSED_TO_ASSIGNED_JUDGE',
  'QUESTION_PARTICIPANT_PRESENCE_CONFIRMED',
  'QUESTION_RUNTIME_PROVISIONED_BY_PLATFORM_OPERATOR',
  'PARTICIPANT_READING_CHANGED',
  'COMPETITION_POLICY_CHANGED',
  'PRIVILEGED_OVERRIDE',
  'ROLE_CHANGED',
  'LICENSE_ACTION',
  'ENVELOPE_OPENED',
] as const;

export type ServerAuthoredAuditAction = (typeof SERVER_AUTHORED_AUDIT_ACTIONS)[number];

const SERVER_AUTHORED = new Set<string>(SERVER_AUTHORED_AUDIT_ACTIONS);

/**
 * هل هذا الحدثُ ممّا يشهد به الخادمُ بنفسه؟ المطابقةُ بلا حساسيةٍ لحالة الأحرف ولا
 * للمسافات، فلا يمرّ `result_published ` من الباب الذي يُغلق `RESULT_PUBLISHED`.
 */
export function isServerAuthoredAuditAction(action: unknown): boolean {
  return SERVER_AUTHORED.has(String(action ?? '').trim().toUpperCase());
}
