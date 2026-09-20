import type { Committee, Participant } from '../types';

/*
 * التلاوةُ الجارية — ما تعرفه غرفةُ العمليات عن هذه اللحظة، لا ما نتمنّى أن تعرفه.
 *
 * كانت في المستودع لوحةٌ باسم «محاكاة تلاوة حية · القاعة الرئيسية» تعرض كلماتٍ تتحرّك
 * ودرجةً ٩٨٫٠ ووفاقًا ١٠٠٪ — وكلُّها **ثوابتُ مكتوبة في الشيفرة**، وموضعُها موقعُ
 * التعريف. ونقلُها كما هي إلى شاشات التشغيل عرضُ أرقامٍ مصطنعةٍ على أنها تشغيلٌ حقيقي.
 *
 * وموضعُها ليس شاشةَ قاعةٍ أيضًا: شاشاتُ القاعة يراها المنتظرون خلف الباب، وعقدُها
 * «لا يخرج إلا الكود» ولا يُعرض موضعُ جلسةٍ جارية — فعرضُه كشفٌ للسؤال قبل أن يُسأل.
 * فمكانُها غرفةُ العمليات وحدها، ولا يدخلها إلا من يُشغّل.
 *
 * وما يُعرض هنا مقيسٌ من الحالة نفسِها: أيُّ لجنةٍ تختبر الآن، وبأيّ كود، ومنذ متى،
 * وهل صوتُها سليم. ولا درجةَ فيها: الدرجةُ سرٌّ حتى تُعلن.
 */

export interface LiveRecitationRow {
  committeeId: string;
  committeeName: string;
  committeeNameArabic?: string;
  /** الكودُ وحده — لا اسم، كسائر أسطح التشغيل. */
  participantCode: string;
  /** ثوانٍ منذ دخوله الجلسة، أو `undefined` حين لا يُعرف وقتُ الدخول. */
  elapsedSeconds?: number;
  /** هل أثبتت اللجنةُ سلامةَ مدخلها الصوتي. */
  audioOk: boolean;
}

/** آخرُ لحظةٍ دخل فيها هذا المتسابق الجلسة، من سجلّ حالته هو. */
export function sessionStartedAt(participant: Participant): string | undefined {
  const history = participant.statusHistory || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.status === 'in_session' && history[i]?.timestamp) return history[i].timestamp;
  }
  return undefined;
}

/**
 * اللجانُ التي تختبر الآن، بترتيب الأطول جلسةً أوّلًا — لأن الأطولَ هو ما يُسأل عنه.
 *
 * ولا تُعرض لجنةٌ حالتُها «تختبر» ولا متسابقَ لها: تلك حالةٌ عالقة، تظهر في لوحة
 * اللجان بوصفها عطبًا، ولا تُزيَّن هنا بصفٍّ فارغ.
 */
export function liveRecitationRows(
  committees: readonly Committee[],
  participants: readonly Participant[],
  now: number,
): LiveRecitationRow[] {
  const byId = new Map(participants.map(p => [p.id, p] as const));
  const rows: LiveRecitationRow[] = [];
  for (const committee of committees) {
    if (committee.status !== 'testing' || !committee.currentParticipantId) continue;
    const participant = byId.get(committee.currentParticipantId);
    if (!participant || participant.status !== 'in_session') continue;
    const startedAt = sessionStartedAt(participant);
    const started = startedAt ? Date.parse(startedAt) : NaN;
    /* زمنٌ سالبٌ يعني ساعةً غيرَ متّسقة، فلا يُعرض رقمٌ لا معنى له. */
    const elapsed = Number.isFinite(started) && now >= started ? Math.floor((now - started) / 1000) : undefined;
    rows.push({
      committeeId: committee.id,
      committeeName: committee.name,
      ...(committee.nameArabic ? { committeeNameArabic: committee.nameArabic } : {}),
      participantCode: participant.code,
      ...(elapsed !== undefined ? { elapsedSeconds: elapsed } : {}),
      audioOk: committee.audioInputOk === true,
    });
  }
  return rows.sort((a, b) => (b.elapsedSeconds ?? -1) - (a.elapsedSeconds ?? -1));
}
