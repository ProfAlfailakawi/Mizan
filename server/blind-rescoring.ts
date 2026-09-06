import { computePanelScore, type ScoringCriterion, type ScoringSubmission } from '../src/lib/scoring-core';

/*
 * التحكيم الأعمى المزدوج.
 *
 * تقول كل مسابقة إن محكميها عدول، ولا تملك رقمًا يسند القول. هذه الطبقة تقيسه: تُعاد تلاوةٌ
 * سبق تحكيمها على محكّم آخر **دون أن يعلم أنها مُحكَّمة**، ثم يُقاس الفرق بين الحكمين.
 *
 * الإعماء شرط لا تحسين: محكّم يعلم أنه يراجع زميلًا يقيس اتفاقه مع زميله لا مع التلاوة، والرقم
 * الناتج يصف مجاملةً لا موثوقية. لذلك لا يخرج من هنا ما يكشف الحكم الأول، ولا يُختار مراجعٌ شارك
 * في الجلسة الأصلية أو رآها.
 *
 * والقياس **لا يغيّر درجة**: نتيجة المتسابق تبقى كما ختمتها لجنته. المقيس هو النظام لا الشخص،
 * والمخرج دليل للإدارة العلمية لا حكم على محكّم.
 */

export interface ScoredSession {
  sessionId: string;
  participantId: string;
  judgeId: string;
  submittedAt: string;
  totalScore: number;
  criterionScores?: Record<string, number>;
  /** هل بقي تسجيل يُعاد سماعه؟ بلا تسجيل لا تُعاد الجلسة. */
  hasRecording?: boolean;
}

export interface BlindAssignment {
  sessionId: string;
  participantId: string;
  /** المحكّم المكلَّف بالإعادة — لا يعلم أنها إعادة. */
  reviewerId: string;
  /** يُحجب عن المراجع؛ يُستعمل عند المقارنة فقط. */
  originalJudgeId: string;
  assignedAt: string;
}

/** ما يُسلَّم للمراجع فعلًا: جلسة للتحكيم، بلا أي أثر لحكمٍ سابق. */
export interface BlindWorkItem { sessionId: string; participantId: string; reviewerId: string }

export interface AgreementPair {
  sessionId: string;
  participantId: string;
  originalScore: number;
  reviewScore: number;
  difference: number;
  /** فروق كل معيار على حدة — تكشف أين يقع الخلاف لا كم مقداره. */
  criterionDifferences: Record<string, number>;
}

export interface ReliabilityReport {
  protocol: 'MIZAN-BLIND-RESCORING-1';
  pairs: number;
  /** نسبة الأزواج التي لا يتجاوز فرقها السماحية المعلنة. */
  agreementRate: number;
  toleranceUsed: number;
  meanAbsoluteDifference: number;
  maxAbsoluteDifference: number;
  /** الأزواج التي تجاوزت السماحية — تُعرض للمراجعة العلمية بلا حكم مسبق. */
  outliers: AgreementPair[];
  /** أوسع المعايير خلافًا، وهو ما يُدرَّب عليه لا ما يُعاقَب عليه. */
  widestCriterion?: { criterionId: string; meanAbsoluteDifference: number };
  /** يُقال صراحةً حين العيّنة أصغر من أن تُحمَّل استنتاجًا. */
  sufficientSample: boolean;
  note: string;
}

/** أقلّ عدد أزواج يُبنى عليه كلام؛ ما دونه يُعرض عددًا لا نسبةً يُوثق بها. */
export const MIN_RELIABLE_PAIRS = 8;

/**
 * اختيار الجلسات المؤهّلة للإعادة وإسنادها.
 *
 * لا يُسنَد مراجعٌ حكم الجلسة أصلًا، ولا جلسةٌ بلا تسجيل، ولا يُكلَّف مراجعٌ فوق حصّته حتى لا
 * تتحول العينة إلى قياس محكّم واحد. والاختيار حتميّ بالبذرة فيُعاد إنتاجه عند المراجعة.
 */
export function planBlindRescoring(input: {
  sessions: ScoredSession[];
  reviewers: string[];
  targetPairs: number;
  seed: string;
  maxPerReviewer?: number;
}): BlindAssignment[] {
  const eligible = input.sessions.filter((s) => s.hasRecording !== false && s.sessionId && s.judgeId);
  const reviewers = [...new Set(input.reviewers)].filter(Boolean);
  if (!eligible.length || !reviewers.length) return [];
  const maxPer = Math.max(1, input.maxPerReviewer ?? Math.ceil(input.targetPairs / reviewers.length) + 1);

  // ترتيب حتمي مشتق من البذرة، فالعيّنة ليست اختيارًا بشريًا يمكن توجيهه.
  const ordered = [...eligible].sort((a, b) =>
    hash(`${input.seed}:${a.sessionId}`).localeCompare(hash(`${input.seed}:${b.sessionId}`)));

  const load = new Map<string, number>(reviewers.map((r) => [r, 0]));
  const out: BlindAssignment[] = [];
  for (const s of ordered) {
    if (out.length >= input.targetPairs) break;
    const candidate = reviewers
      .filter((r) => r !== s.judgeId && (load.get(r) || 0) < maxPer)
      .sort((a, b) => (load.get(a) || 0) - (load.get(b) || 0) || a.localeCompare(b))[0];
    if (!candidate) continue;
    load.set(candidate, (load.get(candidate) || 0) + 1);
    out.push({ sessionId: s.sessionId, participantId: s.participantId, reviewerId: candidate, originalJudgeId: s.judgeId, assignedAt: new Date().toISOString() });
  }
  return out;
}

