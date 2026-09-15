/*
 * المراكز ونِسَبها، والحجب.
 *
 * المركز ليس ترتيبًا فحسب. اللائحة عندنا تقول: المركز الأول لمن بلغ نسبةً معلنة، فإن لم
 * يبلغها أحد حُجب المركز ولم يُمنح لأعلى الحاضرين. وهذا ليس قسوةً: هو ما يجعل «الأول»
 * يعني شيئًا ثابتًا عبر الدورات، فلا يكون أولُ عامٍ أضعفَ من عاشر عامٍ آخر.
 *
 * فالمركز هنا عتبةٌ معلنة قبل المسابقة، والترتيب يأتي بعدها لا قبلها:
 *   ١) من لم يبلغ عتبة المركز لا يناله ولو كان الأعلى.
 *   ٢) المركز المحجوب يُقال محجوبًا باسمه وسببه، ولا يُزحزح من بعده إلى مكانه.
 *   ٣) من بلغ عتبةً ولم ينلها لازدحام المركز يُقال «ضمن المنافسة» بمستواه، لا «خاسرًا».
 *
 * والنِّسب تُكتب مئويةً كما تكتبها اللجنة (٩٧ تعني ٩٧٪ من الدرجة الكاملة)، لا كسورًا.
 */

export interface AwardPlace {
  /** ١ = المركز الأول. */
  rank: number;
  titleArabic: string;
  titleEnglish: string;
  /** أقل نسبة مئوية (٠–١٠٠) تُنال بها هذه المرتبة. */
  minimumPercentage: number;
  /** كم متسابقًا يسع هذا المركز. الافتراضي واحد؛ والتعادل قد يتجاوزه. */
  seats: number;
  /** حين لا يبلغ العتبةَ أحد: يُحجب المركز، أو يُمنح لأعلى المتقدّمين. */
  whenUnmet: 'withhold' | 'award_anyway';
}

export interface AwardPolicy {
  version: number;
  places: AwardPlace[];
  /** أقل نسبة تُعدّ بها المشاركة «ضمن المنافسة» وتُذكر في الشهادة. */
  competingThresholdPercentage: number;
  /** هل يُذكر في الشهادة أن صاحبها كان ضمن المنافسة؟ */
  showCompetingOnCertificate: boolean;
}

export const DEFAULT_AWARD_POLICY: AwardPolicy = {
  version: 1,
  competingThresholdPercentage: 85,
  showCompetingOnCertificate: true,
  places: [
    { rank: 1, titleArabic: 'المركز الأول', titleEnglish: 'First place', minimumPercentage: 98, seats: 1, whenUnmet: 'withhold' },
    { rank: 2, titleArabic: 'المركز الثاني', titleEnglish: 'Second place', minimumPercentage: 96, seats: 1, whenUnmet: 'withhold' },
    { rank: 3, titleArabic: 'المركز الثالث', titleEnglish: 'Third place', minimumPercentage: 94, seats: 1, whenUnmet: 'withhold' },
  ],
};

export interface AwardCandidate {
  participantId: string;
  participantCode: string;
  /** الدرجة النهائية كما اعتُمدت. */
  finalScore: number;
  /** الدرجة الكاملة لهذه الفئة (عادةً ١٠٠). */
  maxScore: number;
}

export type AwardStanding =
  | { kind: 'place'; place: AwardPlace; percentage: number }
  | { kind: 'competing'; percentage: number }
  | { kind: 'participant'; percentage: number };

export interface AwardOutcome {
  /** المراكز الممنوحة فعلًا، مرتّبة. */
  awarded: { place: AwardPlace; winners: (AwardCandidate & { percentage: number })[] }[];
  /** المراكز التي لم يبلغ عتبتَها أحد، مع سببها. */
  withheld: { place: AwardPlace; reasonArabic: string; reasonEnglish: string; bestPercentage: number | null }[];
  /** حالة كل متسابق: مركزٌ، أو ضمن المنافسة، أو مشاركة. */
  standings: Map<string, AwardStanding>;
}

export const scorePercentage = (score: number, maxScore: number) => {
  const max = Number(maxScore) || 0;
  if (max <= 0) return 0;
  return Number(Math.max(0, Math.min(100, (Number(score) || 0) / max * 100)).toFixed(2));
};

export function normalizeAwardPolicy(policy?: Partial<AwardPolicy> | null): AwardPolicy {
  const places = (policy?.places?.length ? policy.places : DEFAULT_AWARD_POLICY.places)
    .map((place, index) => ({
      rank: Math.max(1, Math.round(Number(place.rank) || index + 1)),
      titleArabic: place.titleArabic || `المركز ${index + 1}`,
      titleEnglish: place.titleEnglish || `Place ${index + 1}`,
      minimumPercentage: Math.max(0, Math.min(100, Number(place.minimumPercentage) || 0)),
      seats: Math.max(1, Math.round(Number(place.seats) || 1)),
      whenUnmet: place.whenUnmet === 'award_anyway' ? 'award_anyway' as const : 'withhold' as const,
    }))
    .sort((a, b) => a.rank - b.rank);
  return {
    version: Math.max(1, Math.round(Number(policy?.version) || 1)),
    places,
    competingThresholdPercentage: Math.max(0, Math.min(100, Number(policy?.competingThresholdPercentage ?? DEFAULT_AWARD_POLICY.competingThresholdPercentage))),
    showCompetingOnCertificate: policy?.showCompetingOnCertificate !== false,
  };
}

