/*
 * التوأم الرقمي — تشغيل المسابقة افتراضيًا قبل أن تُشغَّل حقيقة.
 *
 * يأخذ المسابقة بفئاتها ومتسابقيها ونطاقاتهم وبنكها وسياساتها، ويُجري كل عمليات السحب
 * بالمحرك نفسه الذي سيعمل يوم المسابقة — لا بمحاكٍ مبسّط — ثم يقيس:
 * الكفاية، والتكرار الحتمي مقابل التكرار الذي سببته الخوارزمية، وتوزيع الحمل، وعدالة
 * النماذج، وخروقات النطاق والرواية (ويجب أن تكون صفرًا)، والزمن.
 *
 * ولا يمسّ بيانات التشغيل: حالته كلها داخل هذه الدالة.
 */

import { describeScope, scopeAyahCount, scopeSignature, type QuranScope } from './quran-scope';
import { resolveZoneSlots, type QuestionDistributionPlan } from './question-zones';
import {
  QuestionAllocationEngine, candidatesInScope, locusKeyOf, uniqueLocusCount,
  type QuestionCandidate, type ReadingContext, type SelectionResult,
} from './question-engine';
import { theoreticalRepeatFloor, type RepeatPolicy } from './repeat-policy';
import { analyzeDemand, buildDemandGroups, buildGroupScarcityOracle, zoneAwareReuseLowerBound, type DemandAnalysis, type ReuseLowerBound } from './scope-demand';

export interface TwinParticipant {
  participantId: string;
  categoryId: string;
  scope: QuranScope;
  questionCount: number;
  reading?: ReadingContext;
  hallId?: string;
  day?: string;
  stage?: string;
}

export interface TwinInput {
  competitionId: string;
  participants: TwinParticipant[];
  candidates: QuestionCandidate[];
  distributionPlanByCategory?: Record<string, QuestionDistributionPlan>;
  defaultPlan?: QuestionDistributionPlan;
  repeatPolicy: RepeatPolicy;
  targetDifficulty?: number;
  seed: string;
  requireReviewedDifficulty?: boolean;
  /** حماية المتسابقين القادمين: يوزن المحرك الندرة المستقبلية عند كل سحب. */
  protectFutureContestants?: boolean;
  /** يوقف المحاكاة عند هذا الحد من الخانات الفاشلة لتفادي تقرير بلا معنى. */
  failureAbortThreshold?: number;
  /** هامش موازنة الحمل الممرَّر إلى المحرك. */
  usageBandTolerance?: number;
}

export interface TwinMetrics {
  participants: number;
  draws: number;
  successfulDraws: number;
  failedDraws: number;
  successRate: number;
  uniqueQuestionsUsed: number;
  totalRepeats: number;
  unavoidableRepeats: number;
  avoidableRepeats: number;
  excessOverLowerBound: number;
  maxUsesOfAnyQuestion: number;
  minUsesOfAnyQuestion: number;
  theoreticalMinimumMaxUses: number;
  /** مصدر الحد الأدنى: أي مجموعة طلب هي عنق الزجاجة، وبكم. */
  reuseLowerBound: ReuseLowerBound;
  reuseDispersion: number;
  reuseDistribution: { uses: number; questionCount: number }[];
  averageModelDifficulty: number;
  maxModelDifficultyDelta: number;
  modelDifficultyVariance: number;
  zoneCoverageFailures: number;
  scopeViolations: number;
  readingViolations: number;
  duplicateWithinModelViolations: number;
  duplicateForParticipantViolations: number;
  scarcityIncidents: number;
  relaxationCounts: Record<string, number>;
  selectionMillisTotal: number;
  selectionMillisAverage: number;
  selectionMillisP50: number;
  selectionMillisP95: number;
  selectionMillisP99: number;
  heapUsedMb?: number;
}

export interface TwinResult {
  competitionId: string;
  seed: string;
  metrics: TwinMetrics;
  demand: DemandAnalysis;
  failures: { participantId: string; code: string; ar: string; en: string }[];
  perCluster: { signature: string; label: string; participants: number; demand: number; supply: number; repeats: number }[];
  generatedAt: string;
  runtimeMs: number;
}

/* أساس ندرة المتسابق = أدنى ضغط بين مواضعه المتاحة: أرخص بديل يملكه فعلًا. */
function clusterBaseline(scarcity: { pressureOfLocus(key: string): number }, pool: QuestionCandidate[]) {
  if (!pool.length) return 0;
  let min = Infinity;
  for (const candidate of pool) min = Math.min(min, scarcity.pressureOfLocus(locusKeyOf(candidate)));
  return Number.isFinite(min) ? min : 0;
}

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : 0);

