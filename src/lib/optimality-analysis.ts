/*
 * ما بعد الحلّ: الفجوة، والندم، والحرج، وجبهة باريتو، وأقلّ إصلاح.
 *
 * المِرصد يجيب: «ما الأفضل ممكنًا؟». وهذا الملف يجيب عمّا هو أهمّ للجنة:
 *
 *   · الفجوة — كم بَعُد ميزان عن الأفضل المُثبَت، في كل بُعدٍ على حدة؟
 *   · الندم  — كم خسر ميزان لأنه يعمل على الخط ولا يعرف الغيب؟ وهذا وحده هو القياس
 *              الحقيقي لنجاح «حماية المتسابقين القادمين»، لا الادّعاء.
 *   · الحرج  — ما ثمن استهلاك هذا الموضع الآن على أفضل حلٍّ مستقبلي؟
 *   · باريتو — ما الخيارات التي لا يهيمن أحدها على آخر، فتختار اللجنة سياسةً بعينها؟
 *   · الإصلاح — إن استحال التوزيع، فما أقلّ تعديلٍ يجعله ممكنًا؟ بالأرقام لا بالحدس.
 *
 * وقاعدةٌ واحدة تحكم الملف كله: لا تُجمع مقاييس غير متجانسة في نسبةٍ واحدة تُعرض على أنها
 * «درجة عدالة». التكرار يُقاس بعدده، والصعوبة بانحرافها، والانكشاف بمقداره. ومن جمعها في
 * رقمٍ واحد أخفى أيَّها تدهور.
 */

import { COST_SCALE } from './optimization/flow';
import {
  BALANCED_OBJECTIVE, measureAssignments, minimizeCost, proveFeasibility, proveMinimumMaxReuse,
  type OracleAssignment, type OracleBudget, type OracleInstance, type OracleMetrics,
  type OracleObjective, type OracleStatus,
} from './fairness-oracle';

/* ───────────────────────── الفجوة عن الأمثل ───────────────────────── */

export type GapDimension = 'max_reuse' | 'total_repeats' | 'difficulty_deviation' | 'exposure_cost' | 'scarcity_cost' | 'same_hall_reuses' | 'aggregate_cost';

export interface DimensionGap {
  dimension: GapDimension;
  /** الأمثل في هذا البُعد وحده — `null` إذا لم يُثبَت. */
  optimum: number | null;
  achieved: number;
  /** المحقَّق ناقص الأمثل. موجبٌ = تخلُّف، صفر = بلوغ الحدّ، سالبٌ مستحيل إن صحّ الحلّال. */
  gap: number | null;
  status: OracleStatus;
  /*
   * سماحية التدوير.
   *
   * حلّال التدفّق يعمل بتكاليف صحيحة (انظر `COST_SCALE`)، فيُدوَّر وزنُ كل قوسٍ إلى أقرب
   * جزءٍ من ألف. وأثر ذلك تراكميّ: مسألةٌ بثلاثمئة تخصيص قد يختلف فيها المقيس عن الأمثل
   * الحقيقي بجزءٍ من عشرة — فيخرج «فرقٌ سالب»، أي أن ميزان دون الأمثل، وهو محال.
   *
   * والسالب هنا ليس اكتشافًا بل حدُّ دقّةٍ معلن. فتُحسب السماحية صراحةً، ويُعدّ ما دونها
   * بلوغًا للحدّ لا تجاوزًا له ولا تقصيرًا عنه. وإخفاء هذا أسهل، وذكرُه أصدق.
   */
  toleranceFromRounding?: number;
  /** تعريف البُعد بلغةٍ لا تحتمل التأويل. */
  ar: string;
}

export interface OptimalityGapReport {
  instanceLabel?: string;
  dimensions: DimensionGap[];
  provenOptimalDimensions: number;
  /** صحيح إذا بلغ ميزان الأمثل المُثبَت في كل بُعدٍ أُثبت. */
  matchedEverywhere: boolean;
  elapsedMs: number;
}