/**
 * نِسب المراكز يجب أن تنزل مع المرتبة: مركزٌ ثانٍ عتبتُه أعلى من الأول تناقضٌ يُسكت عنه
 * حتى يوم الإعلان. يُقال هنا بدل أن يُكتشف هناك.
 */
export function validateAwardPolicy(policy: AwardPolicy, arabic: boolean): string[] {
  const issues: string[] = [];
  const places = [...policy.places].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < places.length; i++) {
    if (places[i].minimumPercentage > places[i - 1].minimumPercentage) {
      issues.push(arabic
        ? `نسبة «${places[i].titleArabic}» أعلى من نسبة «${places[i - 1].titleArabic}»؛ العتبات تنزل مع المرتبة لا ترتفع.`
        : `“${places[i].titleEnglish}” requires a higher percentage than “${places[i - 1].titleEnglish}”; thresholds must descend with rank.`);
    }
  }
  const lowest = places.length ? places[places.length - 1].minimumPercentage : 0;
  if (policy.competingThresholdPercentage > lowest && places.length) {
    issues.push(arabic
      ? `عتبة «ضمن المنافسة» (${policy.competingThresholdPercentage}٪) أعلى من عتبة آخر مركز (${lowest}٪)، فلن يقع فيها أحد.`
      : `The “in contention” threshold (${policy.competingThresholdPercentage}%) sits above the last place threshold (${lowest}%), so nobody can fall into it.`);
  }
  return issues;
}

/**
 * توزيع المراكز.
 *
 * الترتيب بالدرجة نزولًا، ثم تُمنح المراكز بالتتابع: من بلغ عتبة المركز المفتوح ناله،
 * ومن لم يبلغها لم يُنقل المركز إليه ولم يُطوَ المركز عمّن بعده — يُحجب ويُنتقل إلى ما
 * يليه، وتبقى بقية المتسابقين مرشّحين لما هو أدنى عتبةً.
 */
export function resolveAwards(input: { policy: AwardPolicy; candidates: AwardCandidate[] }): AwardOutcome {
  const policy = normalizeAwardPolicy(input.policy);
  const ranked = input.candidates
    .map(c => ({ ...c, percentage: scorePercentage(c.finalScore, c.maxScore) }))
    .sort((a, b) => b.percentage - a.percentage || a.participantCode.localeCompare(b.participantCode));

  const awarded: AwardOutcome['awarded'] = [];
  const withheld: AwardOutcome['withheld'] = [];
  const standings = new Map<string, AwardStanding>();
  const taken = new Set<string>();

  for (const place of policy.places) {
    const pool = ranked.filter(c => !taken.has(c.participantId));
    const qualified = pool.filter(c => c.percentage >= place.minimumPercentage);
    if (!qualified.length) {
      if (place.whenUnmet === 'award_anyway' && pool.length) {
        const top = pool[0];
        // التعادل على الحد نفسه يُمنح معًا، ولو تجاوز عدد المقاعد.
        const winners = pool.filter(c => c.percentage === top.percentage);
        winners.forEach(w => { taken.add(w.participantId); standings.set(w.participantId, { kind: 'place', place, percentage: w.percentage }); });
        awarded.push({ place, winners });
        continue;
      }
      withheld.push({
        place,
        bestPercentage: pool.length ? pool[0].percentage : null,
        reasonArabic: pool.length
          ? `حُجب ${place.titleArabic}: النسبة المطلوبة ${place.minimumPercentage}٪ وأعلى ما تحقّق ${pool[0].percentage}٪.`
          : `حُجب ${place.titleArabic}: لا يوجد متسابق مؤهَّل.`,
        reasonEnglish: pool.length
          ? `${place.titleEnglish} withheld: ${place.minimumPercentage}% was required and the best result was ${pool[0].percentage}%.`
          : `${place.titleEnglish} withheld: no eligible participant.`,
      });
      continue;
    }
    const cutoff = qualified[Math.min(place.seats, qualified.length) - 1].percentage;
    const winners = qualified.filter(c => c.percentage >= cutoff);
    winners.forEach(w => { taken.add(w.participantId); standings.set(w.participantId, { kind: 'place', place, percentage: w.percentage }); });
    awarded.push({ place, winners });
  }

  for (const candidate of ranked) {
    if (standings.has(candidate.participantId)) continue;
    standings.set(candidate.participantId, candidate.percentage >= policy.competingThresholdPercentage
      ? { kind: 'competing', percentage: candidate.percentage }
      : { kind: 'participant', percentage: candidate.percentage });
  }

  return { awarded, withheld, standings };
}

/** العبارة التي تُكتب للمتسابق في شهادته وفي صفحته. */
export function describeStanding(standing: AwardStanding | undefined, arabic: boolean): string {
  if (!standing) return arabic ? 'شهادة مشاركة' : 'Certificate of participation';
  if (standing.kind === 'place') return arabic ? standing.place.titleArabic : standing.place.titleEnglish;
  if (standing.kind === 'competing') {
    return arabic
      ? `ضمن المنافسة — بلغت ${standing.percentage}٪ من الدرجة الكاملة`
      : `In contention — ${standing.percentage}% of the full score`;
  }
  return arabic ? 'شهادة مشاركة' : 'Certificate of participation';
}
