import type { Committee, CompetitionPolicy, Participant, RuleSet } from '../types';

/*
 * ما يُقرَّر لحظة بدء أول جلسة.
 *
 * قراران هنا، وأحدهما يمسّ عدالة المسابقة لا مظهرها:
 *
 *   ١) **تجميد اللائحة.** عند بدء أوّل جلسة تُختم سياسةُ التحكيم ولائحته بطابع زمني، فلا
 *      يستطيع أحد — ولا مدير المسابقة — أن يغيّر قواعد التقييم بعد أن بدأ التحكيم. ولو
 *      انكسر هذا لأمكن تعديل قواعد التصحيح **أثناء** الجلسات، وهذا ليس عطلًا في شاشة بل
 *      خللٌ في نزاهة المسابقة. والتجميد يقع **مرّة واحدة**: لائحةٌ جُمّدت لا تُجمَّد ثانيةً
 *      بطابعٍ جديد، وإلا لأمكن تحريكها بتكرار الفعل.
 *
 *   ٢) **اختيار اللجنة.** اللجنة المسندة إن خلت من تعارضٍ قاطع، وإلا فأوّل لجنةٍ مؤهَّلة.
 *      وبلا لجنةٍ آمنة لا تبدأ الجلسة — يُفتح بلاغٌ ويُترك الأمر لإنسان.
 */

export type SessionStartDecision =
  | { kind: 'no-participant' }
  | { kind: 'no-safe-committee' }
  | { kind: 'start'; committee: Committee };

export function chooseSessionCommittee(args: {
  participant: Participant | undefined;
  assignedCommittee: Committee | undefined;
  assignedHasHardConflict: boolean;
  compatibleCommittees: Committee[];
}): SessionStartDecision {
  const { participant, assignedCommittee, assignedHasHardConflict, compatibleCommittees } = args;
  if (!participant) return { kind: 'no-participant' };
  const committee = (assignedCommittee && !assignedHasHardConflict) ? assignedCommittee : compatibleCommittees[0];
  /* لا لجنةً آمنة ⇒ لا تبدأ الجلسة. إسنادٌ خاطئ أسوأ من انتظار. */
  if (!committee) return { kind: 'no-safe-committee' };
  return { kind: 'start', committee };
}

export type FrozenRules = { policy: CompetitionPolicy; ruleSet: RuleSet; ruleSets: RuleSet[] };

/**
 * تجميد اللائحة — إن لم تكن مجمّدة. يُعيد `null` حين لا شيء يتغيّر، فلا تُكتب حالةٌ بلا سبب.
 */
export function freezeRulesOnce(args: {
  policy: CompetitionPolicy;
  ruleSet: RuleSet;
  ruleSets?: RuleSet[];
  now: string;
}): FrozenRules | null {
  const { policy, ruleSet, ruleSets, now } = args;
  if (policy.frozenAt) return null;
  const frozenRuleSet = { ...ruleSet, frozenAt: now };
  return {
    policy: { ...policy, frozenAt: now, updatedAt: now },
    ruleSet: frozenRuleSet,
    ruleSets: [frozenRuleSet, ...(ruleSets || []).filter(r => r.id !== frozenRuleSet.id)],
  };
}

/*
 * تقدير الدور: الرقم الذي يقرؤه المتسابق على شاشته.
 *
 * خطؤه لا يفسد نتيجة، لكنه يُفقد الثقة في القاعة — فرقمٌ يقول «دقيقتان» ثم يمضي ربع ساعة
 * أسوأ من ألّا يُقال شيء. ولذلك يحمل التقدير ثقتَه معه، ويُحتسب فيه ما تحت يد اللجنة الآن:
 * جلسةٌ جارية تُحمَّل نحو نصفها المتبقّي، ولجنةٌ متوقّفة تُحمَّل جلسةً كاملة.
 */
export interface QueueEstimate {
  ahead: number;
  estimatedWaitMinutes: number;
  expectedTurnAt: string;
  committeeId: string;
  committeeCode: string;
  basis: { currentCompetitionAverageMinutes: number; activeSession: boolean; paused: boolean; queueSize: number };
  confidence: 'medium' | 'low';
}

export function estimateQueueWait(args: {
  participant: Participant | undefined;
  committee: Committee | undefined;
  committeeQueueInOrder: Participant[];
  fallbackSessionMinutes: number;
  now: number;
}): QueueEstimate | null {
  const { participant, committee, committeeQueueInOrder, fallbackSessionMinutes, now } = args;
  if (!participant || participant.status !== 'in_queue' || !committee) return null;

  const index = Math.max(0, committeeQueueInOrder.findIndex(x => x.id === participant.id));
  /* دقيقتان أرضيّةٌ للمتوسّط: متوسّطٌ صفر أو مفقود يجعل كل التقديرات صفرًا. */
  const avg = Math.max(2, committee.averageSessionMinutes || fallbackSessionMinutes || 8);
  const activeCarry = committee.status === 'testing' ? avg * 0.55 : 0;
  const pauseCarry = committee.status === 'paused' ? avg : 0;
  const estimatedWaitMinutes = Math.max(1, Math.round(index * avg + activeCarry + pauseCarry));
  return {
    ahead: index,
    estimatedWaitMinutes,
    expectedTurnAt: new Date(now + estimatedWaitMinutes * 60000).toISOString(),
    committeeId: committee.id,
    committeeCode: committee.code,
    basis: {
      currentCompetitionAverageMinutes: avg,
      activeSession: committee.status === 'testing',
      paused: committee.status === 'paused',
      queueSize: committeeQueueInOrder.length,
    },
    /* الثقة تنخفض مع البعد: ما بعد الثالث يتراكم عليه خطأ كل من قبله. */
    confidence: index <= 2 ? 'medium' : 'low',
  };
}
