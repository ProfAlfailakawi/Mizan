/*
 * بناء لقطة التخصيص التي يقرؤها المدقّق المستقل.
 *
 * اللقطة عقدٌ بين طرفين: الجهة التي سحبت، والجهة التي تدقّق. فيجب أن تحمل كل ما يلزم
 * للحكم — النطاقات، والمناطق، والبنك بحالاته، والحجر، والحجز، وتاريخ المتسابقين، واللائحة
 * وبصمتها — ولا تحمل ما لا يلزم: لا أسماء، ولا أكواد، ولا درجات.
 *
 * وهذا الملف يبني اللقطة؛ والمدقّق في ملفٍ آخر لا يستورد منه ولا من المحرّك شيئًا. الفصل
 * مقصود: من يبني الدليل غير من يحكم به.
 */

import { resolveZoneSlots, type QuestionDistributionPlan } from './question-zones';
import type { QuestionCandidate, ReadingContext } from './question-engine';
import type { RepeatPolicy } from './repeat-policy';
import { QUESTION_ENGINE_VERSION, locusKeyOf } from './question-engine';
import type { QuranScope } from './quran-scope';
import { allocationPolicyHash, type AllocationSnapshot, type SnapshotPolicy } from './allocation-verifier';

export interface SnapshotBuildInput {
  competitionId: string;
  organizationId?: string;
  policyVersion: string;
  repeatPolicy: RepeatPolicy;
  requireReviewedDifficulty?: boolean;
  requireCertifiedSource?: boolean;
  participants: {
    participantId: string;
    categoryId: string;
    scope: QuranScope;
    scopeVersion?: number;
    questionCount: number;
    reading?: ReadingContext;
    hallId?: string;
    priorHistory?: string[];
  }[];
  candidates: QuestionCandidate[];
  distributionPlanByCategory?: Record<string, QuestionDistributionPlan>;
  defaultPlan?: QuestionDistributionPlan;
  allocations: { participantId: string; zoneId: string | null; slotIndex: number; questionId: string; locusKey: string }[];
  quarantinedLocusKeys?: string[];
  reservations?: AllocationSnapshot['reservations'];
  /** يحدّد أي المصادر معتمدة؛ غيابه يعني أن الاعتماد غير مسجَّل في هذه اللقطة. */
  certifiedSourceOf?: (candidate: QuestionCandidate) => boolean;
}

export async function buildAllocationSnapshot(input: SnapshotBuildInput): Promise<AllocationSnapshot> {
  const policy: SnapshotPolicy = {
    version: input.repeatPolicy.version,
    mode: input.repeatPolicy.mode,
    maxUsesPerQuestion: input.repeatPolicy.maxUsesPerQuestion,
    noRepeatWithinParticipant: input.repeatPolicy.noRepeatWithinParticipant,
    noRepeatWithinModel: input.repeatPolicy.noRepeatWithinModel,
    allowUnreviewedDifficulty: input.repeatPolicy.allowUnreviewedDifficulty,
    requireReviewedDifficulty: input.requireReviewedDifficulty,
    requireCertifiedSource: input.requireCertifiedSource,
  };

  const participants = input.participants.map(participant => {
    const plan = input.distributionPlanByCategory?.[participant.categoryId] || input.defaultPlan || { version: 1, mode: 'free' as const, zones: [] };
    const { slots } = resolveZoneSlots({ plan, effectiveScope: participant.scope, questionCount: participant.questionCount });
    const zones = new Map<string, QuranScope>();
    for (const slot of slots) if (slot.zoneId) zones.set(slot.zoneId, slot.scope);
    return {
      participantId: participant.participantId,
      categoryId: participant.categoryId,
      scope: participant.scope,
      scopeVersion: participant.scopeVersion,
      reading: participant.reading,
      questionCount: participant.questionCount,
      zones: [...zones.entries()].map(([zoneId, scope]) => ({ zoneId, scope })),
      priorHistory: participant.priorHistory,
      hallId: participant.hallId,
    };
  });

  const pool = input.candidates.map(candidate => ({
    questionId: candidate.id,
    locusKey: locusKeyOf(candidate),
    surahNumber: candidate.surahNumber,
    startAyah: candidate.startAyah,
    endAyah: candidate.endAyah,
    approvalStatus: candidate.approvalStatus || 'approved',
    difficultyAssurance: candidate.difficultyAssurance,
    qiraahId: candidate.qiraahId,
    rawiId: candidate.rawiId,
    tariqId: candidate.tariqId,
    ...(input.certifiedSourceOf ? { sourceCertified: input.certifiedSourceOf(candidate) } : {}),
    priorUsageCount: candidate.priorUsageCount,
  }));

  const policyHash = await allocationPolicyHash({ policy, policyVersion: input.policyVersion, engineVersion: QUESTION_ENGINE_VERSION });

  return {
    competitionId: input.competitionId,
    organizationId: input.organizationId,
    engineVersion: QUESTION_ENGINE_VERSION,
    policyVersion: input.policyVersion,
    policyHash,
    policy,
    participants,
    pool,
    quarantinedLocusKeys: input.quarantinedLocusKeys,
    reservations: input.reservations,
    allocations: input.allocations,
    generatedAt: new Date().toISOString(),
  };
}
