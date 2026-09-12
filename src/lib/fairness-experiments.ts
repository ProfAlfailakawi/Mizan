/*
 * مختبر التجارب على العدالة.
 *
 * التوأم الرقمي يجيب: «ماذا يحدث في هذا التشغيل؟». وهذا الملف يجيب عن أسئلةٍ لا يجيب عنها
 * تشغيلٌ واحد مهما دقّ:
 *
 *   · الاستقرار   — تشغيلةٌ ببذرةٍ واحدة لا تكفي. ما توزيع النتائج على خمسمئة بذرة؟
 *   · الترتيب     — هل يغيّر ترتيبُ وصول المتسابقين عدالةَ ما يحصلون عليه؟
 *   · أسوأ ترتيب  — لا يُكتفى بالعشوائي: يُبحث عمدًا عن ترتيبٍ يُسيء بأقصى ما يستطيع.
 *   · الاستئصال   — هل كل طبقة ذكاءٍ في المحرّك تُحسّن النتيجة فعلًا، أم بعضها زينة؟
 *   · الحساسية    — هل نتيجة ميزان صلبة، أم يقلبها تغييرُ وزنٍ بخمسة في المئة؟
 *   · الخصومة     — ما التهيئة التي تجعل المشكلة أسوأ ما يمكن؟
 *
 * والفرق بين الفحص العشوائي وهذا الملف في السؤال لا في الأداة: الأول يسأل «هل تظهر
 * مشكلة؟»، وهذا يسأل «ما الذي يجعلها أسوأ؟».
 *
 * ولا شيء هنا يمسّ الإنتاج: كل ما في هذا الملف يبني مُدخلاتٍ ويشغّل التوأم ويقيس.
 */

import { runCompetitionTwin, type TwinInput, type TwinMetrics, type TwinResult } from './competition-twin';
import type { EngineWeights } from './question-engine';

export const FAIRNESS_EXPERIMENTS_VERSION = 'MIZAN-FAIRNESS-EXPERIMENTS-1';

/* مولّد حتمي: كل نتيجةٍ هنا قابلة لإعادة الإنتاج ببذرتها وحدها. */
export function seededRandom(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 0x100000000; };
}

/** المقاييس التي تُتابَع في كل التجارب. أسماؤها هي أسماؤها في تقرير المحاكاة، بلا ترجمة. */
export const TRACKED_METRICS = [
  'maxUsesOfAnyQuestion', 'totalRepeats', 'excessOverLowerBound', 'failedDraws',
  'maxModelDifficultyDelta', 'reuseDispersion', 'scarcityIncidents', 'selectionMillisP95',
] as const;
export type TrackedMetric = typeof TRACKED_METRICS[number];

const valueOf = (metrics: TwinMetrics, key: TrackedMetric): number => Number(metrics[key] ?? 0);

export interface Distribution {
  metric: TrackedMetric;
  samples: number;
  min: number;
  median: number;
  p95: number;
  /** أسوأ ما رُصد فعلًا — لا أسوأ ما يُتصوَّر. */
  worst: number;
  mean: number;
  variance: number;
  /** توزيع القيم: القيمة ← كم مرة ظهرت، وبأي نسبة. */
  histogram: { value: number; count: number; share: number }[];
}

function distribution(metric: TrackedMetric, values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : 0);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const variance = values.length ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length : 0;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return {
    metric,
    samples: values.length,
    min: sorted[0] ?? 0,
    median: at(50),
    p95: at(95),
    worst: sorted[sorted.length - 1] ?? 0,
    mean: Number(mean.toFixed(4)),
    variance: Number(variance.toFixed(4)),
    histogram: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count, share: Number(((count / values.length) * 100).toFixed(2)) })),
  };
}

/* ───────────────────────── استقرار مونتي كارلو ───────────────────────── */

export interface MonteCarloReport {
  seeds: number;
  distributions: Distribution[];
  /** بذورٌ أخرجت أسوأ قيمةٍ رُصدت لكل مقياس — مادّة إعادة الإنتاج. */
  worstSeedByMetric: Record<string, string>;
  elapsedMs: number;
}

