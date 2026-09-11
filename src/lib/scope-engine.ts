/*
 * واجهة محرك النطاق — النقطة الوحيدة التي يمرّ منها المخزن والخادم والشاشات.
 *
 * وجودها يمنع أن يعرف FairDraw معنىً للنطاق، ويعرف بناءُ البنك معنىً آخر، وتعرض الواجهة
 * معنىً ثالثًا. من هنا يُجاب سؤال واحد: ما نطاق هذا المتسابق الآن، وكم سؤالًا له، ومن أين؟
 */

import type { Category, CompetitionPolicy, Participant, QuestionModelRecord } from '../types';
import { describeScope, fullQuranScope, normalizeScope, scopeAyahCount, scopeSignature, type QuranScope } from './quran-scope';
import { ayahOrdinal } from './quran-canon';
import { DEFAULT_SELECTION_RULE, buildEffectiveScope, scopeRecordIsUsable, type ParticipantScopeRecord, type ParticipantScopeSelectionRule } from './participant-scope';
import { autoBalancedPlan, freeDistributionPlan, resolveZoneSlots, type QuestionDistributionPlan, type ZoneSlot } from './question-zones';
import { DEFAULT_REPEAT_POLICY, type RepeatPolicy } from './repeat-policy';
import { projectCandidatesFromScope } from './question-corpus';
import { QuestionAllocationEngine, candidatesInScope, type QuestionCandidate, type ReadingContext } from './question-engine';
import { migrateLegacyScope } from './scope-migration';
import { resolveReading } from './scientific-core';

/**
 * أسبقية عدد الأسئلة — معلنة رسميًا، لا أسبقية صامتة.
 *
 *   ١) `category.questionsCount` إن كان أكبر من صفر — الفئة أخصّ من المسابقة.
 *   ٢) وإلا `policy.questions.questionsPerParticipant`.
 *   ٣) وإلا واحد.
 *
 * ومجموع أسئلة المناطق **لا** يتقدّم على هذا العدد؛ إن خالفه فهو خطأ تهيئة يُعرض في فحص
 * الجاهزية، لا تجاوزٌ صامت. وعدد الأسئلة مستقل تمامًا عن حجم النطاق: ثلاثون جزءًا وسؤالٌ
 * واحد تهيئةٌ مشروعة، وجزءٌ واحد وعشرة أسئلة كذلك.
 */
export function resolveQuestionCount(category: Category | undefined, policy: CompetitionPolicy): number {
  const fromCategory = Number(category?.questionsCount || 0);
  if (Number.isFinite(fromCategory) && fromCategory > 0) return Math.round(fromCategory);
  const fromPolicy = Number(policy?.questions?.questionsPerParticipant || 0);
  return Number.isFinite(fromPolicy) && fromPolicy > 0 ? Math.round(fromPolicy) : 1;
}

export function categoryScopeOf(category: Category | undefined): QuranScope {
  if (category?.scope && scopeAyahCount(category.scope) > 0) return normalizeScope(category.scope);
  const migrated = migrateLegacyScope({ memorizationScope: category?.memorizationScope, juzCount: category?.juzCount });
  return migrated.scope ? normalizeScope(migrated.scope) : { version: 1, segments: [], assurance: 'CANONICAL_TABLE' };
}

export function categorySelectionRule(category: Category | undefined): ParticipantScopeSelectionRule {
  const rule = category?.selectionRule;
  if (!rule) return { ...DEFAULT_SELECTION_RULE, parentScope: category ? categoryScopeOf(category) : undefined };
  return { ...rule, parentScope: rule.parentScope || (category ? categoryScopeOf(category) : undefined) };
}

export function categoryDistribution(category: Category | undefined, questionCount: number): QuestionDistributionPlan {
  if (category?.distribution) return category.distribution;
  // الافتراض الذكي: توزيع متوازن بعدد الأسئلة. اقتراحٌ يُعدَّل، لا قاعدة مفروضة.
  const scope = categoryScopeOf(category);
  return scopeAyahCount(scope) > 0 ? autoBalancedPlan(scope, questionCount) : freeDistributionPlan();
}

export function categoryRepeatPolicy(category: Category | undefined, policy: CompetitionPolicy): RepeatPolicy {
  if (category?.repeatPolicy) return category.repeatPolicy;
  // القيم الموروثة في لائحة المسابقة تُترجَم إلى سياسة تكرار صريحة بدل أن تبقى مضمرة.
  return {
    ...DEFAULT_REPEAT_POLICY,
    noRepeatWithinModel: true,
    noRepeatAcrossRoundsForParticipant: policy?.questions?.avoidRepeatWithinRound !== false,
  };
}

export type EffectiveScopeSource = 'participant_approved' | 'category' | 'none';