const DIMENSION_LABELS: Record<GapDimension, string> = {
  max_reuse: 'أكثر موضع استعمالًا',
  total_repeats: 'مجموع الاستعمالات بعد الأول',
  difficulty_deviation: 'مجموع انحراف الصعوبة عن الهدف',
  exposure_cost: 'مجموع الانكشاف المستهلَك',
  scarcity_cost: 'مجموع الندرة المستهلَكة',
  same_hall_reuses: 'إعادات الموضع في القاعة نفسها',
  aggregate_cost: 'التكلفة المركّبة للهدف المعلن',
};

const single = (dimension: Exclude<GapDimension, 'max_reuse' | 'aggregate_cost'>): OracleObjective => ({
  repeat: dimension === 'total_repeats' ? 1 : 0,
  difficulty: dimension === 'difficulty_deviation' ? 1 : 0,
  exposure: dimension === 'exposure_cost' ? 1 : 0,
  scarcity: dimension === 'scarcity_cost' ? 1 : 0,
  hallSeparation: dimension === 'same_hall_reuses' ? 1 : 0,
});

const metricOf = (metrics: OracleMetrics, dimension: GapDimension): number => {
  switch (dimension) {
    case 'max_reuse': return metrics.maxReuse;
    case 'total_repeats': return metrics.totalRepeats;
    case 'difficulty_deviation': return metrics.difficultyDeviation;
    case 'exposure_cost': return metrics.exposureCost;
    case 'scarcity_cost': return metrics.scarcityCost;
    case 'same_hall_reuses': return metrics.sameHallReuses;
    case 'aggregate_cost': return 0;
  }
};

/**
 * الفجوة بين ما فعله ميزان وأفضل ما كان ممكنًا رياضيًا، بُعدًا بُعدًا.
 *
 * كل بُعدٍ يُحلّ وحده بهدفٍ مفرد: فالأمثل في «أقلّ تكرار» لا يلزم أن يكون هو الأمثل في
 * «أقلّ انحراف صعوبة»، وجمعُهما في رقمٍ واحد يخفي المفاضلة بدل أن يُظهرها.
 */
export function optimalityGap(input: {
  instance: OracleInstance;
  /** ما فعله المحرّك فعلًا. */
  achieved: OracleAssignment[];
  dimensions?: GapDimension[];
  objective?: OracleObjective;
  budget?: OracleBudget;
}): OptimalityGapReport {
  const startedAt = Date.now();
  const objective = input.objective || BALANCED_OBJECTIVE;
  const dimensions = input.dimensions || ['max_reuse', 'total_repeats', 'difficulty_deviation', 'exposure_cost', 'scarcity_cost', 'same_hall_reuses'];
  const achievedMetrics = measureAssignments(input.instance, input.achieved);
  const ceiling = Number.isFinite(input.instance.policyMaxUses) ? input.instance.policyMaxUses : Math.max(1, input.instance.totalDemand);
  const out: DimensionGap[] = [];

  for (const dimension of dimensions) {
    if (dimension === 'max_reuse') {
      const solved = proveMinimumMaxReuse(input.instance, { budget: input.budget });
      out.push({
        dimension, status: solved.status,
        optimum: solved.provenOptimum,
        achieved: achievedMetrics.maxReuse,
        gap: solved.provenOptimum === null ? null : achievedMetrics.maxReuse - solved.provenOptimum,
        ar: DIMENSION_LABELS[dimension],
      });
      continue;
    }
    if (dimension === 'aggregate_cost') {
      const solved = minimizeCost(input.instance, { maxUses: ceiling, objective, budget: input.budget });
      const achievedCost = aggregateCost(input.instance, achievedMetrics, objective);
      /* كل قوسٍ حامل تكلفة يخطئ بنصف وحدة تدوير على الأكثر: التخصيصات، والتكرارات، وإعادات القاعة. */
      const costBearingArcs = achievedMetrics.assignments + achievedMetrics.totalRepeats + achievedMetrics.sameHallReuses;
      const tolerance = Number(((0.5 / COST_SCALE) * Math.max(1, costBearingArcs)).toFixed(6));
      const raw = solved.cost === null ? null : Number((achievedCost - solved.cost).toFixed(4));
      out.push({
        dimension, status: solved.status,
        optimum: solved.cost,
        achieved: achievedCost,
        gap: raw === null ? null : (Math.abs(raw) <= tolerance ? 0 : raw),
        toleranceFromRounding: tolerance,
        ar: DIMENSION_LABELS[dimension],
      });
      continue;
    }
    const solved = minimizeCost(input.instance, { maxUses: ceiling, objective: single(dimension), budget: input.budget });
    const optimum = solved.metrics ? metricOf(solved.metrics, dimension) : null;
    const achieved = metricOf(achievedMetrics, dimension);
    out.push({
      dimension, status: solved.status, optimum, achieved,
      gap: optimum === null ? null : Number((achieved - optimum).toFixed(4)),
      ar: DIMENSION_LABELS[dimension],
    });
  }

  const proven = out.filter(row => row.status === 'proven_optimal');
  return {
    instanceLabel: input.instance.label,
    dimensions: out,
    provenOptimalDimensions: proven.length,
    matchedEverywhere: proven.length > 0 && proven.every(row => (row.gap ?? 1) <= 0),
    elapsedMs: Date.now() - startedAt,
  };
}