/**
 * تشغيلةٌ واحدة ببذرةٍ واحدة لا تقول شيئًا عن الاستقرار.
 *
 * فتُشغَّل المسابقة نفسها بمئاتٍ من البذور، ويُعرض التوزيع لا المتوسط وحده. والمتوسط
 * الجميل فوق ذيلٍ ثقيل خداعٌ: ما يهمّ اللجنة هو ماذا يقع في أسوأ التشغيلات لا في أوسطها.
 */
export function monteCarloStability(input: { base: TwinInput; seeds: number; seedPrefix?: string }): MonteCarloReport {
  const startedAt = Date.now();
  const prefix = input.seedPrefix || input.base.seed;
  const byMetric = new Map<TrackedMetric, number[]>(TRACKED_METRICS.map(metric => [metric, []]));
  const seedOfIndex: string[] = [];
  for (let i = 0; i < input.seeds; i++) {
    const seed = `${prefix}#${i}`;
    seedOfIndex.push(seed);
    const result = runCompetitionTwin({ ...input.base, seed });
    for (const metric of TRACKED_METRICS) byMetric.get(metric)!.push(valueOf(result.metrics, metric));
  }
  const distributions = TRACKED_METRICS.map(metric => distribution(metric, byMetric.get(metric)!));
  const worstSeedByMetric: Record<string, string> = {};
  for (const metric of TRACKED_METRICS) {
    const values = byMetric.get(metric)!;
    let worstIndex = 0;
    values.forEach((value, index) => { if (value > values[worstIndex]) worstIndex = index; });
    worstSeedByMetric[metric] = seedOfIndex[worstIndex] ?? prefix;
  }
  return { seeds: input.seeds, distributions, worstSeedByMetric, elapsedMs: Date.now() - startedAt };
}

/* ───────────────────────── حساسية الترتيب ───────────────────────── */

export type ArrivalOrder = 'registration' | 'random' | 'grouped_by_scope' | 'rare_scope_first' | 'rare_scope_last' | 'hall_grouped' | 'adversarial';

export interface OrderSensitivityRow {
  order: ArrivalOrder;
  metrics: Record<TrackedMetric, number>;
}

export interface OrderSensitivityReport {
  rows: OrderSensitivityRow[];
  /** أكبر فرقٍ بين ترتيبين في كل مقياس — هذا هو مقدار ما يحكمه الترتيب وحده. */
  spread: Record<string, { min: number; max: number; delta: number; worstOrder: ArrivalOrder }>;
  elapsedMs: number;
}

