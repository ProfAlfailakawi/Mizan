/*
 * ميزانية إصدار العدالة، ومنازلة النسخ، وتاريخ الجبهة.
 *
 * ثلاثة أسئلة تُسأل عند كل تعديلٍ على محرّك السحب، وكلها بالأرقام:
 *
 *   ١) هل هذا الإصدار أسوأ من سابقه في شيءٍ لا يُغتفر؟ (الميزانية)
 *   ٢) أين تحسّنت النسخة الجديدة وأين تراجعت؟ (المنازلة)
 *   ٣) كيف تطوّرت عدالة ميزان عبر السنة؟ (التاريخ)
 *
 * وقاعدتان تحكمان هذا الملف:
 *
 *   · **لا عتبات اعتباطية.** كل حدٍّ هنا يُشتقّ من خطّ أساسٍ مُقاس، لا من رقمٍ جميل. ومن
 *     لم يقس خطّ أساسه فليس له أن يضع حدًّا.
 *   · **لا يُستبدل خوارزمٌ لأن متوسّطه جميل بينما أسوأ حالاته انهارت.** المتوسط يُخفي
 *     الذيل، والذيل هو الذي يقع على متسابقٍ بعينه يوم المسابقة.
 */

import type { TwinMetrics } from './competition-twin';

export const FAIRNESS_BUDGET_VERSION = 'MIZAN-FAIRNESS-BUDGET-1';

/** المقاييس التي تُحكم بها البوابة، وهل الأقلّ فيها خيرٌ أم الأكثر. */
export const BUDGET_METRICS = {
  scopeViolations: { direction: 'lower', hard: true, ar: 'خروقات النطاق' },
  readingViolations: { direction: 'lower', hard: true, ar: 'خروقات الرواية' },
  duplicateWithinModelViolations: { direction: 'lower', hard: true, ar: 'تكرار داخل النموذج' },
  duplicateForParticipantViolations: { direction: 'lower', hard: true, ar: 'تكرار على المتسابق نفسه' },
  failedDraws: { direction: 'lower', hard: false, ar: 'سحوب فاشلة' },
  excessOverLowerBound: { direction: 'lower', hard: false, ar: 'الزيادة على الحدّ الرياضي' },
  maxUsesOfAnyQuestion: { direction: 'lower', hard: false, ar: 'أكثر موضع استعمالًا' },
  totalRepeats: { direction: 'lower', hard: false, ar: 'مجموع التكرار' },
  maxModelDifficultyDelta: { direction: 'lower', hard: false, ar: 'الفرق بين أصعب نموذج وأسهله' },
  selectionMillisP95: { direction: 'lower', hard: false, ar: 'زمن الاختيار (المئين ٩٥)' },
  heapUsedMb: { direction: 'lower', hard: false, ar: 'الذاكرة المستعملة' },
} as const;

export type BudgetMetric = keyof typeof BUDGET_METRICS;

export interface FairnessBaseline {
  version: string;
  engineVersion: string;
  recordedAt: string;
  /** اسم السيناريو — المقارنة لا تصحّ إلا بين سيناريوهين متطابقين. */
  scenario: string;
  metrics: Partial<Record<BudgetMetric, number>>;
  /** أسوأ ما رُصد على عدة بذور — الذيل لا المتوسط. */
  multiSeedWorst?: Partial<Record<BudgetMetric, number>>;
  /** الفجوة عن الأمثل المُثبَت، حيث أُثبت. */
  optimalityGap?: Record<string, number | null>;
}

export interface BudgetTolerance {
  /** نسبة التدهور المسموحة لكل مقياسٍ ليّن (٠٫١ = ١٠٪). */
  relative?: number;
  /** تدهورٌ مطلق مسموح، يُستعمل حين تكون القيم صغيرة فتصير النسبة بلا معنى. */
  absolute?: Partial<Record<BudgetMetric, number>>;
}

export interface BudgetFinding {
  metric: BudgetMetric | 'optimality_gap' | 'multi_seed_worst';
  severity: 'blocking' | 'warning' | 'improvement' | 'unchanged';
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  ar: string;
}

export interface BudgetVerdict {
  releasable: boolean;
  findings: BudgetFinding[];
  blocking: BudgetFinding[];
  ar: string;
}

const DEFAULT_TOLERANCE: Required<Pick<BudgetTolerance, 'relative'>> = { relative: 0.1 };

/**
 * حكم بوابة الإصدار.
 *
 * القيود القاطعة تُقاس مطلقًا: خرقُ نطاقٍ واحد يمنع الإصدار مهما تحسّن غيره — لأن الخرق
 * ليس تدهورًا في مقياس، بل كسرٌ لوعد. وما عداه يُقاس بالسماحية المشتقّة من خطّ الأساس.
 */