export function aggregateCost(instance: OracleInstance, metrics: OracleMetrics, objective: OracleObjective): number {
  const value = objective.repeat * metrics.totalRepeats
    + objective.difficulty * metrics.difficultyDeviation
    + objective.exposure * metrics.exposureCost
    + objective.scarcity * metrics.scarcityCost
    + objective.hallSeparation * metrics.sameHallReuses;
  return Number(value.toFixed(4));
}

/* ───────────────────────── ندم العدالة ───────────────────────── */

export interface FairnessRegretReport {
  /** ندمٌ لكل بُعد: ما دفعه ميزان ثمنًا لأنه لا يعرف الغيب. */
  regret: DimensionGap[];
  /** مجموع الندم على الهدف المعلن — يُذكر باسم هدفه لا مجرّدًا. */
  totalRegret: number | null;
  objective: OracleObjective;
  ar: string;
}

/**
 * ندم العدالة.
 *
 * ميزان يعمل على الخط: حين يأتي أول متسابق لا يعرف من سيأتي بعده، ولا من سيغيب، ولا ما
 * سيُحجر اليوم. وبعد انتهاء المسابقة نعرف كل ذلك، فنعيد حلّ المسألة **بمعرفة تامّة** ثم
 * نسأل: كم كانت تكلفة الجهل؟
 *
 * وهذا هو القياس الوحيد الصادق لـ«حماية المتسابقين القادمين»: إن كانت الحماية تعمل فالندم
 * صغير، وإن لم تعمل فالندم كبير مهما قيل عنها. وليس في هذا لومٌ للمحرّك: الندم ثمنُ العمل
 * على الخط لا خطأً فيه، وإنما يُقاس ليُعرف قدرُه.
 */
export function fairnessRegret(input: {
  /** المسألة كما تبيّنت بعد انتهاء المسابقة: الحضور الحقيقي، والغياب، والحجر، وما كان متاحًا فعلًا. */
  offlineInstance: OracleInstance;
  /** ما فعله ميزان على الخط. */
  onlineAssignments: OracleAssignment[];
  objective?: OracleObjective;
  budget?: OracleBudget;
}): FairnessRegretReport {
  const objective = input.objective || BALANCED_OBJECTIVE;
  const report = optimalityGap({
    instance: input.offlineInstance,
    achieved: input.onlineAssignments,
    objective,
    budget: input.budget,
    dimensions: ['max_reuse', 'total_repeats', 'difficulty_deviation', 'exposure_cost', 'scarcity_cost', 'same_hall_reuses', 'aggregate_cost'],
  });
  const total = report.dimensions.find(row => row.dimension === 'aggregate_cost')?.gap ?? null;
  return {
    regret: report.dimensions,
    totalRegret: total,
    objective,
    ar: total === null
      ? 'تعذّر إثبات الندم الكلي على هذه المسألة؛ الأبعاد المُثبَتة وحدها معتبرة.'
      : `ندم العدالة الكلي على الهدف المعلن: ${total.toFixed(3)}. وهو ثمن العمل على الخط بلا معرفةٍ بالغيب، لا خطأ في القرار.`,
  };
}

