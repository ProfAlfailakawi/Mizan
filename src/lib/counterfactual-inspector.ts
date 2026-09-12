/*
 * مُفتّش القرار المضادّ.
 *
 * في ميزان اليوم أسبابُ اختيارٍ بنيوية لكل سؤال: كم استُعمل، وما ضغط ندرته، وما انحراف
 * صعوبته، وكم كان البديل الثاني. وهي تجيب عن سؤالٍ ماضٍ: **لماذا اختير هذا؟**
 *
 * وهذا الملف يجيب عن سؤالٍ آخر لا تجيب عنه: **ماذا كان سيحدث لو اختير غيره؟**
 *
 * والفرق عمليّ لا لفظي. «أ كان أقلّ استعمالًا» تفسيرٌ للماضي. أمّا «لو اخترنا ب لارتفع
 * الحدّ الأدنى لأكثر موضعٍ استعمالًا من ١٤ إلى ١٥، ولنقص المخزون النادر بمقدار كذا» فهو
 * تفسيرٌ للمستقبل — وهو الذي يُبنى عليه القرار حين يراجعه إنسان.
 *
 * والحساب بإعادة حلّ المسألة لا بتقدير: يُثبَّت الاختيار، ويُعاد إثبات الأمثل لما بقي،
 * ويُقاس الفرق. مكلفٌ بطبعه، فلا يُنادى في مسار السحب الحيّ — موضعه المراجعة والمختبر.
 */

import {
  BALANCED_OBJECTIVE, measureAssignments, minimizeCost, proveMinimumMaxReuse,
  type OracleBudget, type OracleInstance, type OracleObjective, type OracleStatus,
} from './fairness-oracle';

export interface CounterfactualOutcome {
  locusKey: string;
  status: OracleStatus;
  /** أفضل «أكثرِ استعمال» ممكن لبقيّة المسابقة بعد تثبيت هذا الاختيار. */
  futureMaxReuse: number | null;
  /** أقلّ تكلفةٍ ممكنة للهدف المعلن بعد تثبيته. */
  futureCost: number | null;
  futureTotalRepeats: number | null;
  futureScarcityCost: number | null;
  futureExposureCost: number | null;
  futureDifficultyDeviation: number | null;
}

export interface CounterfactualComparison {
  groupId: string;
  participantId: string;
  chosen: CounterfactualOutcome;
  alternative: CounterfactualOutcome;
  /** ما الذي يتغيّر بالانتقال من المختار إلى البديل. موجبٌ = البديل أسوأ. */
  delta: {
    maxReuse: number | null;
    cost: number | null;
    totalRepeats: number | null;
    scarcityCost: number | null;
    exposureCost: number | null;
    difficultyDeviation: number | null;
  };
  /** حكمٌ بلغةٍ لا تحتمل التأويل، ولا يُقال فيه «أفضل» بلا برهان. */
  ar: string;
  elapsedMs: number;
}

/**
 * تثبيت اختيارٍ واحد.
 *
 * يُقتطع من المجموعة وحدةُ طلبٍ واحدة تُحصر في الموضع المطلوب، ويبقى ما تبقّى من طلبها
 * حرًّا بين بقيّة مواضعها ناقصًا هذا الموضع. وبهذا يكون التثبيت تثبيتًا حقيقيًا — لا
 * ترجيحًا — ويبقى قيدُ التمايز على المتسابق محفوظًا.
 */
function pin(instance: OracleInstance, groupId: string, locusIndex: number): OracleInstance | null {
  const group = instance.groups.find(row => row.groupId === groupId);
  if (!group || !group.eligible.includes(locusIndex)) return null;
  const position = group.eligible.indexOf(locusIndex);
  const pinned = {
    ...group,
    groupId: `${group.groupId}#pinned`,
    demand: 1,
    eligible: [locusIndex],
    eligibleDifficulty: group.eligibleDifficulty ? [group.eligibleDifficulty[position]] : undefined,
    eligibleUncertainty: group.eligibleUncertainty ? [group.eligibleUncertainty[position]] : undefined,
  };
  const restIndexes = group.eligible.filter(index => index !== locusIndex);
  const rest = {
    ...group,
    demand: group.demand - 1,
    eligible: restIndexes,
    eligibleDifficulty: group.eligibleDifficulty ? restIndexes.map(index => group.eligibleDifficulty![group.eligible.indexOf(index)]) : undefined,
    eligibleUncertainty: group.eligibleUncertainty ? restIndexes.map(index => group.eligibleUncertainty![group.eligible.indexOf(index)]) : undefined,
  };
  const groups = instance.groups.flatMap(row => {
    if (row.groupId !== groupId) return [row];
    return rest.demand > 0 ? [pinned, rest] : [pinned];
  });
  return { ...instance, groups };
}

