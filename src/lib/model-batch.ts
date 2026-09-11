/*
 * دفعات النماذج، والاحتياط، والحجر.
 *
 * ثلاثة أسئلة تنظيمية يجيب عنها هذا الملف:
 *
 * ١) **متى تُولَّد الأسئلة؟** قبل المسابقة كلها (pre_generated)، أو عند حضور المتسابق
 *    (just_in_time)، أو مختلطًا: القواعد والبنك معتمدان مسبقًا والتوليد في وقته مع احتياط.
 *
 * ٢) **ماذا لو سقط سؤال؟** نموذجٌ احتياطي جاهز — مولَّدٌ بالمحرك نفسه وبقيوده نفسها — لا
 *    سؤالٌ يختاره محكّم بيده. والاحتياط مربوطٌ ببصمة نطاقٍ بعينها، فلا يُعطى لمن لا يصلح له.
 *
 * ٣) **ماذا لو ظهر عيبٌ في سؤال بعد التوليد؟** يُحجر، فيُبطَل كل نموذج يحمله، ويُقاس أثره:
 *    كم متسابقًا تأثر، وكم بقي في المخزون، وهل تستطيع المسابقة أن تستمر. بلا حذف تاريخ.
 */

import type { FairnessBreakdown, QuestionModelBatchRecord, QuestionModelRecord } from '../types';
import { describeScope, scopeSignature, type QuranScope } from './quran-scope';
import { resolveZoneSlots, type QuestionDistributionPlan } from './question-zones';
import { QuestionAllocationEngine, candidatesInScope, locusKeyOf, uniqueLocusCount, type QuestionCandidate, type ReadingContext } from './question-engine';
import type { RepeatPolicy } from './repeat-policy';
import { aggregateFairness, buildQuestionModel } from './model-fairness';
import { theoreticalRepeatFloor } from './repeat-policy';

export interface BatchParticipant {
  participantId: string;
  scope: QuranScope;
  scopeVersion: number;
  questionCount: number;
  reading?: ReadingContext;
  hallId?: string;
}

export interface BatchGenerationInput {
  batchId: string;
  organizationId: string;
  competitionId: string;
  categoryId: string;
  categoryScopeVersion: number;
  policyVersion: string;
  poolVersion: string;
  participants: BatchParticipant[];
  candidates: QuestionCandidate[];
  distribution: QuestionDistributionPlan;
  repeatPolicy: RepeatPolicy;
  targetDifficulty: number;
  difficultyTolerance: number;
  seed: string;
  /** كم نموذجًا احتياطيًا لكل بصمة نطاق. صفر يعني بلا احتياط. */
  reserveCount?: number;
  generationMode: 'pre_generated' | 'hybrid';
  requireReviewedDifficulty?: boolean;
  quranSourceVersion?: string;
  quranSourcePackageHash?: string;
  now?: string;
  newId: (prefix: string) => string;
}

export interface BatchGenerationResult {
  batch: QuestionModelBatchRecord;
  models: QuestionModelRecord[];
  /** نماذج احتياطية غير مربوطة بمتسابق؛ participantId فيها فارغ. */
  reserves: QuestionModelRecord[];
  failures: { participantId: string; code: string; ar: string; en: string }[];
}

const RESERVE_PARTICIPANT = '' as const;