/* ───────────────────────── حرج الموضع الحدّي ───────────────────────── */

export interface LocusCriticality {
  locusKey: string;
  /** الأمثل الأصلي لأكثر موضع استعمالًا. */
  baselineMaxReuse: number;
  /** الأمثل بعد منع هذا الموضع. */
  withoutMaxReuse: number | null;
  /** كم يرفع منعُه الحدَّ الأمثل. صفر = لا أثر مُثبَت. */
  maxReuseDelta: number | null;
  /** كم تزيد التكلفة المركّبة المثلى بمنعه. */
  costDelta: number | null;
  status: OracleStatus;
}

export interface CriticalityReport {
  baselineMaxReuse: number | null;
  baselineCost: number | null;
  loci: LocusCriticality[];
  /** عدد المواضع التي فُحصت فعلًا (الفحص مكلف، فيُقصر على المرشّحين). */
  examined: number;
  elapsedMs: number;
}

/**
 * حرج الموضع الحدّي — ثمن استهلاكه الآن على أفضل حلٍّ مستقبلي.
 *
 * هذا ليس درجة الندرة القائمة في ميزان ولا بديلًا عنها. الندرة تقول: كم متسابقًا يحتاج
 * هذا الموضع؟ وهذا يقول شيئًا آخر تمامًا: **لو مُنع هذا الموضع، كم يسوء أفضلُ حلٍّ ممكن؟**
 *
 * والفرق عمليّ لا لفظي: موضعٌ يطلبه كثيرون وله بدائل كثيرة ليس حرجًا — إزالته لا تغيّر
 * الأمثل. وموضعٌ يطلبه قليلون ولا بديل له حرجٌ جدًا — إزالته ترفع الحدّ الأدنى من ١٤ إلى ١٧.
 *
 * والحساب بإعادة الحلّ لا بتقديرٍ: يُمنع الموضع، ويُعاد إثبات الأمثل، ويُقاس الفرق. وهو
 * مكلف بطبعه، فيُقصر على مرشّحين يُختارون بالندرة والانكشاف، ويُعلن عددُ ما فُحص.
 */
export function locusMarginalCriticality(input: {
  instance: OracleInstance;
  /** عدد المواضع التي تُفحص. الترتيب بالندرة ثم الانكشاف. */
  limit?: number;
  /** فحص التكلفة المركّبة أيضًا (أبطأ). */
  withCost?: boolean;
  objective?: OracleObjective;
  budget?: OracleBudget;
}): CriticalityReport {
  const startedAt = Date.now();
  const objective = input.objective || BALANCED_OBJECTIVE;
  const ceiling = Number.isFinite(input.instance.policyMaxUses) ? input.instance.policyMaxUses : Math.max(1, input.instance.totalDemand);
  const baseline = proveMinimumMaxReuse(input.instance, { budget: input.budget });
  const baselineCost = input.withCost ? minimizeCost(input.instance, { maxUses: ceiling, objective, budget: input.budget }).cost : null;
  if (baseline.provenOptimum === null) {
    return { baselineMaxReuse: null, baselineCost, loci: [], examined: 0, elapsedMs: Date.now() - startedAt };
  }

  const order = input.instance.loci
    .map((locus, index) => ({ index, locus }))
    .filter(row => row.locus.capacity > 0)
    .sort((a, b) => (b.locus.scarcity - a.locus.scarcity) || (b.locus.exposure - a.locus.exposure) || a.locus.locusKey.localeCompare(b.locus.locusKey))
    .slice(0, Math.max(1, input.limit ?? 20));

  const rows: LocusCriticality[] = [];
  for (const row of order) {
    // المنع يكون بإسقاط سعة الموضع إلى صفر، ثم إعادتها — نسخةٌ سطحية تكفي ولا تنسخ البنك.
    const original = row.locus.capacity;
    const patched: OracleInstance = {
      ...input.instance,
      loci: input.instance.loci.map((locus, index) => (index === row.index ? { ...locus, capacity: 0 } : locus)),
    };
    const without = proveMinimumMaxReuse(patched, { budget: input.budget });
    const cost = input.withCost && without.provenOptimum !== null
      ? minimizeCost(patched, { maxUses: ceiling, objective, budget: input.budget }).cost
      : null;
    rows.push({
      locusKey: row.locus.locusKey,
      baselineMaxReuse: baseline.provenOptimum,
      withoutMaxReuse: without.provenOptimum,
      maxReuseDelta: without.provenOptimum === null ? null : without.provenOptimum - baseline.provenOptimum,
      costDelta: cost === null || baselineCost === null ? null : Number((cost - baselineCost).toFixed(4)),
      status: without.status,
    });
    void original;
  }
  rows.sort((a, b) => (b.maxReuseDelta ?? -1) - (a.maxReuseDelta ?? -1) || (b.costDelta ?? 0) - (a.costDelta ?? 0));
  return { baselineMaxReuse: baseline.provenOptimum, baselineCost, loci: rows, examined: rows.length, elapsedMs: Date.now() - startedAt };
}

