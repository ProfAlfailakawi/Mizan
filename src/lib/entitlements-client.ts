/*
 * قياس ما تستعمله الجهة فعلًا — وإلا فحدودُ الترخيص أرقامٌ لا يبلغها شيء.
 *
 * في ميزان نموذجُ تراخيص كامل ومُختبَر على الخادم: خططٌ وحدودٌ وفواتير، ورفضٌ صريح عند
 * تجاوز عدد المتسابقين السنوي أو عدد المسابقات النشطة. لكن لا أحد كان ينادي نقاط
 * القياس، فالعدّادات تبقى صفرًا مهما جرى — وحدٌّ لا يُقاس ليس حدًّا.
 *
 * وقاعدتان تحكمان هذا الملف:
 *
 *   ١. **لا يوقف القياسُ عملًا قائمًا.** تسجيلُ متسابقٍ لا يُلغى لأن عدّادًا تجاريًّا
 *      تعذّر، ولا لأن الشبكة سقطت. فكلّ نداءٍ هنا يعيد نتيجةً ولا يرمي، والمنعُ يقع في
 *      موضعه الصحيح: فحصُ ما قبل الانطلاق وبوابةُ الخادم، لا منتصفُ نموذج تسجيل.
 *   ٢. **الخادم هو الحكم.** الحدود تُقرأ وتُطبَّق هناك؛ وهذا الملف يبلّغ ويقرأ الجواب،
 *      ولا يقرّر استحقاقًا في المتصفّح.
 */

import { auth } from './firebase';

export type EntitlementIssue =
  | 'ANNUAL_PARTICIPANT_LIMIT_REACHED'
  | 'ACTIVE_COMPETITION_LIMIT_REACHED'
  | 'LICENSE_NOT_FOUND'
  | 'PARTICIPANT_USAGE_REQUIRES_PUBLISHED_COMPETITION'
  | 'TENANT_SUSPENDED'
  | 'IDENTITY_REQUIRED'
  | 'COMMERCIAL_BACKEND_UNAVAILABLE'
  | 'ENTITLEMENT_CALL_FAILED';

export interface EntitlementResult {
  ok: boolean;
  /** رمزُ المانع حين يرفض الخادم — يُعرض من فهرس الأعطال، ولا يُخترع هنا. */
  issue?: EntitlementIssue;
  /** هل هذا رفضٌ بحدٍّ تجاري (يُعرض للمسؤول) أم تعذّرٌ تقني (يُسجَّل ولا يُزعج)؟ */
  limitReached: boolean;
}

const LIMIT_CODES = new Set<EntitlementIssue>([
  'ANNUAL_PARTICIPANT_LIMIT_REACHED',
  'ACTIVE_COMPETITION_LIMIT_REACHED',
  'TENANT_SUSPENDED',
]);

const ok = (): EntitlementResult => ({ ok: true, limitReached: false });
const failed = (issue: EntitlementIssue): EntitlementResult => ({ ok: false, issue, limitReached: LIMIT_CODES.has(issue) });

async function post(path: string, body: unknown): Promise<EntitlementResult> {
  const user = auth.currentUser;
  if (!user) return failed('IDENTITY_REQUIRED');
  let response: Response;
  try {
    const token = await user.getIdToken();
    response = await fetch(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    /* شبكةٌ ساقطة ليست تجاوزَ حدّ. تُسجَّل ولا تُعرض للمسؤول كأنها رفضُ ترخيص. */
    return failed('COMMERCIAL_BACKEND_UNAVAILABLE');
  }
  if (response.ok) return ok();
  if (response.status === 503) return failed('COMMERCIAL_BACKEND_UNAVAILABLE');
  const payload = await response.json().catch(() => ({}));
  const code = String((payload as { code?: string }).code || '');
  return failed((LIMIT_CODES.has(code as EntitlementIssue) || code === 'LICENSE_NOT_FOUND'
    || code === 'PARTICIPANT_USAGE_REQUIRES_PUBLISHED_COMPETITION')
    ? code as EntitlementIssue
    : 'ENTITLEMENT_CALL_FAILED');
}

/**
 * يسجّل متسابقًا في عدّاد الاستعمال السنوي. النداء مُعاد الاستعمال على الخادم: تسجيل
 * المتسابق نفسه مرّتين في السنة نفسها يعيد الصفّ القائم ولا يضاعف العدّ.
 */
export function recordParticipantUsage(input: { competitionId: string; participantId: string; organizationId?: string }) {
  return post('/api/saas/usage/participants', input);
}

/** يسجّل حالة المسابقة التجارية. الانتقال إلى حالةٍ نشطة هو ما يقيس حدّ المسابقات. */
export function recordCompetitionState(input: { competitionId: string; state: string; organizationId?: string }) {
  return post(`/api/saas/usage/competitions/${encodeURIComponent(input.competitionId)}/state`, {
    state: input.state,
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  });
}

/**
 * يسجّل دفعةً من المتسابقين ويعيد أول مانعٍ تجاري إن وقع. لا يتوقّف عند تعذّرٍ تقني:
 * الاستيراد تمّ محليًّا، والقياس إبلاغٌ لا شرطٌ لصحّته.
 */
export async function recordParticipantBatchUsage(
  competitionId: string,
  participantIds: readonly string[],
  organizationId?: string,
): Promise<EntitlementResult> {
  let firstLimit: EntitlementResult | undefined;
  for (const participantId of participantIds) {
    const result = await recordParticipantUsage({ competitionId, participantId, ...(organizationId ? { organizationId } : {}) });
    if (!result.ok && result.limitReached && !firstLimit) firstLimit = result;
  }
  return firstLimit || ok();
}
