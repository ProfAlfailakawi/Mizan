import type { Participant } from '../types';

/*
 * حجب بيانات الهوية عن النسخة المحلية.
 *
 * النسخة المحلية تبقى على الجهاز بلا انتهاء: الخروج التلقائي يُنهي الجلسة ولا يمسحها، وقراءتها
 * لا تتطلب تسجيل دخول أصلًا. فجهاز ضائع أو مشترك يكشف أرقام هويات وجوازات كل المشاركين.
 *
 * الحقل يُحذف حذفًا ولا يُستبدل بقناع: الكتابة إلى الخادم دمج (merge)، فالحقل الغائب يُبقي
 * القيمة الحقيقية هناك سليمة، أما قناعٌ مكتوب فكان سيدهسها.
 *
 * ويبقى آخر أربعة محارف لتظل المطابقة عند مكتب الاستثناءات ممكنة دون اتصال. وهي لا تعتمد على
 * شكل الرقم، فتتصرّف بالطريقة نفسها مع أي دولة — والبرنامج ليس لدولة واحدة.
 */

/** حقول مشتقّة محليًا لا تُرفع إلى الخادم: مصدرها الحقيقي هناك ولا يُكتب فوقه بمشتقّ ناقص. */
export const LOCAL_ONLY_PARTICIPANT_FIELDS = ['identityLast4'] as const;

export function redactParticipantForLocalSnapshot(participant: Participant): Participant {
  const { nationalIdOrPassport, documents, ...rest } = participant;
  const trimmed = String(nationalIdOrPassport || '').trim();
  const last4 = trimmed.length > 4 ? trimmed.slice(-4) : trimmed;
  return { ...rest, ...(last4 ? { identityLast4: last4 } : {}) } as Participant;
}

/** يُطابق ما كتبه الموظف مع ما بقي محليًا: الرقم الكامل إن كان حاضرًا، وإلا آخر أربعة محارف. */
export function participantMatchesIdentityQuery(participant: Participant, query: string): boolean {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return false;
  const haystack = `${participant.code} ${participant.fullName} ${participant.fullNameArabic} ${participant.nationalIdOrPassport || ''}`.toLowerCase();
  if (haystack.includes(needle)) return true;
  const tail = needle.length > 4 ? needle.slice(-4) : needle;
  return !!participant.identityLast4 && participant.identityLast4.toLowerCase() === tail;
}
