/*
 * بناء مسألة المِرصد من عالم ميزان.
 *
 * هنا يُترجم العالم الحقيقي — متسابقون ونطاقات ومناطق وبنك وسياسة وحجرٌ وحجز — إلى
 * المسألة الرياضية التي يحلّها `fairness-oracle`. وشرط الترجمة الوحيد: **ألّا تُرخى قيد.**
 * ما لا يمرّ في `QuestionAllocationEngine.eligible` لا يجوز أن يمرّ هنا، وإلا صار
 * «الأمثل» أمثلَ مسألةٍ أخرى، وصارت المقارنة تجميلًا.
 *
 * ولهذا يستورد هذا الملف مطابقةَ القراءة من المحرّك نفسه بدل أن يعيد كتابتها: التطابق
 * مضمون بالاستيراد لا بالانتباه. وما بقي من القيود يُبنى هنا صراحةً، ويُختبر تطابقه مع
 * المحرّك على حالاتٍ عشوائية في tests/fairness-oracle.test.ts.
 *
 * وعدم اليقين في الصعوبة يدخل من هنا: لكل مرشّح ثقةٌ (مصرَّحة أو مشتقّة من درجة توثيقه)،
 * فتُحسب منها سعةُ الشك. وهذا هو الفرق بين شارةٍ تُعرض وبين رقمٍ يدخل في القرار.
 */

import { ayahOrdinal } from './quran-canon';
import { scopeRanges, type QuranScope } from './quran-scope';
import { resolveZoneSlots, type QuestionDistributionPlan } from './question-zones';
import {
  candidateReadingMatches, locusKeyOf,
  type QuestionCandidate, type DifficultyAssurance, type ReadingContext, type ScarcityOracle,
} from './question-engine';
import type { RepeatPolicy } from './repeat-policy';
import type { OracleGroup, OracleInstance, OracleLocus } from './fairness-oracle';

/*
 * ثقة افتراضية بحسب درجة توثيق الصعوبة.
 *
 * أرقامٌ معلنة لا مخفيّة، وهي **افتراضٌ لا قياس**: تُستعمل حين لا يذكر المصدر ثقته.
 * ومتى ذكرها المصدر فقولُه مقدَّم على هذا الجدول.
 */
export const ASSURANCE_CONFIDENCE: Record<DifficultyAssurance, number> = {
  unknown: 0.25,
  automatically_estimated: 0.55,
  human_reviewed: 0.85,
  scientifically_approved: 0.97,
};

/** أقصى اتساعٍ لسعة الشك على سلّم الصعوبة (١–٥). */
export const MAX_DIFFICULTY_UNCERTAINTY = 1.0;

export function difficultyConfidenceOf(candidate: QuestionCandidate): number {
  const stated = candidate.difficultyConfidence;
  if (typeof stated === 'number' && Number.isFinite(stated)) return Math.max(0, Math.min(1, stated));
  return ASSURANCE_CONFIDENCE[candidate.difficultyAssurance] ?? 0.25;
}

/** سعة الشك: ما يبعده أسوأ تقديرٍ معقول عن التقدير المعلن. */
export function difficultyUncertaintyOf(candidate: QuestionCandidate): number {
  return Number(((1 - difficultyConfidenceOf(candidate)) * MAX_DIFFICULTY_UNCERTAINTY).toFixed(4));
}

export interface OracleParticipant {
  participantId: string;
  categoryId: string;
  scope: QuranScope;
  questionCount: number;
  reading?: ReadingContext;
  hallId?: string;
  /** مواضع سبق أن رآها هذا المتسابق — ممنوعة عليه وحده. */
  history?: string[];
}

export interface OracleInstanceInput {
  participants: OracleParticipant[];
  candidates: QuestionCandidate[];
  distributionPlanByCategory?: Record<string, QuestionDistributionPlan>;
  defaultPlan?: QuestionDistributionPlan;
  repeatPolicy: RepeatPolicy;
  targetDifficulty?: number;
  requireReviewedDifficulty?: boolean;
  /** ضغط الندرة لكل موضع (٠..١) — يأتي من `buildGroupScarcityOracle` لا يُخترع هنا. */
  scarcity?: ScarcityOracle;
  /** انكشاف كل موضع (٠..١) — يأتي من سجل الانكشاف القائم. */
  exposureOf?: (locusKey: string) => number;
  /** استعمالٌ سابق لكل موضع، يُخصم من سعته. */
  priorUsage?: Map<string, number> | Record<string, number>;
  /** مواضع محجورة أو محجوزة — ممنوعة على الجميع. */
  blockedLocusKeys?: string[];
  label?: string;
}