/* ───────────────────────── جبهة باريتو ───────────────────────── */

export interface ParetoPoint {
  label: string;
  weights: OracleObjective;
  metrics: OracleMetrics;
  status: OracleStatus;
  maxUses: number;
}

export interface ParetoReport {
  frontier: ParetoPoint[];
  /** حلولٌ حُذفت لأن غيرها يتفوّق عليها في كل بُعد. */
  dominated: number;
  elapsedMs: number;
}

const PARETO_AXES: (keyof OracleMetrics)[] = ['totalRepeats', 'difficultyDeviation', 'exposureCost', 'scarcityCost', 'sameHallReuses'];

const dominates = (a: OracleMetrics, b: OracleMetrics) =>
  PARETO_AXES.every(axis => (a[axis] as number) <= (b[axis] as number)) && PARETO_AXES.some(axis => (a[axis] as number) < (b[axis] as number));

/**
 * جبهة باريتو بين أهداف العدالة.
 *
 * الأوزان في المحرّك مفاضلةٌ ضمنية: من رفع وزن الصعوبة خفض شيئًا آخر بالضرورة، ولا يُرى
 * ذلك في رقمٍ واحد. وهذه الجبهة تُظهره: سياسةٌ أقلّ تكرارًا، وسياسةٌ تزيد تكرارًا واحدًا
 * وتحسّن تكافؤ الصعوبة تحسّنًا كبيرًا، وسياسةٌ تحمي الندرة أكثر.
 *
 * ولا يُعرض حلٌّ مهيمنٌ عليه: من كان غيره أفضل منه في كل بُعدٍ ليس خيارًا بل خطأ. واللجنة
 * تختار سياسة، ولا تتغيّر سياسة الإنتاج تلقائيًا بحال.
 */