export function runCompetitionTwin(input: TwinInput): TwinResult {
  const startedAt = Date.now();
  const demand = analyzeDemand({
    participants: input.participants.map(p => ({ participantId: p.participantId, categoryId: p.categoryId, scope: p.scope, questionCount: p.questionCount })),
    candidates: input.candidates,
  });
  // فهرسة المرشحين بحسب بصمة النطاق: العنقود الواحد يُصفّى مرة لا ألف مرة.
  const candidatesByScope = new Map<string, QuestionCandidate[]>();
  const candidatesFor = (scope: QuranScope) => {
    const key = scopeSignature(scope);
    const hit = candidatesByScope.get(key);
    if (hit) return hit;
    const list = candidatesInScope(input.candidates, scope);
    candidatesByScope.set(key, list);
    return list;
  };
  const planFor = (categoryId: string) => input.distributionPlanByCategory?.[categoryId] || input.defaultPlan || { version: 1, mode: 'free' as const, zones: [] };
  const questionByCategory = new Map(input.participants.map(p => [p.categoryId, p.questionCount]));
  const questionCountFor = (cluster: { categoryIds: string[] }) => questionByCategory.get(cluster.categoryIds[0] || '') || 1;
  const demandGroups = buildDemandGroups({ clusters: demand.clusters, candidates: input.candidates, planFor, questionCountFor });
  const scarcity = input.protectFutureContestants === false ? undefined : buildGroupScarcityOracle(demandGroups, input.candidates);
  const engine = new QuestionAllocationEngine({
    policy: input.repeatPolicy,
    seed: input.seed,
    requireReviewedDifficulty: input.requireReviewedDifficulty,
    defaultTargetDifficulty: input.targetDifficulty,
    scarcity,
    usageBandTolerance: input.usageBandTolerance,
    candidateResolver: candidatesFor,
  });
  const baselineByScope = new Map<string, number>();
  for (const cluster of demand.clusters) baselineByScope.set(cluster.signature, scarcity?.pressureOfLocus(`cluster:${cluster.signature}`) ?? 0);

  const failures: TwinResult['failures'] = [];
  const durations: number[] = [];
  const results: SelectionResult[] = [];
  const relaxationCounts: Record<string, number> = {};
  const repeatsByCluster = new Map<string, number>();
  let scopeViolations = 0, readingViolations = 0, duplicateInModel = 0, duplicateForParticipant = 0, zoneFailures = 0, scarcityIncidents = 0;
  const seenByParticipant = new Map<string, Set<string>>();
  const abortAt = input.failureAbortThreshold ?? Number.MAX_SAFE_INTEGER;

  let index = 0;
  for (const participant of input.participants) {
    const plan = input.distributionPlanByCategory?.[participant.categoryId] || input.defaultPlan || { version: 1, mode: 'free' as const, zones: [] };
    const { slots, issues } = resolveZoneSlots({ plan, effectiveScope: participant.scope, questionCount: participant.questionCount });
    zoneFailures += issues.filter(x => x.severity === 'error').length;
    const pool = candidatesFor(participant.scope);
    const began = Date.now();
    const result = engine.selectForParticipant({
      participantId: participant.participantId,
      sequencePosition: index,
      effectiveScope: participant.scope,
      slots,
      reading: participant.reading,
      targetDifficulty: input.targetDifficulty,
      hallId: participant.hallId,
      day: participant.day,
      stage: participant.stage,
      scarcityBaseline: scarcity ? clusterBaseline(scarcity, pool) : 0,
    }, pool);
    durations.push(Date.now() - began);
    results.push(result);
    index++;

    for (const failure of result.failures) failures.push({ participantId: participant.participantId, code: failure.code, ar: failure.ar, en: failure.en });
    for (const name of result.relaxations) relaxationCounts[name] = (relaxationCounts[name] || 0) + 1;
    if (result.questions.some(q => q.reason.scarcityPressure >= 0.9)) scarcityIncidents++;

    // تحقق مستقل من المخرجات — لا يُصدَّق المحرك على نفسه.
    const inScope = new Set(pool.map(c => c.id));
    const modelLoci = new Set<string>();
    const history = seenByParticipant.get(participant.participantId) || new Set<string>();
    for (const picked of result.questions) {
      if (!inScope.has(picked.candidate.id)) scopeViolations++;
      if (!picked.reason.matchedReading) readingViolations++;
      const key = locusKeyOf(picked.candidate);
      if (modelLoci.has(key)) duplicateInModel++;
      modelLoci.add(key);
      if (history.has(key)) duplicateForParticipant++;
      history.add(key);
      const cluster = scopeSignature(participant.scope);
      if (picked.reason.usesBeforeSelection > 0) repeatsByCluster.set(cluster, (repeatsByCluster.get(cluster) || 0) + 1);
    }
    seenByParticipant.set(participant.participantId, history);
    if (failures.length >= abortAt) break;
  }

  const lowerBound = zoneAwareReuseLowerBound({ clusters: demand.clusters, candidates: input.candidates, planFor, questionCountFor });
  const stats = engine.statistics();
  const draws = input.participants.reduce((sum, p) => sum + p.questionCount, 0);
  const successfulDraws = results.reduce((sum, r) => sum + r.questions.length, 0);
  const floor = theoreticalRepeatFloor({ draws: successfulDraws, uniqueLoci: uniqueLocusCount(input.candidates) });
  const perClusterFloor = demand.clusters.reduce((sum, cluster) => sum + cluster.unavoidableRepeats, 0);
  const totalRepeats = results.reduce((sum, r) => sum + r.repeatsUsed, 0);
  const modelDifficulties = results.filter(r => r.questions.length).map(r => r.aggregateDifficulty);
  const meanModel = modelDifficulties.length ? modelDifficulties.reduce((a, b) => a + b, 0) / modelDifficulties.length : 0;
  const modelVariance = modelDifficulties.length ? modelDifficulties.reduce((a, b) => a + (b - meanModel) ** 2, 0) / modelDifficulties.length : 0;
  const usageBuckets = new Map<number, number>();
  for (const row of engine.usageSnapshot()) usageBuckets.set(row.uses, (usageBuckets.get(row.uses) || 0) + 1);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const heap = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed / (1024 * 1024) : undefined;

  return {
    competitionId: input.competitionId,
    seed: input.seed,
    demand,
    failures,
    perCluster: demand.clusters.map(cluster => ({
      signature: cluster.signature, label: cluster.label, participants: cluster.participantCount,
      demand: cluster.demand, supply: cluster.supply, repeats: repeatsByCluster.get(cluster.signature) || 0,
    })),
    metrics: {
      participants: input.participants.length,
      draws,
      successfulDraws,
      failedDraws: draws - successfulDraws,
      successRate: draws ? Number((successfulDraws / draws).toFixed(4)) : 1,
      uniqueQuestionsUsed: stats.uniqueLociUsed,
      totalRepeats,
      unavoidableRepeats: Math.max(floor.unavoidableRepeats, perClusterFloor),
      avoidableRepeats: Math.max(0, totalRepeats - Math.max(floor.unavoidableRepeats, perClusterFloor)),
      /** فائض أكثر المواضع استعمالًا فوق الحدّ الرياضي — هذا وحده ذنب الخوارزمية. */
      excessOverLowerBound: Math.max(0, stats.maxUsesOfAnyLocus - Math.max(lowerBound.minimumMaxUses, floor.minimumMaxUses)),
      maxUsesOfAnyQuestion: stats.maxUsesOfAnyLocus,
      minUsesOfAnyQuestion: stats.minUsesOfAnyLocus,
      theoreticalMinimumMaxUses: Math.max(lowerBound.minimumMaxUses, floor.minimumMaxUses),
      reuseLowerBound: lowerBound,
      reuseDispersion: stats.reuseDispersion,
      reuseDistribution: [...usageBuckets.entries()].sort((a, b) => a[0] - b[0]).map(([uses, questionCount]) => ({ uses, questionCount })),
      averageModelDifficulty: Number(meanModel.toFixed(3)),
      maxModelDifficultyDelta: modelDifficulties.length ? Number((Math.max(...modelDifficulties) - Math.min(...modelDifficulties)).toFixed(3)) : 0,
      modelDifficultyVariance: Number(modelVariance.toFixed(4)),
      zoneCoverageFailures: zoneFailures,
      scopeViolations,
      readingViolations,
      duplicateWithinModelViolations: duplicateInModel,
      duplicateForParticipantViolations: duplicateForParticipant,
      scarcityIncidents,
      relaxationCounts,
      selectionMillisTotal: durations.reduce((a, b) => a + b, 0),
      selectionMillisAverage: durations.length ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(3)) : 0,
      selectionMillisP50: percentile(sortedDurations, 50),
      selectionMillisP95: percentile(sortedDurations, 95),
      selectionMillisP99: percentile(sortedDurations, 99),
      ...(heap !== undefined ? { heapUsedMb: Number(heap.toFixed(1)) } : {}),
    },
    generatedAt: new Date().toISOString(),
    runtimeMs: Date.now() - startedAt,
  };
}

/** مولّد متسابقين اصطناعيين — للتجربة والمحاكاة فقط، بلا أي بيانات شخصية حقيقية. */
export function syntheticParticipants(input: {
  count: number;
  categoryId: string;
  questionCount: number;
  scopes: { scope: QuranScope; share: number }[];
  reading?: ReadingContext;
  halls?: number;
  prefix?: string;
}): TwinParticipant[] {
  const totalShare = input.scopes.reduce((sum, s) => sum + Math.max(0, s.share), 0) || 1;
  const out: TwinParticipant[] = [];
  let produced = 0;
  input.scopes.forEach((entry, entryIndex) => {
    const isLast = entryIndex === input.scopes.length - 1;
    const share = Math.max(0, entry.share) / totalShare;
    const n = isLast ? input.count - produced : Math.round(input.count * share);
    for (let i = 0; i < n; i++) {
      const index = produced + i;
      out.push({
        participantId: `${input.prefix || 'sim'}-${String(index + 1).padStart(6, '0')}`,
        categoryId: input.categoryId,
        scope: entry.scope,
        questionCount: input.questionCount,
        reading: input.reading,
        hallId: input.halls ? `hall-${(index % input.halls) + 1}` : undefined,
      });
    }
    produced += n;
  });
  return out;
}