export interface EffectiveScopeResolution {
  scope: QuranScope;
  source: EffectiveScopeSource;
  version: number;
  signature: string;
  /** هل تشترط الفئة نطاقًا معتمدًا للمتسابق ولم يوجد؟ */
  blocked: boolean;
  reasonArabic: string;
  reasonEnglish: string;
}

/**
 * Participant Effective Scope is the authoritative source for question eligibility whenever
 * participant-specific selection applies.
 */
export function resolveEffectiveScope(input: {
  participant: Pick<Participant, 'id'>;
  category: Category | undefined;
  scopes: ParticipantScopeRecord[];
  /*
   * حدّ العزل بين الجهات.
   *
   * المطابقة بالمعرّف وحده تكفي ما دامت المعرّفات فريدة — وهذا ما لا يُضمن حين تُستورد
   * بيانات أو تُستنسخ مسابقة. فيُقال الحدّ صراحةً: سجلٌّ من جهةٍ أخرى أو مسابقةٍ أخرى لا
   * يُقرأ أصلًا، لا أن يُقرأ ثم يُرجى ألا يتطابق.
   */
  tenant?: { organizationId?: string; competitionId?: string };
}): EffectiveScopeResolution {
  const category = input.category;
  const rule = categorySelectionRule(category);
  const tenant = input.tenant;
  const record = input.scopes.find(r => r.participantId === input.participant.id && r.status !== 'superseded'
    && (!tenant?.organizationId || r.organizationId === tenant.organizationId)
    && (!tenant?.competitionId || r.competitionId === tenant.competitionId));
  const recordVersion = record?.version || 0;
  if (rule.enabled && category?.scopeMode === 'participant_selected') {
    if (!scopeRecordIsUsable(record)) {
      return {
        scope: { version: 1, segments: [], assurance: 'CANONICAL_TABLE' }, source: 'none', version: recordVersion,
        signature: '', blocked: true,
        reasonArabic: 'نطاق الحفظ المعتمد لهذا المتسابق يحتاج مراجعة.',
        reasonEnglish: 'This participant\'s approved memorization scope needs review.',
      };
    }
    return {
      scope: record.scope, source: 'participant_approved', version: record.version, signature: record.scopeSignature, blocked: false,
      reasonArabic: `نطاق معتمد خاص بالمتسابق (النسخة ${record.version}).`,
      reasonEnglish: `Participant-approved scope (version ${record.version}).`,
    };
  }
  // نطاق ثابت للفئة: يُبنى عبر القواعد نفسها، فالمقاطع الإلزامية والقصّ يسريان أيضًا.
  const scope = buildEffectiveScope({ ...rule, enabled: false }, categoryScopeOf(category));
  return {
    scope, source: scopeAyahCount(scope) > 0 ? 'category' : 'none', version: category?.scopeVersion || 1,
    signature: scopeSignature(scope), blocked: scopeAyahCount(scope) === 0,
    reasonArabic: scopeAyahCount(scope) > 0 ? `نطاق الفئة الثابت: ${describeScope(scope, true)}.` : 'الفئة بلا نطاق محدد.',
    reasonEnglish: scopeAyahCount(scope) > 0 ? `Fixed category scope: ${describeScope(scope, false)}.` : 'The category has no defined scope.',
  };
}

export function readingContextOf(input: { riwaya?: string; qiraah?: string }): ReadingContext {
  const reading = resolveReading({ riwaya: input.riwaya, rawi: input.riwaya, qiraah: input.qiraah });
  return reading ? { qiraahId: reading.qiraahId, rawiId: reading.rawiId } : {};
}

/** طول المقطع بالآيات كما يحدده المنظم في الفئة. */
export function passageAyahCount(category: Category | undefined): number {
  if (category?.passageMode === 'page_quarters') {
    // تقدير تقريبي: ربع الوجه ≈ آيتان في المتوسط. الرقم للعرض والتوليد التطويري فقط.
    return Math.max(1, Math.min(20, Math.round(Math.max(1, category.pageQuarterUnits || 1) * 2)));
  }
  return Math.max(1, Math.min(20, Math.round(category?.ayatPerQuestion || 3)));
}

export interface CandidatePoolOptions {
  scope: QuranScope;
  category: Category | undefined;
  reading: ReadingContext;
  /** بنك معتمد حقيقي متى توفّر. عند غيابه تُسقَط المواضع البنيوية لقياس السعة والمحاكاة. */
  certifiedPool?: QuestionCandidate[];
  difficultyByLocus?: Record<string, number>;
}

/**
 * مرشحو النطاق.
 *
 * متى توفّر بنكٌ من مصدر معتمد فهو المقدَّم بلا منازع. وعند غيابه تُسقَط المواضع **البنيوية**
 * من جدول المصحف القانوني: بنيتها قانونية وصعوبتها مقدَّرة آليًا وموصوفة بذلك، فتصلح لقياس
 * السعة والندرة والمحاكاة — ولا تُسلَّم إلى لجنة تحكيم رسمية إلا عبر خزنة السؤال المعتمدة.
 */