export interface OracleInstanceBuild {
  instance: OracleInstance;
  /** مجموعات لم تُبنَ لأن خانتها لم تجد مرشّحًا واحدًا — تُعلَن ولا تُطوى. */
  emptyGroups: { groupId: string; participantId: string; zoneId: string | null; demand: number }[];
  /** عدد المواضع التي حملت أكثر من مرشّح، فاختير لكل مجموعةٍ أقربُها إلى هدفها. */
  multiCandidateLoci: number;
}

/**
 * اسم المجموعة — يُشتقّ من المتسابق والمنطقة وحدهما.
 *
 * مُصدَّر عمدًا: هو الجسر بين مخرجات المحرّك (التي تحمل `reason.zoneId`) ومجموعات المِرصد،
 * فبه تُقابَل السحبة بالمجموعة التي تخصّها حين تُقاس الفجوة.
 */
export const oracleGroupId = (participantId: string, zoneId: string | null | undefined) => `${participantId}#${zoneId ?? 'free'}`;

const asMap = (value: Map<string, number> | Record<string, number> | undefined) =>
  value instanceof Map ? value : new Map(Object.entries(value || {}));

/**
 * أهلية مرشّحٍ لخانةٍ بعينها — صورة طبق الأصل من قيود المحرّك القاطعة.
 *
 * القيود المعتمدة على تاريخ السحب (توازن الحمل، والمباعدة، والجوار) ليست هنا: تلك
 * تفضيلاتٌ لا شروط، والمِرصد يُحسِّنها بالتكلفة لا يمنع بها.
 */
export function oracleEligible(input: {
  candidate: QuestionCandidate;
  slotRanges: readonly (readonly [number, number])[];
  reading?: ReadingContext;
  policy: RepeatPolicy;
  requireReviewedDifficulty?: boolean;
  participantHistory?: Set<string>;
  blocked?: Set<string>;
}): boolean {
  const { candidate, policy } = input;
  if (candidate.approvalStatus && candidate.approvalStatus !== 'approved') return false;
  if (input.requireReviewedDifficulty && candidate.difficultyAssurance !== 'human_reviewed' && candidate.difficultyAssurance !== 'scientifically_approved') return false;
  if (!policy.allowUnreviewedDifficulty && candidate.difficultyAssurance === 'unknown') return false;
  if (!candidateReadingMatches(candidate, input.reading)) return false;
  const from = ayahOrdinal({ surah: candidate.surahNumber, ayah: candidate.startAyah });
  const to = ayahOrdinal({ surah: candidate.surahNumber, ayah: candidate.endAyah });
  let inside = false;
  for (const [a, b] of input.slotRanges) if (from >= a && to <= b) { inside = true; break; }
  if (!inside) return false;
  const key = locusKeyOf(candidate);
  if (input.blocked?.has(key)) return false;
  if (policy.noRepeatWithinParticipant && input.participantHistory?.has(key)) return false;
  return true;
}

/**
 * بناء المسألة.
 *
 * المجموعة = (متسابق × منطقة). خانتان في منطقةٍ واحدة لمتسابقٍ واحد تُدمجان في مجموعةٍ
 * طلبُها اثنان — والدمج لا يُرخي شيئًا: قوس (مجموعة ← موضع) وحدويّ، فالتمايز داخل المنطقة
 * محفوظ، والتمايز عبر المناطق تحفظه عقدة منع التكرار حين تتداخل المناطق.
 */