export function judgeReleaseBudget(input: {
  baseline: FairnessBaseline;
  candidate: FairnessBaseline;
  tolerance?: BudgetTolerance;
}): BudgetVerdict {
  const tolerance = { ...DEFAULT_TOLERANCE, ...(input.tolerance || {}) };
  const findings: BudgetFinding[] = [];

  if (input.baseline.scenario !== input.candidate.scenario) {
    findings.push({
      metric: 'optimality_gap', severity: 'blocking', baseline: null, candidate: null, delta: null,
      ar: `المقارنة بين سيناريوهين مختلفين («${input.baseline.scenario}» و«${input.candidate.scenario}») لا تصحّ؛ لا يُبنى عليها إصدار.`,
    });
  }

  for (const key of Object.keys(BUDGET_METRICS) as BudgetMetric[]) {
    const spec = BUDGET_METRICS[key];
    const before = input.baseline.metrics[key];
    const after = input.candidate.metrics[key];
    if (before === undefined || after === undefined) continue;
    const delta = Number((after - before).toFixed(4));

    if (spec.hard) {
      findings.push({
        metric: key,
        severity: after > 0 ? 'blocking' : 'unchanged',
        baseline: before, candidate: after, delta,
        ar: after > 0
          ? `${spec.ar}: ${after}. هذا كسرُ وعدٍ لا تدهورُ مقياس، فلا إصدار معه.`
          : `${spec.ar}: صفر، كما كان.`,
      });
      continue;
    }

    const allowedAbsolute = input.tolerance?.absolute?.[key];
    const allowed = allowedAbsolute !== undefined ? allowedAbsolute : Math.abs(before) * tolerance.relative;
    if (delta > allowed) {
      findings.push({
        metric: key, severity: 'blocking', baseline: before, candidate: after, delta,
        ar: `${spec.ar} تدهور من ${before} إلى ${after} (المسموح ${Number(allowed.toFixed(4))} فوق خطّ الأساس).`,
      });
    } else if (delta < 0) {
      findings.push({ metric: key, severity: 'improvement', baseline: before, candidate: after, delta, ar: `${spec.ar} تحسّن من ${before} إلى ${after}.` });
    } else {
      findings.push({ metric: key, severity: delta > 0 ? 'warning' : 'unchanged', baseline: before, candidate: after, delta, ar: `${spec.ar}: ${after} (كان ${before}).` });
    }
  }

  // الذيل: أسوأ ما رُصد على عدة بذور. تدهورُه يمنع الإصدار ولو تحسّن المتوسط.
  for (const key of Object.keys(input.candidate.multiSeedWorst || {}) as BudgetMetric[]) {
    const before = input.baseline.multiSeedWorst?.[key];
    const after = input.candidate.multiSeedWorst?.[key];
    if (before === undefined || after === undefined) continue;
    const delta = Number((after - before).toFixed(4));
    if (delta > 0) {
      findings.push({
        metric: 'multi_seed_worst', severity: 'blocking', baseline: before, candidate: after, delta,
        ar: `أسوأ ما رُصد على عدة بذور في «${BUDGET_METRICS[key].ar}» تدهور من ${before} إلى ${after}. المتوسط لا يشفع للذيل.`,
      });
    }
  }

  // الفجوة عن الأمثل المُثبَت: اتساعها تراجعٌ في جودة التوزيع لا في حجم البنك.
  for (const dimension of Object.keys(input.candidate.optimalityGap || {})) {
    const before = input.baseline.optimalityGap?.[dimension];
    const after = input.candidate.optimalityGap?.[dimension];
    if (before === null || before === undefined || after === null || after === undefined) continue;
    const delta = Number((after - before).toFixed(4));
    if (delta > 0) {
      findings.push({
        metric: 'optimality_gap', severity: 'blocking', baseline: before, candidate: after, delta,
        ar: `الفجوة عن الأمثل المُثبَت في «${dimension}» اتّسعت من ${before} إلى ${after}؛ هذا نقصُ توزيعٍ لا نقصُ بنك.`,
      });
    } else if (delta < 0) {
      findings.push({ metric: 'optimality_gap', severity: 'improvement', baseline: before, candidate: after, delta, ar: `الفجوة في «${dimension}» ضاقت من ${before} إلى ${after}.` });
    }
  }

  const blocking = findings.filter(finding => finding.severity === 'blocking');
  return {
    releasable: blocking.length === 0,
    findings,
    blocking,
    ar: blocking.length === 0
      ? 'الإصدار يجتاز ميزانية العدالة: لا خرقَ قاطعًا، ولا تدهورَ فوق السماحية المشتقّة من خطّ الأساس.'
      : `الإصدار موقوف: ${blocking.length} مانعًا. ${blocking[0].ar}`,
  };
}

/* ───────────────────────── منازلة النسخ ───────────────────────── */

export interface ChallengeCase { id: string; ar: string; baseline: Partial<Record<BudgetMetric, number>>; candidate: Partial<Record<BudgetMetric, number>> }

export interface ChallengeRow {
  metric: BudgetMetric;
  ar: string;
  improvedIn: string[];
  regressedIn: string[];
  averageDelta: number;
  /** أسوأ تدهورٍ رُصد في أي حالة — لا يُخفيه متوسطٌ جميل. */
  worstDelta: number;
  worstCase: string;
}