export function buildCandidatePool(options: CandidatePoolOptions): QuestionCandidate[] {
  if (options.certifiedPool?.length) return candidatesInScope(options.certifiedPool, options.scope);
  return projectCandidatesFromScope(options.scope, {
    passageAyahCount: passageAyahCount(options.category),
    reading: options.reading,
    difficultyByLocus: options.difficultyByLocus,
    idPrefix: options.category ? `cat-${options.category.id}` : 'loc',
  });
}

export interface AllocationPlan {
  slots: ZoneSlot[];
  issues: { code: string; ar: string; en: string; severity: 'error' | 'warning' | 'recommendation' }[];
  questionCount: number;
  scope: QuranScope;
}

export function planAllocation(input: {
  category: Category | undefined;
  policy: CompetitionPolicy;
  effectiveScope: QuranScope;
  candidates?: QuestionCandidate[];
}): AllocationPlan {
  const questionCount = resolveQuestionCount(input.category, input.policy);
  const plan = categoryDistribution(input.category, questionCount);
  // الوزن بالمواضع الصالحة فعلًا حين تتوفر: الأجزاء ليست متساوية كمخزون أسئلة.
  const weights = input.candidates?.length ? supplyWeights(input.candidates) : undefined;
  const { slots, issues } = resolveZoneSlots({ plan, effectiveScope: input.effectiveScope, questionCount, weightOfOrdinal: weights });
  return { slots, issues, questionCount, scope: input.effectiveScope };
}

/*
 * وزن القسمة التلقائية بالمخزون الحقيقي لا بعدد الآيات.
 *
 * الأجزاء ليست متساوية كمخزون أسئلة: جزءٌ سوره قصيرة كثيرة المواضع الصالحة يحتمل أسئلة
 * أكثر من جزءٍ آيته طويلة. الوزن هنا هو وجود موضع بداية صالح عند الآية أو عدمه، فتخرج
 * المناطق متساوية الطاقة لا متساوية المسافة.
 */
function supplyWeights(candidates: QuestionCandidate[]) {
  const starts = new Set<number>();
  for (const candidate of candidates) {
    try { starts.add(ayahOrdinal({ surah: candidate.surahNumber, ayah: candidate.startAyah })); } catch { /* موضع غير صالح لا يُوزن */ }
  }
  return (ordinal: number) => (starts.has(ordinal) ? 1 : 0.05);
}

export interface DrawInput {
  participant: Participant;
  category: Category | undefined;
  policy: CompetitionPolicy;
  scopes: ParticipantScopeRecord[];
  candidates: QuestionCandidate[];
  engine: QuestionAllocationEngine;
  sequencePosition?: number;
  hallId?: string;
  excludedIds?: string[];
}

export function drawForParticipant(input: DrawInput) {
  const resolution = resolveEffectiveScope({ participant: input.participant, category: input.category, scopes: input.scopes });
  if (resolution.blocked) return { ok: false as const, resolution, reason: resolution.reasonArabic };
  const reading = readingContextOf({ riwaya: input.participant.riwaya });
  const plan = planAllocation({ category: input.category, policy: input.policy, effectiveScope: resolution.scope, candidates: input.candidates });
  if (!plan.slots.length) return { ok: false as const, resolution, reason: 'تعذر بناء خانات الأسئلة لهذا المتسابق.' };
  const result = input.engine.selectForParticipant({
    participantId: input.participant.id,
    sequencePosition: input.sequencePosition,
    effectiveScope: resolution.scope,
    slots: plan.slots,
    reading,
    targetDifficulty: input.policy.questions.targetDifficulty,
    difficultyTolerance: input.policy.questions.difficultyTolerance,
    hallId: input.hallId,
    excludedIds: input.excludedIds,
  }, input.candidates);
  return { ok: true as const, resolution, plan, result, reading };
}

/** النماذج التي بُنيت على نسخة نطاق لم تعد سارية — تُحصى قبل التشغيل، لا بعده. */
export function staleModels(models: QuestionModelRecord[], scopes: ParticipantScopeRecord[], categories: Category[]): QuestionModelRecord[] {
  const scopeVersion = new Map(scopes.filter(s => s.status !== 'superseded').map(s => [s.participantId, s.version]));
  const categoryVersion = new Map(categories.map(c => [c.id, c.scopeVersion || 1]));
  return models.filter(model => {
    if (model.status === 'invalidated') return false;
    const participantVersion = scopeVersion.get(model.participantId);
    if (participantVersion !== undefined && participantVersion !== model.participantScopeVersion) return true;
    const category = categoryVersion.get(model.categoryId);
    return category !== undefined && category !== model.categoryScopeVersion;
  });
}
