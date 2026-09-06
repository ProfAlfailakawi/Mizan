/*
 * احتساب درجة اللجنة — تطبيق واحد يشترك فيه العميل والخادم.
 *
 * الدرجة كانت تُحسب في المتصفّح فقط، ويُكتب ناتجها كما هو. وهذا يجعل صحّة النتيجة قائمة على
 * سلامة العميل وحده. الخادم الآن يعيد الاحتساب من إرسالات المحكمين الخام ويشهد على الناتج
 * (`result-attestation`)، وهذه الوحدة هي القاعدة المشتركة بينهما.
 *
 * الاشتراك مقصود لا اختصارًا: نسختان من قواعد الاحتساب تتباعدان مع أول تعديل، فتصير «شهادة»
 * الخادم شهادةً على قواعد أخرى. القاعدة واحدة، والاستقلال يأتي من أن الخادم يبدأ من الإرسالات
 * الخام لا من الدرجة المُرسَلة.
 *
 * دوالّ خالصة بلا اعتماد على متصفّح أو حالة عامة، ليصحّ استيرادها في الطرفين.
 */

export interface ScoringCriterion { id: string; maxScore: number }
export interface ScoringSubmission {
  totalScore: number;
  criterionScores?: Record<string, number>;
  /** المعايير التي يتحمّل هذا المحكّم مسؤوليتها في اللجان المتخصّصة. */
  scoredCriterionIds?: string[];
  sessionPenaltyCount?: number;
}
export type ScoringMode = 'all_judges_all_criteria' | string;
export interface PanelScore { finalScore: number; criterionScores: Record<string, number> }

const round = (v: number, digits: number) => Number(v.toFixed(digits));
const mean = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);

/**
 * درجة اللجنة من إرسالات محكميها.
 *
 * متوسط الدرجات الكلية صحيح **فقط** حين يُقيّم كل محكّم الرُبريك كاملًا. وفي اللجان المتخصّصة
 * يُقيّم كل محكّم معاييره وحدها، فالصواب جمعُ درجة كل معيار من المسؤول عنه — لا متوسط درجات
 * جزئية مُسقَطة لأعلى، فذلك يعطي رقمًا لم يمنحه أحد.
 */
export function computePanelScore(input: {
  submissions: ScoringSubmission[];
  criteria: ScoringCriterion[];
  mode: ScoringMode;
  dropExtremes?: boolean;
}): PanelScore {
  const { submissions, criteria, mode, dropExtremes } = input;
  const criterionScores: Record<string, number> = {};

  if (mode === 'all_judges_all_criteria') {
    let scoreInputs = submissions.map((s) => s.totalScore);
    if (dropExtremes && scoreInputs.length >= 3) {
      const sorted = [...scoreInputs].sort((a, b) => a - b);
      scoreInputs = sorted.slice(1, -1);
    }
    for (const c of criteria) {
      const vals = submissions.map((s) => s.criterionScores?.[c.id]).filter((v): v is number => typeof v === 'number');
      criterionScores[c.id] = vals.length ? round(mean(vals), 3) : c.maxScore;
    }
    return { finalScore: round(mean(scoreInputs), 2), criterionScores };
  }

  for (const c of criteria) {
    const responsible = submissions.filter((s) => (s.scoredCriterionIds || []).includes(c.id));
    // بلا إسناد صريح للمسؤولية نرجع إلى كل الإرسالات بدل إسقاط المعيار من الدرجة.
    const contributors = responsible.length ? responsible : submissions;
    const vals = contributors.map((s) => s.criterionScores?.[c.id]).filter((v): v is number => typeof v === 'number');
    criterionScores[c.id] = vals.length ? round(mean(vals), 3) : c.maxScore;
  }
  return { finalScore: round(Object.values(criterionScores).reduce((a, b) => a + b, 0), 2), criterionScores };
}

/** عدد المخالفات المعتمد للجلسة: أعلى ما رصده محكّم أو سجّلته أحداث الجلسة. */
export function panelPenaltyCount(submissions: ScoringSubmission[], sessionEventCount = 0): number {
  return Math.max(0, ...submissions.map((s) => s.sessionPenaltyCount || 0), sessionEventCount);
}

export interface RankableResult { finalScore: number; criterionScores?: Record<string, number>; penaltyCount?: number }

/**
 * ترتيب حاسم عند تساوي الدرجة، بترتيب قواعد الرُبريك.
 * `additional_question` لا يُحسم آليًا (يحتاج إعادة اختبار) فيُعامَل محايدًا.
 */
export function breakTie(a: RankableResult, b: RankableResult, rules: readonly string[] = []): number {
  for (const rule of rules) {
    if (rule === 'memorization_priority') {
      const d = (b.criterionScores?.['memorization'] || 0) - (a.criterionScores?.['memorization'] || 0);
      if (Math.abs(d) > 1e-9) return d;
    } else if (rule === 'tajweed_priority') {
      const d = (b.criterionScores?.['tajweed'] || 0) - (a.criterionScores?.['tajweed'] || 0);
      if (Math.abs(d) > 1e-9) return d;
    } else if (rule === 'fewest_penalties') {
      const d = (a.penaltyCount || 0) - (b.penaltyCount || 0);
      if (d !== 0) return d;
    }
  }
  return 0;
}
