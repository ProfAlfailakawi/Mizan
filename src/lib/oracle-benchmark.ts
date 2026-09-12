/*
 * جسر المقايسة: ما فعله المحرّك مقابل ما أثبته المِرصد.
 *
 * هنا يلتقي الطرفان — التوأم الرقمي الذي يُشغّل محرّك الإنتاج نفسه، والمِرصد الذي يحلّ
 * المسألة كاملة. والالتقاء مشروطٌ بأمرٍ لا يجوز التساهل فيه: أن تكون المسألتان واحدة.
 * فبنك واحد، وسياسة واحدة، ومناطق واحدة، وقيود واحدة — وإلا صارت «الفجوة» مقارنةً بين
 * مسابقتين مختلفتين، وهي أسوأ من ألّا تُقاس.
 *
 * والمخرجات تُسمّى بأسمائها الدقيقة: أمثلٌ مُثبَت، أو أفضلُ معروف، أو حدٌّ أدنى مُثبَت،
 * أو استحالةٌ مُثبَتة. ولا يقال «مثالي» بلا برهان.
 */

import { runCompetitionTwin, type TwinInput, type TwinResult } from './competition-twin';
import { buildOracleInstance, oracleGroupId, type OracleInstanceBuild } from './fairness-oracle-instance';
import { buildGroupScarcityOracle, buildDemandGroups, analyzeDemand } from './scope-demand';
import {
  BALANCED_OBJECTIVE, measureAssignments, proveMinimumMaxReuse, strongReuseLowerBound,
  type OracleAssignment, type OracleBudget, type OracleMetrics, type OracleObjective,
  type FeasibilityResult, type MinMaxReuseResult,
} from './fairness-oracle';
import { fairnessRegret, optimalityGap, type FairnessRegretReport, type OptimalityGapReport } from './optimality-analysis';

export interface OracleBenchmarkInput extends TwinInput {
  objective?: OracleObjective;
  budget?: OracleBudget;
  /** يحسب ندم العدالة أيضًا (المِرصد بمعرفةٍ تامّة مقابل المحرّك على الخط). */
  withRegret?: boolean;
}

export interface OracleBenchmarkResult {
  twin: TwinResult;
  build: OracleInstanceBuild;
  /** التخصيصات كما خرجت من المحرّك، مترجمةً إلى لغة المِرصد. */
  achieved: OracleAssignment[];
  achievedMetrics: OracleMetrics;
  feasibility: FeasibilityResult;
  minMaxReuse: MinMaxReuseResult;
  /** الحدّ الأدنى السريع الموجود في ميزان — يُنقل كما هو للمقارنة، لا يُستبدل. */
  fastLowerBound: number;
  /** الحدّ الأدنى القويّ بإرخاء التدفّق. و`infeasible` تعني أنه لا حدَّ أدنى أصلًا: لا حلّ. */
  strongLowerBound: ReturnType<typeof strongReuseLowerBound>;
  gap: OptimalityGapReport;
  regret: FairnessRegretReport | null;
  elapsedMs: number;
}

/**
 * تشغيلٌ واحد يُنتج المقايسة كاملة.
 *
 * الترتيب مقصود: يُشغَّل المحرّك أولًا (فهو صاحب الشأن)، ثم تُبنى المسألة من المُدخلات
 * نفسها، ثم يُسأل المِرصد. وبذلك لا يرى المحرّك شيئًا من المِرصد — ولا يجوز أن يرى.
 */
export function runOracleBenchmark(input: OracleBenchmarkInput): OracleBenchmarkResult {
  const startedAt = Date.now();
  const twin = runCompetitionTwin({ ...input, collectAssignments: true });

  const demand = analyzeDemand({
    participants: input.participants.map(p => ({ participantId: p.participantId, categoryId: p.categoryId, scope: p.scope, questionCount: p.questionCount })),
    candidates: input.candidates,
  });
  const planFor = (categoryId: string) => input.distributionPlanByCategory?.[categoryId] || input.defaultPlan || { version: 1, mode: 'free' as const, zones: [] };
  const questionByCategory = new Map(input.participants.map(p => [p.categoryId, p.questionCount]));
  const demandGroups = buildDemandGroups({
    clusters: demand.clusters, candidates: input.candidates, planFor,
    questionCountFor: cluster => questionByCategory.get(cluster.categoryIds[0] || '') || 1,
  });
  // الندرة تأتي من مِرصد الندرة القائم في ميزان، لا من حساب ثانٍ يخالفه.
  const scarcity = input.protectFutureContestants === false ? undefined : buildGroupScarcityOracle(demandGroups, input.candidates);

  const build = buildOracleInstance({
    participants: input.participants.map(p => ({
      participantId: p.participantId, categoryId: p.categoryId, scope: p.scope,
      questionCount: p.questionCount, reading: p.reading, hallId: p.hallId,
    })),
    candidates: input.candidates,
    distributionPlanByCategory: input.distributionPlanByCategory,
    defaultPlan: input.defaultPlan,
    repeatPolicy: input.repeatPolicy,
    targetDifficulty: input.targetDifficulty,
    requireReviewedDifficulty: input.requireReviewedDifficulty,
    scarcity,
    label: input.competitionId,
  });

  const achieved: OracleAssignment[] = (twin.assignments || []).map(row => ({
    groupId: oracleGroupId(row.participantId, row.zoneId),
    participantId: row.participantId,
    locusKey: row.locusKey,
  }));

  const objective = input.objective || BALANCED_OBJECTIVE;
  const minMaxReuse = proveMinimumMaxReuse(build.instance, { budget: input.budget });
  const gap = optimalityGap({ instance: build.instance, achieved, objective, budget: input.budget, dimensions: ['max_reuse', 'total_repeats', 'difficulty_deviation', 'exposure_cost', 'scarcity_cost', 'same_hall_reuses', 'aggregate_cost'] });
  const regret = input.withRegret
    ? fairnessRegret({ offlineInstance: build.instance, onlineAssignments: achieved, objective, budget: input.budget })
    : null;

  return {
    twin,
    build,
    achieved,
    achievedMetrics: measureAssignments(build.instance, achieved),
    feasibility: minMaxReuse.feasibility,
    minMaxReuse,
    fastLowerBound: twin.metrics.theoreticalMinimumMaxUses,
    strongLowerBound: strongReuseLowerBound(build.instance, { budget: input.budget }),
    gap,
    regret,
    elapsedMs: Date.now() - startedAt,
  };
}

/** عبارةٌ عربية دقيقة عن حالة المِرصد — لا «مثالي» بلا برهان ولا «مستحيل» بلا شاهد. */
export function describeOracleStatus(result: MinMaxReuseResult): string {
  switch (result.status) {
    case 'proven_optimal': return `أمثل مُثبَت: أقلّ «أكثرِ استعمال» ممكن هو ${result.provenOptimum}.`;
    case 'proven_infeasible': return `استحالة مُثبَتة: لا يوجد توزيعٌ يحقق هذه القيود (عجزٌ قدره ${result.feasibility.minimumAdditionalLoci} على الأقل).`;
    case 'best_known': return `أفضل حلٍّ معروف ${result.bestKnown} مقابل حدٍّ أدنى مُثبَت ${result.provenLowerBound}؛ الفجوة ${result.solverGap} ولم تُغلق.`;
    case 'instance_too_large': return `المسألة أكبر من ميزانية الحلّال المعلنة؛ الحدّ الأدنى المُثبَت ${result.provenLowerBound} وما فوقه غير محسوم.`;
    default: return 'لم يُسأل المِرصد.';
  }
}