/** توليد دفعة كاملة بالمحرك نفسه الذي يعمل يوم المسابقة — لا بمسار ثانٍ. */
export function generateModelBatch(input: BatchGenerationInput): BatchGenerationResult {
  const now = input.now || new Date().toISOString();
  const engine = new QuestionAllocationEngine({
    policy: input.repeatPolicy,
    seed: input.seed,
    requireReviewedDifficulty: input.requireReviewedDifficulty,
    defaultTargetDifficulty: input.targetDifficulty,
  });
  const poolByScope = new Map<string, QuestionCandidate[]>();
  const poolFor = (scope: QuranScope) => {
    const key = scopeSignature(scope);
    const hit = poolByScope.get(key);
    if (hit) return hit;
    const list = candidatesInScope(input.candidates, scope);
    poolByScope.set(key, list);
    return list;
  };

  const models: QuestionModelRecord[] = [];
  const failures: BatchGenerationResult['failures'] = [];

  const draw = (participant: BatchParticipant, index: number, reserveOf?: string) => {
    const { slots, issues } = resolveZoneSlots({ plan: input.distribution, effectiveScope: participant.scope, questionCount: participant.questionCount });
    for (const issue of issues.filter(x => x.severity === 'error')) {
      failures.push({ participantId: participant.participantId, code: issue.code, ar: issue.ar, en: issue.en });
    }
    if (!slots.length) return null;
    const result = engine.selectForParticipant({
      participantId: participant.participantId || `reserve:${reserveOf}:${index}`,
      sequencePosition: index,
      effectiveScope: participant.scope,
      slots,
      reading: participant.reading,
      targetDifficulty: input.targetDifficulty,
      difficultyTolerance: input.difficultyTolerance,
      hallId: participant.hallId,
    }, poolFor(participant.scope));
    for (const failure of result.failures) failures.push({ participantId: participant.participantId, code: failure.code, ar: failure.ar, en: failure.en });
    if (!result.questions.length) return null;
    return buildQuestionModel({
      result, slots,
      targetDifficulty: input.targetDifficulty,
      difficultyTolerance: input.difficultyTolerance,
      effectiveScope: participant.scope,
      id: input.newId('qmodel'),
      organizationId: input.organizationId,
      competitionId: input.competitionId,
      categoryId: input.categoryId,
      participantId: participant.participantId,
      participantScopeVersion: participant.scopeVersion,
      categoryScopeVersion: input.categoryScopeVersion,
      policyVersion: input.policyVersion,
      poolVersion: input.poolVersion,
      reading: participant.reading || {},
      generationMode: input.generationMode,
      quranSourceVersion: input.quranSourceVersion,
      quranSourcePackageHash: input.quranSourcePackageHash,
      seed: input.seed,
      batchId: input.batchId,
      now,
    });
  };

  input.participants.forEach((participant, index) => {
    const model = draw(participant, index);
    if (model) models.push({ ...model, status: 'sealed', sealedAt: now });
  });

  /*
   * الاحتياط مربوطٌ ببصمة نطاق، لا نموذجٌ عائم.
   *
   * نموذجٌ احتياطي مبني على المصحف كله لا ينفع متسابقًا نطاقه الجزء الأول: أسئلته خارج
   * نطاقه. فيُولَّد لكل بصمة نطاق في الدفعة نصيبها من الاحتياط، ويُستدعى بمطابقة البصمة.
   */
  const reserves: QuestionModelRecord[] = [];
  const reserveCount = Math.max(0, Math.round(input.reserveCount || 0));
  if (reserveCount > 0) {
    const byScope = new Map<string, BatchParticipant>();
    for (const participant of input.participants) {
      const key = scopeSignature(participant.scope);
      if (!byScope.has(key)) byScope.set(key, participant);
    }
    let position = input.participants.length;
    for (const [key, sample] of byScope) {
      for (let n = 0; n < reserveCount; n++) {
        const model = draw({ ...sample, participantId: RESERVE_PARTICIPANT, hallId: undefined }, position++, key);
        if (model) reserves.push({ ...model, status: 'draft' });
      }
    }
  }

  const fairness = aggregateFairness(models);
  /* أسباب التعذّر تُجمَّع بالرمز بلا معرّف متسابق: التقرير يحتاج السبب لا الاسم. */
  const failureByCode = new Map<string, { code: string; ar: string; en: string; count: number }>();
  for (const failure of failures) {
    const row = failureByCode.get(failure.code);
    if (row) row.count += 1;
    else failureByCode.set(failure.code, { code: failure.code, ar: failure.ar, en: failure.en, count: 1 });
  }
  const batch: QuestionModelBatchRecord = {
    id: input.batchId,
    organizationId: input.organizationId,
    competitionId: input.competitionId,
    categoryId: input.categoryId,
    modelCount: models.length,
    reserveCount: reserves.length,
    policyVersion: input.policyVersion,
    poolVersion: input.poolVersion,
    categoryScopeVersion: input.categoryScopeVersion,
    repeatPolicyVersion: input.repeatPolicy.version,
    generationMode: input.generationMode,
    aggregateFairness: fairness,
    declaredFailures: [...failureByCode.values()],
    approvalState: 'draft',
    createdAt: now,
  };
  return { batch, models, reserves, failures };
}

/** نتيجة استدعاء الاحتياط: نموذجٌ أو سببُ تعذّره. لا صمت بينهما. */
export interface ClaimReserveOutcome {
  ok: boolean;
  model: QuestionModelRecord | null;
  remaining: QuestionModelRecord[];
  reason?: string;
}

/**
 * استدعاء نموذج احتياطي لمتسابق.
 *
 * الشرط أن يكون الاحتياط مبنيًا على بصمة نطاقه نفسها — لا «قريبًا منها». نموذجٌ من نطاق
 * أوسع قد يحمل سؤالًا خارج ما حفظه، ونموذجٌ من نطاق أضيق يظلمه بغير ما التزمت به اللائحة.
 */