/** ندرة نطاق المتسابق: كم من زملائه يشاركه النطاق نفسه. الأقلّ مشاركةً هو الأندر. */
function scopeRarity(participants: TwinInput['participants']) {
  const counts = new Map<string, number>();
  for (const participant of participants) {
    const key = JSON.stringify(participant.scope.segments);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return (participant: TwinInput['participants'][number]) => counts.get(JSON.stringify(participant.scope.segments)) || 0;
}

export function reorderParticipants(participants: TwinInput['participants'], order: ArrivalOrder, seed: string): TwinInput['participants'] {
  const rarity = scopeRarity(participants);
  const list = [...participants];
  switch (order) {
    case 'registration': return list;
    case 'random': {
      const next = seededRandom(seed);
      const keyed = list.map(participant => ({ participant, key: next() }));
      keyed.sort((a, b) => a.key - b.key);
      return keyed.map(row => row.participant);
    }
    case 'grouped_by_scope':
      return list.sort((a, b) => JSON.stringify(a.scope.segments).localeCompare(JSON.stringify(b.scope.segments)));
    case 'rare_scope_first':
      return list.sort((a, b) => rarity(a) - rarity(b) || a.participantId.localeCompare(b.participantId));
    case 'rare_scope_last':
      return list.sort((a, b) => rarity(b) - rarity(a) || a.participantId.localeCompare(b.participantId));
    case 'hall_grouped':
      return list.sort((a, b) => (a.hallId || '').localeCompare(b.hallId || '') || a.participantId.localeCompare(b.participantId));
    case 'adversarial':
      /*
       * ترتيبٌ خصم بسيط: أوسعُ النطاقات أولًا.
       *
       * ومعناه أن أصحاب الحيلة الواسعة يستهلكون المخزون المشترك قبل أن يصل أصحاب النطاق
       * الضيّق الذين لا بديل لهم. وهذا بعينه ما تُفترض «حماية المتسابقين القادمين» أنها
       * تمنعه — فهو المحكّ لا الافتراء.
       */
      return list.sort((a, b) => rarity(b) - rarity(a) || b.questionCount - a.questionCount || a.participantId.localeCompare(b.participantId));
  }
}

export function participantOrderSensitivity(input: { base: TwinInput; orders?: ArrivalOrder[] }): OrderSensitivityReport {
  const startedAt = Date.now();
  const orders = input.orders || ['registration', 'random', 'grouped_by_scope', 'rare_scope_first', 'rare_scope_last', 'hall_grouped', 'adversarial'];
  const rows: OrderSensitivityRow[] = [];
  for (const order of orders) {
    const participants = reorderParticipants(input.base.participants, order, `${input.base.seed}|${order}`);
    const result = runCompetitionTwin({ ...input.base, participants });
    rows.push({ order, metrics: Object.fromEntries(TRACKED_METRICS.map(metric => [metric, valueOf(result.metrics, metric)])) as Record<TrackedMetric, number> });
  }
  const spread: OrderSensitivityReport['spread'] = {};
  for (const metric of TRACKED_METRICS) {
    const values = rows.map(row => row.metrics[metric]);
    const max = Math.max(...values), min = Math.min(...values);
    spread[metric] = { min, max, delta: Number((max - min).toFixed(4)), worstOrder: rows[values.indexOf(max)].order };
  }
  return { rows, spread, elapsedMs: Date.now() - startedAt };
}

/* ───────────────────────── البحث عن أسوأ ترتيب وصول ───────────────────────── */

export interface WorstArrivalReport {
  metric: TrackedMetric;
  baseline: number;
  worst: number;
  /** الزيادة التي أحدثها الترتيب وحده — هذا هو ندم الترتيب. */
  delta: number;
  iterations: number;
  /** معرّفات المتسابقين بالترتيب الذي أنتج الأسوأ — مادّة إعادة الإنتاج. */
  worstOrderIds: string[];
  elapsedMs: number;
}

/**
 * بحثٌ عن ترتيب وصولٍ يُسيء بأقصى ما يستطيع.
 *
 * تلدينٌ محاكى بسيط: يُبدَّل موضعا متسابقَين، فإن ساءت النتيجة قُبل التبديل، وإن تحسّنت
 * قُبل أحيانًا بحرارةٍ تهبط — فلا يعلق البحث في أول قمّةٍ يبلغها.
 *
 * والغرض ليس اتهام المحرّك: الترتيب لا يملكه أحد يوم المسابقة. الغرض معرفة **مقدار** ما
 * يملكه الترتيب من العدالة. فإن كان كبيرًا فهذه معلومةٌ خطيرة عن مُخصِّصٍ يعمل على الخط.
 */
export function worstCaseArrivalSearch(input: {
  base: TwinInput;
  metric?: TrackedMetric;
  iterations?: number;
  seed?: string;
}): WorstArrivalReport {
  const startedAt = Date.now();
  const metric = input.metric || 'maxUsesOfAnyQuestion';
  const iterations = Math.max(1, input.iterations ?? 60);
  const next = seededRandom(input.seed || `${input.base.seed}|worst-arrival`);
  const score = (participants: TwinInput['participants']) => valueOf(runCompetitionTwin({ ...input.base, participants }).metrics, metric);

  let current = [...input.base.participants];
  let currentScore = score(current);
  const baseline = currentScore;
  let best = current, bestScore = currentScore;

  for (let i = 0; i < iterations; i++) {
    const temperature = 1 - i / iterations;
    const candidate = [...current];
    const a = Math.floor(next() * candidate.length);
    const b = Math.floor(next() * candidate.length);
    if (a === b) continue;
    [candidate[a], candidate[b]] = [candidate[b], candidate[a]];
    const candidateScore = score(candidate);
    // القبول: كل تدهورٍ يُقبل، والتحسّن يُقبل احتمالًا بحرارةٍ تهبط.
    if (candidateScore >= currentScore || next() < temperature * 0.3) { current = candidate; currentScore = candidateScore; }
    if (candidateScore > bestScore) { best = candidate; bestScore = candidateScore; }
  }

  return {
    metric,
    baseline,
    worst: bestScore,
    delta: Number((bestScore - baseline).toFixed(4)),
    iterations,
    worstOrderIds: best.map(participant => participant.participantId),
    elapsedMs: Date.now() - startedAt,
  };
}

/* ───────────────────────── استئصال الطبقات ───────────────────────── */

export type AblationLayer = 'none' | 'scarcity' | 'exposure' | 'model_balance' | 'separation' | 'usage_balance' | 'neighborhood' | 'diversity';

export interface AblationRow {
  layer: AblationLayer;
  ar: string;
  metrics: Record<TrackedMetric, number>;
  /** الفرق عن المحرّك الكامل. موجبٌ = الطبقة كانت تُحسّن، صفر = لا أثر مقيس. */
  deltaFromFull: Record<TrackedMetric, number>;
  /** هل لهذه الطبقة أثرٌ مقيس في أيّ مقياس؟ */
  measurableEffect: boolean;
}

export interface AblationReport { rows: AblationRow[]; inertLayers: AblationLayer[]; elapsedMs: number }

const ABLATION_LABELS: Record<AblationLayer, string> = {
  none: 'المحرّك الكامل',
  scarcity: 'بلا حماية المورد النادر',
  exposure: 'بلا اعتبار الانكشاف',
  model_balance: 'بلا موازنة صعوبة النموذج',
  separation: 'بلا مباعدة',
  usage_balance: 'بلا موازنة الاستعمال',
  neighborhood: 'بلا اعتبار الجوار',
  diversity: 'بلا اعتبار التنوّع',
};

function ablate(base: TwinInput, layer: AblationLayer): TwinInput {
  const weights: Partial<EngineWeights> = { ...(base.weights || {}) };
  switch (layer) {
    case 'none': return base;
    case 'scarcity': return { ...base, protectFutureContestants: false, weights: { ...weights, scarcity: 0 } };
    case 'exposure': return { ...base, weights: { ...weights, exposure: 0 } };
    case 'model_balance': return { ...base, weights: { ...weights, modelBalance: 0 } };
    case 'separation': return { ...base, weights: { ...weights, separation: 0 } };
    case 'usage_balance': return { ...base, weights: { ...weights, usage: 0 }, usageBandTolerance: 10_000 };
    case 'neighborhood': return { ...base, weights: { ...weights, neighborhood: 0 } };
    case 'diversity': return { ...base, weights: { ...weights, diversity: 0 } };
  }
}

/**
 * هل كل طبقةٍ تُحسّن النتيجة فعلًا؟
 *
 * تُعطَّل طبقةٌ واحدة في كل تشغيلة، ويُقاس الفرق. وطبقةٌ لا يتغيّر بتعطيلها شيء ليست
 * «غير ضارّة»: هي كلفةٌ بلا مقابل مقيس، تُبقي في المحرّك تعقيدًا لا يشتري شيئًا. وقولُ
 * ذلك بالأرقام أنفع من الدفاع عنها بالنيّة.
 *
 * ولا يُغيَّر الإنتاج هنا بحال — القياس شيء والقرار شيء آخر.
 */
export function allocationAblation(input: { base: TwinInput; layers?: AblationLayer[] }): AblationReport {
  const startedAt = Date.now();
  const layers = input.layers || ['none', 'scarcity', 'exposure', 'model_balance', 'separation', 'usage_balance', 'neighborhood', 'diversity'];
  const full = runCompetitionTwin(ablate(input.base, 'none'));
  const fullMetrics = Object.fromEntries(TRACKED_METRICS.map(metric => [metric, valueOf(full.metrics, metric)])) as Record<TrackedMetric, number>;

  const rows: AblationRow[] = [];
  for (const layer of layers) {
    const result = layer === 'none' ? full : runCompetitionTwin(ablate(input.base, layer));
    const metrics = Object.fromEntries(TRACKED_METRICS.map(metric => [metric, valueOf(result.metrics, metric)])) as Record<TrackedMetric, number>;
    const deltaFromFull = Object.fromEntries(TRACKED_METRICS.map(metric => [metric, Number((metrics[metric] - fullMetrics[metric]).toFixed(4))])) as Record<TrackedMetric, number>;
    rows.push({
      layer, ar: ABLATION_LABELS[layer], metrics, deltaFromFull,
      measurableEffect: layer !== 'none' && TRACKED_METRICS.some(metric => Math.abs(deltaFromFull[metric]) > 1e-9),
    });
  }
  return { rows, inertLayers: rows.filter(row => row.layer !== 'none' && !row.measurableEffect).map(row => row.layer), elapsedMs: Date.now() - startedAt };
}

/* ───────────────────────── حساسية الأوزان ───────────────────────── */

export interface SensitivityRow {
  weight: keyof EngineWeights;
  deltaPercent: number;
  metrics: Record<TrackedMetric, number>;
  changeFromBase: Record<TrackedMetric, number>;
}

export interface SensitivityReport {
  rows: SensitivityRow[];
  /** أوزانٌ يقلب تحريكها الطفيف النتيجة قلبًا كبيرًا — إشارة أن السياسة تحتاج مراجعة. */
  highSensitivity: { weight: keyof EngineWeights; metric: TrackedMetric; atPercent: number; change: number }[];
  elapsedMs: number;
}

/**
 * هل نتيجة ميزان صلبة أم هشّة؟
 *
 * يُزاح كل وزنٍ رئيسي ±٥٪ و±١٠٪ و±٢٠٪، ويُقاس أثر ذلك على المقاييس كلها. فإن قلب تحريكٌ
 * بخمسة في المئة آلافَ القرارات فالنتيجة ليست «الأفضل» بل «ما خرج من هذا الضبط بعينه» —
 * وذلك ما يجب أن يُعرف قبل أن يُبنى عليه حكم.
 */
export function weightSensitivity(input: {
  base: TwinInput;
  weights?: (keyof EngineWeights)[];
  deltas?: number[];
  /** عتبة إعلان الحساسية العالية: تغيّرٌ نسبيّ في المقياس يفوق هذا. */
  highThreshold?: number;
}): SensitivityReport {
  const startedAt = Date.now();
  const weightNames = input.weights || ['difficulty', 'usage', 'scarcity', 'separation', 'exposure', 'modelBalance'];
  const deltas = input.deltas || [-20, -10, -5, 5, 10, 20];
  const threshold = input.highThreshold ?? 0.15;

  const baseRun = runCompetitionTwin(input.base);
  const baseMetrics = Object.fromEntries(TRACKED_METRICS.map(metric => [metric, valueOf(baseRun.metrics, metric)])) as Record<TrackedMetric, number>;
  const defaults: Record<string, number> = { difficulty: 3.0, modelBalance: 1.4, usage: 2.2, exposure: 1.1, scarcity: 1.6, separation: 1.8, neighborhood: 1.2, diversity: 0.9, jitter: 0.35 };

  const rows: SensitivityRow[] = [];
  const high: SensitivityReport['highSensitivity'] = [];
  for (const weight of weightNames) {
    const current = (input.base.weights?.[weight] ?? defaults[weight]) as number;
    for (const deltaPercent of deltas) {
      const value = current * (1 + deltaPercent / 100);
      const result = runCompetitionTwin({ ...input.base, weights: { ...(input.base.weights || {}), [weight]: value } });
      const metrics = Object.fromEntries(TRACKED_METRICS.map(metric => [metric, valueOf(result.metrics, metric)])) as Record<TrackedMetric, number>;
      const changeFromBase = Object.fromEntries(TRACKED_METRICS.map(metric => [metric, Number((metrics[metric] - baseMetrics[metric]).toFixed(4))])) as Record<TrackedMetric, number>;
      rows.push({ weight, deltaPercent, metrics, changeFromBase });
      for (const metric of TRACKED_METRICS) {
        const denominator = Math.max(1e-9, Math.abs(baseMetrics[metric]));
        const relative = Math.abs(changeFromBase[metric]) / denominator;
        if (relative > threshold) high.push({ weight, metric, atPercent: deltaPercent, change: changeFromBase[metric] });
      }
    }
  }
  return { rows, highSensitivity: high, elapsedMs: Date.now() - startedAt };
}

/* ───────────────────────── البحث الخصومي ───────────────────────── */

export interface AdversarialCandidate<C> { config: C; input: TwinInput }

export interface AdversarialReport<C> {
  configurationsSearched: number;
  bestFitness: number;
  baselineFitness: number;
  worstConfig: C | null;
  worstMetrics: TwinMetrics | null;
  /** كل تهيئةٍ تجاوزت عتبة الإبلاغ — مادّة حصاد الشواهد المضادّة. */
  harvested: { config: C; fitness: number; metrics: TwinMetrics }[];
  elapsedMs: number;
}

export type AdversarialFitness = (result: TwinResult) => number;

/**
 * لياقةٌ افتراضية تعظّم الضرر لا الفوضى.
 *
 * مركّبة عمدًا: سحبةٌ فاشلة أثقل من تكرارٍ زائد، وتجاوزُ الحدّ الرياضي أثقل من فارق
 * صعوبة. وكلُّ حدٍّ معلَنٌ بوزنه، فمن اختلف معه غيّره ورأى أثر تغييره.
 */
export const DEFAULT_ADVERSARIAL_FITNESS: AdversarialFitness = result => {
  const m = result.metrics;
  return m.failedDraws * 10
    + m.excessOverLowerBound * 6
    + m.totalRepeats * 0.05
    + m.maxModelDifficultyDelta * 2
    + m.scarcityIncidents * 0.1
    + m.scopeViolations * 1000
    + m.readingViolations * 1000
    + m.duplicateWithinModelViolations * 1000;
};

/**
 * بحثٌ خصومي عن تهيئةٍ تكسر جودة ميزان.
 *
 * الفرق عن الفحص العشوائي في السؤال: العشوائي يسأل «هل تظهر مشكلة؟»، وهذا يسأل «ما
 * التهيئة التي تجعلها أسوأ ما يمكن؟». فيولّد ثم **يُطفّر**: يأخذ أسوأ ما وجد ويغيّره
 * قليلًا، فيصعد نحو الأسوأ بدل أن يجرّب عشوائيًا من جديد في كل مرة.
 */
export function adversarialTournamentSearch<C>(input: {
  /** يولّد تهيئةً ابتدائية من عشوائيٍّ حتمي. */
  generate: (random: () => number, index: number) => AdversarialCandidate<C>;
  /** يُطفّر تهيئةً قائمة — هذا هو الفرق بين البحث والتجريب. */
  mutate: (config: C, random: () => number) => AdversarialCandidate<C>;
  iterations?: number;
  populationSeeds?: number;
  fitness?: AdversarialFitness;
  /** عتبة حصاد الشاهد المضادّ: ما تجاوزها يُحفظ. */
  harvestThreshold?: number;
  seed?: string;
}): AdversarialReport<C> {
  const startedAt = Date.now();
  const fitness = input.fitness || DEFAULT_ADVERSARIAL_FITNESS;
  const iterations = Math.max(1, input.iterations ?? 40);
  const population = Math.max(1, input.populationSeeds ?? 6);
  const random = seededRandom(input.seed || 'adversarial');
  const harvested: AdversarialReport<C>['harvested'] = [];

  let best: { config: C; fitness: number; metrics: TwinMetrics } | null = null;
  let baselineFitness = 0;
  let searched = 0;

  const evaluate = (candidate: AdversarialCandidate<C>) => {
    const result = runCompetitionTwin(candidate.input);
    searched++;
    const value = fitness(result);
    if (input.harvestThreshold !== undefined && value >= input.harvestThreshold) harvested.push({ config: candidate.config, fitness: value, metrics: result.metrics });
    if (!best || value > best.fitness) best = { config: candidate.config, fitness: value, metrics: result.metrics };
    return value;
  };

  for (let i = 0; i < population; i++) {
    const candidate = input.generate(random, i);
    const value = evaluate(candidate);
    if (i === 0) baselineFitness = value;
  }
  for (let i = 0; i < iterations; i++) {
    if (!best) break;
    evaluate(input.mutate(best.config, random));
  }

  return {
    configurationsSearched: searched,
    bestFitness: best ? (best as { fitness: number }).fitness : 0,
    baselineFitness,
    worstConfig: best ? (best as { config: C }).config : null,
    worstMetrics: best ? (best as { metrics: TwinMetrics }).metrics : null,
    harvested,
    elapsedMs: Date.now() - startedAt,
  };
}