/** ما يراه المراجع: لا درجة سابقة ولا اسم محكّم ولا إشارة إلى أنها إعادة. */
export function blindWorkItem(assignment: BlindAssignment): BlindWorkItem {
  return { sessionId: assignment.sessionId, participantId: assignment.participantId, reviewerId: assignment.reviewerId };
}

/** مقارنة الحكمين المستقلّين بعد وصول الثاني. */
export function measureAgreement(input: {
  assignments: BlindAssignment[];
  originals: ScoredSession[];
  reviews: ScoredSession[];
  criteria: ScoringCriterion[];
  tolerance?: number;
}): ReliabilityReport {
  const tolerance = input.tolerance ?? 2;
  const originalBy = new Map(input.originals.map((s) => [`${s.sessionId}:${s.judgeId}`, s]));
  const reviewBy = new Map(input.reviews.map((s) => [`${s.sessionId}:${s.judgeId}`, s]));

  const pairs: AgreementPair[] = [];
  for (const a of input.assignments) {
    const original = originalBy.get(`${a.sessionId}:${a.originalJudgeId}`);
    const review = reviewBy.get(`${a.sessionId}:${a.reviewerId}`);
    if (!original || !review) continue;
    const criterionDifferences: Record<string, number> = {};
    for (const c of input.criteria) {
      const o = original.criterionScores?.[c.id], r = review.criterionScores?.[c.id];
      if (typeof o === 'number' && typeof r === 'number') criterionDifferences[c.id] = round(r - o);
    }
    pairs.push({
      sessionId: a.sessionId, participantId: a.participantId,
      originalScore: original.totalScore, reviewScore: review.totalScore,
      difference: round(review.totalScore - original.totalScore),
      criterionDifferences,
    });
  }

  const abs = pairs.map((p) => Math.abs(p.difference));
  const within = pairs.filter((p) => Math.abs(p.difference) <= tolerance).length;

  // أوسع المعايير خلافًا: يُحسب فقط حين وُجد له قياس، ولا يُخترع حين لا توجد معايير مشتركة.
  const perCriterion = input.criteria
    .map((c) => {
      const diffs = pairs.map((p) => p.criterionDifferences[c.id]).filter((v): v is number => typeof v === 'number');
      return diffs.length ? { criterionId: c.id, meanAbsoluteDifference: round(mean(diffs.map(Math.abs))) } : null;
    })
    .filter((x): x is { criterionId: string; meanAbsoluteDifference: number } => !!x)
    .sort((a, b) => b.meanAbsoluteDifference - a.meanAbsoluteDifference);

  const sufficientSample = pairs.length >= MIN_RELIABLE_PAIRS;
  return {
    protocol: 'MIZAN-BLIND-RESCORING-1',
    pairs: pairs.length,
    agreementRate: pairs.length ? round(within / pairs.length) : 0,
    toleranceUsed: tolerance,
    meanAbsoluteDifference: abs.length ? round(mean(abs)) : 0,
    maxAbsoluteDifference: abs.length ? round(Math.max(...abs)) : 0,
    outliers: pairs.filter((p) => Math.abs(p.difference) > tolerance).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)),
    widestCriterion: perCriterion[0],
    sufficientSample,
    note: sufficientSample
      ? 'قياس موثوقية بين محكمين على تلاوات مُعادة بإعماء. لا يغيّر أي درجة مختومة.'
      : `العيّنة ${pairs.length} زوجًا وهي أصغر من ${MIN_RELIABLE_PAIRS}؛ تُعرض كعدّ لا كنسبة يُستنتج منها.`,
  };
}

/** درجة المراجع تُحتسب بنفس قواعد اللجنة، فالمقارنة بين رقمين من ميزان واحد. */
export function reviewerTotal(submission: ScoringSubmission, criteria: ScoringCriterion[], mode: string): number {
  return computePanelScore({ submissions: [submission], criteria, mode }).finalScore;
}

const round = (v: number) => Number(v.toFixed(3));
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
function hash(v: string): string {
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(16).padStart(8, '0');
}