export function claimReserveModel(input: {
  reserves: QuestionModelRecord[];
  participantId: string;
  scope: QuranScope;
  scopeVersion: number;
  reason: string;
  now?: string;
}): ClaimReserveOutcome {
  const signature = scopeSignature(input.scope);
  const index = input.reserves.findIndex(r => r.status === 'draft' && !r.participantId && r.scopeSignature === signature);
  if (index < 0) return { ok: false, model: null, remaining: input.reserves, reason: 'NO_RESERVE_FOR_THIS_SCOPE' };
  const now = input.now || new Date().toISOString();
  const claimed: QuestionModelRecord = {
    ...input.reserves[index],
    participantId: input.participantId,
    participantScopeVersion: input.scopeVersion,
    status: 'sealed',
    sealedAt: now,
    relaxations: [...input.reserves[index].relaxations, `reserve_claimed:${input.reason}`],
  };
  return { ok: true, model: claimed, remaining: input.reserves.filter((_, i) => i !== index) };
}

export interface QuarantineImpact {
  quarantinedLoci: string[];
  invalidatedModels: QuestionModelRecord[];
  affectedParticipantIds: string[];
  remainingUniqueLoci: number;
  requiredDraws: number;
  averageReuseAfter: number;
  canContinue: boolean;
  summaryArabic: string;
  summaryEnglish: string;
}

/**
 * حجر مواضع بعد اكتشاف عيب فيها.
 *
 * لا يُحذف تاريخ: النماذج الحاملة للموضع المحجور تُعلَّم invalidated بسببها، والمخزون
 * يُعاد قياسه، ويُقال صراحةً هل تستطيع المسابقة الاستمرار بما بقي أم لا.
 */
export function applyQuarantine(input: {
  locusKeys: string[];
  reason: string;
  models: QuestionModelRecord[];
  candidates: QuestionCandidate[];
  requiredDraws: number;
  now?: string;
}): QuarantineImpact {
  const now = input.now || new Date().toISOString();
  const quarantined = new Set(input.locusKeys);
  const invalidated: QuestionModelRecord[] = [];
  for (const model of input.models) {
    if (model.status === 'invalidated') continue;
    if (!model.questions.some(q => quarantined.has(`${q.surahNumber}:${q.startAyah}`))) continue;
    invalidated.push({ ...model, status: 'invalidated', invalidatedAt: now, invalidationReason: `QUARANTINED_LOCUS:${input.reason}` });
  }
  const remaining = input.candidates.filter(c => !quarantined.has(locusKeyOf(c)));
  const remainingUniqueLoci = uniqueLocusCount(remaining);
  const floor = theoreticalRepeatFloor({ draws: input.requiredDraws, uniqueLoci: remainingUniqueLoci });
  const affected = [...new Set(invalidated.map(m => m.participantId).filter(Boolean))];
  const canContinue = remainingUniqueLoci > 0;
  return {
    quarantinedLoci: [...quarantined],
    invalidatedModels: invalidated,
    affectedParticipantIds: affected,
    remainingUniqueLoci,
    requiredDraws: input.requiredDraws,
    averageReuseAfter: floor.averageReuse,
    canContinue,
    summaryArabic: canContinue
      ? `حُجر ${quarantined.size} موضعًا، فبطل ${invalidated.length} نموذجًا وتأثر ${affected.length} متسابقًا. بقي ${remainingUniqueLoci} موضعًا صالحًا، ومتوسط إعادة الاستعمال المتوقع ${floor.averageReuse}.`
      : `حُجر ${quarantined.size} موضعًا ولم يبقَ موضع صالح واحد. لا يمكن الاستمرار قبل توسيع البنك.`,
    summaryEnglish: canContinue
      ? `${quarantined.size} loci quarantined; ${invalidated.length} models invalidated affecting ${affected.length} participants. ${remainingUniqueLoci} loci remain, expected reuse ${floor.averageReuse}.`
      : `${quarantined.size} loci quarantined and none remain eligible. The competition cannot continue until the pool is widened.`,
  };
}

export function describeBatch(batch: QuestionModelBatchRecord, scope: QuranScope | null, arabic: boolean): string {
  const range = scope ? describeScope(scope, arabic) : '';
  return arabic
    ? `${batch.modelCount} نموذجًا${batch.reserveCount ? ` و${batch.reserveCount} احتياطيًا` : ''}${range ? ` · ${range}` : ''}`
    : `${batch.modelCount} models${batch.reserveCount ? ` + ${batch.reserveCount} reserve` : ''}${range ? ` · ${range}` : ''}`;
}

export type { FairnessBreakdown };