export interface ChallengeReport {
  challenger: string;
  incumbent: string;
  rows: ChallengeRow[];
  /** حكم الهيمنة: أسوأ في كل شيءٍ ولا مكسب في غيره = يُرفض. */
  dominated: boolean;
  tradeOffs: string[];
  ar: string;
}

/**
 * منازلة نسخة المحرّك السابقة.
 *
 * كل تعديل على محرّك الأسئلة ينازل سابقه على المقايسة نفسها، ويُعرض أين تحسّن وأين تراجع —
 * بالمتوسط وبأسوأ حالة وبالحالة الخصومية. ولا يُقبل خوارزمٌ لأن متوسّطه جميل.
 */
export function challengeVersions(input: { incumbent: string; challenger: string; cases: ChallengeCase[] }): ChallengeReport {
  const rows: ChallengeRow[] = [];
  for (const key of Object.keys(BUDGET_METRICS) as BudgetMetric[]) {
    const deltas: { id: string; delta: number }[] = [];
    for (const testCase of input.cases) {
      const before = testCase.baseline[key];
      const after = testCase.candidate[key];
      if (before === undefined || after === undefined) continue;
      deltas.push({ id: testCase.id, delta: Number((after - before).toFixed(4)) });
    }
    if (!deltas.length) continue;
    const worst = deltas.reduce((a, b) => (b.delta > a.delta ? b : a));
    rows.push({
      metric: key,
      ar: BUDGET_METRICS[key].ar,
      improvedIn: deltas.filter(row => row.delta < 0).map(row => row.id),
      regressedIn: deltas.filter(row => row.delta > 0).map(row => row.id),
      averageDelta: Number((deltas.reduce((sum, row) => sum + row.delta, 0) / deltas.length).toFixed(4)),
      worstDelta: worst.delta,
      worstCase: worst.id,
    });
  }

  /*
   * قاعدة الهيمنة.
   *
   * خوارزمٌ أبطأ، وأكثر تكرارًا، وأعلى تفاوتَ صعوبة، وأعلى انكشافًا — ولا مكسب له في معيارٍ
   * آخر — يُرفض. ولا يُقبل «لكنه أنظف بنيةً»: البنية لا يراها المتسابق، والتكرار يراه.
   */
  const regressed = rows.filter(row => row.averageDelta > 0);
  const improved = rows.filter(row => row.averageDelta < 0);
  const dominated = regressed.length > 0 && improved.length === 0;
  const tradeOffs = regressed.length && improved.length
    ? [`تراجعٌ في: ${regressed.map(row => row.ar).join('، ')}. مقابل تحسّنٍ في: ${improved.map(row => row.ar).join('، ')}.`]
    : [];

  return {
    challenger: input.challenger,
    incumbent: input.incumbent,
    rows,
    dominated,
    tradeOffs,
    ar: dominated
      ? `${input.challenger} مهيمنٌ عليه: تراجع في ${regressed.length} معيارًا ولم يكسب في واحد. يُرفض.`
      : improved.length && !regressed.length
        ? `${input.challenger} يتفوّق على ${input.incumbent} في ${improved.length} معيارًا بلا تراجعٍ في شيء.`
        : `${input.challenger} مفاضلةٌ لا تفوّق مطلق. ${tradeOffs[0] || ''}`,
  };
}

/* ───────────────────────── تاريخ الجبهة ───────────────────────── */

export interface FrontierHistoryEntry {
  recordedAt: string;
  engineVersion: string;
  scenario: string;
  metrics: Partial<Record<BudgetMetric, number>>;
  optimalityGap?: Record<string, number | null>;
  note?: string;
}

export interface FrontierHistory {
  historyVersion: typeof FAIRNESS_BUDGET_VERSION;
  entries: FrontierHistoryEntry[];
}

/**
 * تاريخ جبهة العدالة.
 *
 * لا بيانات متسابقين هنا بحال: مقاييس مقايسةٍ اصطناعية وحدها. والغرض أن يُسأل بعد سنة:
 * كيف تطوّرت عدالة ميزان؟ فيُجاب بأرقامٍ مسجَّلة لا بذاكرة.
 */
export function appendFrontierHistory(history: FrontierHistory | null, entry: FrontierHistoryEntry): FrontierHistory {
  const entries = [...(history?.entries || []), entry];
  entries.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  return { historyVersion: FAIRNESS_BUDGET_VERSION, entries };
}

/** تطوّر مقياسٍ واحد عبر التاريخ المسجَّل — للعرض في لوحة العدالة. */
export function frontierTrend(history: FrontierHistory, scenario: string, metric: BudgetMetric) {
  return history.entries
    .filter(entry => entry.scenario === scenario && entry.metrics[metric] !== undefined)
    .map(entry => ({ recordedAt: entry.recordedAt, engineVersion: entry.engineVersion, value: entry.metrics[metric] as number }));
}
