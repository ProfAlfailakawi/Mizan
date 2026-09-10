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
  const { nationalIdOrPassport, documents, journeyAccessToken, guardianAccessToken, ...rest } = participant;
  const trimmed = String(nationalIdOrPassport || '').trim();
  const last4 = trimmed.length > 4 ? trimmed.slice(-4) : trimmed;
  return { ...rest, ...(last4 ? { identityLast4: last4 } : {}) } as Participant;
}

/*
 * توكنا الرحلة والوليّ اعتمادا وصول حقيقيان: من يملك التوكن يفتح بوابة المتسابق. فلا يبقيان
 * على الجهاز. وتبقى بصمتاهما (وهما بصمتا معرّف عشوائي طويل، لا يُستخرج منهما شيء) لتكونا
 * الدليل على أن التوكن **موجود** وإن غاب عن هذا الجهاز.
 */
export function journeyTokenWithheldLocally(participant: Participant): boolean {
  return !participant.journeyAccessToken && !!participant.journeyAccessTokenHash;
}

/**
 * يُطابق ما كتبه الموظف مع ما بقي محليًا.
 *
 * الرجوع إلى آخر أربعة محارف **بديلٌ عند فقد الرقم لا إضافةٌ إليه**: لو قبلناه والرقم الكامل
 * حاضر، لطابق رقمٌ خاطئ ينتهي بالمحارف نفسها — فيظهر متسابق آخر عند مكتب الاستثناءات، وقد
 * يُعاد إصدار اعتماد لغير صاحبه.
 */
export function participantMatchesIdentityQuery(participant: Participant, query: string): boolean {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return false;
  const fullIdentity = String(participant.nationalIdOrPassport || '').trim();
  const haystack = `${participant.code} ${participant.fullName} ${participant.fullNameArabic} ${fullIdentity}`.toLowerCase();
  if (haystack.includes(needle)) return true;
  if (fullIdentity) return false;
  const tail = needle.length > 4 ? needle.slice(-4) : needle;
  return !!participant.identityLast4 && participant.identityLast4.toLowerCase() === tail;
}

/*
 * حجب على مستوى الحالة كلها: المتسابق يعيش في موضعين — المصفوفة، والجلسة الجارية.
 * الاكتفاء بأحدهما يُبقي نسخة كاملة تُكتب مع كل تحديث أثناء التحكيم، وهو أسوأ الأوقات.
 */
export function redactStateForLocalSnapshot<T extends { participants: Participant[]; activeSession?: { participant: Participant | null } | null }>(state: T): T {
  const activeSession = state.activeSession;
  return {
    ...state,
    participants: state.participants.map(redactParticipantForLocalSnapshot),
    ...(activeSession?.participant
      ? { activeSession: { ...activeSession, participant: redactParticipantForLocalSnapshot(activeSession.participant) } }
      : {}),
  };
}