export function buildOracleInstance(input: OracleInstanceInput): OracleInstanceBuild {
  const policy = input.repeatPolicy;
  const prior = asMap(input.priorUsage);
  const blocked = new Set(input.blockedLocusKeys || []);
  const policyMaxUses = policy.mode === 'strict_no_repeat'
    ? 1
    : (policy.maxUsesPerQuestion && policy.maxUsesPerQuestion > 0 ? policy.maxUsesPerQuestion : Number.POSITIVE_INFINITY);

  // فهرس المواضع: صفٌّ واحد لكل مفتاح موضع، ومرشّحوه معه.
  const locusIndex = new Map<string, number>();
  const loci: OracleLocus[] = [];
  const candidatesByLocus: QuestionCandidate[][] = [];
  let multiCandidateLoci = 0;
  for (const candidate of input.candidates) {
    const key = locusKeyOf(candidate);
    let index = locusIndex.get(key);
    if (index === undefined) {
      index = loci.length;
      locusIndex.set(key, index);
      const used = prior.get(key) || 0;
      loci.push({
        locusKey: key,
        capacity: Math.max(0, (Number.isFinite(policyMaxUses) ? policyMaxUses : Number.MAX_SAFE_INTEGER) - used),
        difficulty: candidate.difficultyRating,
        difficultyUncertainty: difficultyUncertaintyOf(candidate),
        exposure: Math.max(0, Math.min(1, input.exposureOf?.(key) ?? 0)),
        scarcity: Math.max(0, Math.min(1, input.scarcity?.pressureOfLocus(key) ?? 0)),
      });
      candidatesByLocus.push([candidate]);
    } else {
      if (candidatesByLocus[index].length === 1) multiCandidateLoci++;
      candidatesByLocus[index].push(candidate);
    }
  }
  for (const key of blocked) { const index = locusIndex.get(key); if (index !== undefined) loci[index].capacity = 0; }

  const groups: OracleGroup[] = [];
  const emptyGroups: OracleInstanceBuild['emptyGroups'] = [];
  let totalDemand = 0;

  for (const participant of input.participants) {
    const plan = input.distributionPlanByCategory?.[participant.categoryId] || input.defaultPlan || { version: 1, mode: 'free' as const, zones: [] };
    const { slots } = resolveZoneSlots({ plan, effectiveScope: participant.scope, questionCount: participant.questionCount });
    const history = participant.history?.length ? new Set(participant.history) : undefined;
    /*
     * خانات المنطقة الواحدة تُجمع في مجموعةٍ واحدة طلبُها عددُها.
     *
     * والمفتاح هو المنطقة وحدها — لا المنطقة والهدف معًا — كي يكون اسم المجموعة قابلًا
     * للاشتقاق من مخرجات المحرّك مباشرةً (`participantId#zoneId`). ولولا ذلك لتعذّرت
     * مقابلة ما فعله المحرّك بما أثبته المِرصد، وضاع قياس الفجوة كله.
     */
    const byZone = new Map<string, { zoneId: string | null; demand: number; targetDifficulty: number; scope: QuranScope }>();
    for (const slot of slots) {
      const key = slot.zoneId ?? 'free';
      const hit = byZone.get(key);
      if (hit) hit.demand += 1;
      else byZone.set(key, { zoneId: slot.zoneId, demand: 1, targetDifficulty: slot.targetDifficulty ?? input.targetDifficulty ?? 3, scope: slot.scope });
    }
    for (const zone of byZone.values()) {
      const groupId = oracleGroupId(participant.participantId, zone.zoneId);
      const ranges = scopeRanges(zone.scope);
      const eligible: number[] = [];
      const eligibleDifficulty: number[] = [];
      const eligibleUncertainty: number[] = [];
      for (let index = 0; index < loci.length; index++) {
        if (loci[index].capacity <= 0) continue;
        let best: QuestionCandidate | null = null;
        let bestGap = Infinity;
        for (const candidate of candidatesByLocus[index]) {
          if (!oracleEligible({
            candidate, slotRanges: ranges, reading: participant.reading, policy,
            requireReviewedDifficulty: input.requireReviewedDifficulty, participantHistory: history, blocked,
          })) continue;
          const gap = Math.abs(candidate.difficultyRating - zone.targetDifficulty);
          if (gap < bestGap) { best = candidate; bestGap = gap; }
        }
        if (!best) continue;
        eligible.push(index);
        eligibleDifficulty.push(best.difficultyRating);
        eligibleUncertainty.push(difficultyUncertaintyOf(best));
      }
      /*
       * المجموعة الخالية تدخل المسألة بطلبها وبلا أقواس.
       *
       * ولولا ذلك لخرجت المسألة «ممكنة» وفيها خانةٌ لا مرشّح لها أصلًا — وهو كذبٌ
       * بالإغفال. ودخولها هكذا يجعلها تخرج في الشهادة عجزَ تمايزٍ صريحًا باسمها.
       */
      if (!eligible.length) emptyGroups.push({ groupId, participantId: participant.participantId, zoneId: zone.zoneId, demand: zone.demand });
      groups.push({
        groupId,
        participantId: participant.participantId,
        zoneId: zone.zoneId,
        hallId: participant.hallId,
        demand: zone.demand,
        eligible,
        eligibleDifficulty,
        eligibleUncertainty,
        targetDifficulty: zone.targetDifficulty,
      });
      totalDemand += zone.demand;
    }
  }

  return {
    instance: { loci, groups, totalDemand, policyMaxUses, label: input.label },
    emptyGroups,
    multiCandidateLoci,
  };
}
