/*
 * ماذا يُفعل بصفِّ تدقيقٍ ردّه الخادم؟
 *
 * طابورُ المرآة كان يعامل كلَّ ردٍّ غير ناجح معاملةً واحدة: أبقِ الصفَّ وما بعده،
 * وتراجَعْ، وأعِد المحاولة. وهذا صحيحٌ لعطلٍ عابر — شبكةٌ سقطت، خادمٌ مشغول — وكارثيٌّ
 * لرفضٍ دائم.
 *
 * فصفٌّ يردّه الخادم بـ403 لأنه حدثٌ يؤلّفه الخادمُ وحده لن ينجح أبدًا مهما أُعيد. وهو
 * في رأس الطابور، فيسدّه، فلا يصل الخادمَ **أيُّ** حدثٍ بعده ما بقيت الجلسة. والنتيجةُ
 * أنّ الحارسَ الذي بُني ليمنع حدثًا واحدًا مزوَّرًا يمنع كلَّ الأحداث الصادقة.
 *
 * فالقرارُ منطقٌ نقيّ هنا — بلا شبكةٍ ولا تخزين — ليُختبر كما هو، ويقرأه الطابورُ من
 * مكانٍ واحد فلا تفترق السياسةُ عن تنفيذها.
 */

export type AuditRetryDecision =
  /** نجح: يُسقَط من الطابور بلا قيد. */
  | { kind: 'DELIVERED' }
  /** لن ينجح بإعادة المحاولة: يُسقَط **ويُقيَّد بسببه**، ويمضي الطابور إلى ما بعده. */
  | { kind: 'REFUSED_PERMANENTLY'; code: string }
  /** قد ينجح لاحقًا: يبقى هو وما بعده، ويتراجع الطابور المدّةَ المذكورة. */
  | { kind: 'RETRY_LATER'; backoffMs: number };

/*
 * ما لا تُصلحه إعادةُ المحاولة: طلبٌ مرفوض بذاته لا بحال الخادم.
 *
 * 401 ليست منها: الرمزُ ينتهي ويُجدَّد، فإعادةُ المحاولة تصلحه. و429 و5xx حالُ خادمٍ
 * لا حالُ صفّ. و`MFA_REQUIRED` رفضٌ يرفعه المستخدم بخطوةٍ يفعلها، فيبقى الصفُّ منتظرًا.
 */
const PERMANENT_STATUSES = new Set([400, 403, 409, 413, 422]);

/** رفضٌ يرفعه فعلُ المستخدم، فلا يُسقَط الصفّ من أجله. */
const LIFTABLE_BY_USER = new Set(['MFA_REQUIRED']);

export const AUDIT_BACKOFF_SERVER_BUSY_MS = 60_000;
export const AUDIT_BACKOFF_TRANSIENT_MS = 10_000;

/**
 * يقرّر مصيرَ صفٍّ من ردّ الخادم. `code` هو رمزُ الخطأ المُعاد في الجسم إن وُجد.
 */
export function auditRetryDecision(status: number, code?: string): AuditRetryDecision {
  if (status >= 200 && status < 300) return { kind: 'DELIVERED' };
  const named = String(code || '').trim().toUpperCase();
  if (LIFTABLE_BY_USER.has(named)) return { kind: 'RETRY_LATER', backoffMs: AUDIT_BACKOFF_SERVER_BUSY_MS };
  if (PERMANENT_STATUSES.has(status)) return { kind: 'REFUSED_PERMANENTLY', code: named || `HTTP_${status}` };
  return { kind: 'RETRY_LATER', backoffMs: status === 503 ? AUDIT_BACKOFF_SERVER_BUSY_MS : AUDIT_BACKOFF_TRANSIENT_MS };
}