export function paretoFairnessFrontier(input: {
  instance: OracleInstance;
  /** أوزانٌ تُجرَّب. الافتراضي شبكةٌ صغيرة تغطي المفاضلات الأساسية. */
  candidates?: { label: string; weights: OracleObjective }[];
  maxPoints?: number;
  budget?: OracleBudget;
}): ParetoReport {
  const startedAt = Date.now();
  const ceiling = Number.isFinite(input.instance.policyMaxUses) ? input.instance.policyMaxUses : Math.max(1, input.instance.totalDemand);
  const candidates = input.candidates || DEFAULT_PARETO_GRID;
  const points: ParetoPoint[] = [];
  for (const candidate of candidates) {
    const solved = minimizeCost(input.instance, { maxUses: ceiling, objective: candidate.weights, budget: input.budget });
    if (!solved.metrics) continue;
    points.push({ label: candidate.label, weights: candidate.weights, metrics: solved.metrics, status: solved.status, maxUses: ceiling });
  }
  const frontier = points.filter(point => !points.some(other => other !== point && dominates(other.metrics, point.metrics)));
  // إزالة المتطابقين في كل المحاور: خياران متساويان خيارٌ واحد.
  const seen = new Set<string>();
  const unique = frontier.filter(point => {
    const key = PARETO_AXES.map(axis => point.metrics[axis]).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    frontier: unique.slice(0, Math.max(1, input.maxPoints ?? 6)),
    dominated: points.length - unique.length,
    elapsedMs: Date.now() - startedAt,
  };
}

export const DEFAULT_PARETO_GRID: { label: string; weights: OracleObjective }[] = [
  { label: 'أقلّ تكرار قبل كل شيء', weights: { repeat: 10, difficulty: 0.5, exposure: 0.2, scarcity: 0.2, hallSeparation: 0.5 } },
  { label: 'تكافؤ الصعوبة قبل كل شيء', weights: { repeat: 1, difficulty: 10, exposure: 0.2, scarcity: 0.2, hallSeparation: 0.5 } },
  { label: 'حماية المورد النادر', weights: { repeat: 2, difficulty: 1, exposure: 0.5, scarcity: 10, hallSeparation: 1 } },
  { label: 'أقلّ انكشاف', weights: { repeat: 2, difficulty: 1, exposure: 10, scarcity: 1, hallSeparation: 1 } },
  { label: 'تباعد القاعات', weights: { repeat: 2, difficulty: 1, exposure: 0.5, scarcity: 0.5, hallSeparation: 10 } },
  { label: 'متوازن', weights: BALANCED_OBJECTIVE },
  { label: 'متوازن ومحصَّن ضد عدم اليقين', weights: { ...BALANCED_OBJECTIVE, robustDifficulty: true } },
];

/* ───────────────────────── أقلّ إصلاح ───────────────────────── */

export interface RepairOption {
  id: 'add_loci' | 'raise_max_uses' | 'reduce_question_count';
  ar: string;
  en: string;
  /** مقدار التغيير المطلوب — بوحدته المذكورة في النص. */
  amount: number;
  /** هل المقدار مُثبَتٌ أنه الأقلّ داخل هذا النوع من الإصلاح؟ */
  proven: boolean;
  /** من يتأثر بهذا الإصلاح. */
  affectedParticipants: string[];
  before: { feasible: boolean; served: number; demand: number };
  after: { feasible: boolean; served: number; demand: number };
}

export interface MinimalRepairReport {
  feasibleAsIs: boolean;
  options: RepairOption[];
  ar: string;
}

/**
 * أقلّ إصلاح يجعل المستحيل ممكنًا.
 *
 * لا توصيات حدسية: لكل خيارٍ مقدارٌ مُثبَت داخل نوعه، وأثرٌ مقيس قبل وبعد، ومن يتأثر به.
 * ولا يُطبَّق شيءٌ تلقائيًا — القرار للجنة، والنظام يعرض الثمن.
 */
export function minimalRepair(input: { instance: OracleInstance; budget?: OracleBudget }): MinimalRepairReport {
  const instance = input.instance;
  const before = proveFeasibility(instance, { budget: input.budget });
  if (before.status === 'proven_feasible') {
    return { feasibleAsIs: true, options: [], ar: 'التوزيع ممكن كما هو؛ لا حاجة إلى إصلاح.' };
  }
  if (before.status === 'instance_too_large') {
    return { feasibleAsIs: false, options: [], ar: 'المسألة أكبر من ميزانية الحلّال المعلنة؛ لم يُحكم عليها.' };
  }

  const affected = [...new Set(before.certificates.flatMap(c => c.participantIds))];
  const options: RepairOption[] = [];

  // (أ) إضافة مواضع — العجز نفسه هو أقلّ عددٍ يكفي، بمبرهنة أكبر تدفّق/أدنى حاجز.
  options.push({
    id: 'add_loci',
    amount: before.minimumAdditionalLoci,
    proven: true,
    ar: `أضِف ${before.minimumAdditionalLoci} موضعًا صالحًا للمجموعة المحبوسة. هذا أقلّ عددٍ يكفي — مُثبَت لا مقدَّر.`,
    en: `Add ${before.minimumAdditionalLoci} eligible loci for the blocked set — the proven minimum.`,
    affectedParticipants: affected,
    before: { feasible: false, served: before.maxServed, demand: before.totalDemand },
    after: { feasible: true, served: before.totalDemand, demand: before.totalDemand },
  });

  // (ب) رفع سقف الاستعمال — بحثٌ بارامتري على أصغر سقفٍ يُشبع الطلب.
  const ceiling = Math.max(1, Math.min(instance.totalDemand, 64));
  let raised: number | null = null;
  for (let maxUses = (Number.isFinite(instance.policyMaxUses) ? instance.policyMaxUses : 1) + 1; maxUses <= ceiling; maxUses++) {
    const probe = proveFeasibility({ ...instance, policyMaxUses: maxUses, loci: instance.loci.map(locus => ({ ...locus, capacity: Math.max(locus.capacity, maxUses) })) }, { maxUses, budget: input.budget });
    if (probe.status === 'proven_feasible') { raised = maxUses; break; }
  }
  if (raised !== null) {
    options.push({
      id: 'raise_max_uses',
      amount: raised,
      proven: true,
      ar: `ارفع سقف استعمال الموضع الواحد إلى ${raised}. وهذا أصغر سقفٍ يجعل التوزيع ممكنًا.`,
      en: `Raise the per-locus use ceiling to ${raised} — the smallest ceiling that makes the allocation possible.`,
      affectedParticipants: affected,
      before: { feasible: false, served: before.maxServed, demand: before.totalDemand },
      after: { feasible: true, served: before.totalDemand, demand: before.totalDemand },
    });
  }

  /*
   * (ج) خفض عدد الأسئلة على المجموعة المحبوسة.
   *
   * الخفض يقع على المجموعات المحبوسة وحدها لا على الجميع: إنقاصُ سؤالٍ من كل متسابق في
   * المسابقة لإصلاح عجزٍ يخصّ ثمانين منهم ظلمٌ لا إصلاح. والمقدار المذكور هو مجموع ما
   * يُنقص من المجموعة المحبوسة، وهو العجز نفسه.
   */
  const blocked = new Set(before.certificates.flatMap(c => c.groupIds));
  if (blocked.size) {
    const reduction = before.minimumAdditionalLoci;
    const probe = proveFeasibility({
      ...instance,
      totalDemand: instance.totalDemand - reduction,
      groups: reduceDemand(instance, blocked, reduction),
    }, { budget: input.budget });
    options.push({
      id: 'reduce_question_count',
      amount: reduction,
      proven: probe.status === 'proven_feasible',
      ar: `اخفض ${reduction} سؤالًا موزَّعةً على المجموعة المحبوسة وحدها (${blocked.size} مجموعة). العجز يساوي هذا العدد بالضبط.`,
      en: `Drop ${reduction} questions spread across the blocked groups only (${blocked.size} groups).`,
      affectedParticipants: affected,
      before: { feasible: false, served: before.maxServed, demand: before.totalDemand },
      after: { feasible: probe.status === 'proven_feasible', served: probe.maxServed, demand: probe.totalDemand },
    });
  }

  return {
    feasibleAsIs: false,
    options,
    ar: `التوزيع مستحيل بهذه القيود (عجزٌ مُثبَت قدره ${before.minimumAdditionalLoci}). الخيارات أدناه مرتّبة بنوعها لا بأفضليتها؛ الاختيار للجنة.`,
  };
}

/** خفض الطلب على مجموعاتٍ بعينها بمقدارٍ موزَّع بالتساوي، بلا نزول تحت الصفر. */
function reduceDemand(instance: OracleInstance, groupIds: Set<string>, total: number) {
  let remaining = total;
  return instance.groups.map(group => {
    if (!groupIds.has(group.groupId) || remaining <= 0) return group;
    const cut = Math.min(group.demand, Math.ceil(remaining / Math.max(1, groupIds.size)));
    remaining -= cut;
    return { ...group, demand: group.demand - cut };
  });
}