function evaluate(instance: OracleInstance, locusKey: string, objective: OracleObjective, budget?: OracleBudget): CounterfactualOutcome {
  const ceiling = Number.isFinite(instance.policyMaxUses) ? instance.policyMaxUses : Math.max(1, instance.totalDemand);
  const reuse = proveMinimumMaxReuse(instance, { budget });
  const cost = minimizeCost(instance, { maxUses: ceiling, objective, budget });
  const metrics = cost.assignments.length ? measureAssignments(instance, cost.assignments) : null;
  return {
    locusKey,
    status: reuse.status === 'proven_optimal' ? cost.status : reuse.status,
    futureMaxReuse: reuse.provenOptimum,
    futureCost: cost.cost,
    futureTotalRepeats: metrics?.totalRepeats ?? null,
    futureScarcityCost: metrics?.scarcityCost ?? null,
    futureExposureCost: metrics?.exposureCost ?? null,
    futureDifficultyDeviation: metrics?.difficultyDeviation ?? null,
  };
}

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : Number((b - a).toFixed(4)));

/**
 * المقارنة: المختار مقابل البديل.
 *
 * والصياغة تلتزم حدّ الصدق نفسه: إن لم يثبت الحلّال الأمثل في إحدى الحالتين لم يقل «أفضل»
 * ولا «أسوأ» — قال إن المقارنة غير محسومة. ومقارنةٌ بين رقمين أحدهما غير مُثبَت ليست مقارنة.
 */
export function compareCounterfactual(input: {
  instance: OracleInstance;
  groupId: string;
  chosenLocusKey: string;
  alternativeLocusKey: string;
  objective?: OracleObjective;
  budget?: OracleBudget;
}): CounterfactualComparison | null {
  const startedAt = Date.now();
  const objective = input.objective || BALANCED_OBJECTIVE;
  const group = input.instance.groups.find(row => row.groupId === input.groupId);
  if (!group) return null;
  const indexOfKey = (key: string) => input.instance.loci.findIndex(locus => locus.locusKey === key);
  const chosenIndex = indexOfKey(input.chosenLocusKey);
  const alternativeIndex = indexOfKey(input.alternativeLocusKey);
  if (chosenIndex < 0 || alternativeIndex < 0) return null;

  const chosenInstance = pin(input.instance, input.groupId, chosenIndex);
  const alternativeInstance = pin(input.instance, input.groupId, alternativeIndex);
  if (!chosenInstance || !alternativeInstance) return null;

  const chosen = evaluate(chosenInstance, input.chosenLocusKey, objective, input.budget);
  const alternative = evaluate(alternativeInstance, input.alternativeLocusKey, objective, input.budget);

  const delta = {
    maxReuse: diff(chosen.futureMaxReuse, alternative.futureMaxReuse),
    cost: diff(chosen.futureCost, alternative.futureCost),
    totalRepeats: diff(chosen.futureTotalRepeats, alternative.futureTotalRepeats),
    scarcityCost: diff(chosen.futureScarcityCost, alternative.futureScarcityCost),
    exposureCost: diff(chosen.futureExposureCost, alternative.futureExposureCost),
    difficultyDeviation: diff(chosen.futureDifficultyDeviation, alternative.futureDifficultyDeviation),
  };

  const decided = chosen.status === 'proven_optimal' && alternative.status === 'proven_optimal';
  const ar = !decided
    ? `المقارنة غير محسومة: لم يُثبت الحلّال الأمثل في إحدى الحالتين (${chosen.status} / ${alternative.status}).`
    : delta.maxReuse !== null && delta.maxReuse > 0
      ? `اختيار «${input.alternativeLocusKey}» بدل «${input.chosenLocusKey}» يرفع أفضلَ «أكثرِ استعمال» ممكن لما تبقّى من ${chosen.futureMaxReuse} إلى ${alternative.futureMaxReuse}.`
      : delta.maxReuse !== null && delta.maxReuse < 0
        ? `اختيار «${input.alternativeLocusKey}» كان يخفض أفضلَ «أكثرِ استعمال» ممكن لما تبقّى من ${chosen.futureMaxReuse} إلى ${alternative.futureMaxReuse}.`
        : `الاختياران متساويان في أفضل «أكثرِ استعمال» ممكن (${chosen.futureMaxReuse})؛ الفرق في التكلفة المركّبة ${delta.cost ?? '—'}.`;

  return { groupId: input.groupId, participantId: group.participantId, chosen, alternative, delta, ar, elapsedMs: Date.now() - startedAt };
}
