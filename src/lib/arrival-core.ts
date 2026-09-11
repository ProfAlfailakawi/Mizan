import type { Committee, Participant } from '../types';

/*
 * بوابة الحضور: أوّل ما يعمل صباح المسابقة، وأقلّ ما يُغتفر فيه الخطأ.
 *
 * ثلاثة قرارات تُتّخذ عند كل مسح، وكلّها كانت مدفونة في المخزن بلا اختبارٍ يُشغّلها:
 *
 *   ١) هل هذا وصولٌ جديد أم مسحٌ مكرّر؟ متسابقٌ يمسح بطاقته مرّتين — أو يصوّر رمزه
 *      فيُمسح عند بوابةٍ أخرى — يجب ألّا يأخذ رقم دورٍ ثانيًا ولا أن تُعاد رحلته إلى
 *      البداية. وهذا أكثر ما يقع فعلًا في قاعةٍ مزدحمة.
 *   ٢) ما رقم دوره؟ يُشتقّ من أكبر رقمٍ قائم، لا من عدد الصفوف — فحذفُ متسابقٍ لا
 *      يُعيد رقمًا مُنح لغيره.
 *   ٣) أيّ لجنةٍ تستقبله؟ أقلّها حِملًا بين اللجان المؤهَّلة، ويُفصل التعادل بمتوسّط
 *      زمن الجلسة فتذهب إلى الأسرع.
 *
 * هنا القرار وحده، نقيًّا. والأثر — سجلّ التدقيق، والحفظ، وتاريخ الحالة — يبقى في
 * المخزن حيث ينتمي.
 */

/** الحالات التي تعني أن الرحلة بدأت فعلًا، فلا يُعاد ترقيمها. */
export const ARRIVED_STATUSES = ['in_queue', 'in_session', 'tested', 'certified'] as const;

export type ArrivalDecision =
  | { kind: 'not-found' }
  | { kind: 'other-competition' }
  | { kind: 'duplicate'; reason: 'already-arrived' | 'already-numbered' }
  | { kind: 'admit'; queueNumber: number; originalQueueNumber: number; queueOrderKey: number; assignedCommitteeId?: string };

/** أكبر رقم دورٍ مُنح في هذه المسابقة، أيًّا كان الحقل الذي حمله. */
export function highestQueueNumber(roster: Participant[], competitionId: string): number {
  return Math.max(0, ...roster
    .filter(p => p.competitionId === competitionId)
    .map(p => p.originalQueueNumber || p.queueNumber || 0));
}

export function highestQueueOrderKey(roster: Participant[], competitionId: string): number {
  return Math.max(0, ...roster
    .filter(p => p.competitionId === competitionId)
    .map(p => p.queueOrderKey || p.originalQueueNumber || p.queueNumber || 0));
}

/** أقلّ اللجان حِملًا، والتعادل للأسرع جلسةً. لا لجنة ⇒ لا إسناد، ولا اختيارٌ عشوائي. */
export function leastLoadedCommittee(pool: Committee[], roster: Participant[], competitionId: string): string | undefined {
  if (!pool.length) return undefined;
  const load = (committeeId: string) => roster.filter(p =>
    p.competitionId === competitionId && p.assignedCommitteeId === committeeId && p.status === 'in_queue').length;
  return [...pool].sort((a, b) => load(a.id) - load(b.id) || a.averageSessionMinutes - b.averageSessionMinutes)[0]?.id;
}

/**
 * قرار البوابة عند مسحٍ واحد.
 *
 * `eligibleCommittees` هي اللجان المؤهَّلة لهذا المتسابق (فئةً وتعارضًا)، و`fallbackCommittees`
 * ما يُلجأ إليه حين لا تؤهّله أيٌّ منها — يقرّرهما المخزن لأنهما يعتمدان على سياسة المسابقة.
 */
export function decideArrival(args: {
  participant: Participant | undefined;
  roster: Participant[];
  competitionId: string;
  eligibleCommittees: Committee[];
  fallbackCommittees: Committee[];
}): ArrivalDecision {
  const { participant, roster, competitionId, eligibleCommittees, fallbackCommittees } = args;
  if (!participant) return { kind: 'not-found' };
  if (participant.competitionId !== competitionId) return { kind: 'other-competition' };

  if ((ARRIVED_STATUSES as readonly string[]).includes(participant.status)) return { kind: 'duplicate', reason: 'already-arrived' };
  /* وصلَ من قبل وأُعطي رقمًا، ثم أُعيد إلى حالةٍ أخرى: الرقم يبقى له. */
  if (participant.checkedInAt && participant.originalQueueNumber) return { kind: 'duplicate', reason: 'already-numbered' };

  const next = highestQueueNumber(roster, competitionId) + 1;
  const pool = eligibleCommittees.length ? eligibleCommittees : fallbackCommittees;
  return {
    kind: 'admit',
    queueNumber: next,
    originalQueueNumber: next,
    queueOrderKey: highestQueueOrderKey(roster, competitionId) + 1,
    /* لجنةٌ أُسندت من قبل لا تُبدَّل عند الوصول. */
    assignedCommitteeId: participant.assignedCommitteeId || leastLoadedCommittee(pool, roster, competitionId),
  };
}

/** البحث بالمعرّف أو بالكود، والكود غير حسّاس لحالة الأحرف. */
export function findByIdOrCode(roster: Participant[], idOrCode: string): Participant | undefined {
  const needle = String(idOrCode || '').trim();
  if (!needle) return undefined;
  return roster.find(p => p.id === needle || p.code.toLowerCase() === needle.toLowerCase());
}
