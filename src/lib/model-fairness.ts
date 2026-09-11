/*
 * عدالة على مستوى النموذج، لا على مستوى السؤال وحده.
 *
 * تساوي الأسئلة واحدًا واحدًا ليس عدلًا ولا هو ممكن حين يختار كل متسابق نطاقه. المقياس هنا
 * هو الحمل الكلي للنموذج: متوسطه، وتشتّته، وأعلاه، وأدناه، ومدى ثقة تقدير الصعوبة.
 *
 * والدرجة النهائية لا تُعرض رقمًا غامضًا: تنفتح دائمًا إلى مكوّناتها، وكل مكوّن يُقال
 * بأي شيء قِيس.
 */

import type { FairnessBreakdown, QuestionModelQuestion, QuestionModelRecord } from '../types';
import { scopeAyahCount, scopeSignature, type QuranScope } from './quran-scope';
import { locusKeyOf, type SelectionResult } from './question-engine';
import type { ZoneSlot } from './question-zones';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const pct = (value: number) => Number((clamp01(value) * 100).toFixed(1));

export interface FairnessInput {
  result: SelectionResult;
  slots: ZoneSlot[];
  targetDifficulty: number;
  difficultyTolerance: number;
  effectiveScope: QuranScope;
  /** أعلى عدد استعمالات مسموح قبل أن يُعدّ ضغط التكرار عاليًا. */
  repeatPressureCeiling?: number;
}

export function computeModelFairness(input: FairnessInput): FairnessBreakdown {
  const questions = input.result.questions;
  const notesArabic: string[] = [], notesEnglish: string[] = [];
  if (!questions.length) {
    return { score: 0, difficultyParity: 0, scopeCoverage: 0, repeatPressure: 0, diversity: 0, similarity: 0, exposure: 0, zoneCompliance: 0, notesArabic: ['لا أسئلة في هذا النموذج.'], notesEnglish: ['This model contains no questions.'] };
  }

  // مطابقة الصعوبة: بعد متوسط النموذج عن الهدف، منسوبًا إلى السماحية المعلنة.
  const tolerance = Math.max(0.25, input.difficultyTolerance || 1);
  const difficultyParity = pct(1 - Math.abs(input.result.aggregateDifficulty - input.targetDifficulty) / (tolerance * 2));
  if (difficultyParity < 70) { notesArabic.push('متوسط صعوبة النموذج بعيد عن الهدف المعلن.'); notesEnglish.push('Model average difficulty is far from the declared target.'); }

  // تغطية النطاق: كم من نطاق المتسابق لمسته أسئلته (بالمسافة بين أبعد موضعين مقابل حجم النطاق).
  const ayahSpan = scopeAyahCount(input.effectiveScope) || 1;
  const distinctZones = new Set(questions.map(q => q.reason.zoneId ?? `open-${q.slotIndex}`)).size;
  const scopeCoverage = pct(distinctZones / Math.max(1, input.slots.length));
  if (scopeCoverage < 100) { notesArabic.push('لم تُغطَّ كل مناطق التوزيع بأسئلة مستقلة.'); notesEnglish.push('Not every distribution zone received its own question.'); }

  const ceiling = Math.max(1, input.repeatPressureCeiling || 4);
  const meanUses = questions.reduce((sum, q) => sum + q.reason.usesBeforeSelection, 0) / questions.length;
  const repeatPressure = pct(1 - Math.min(1, meanUses / ceiling));

  const distinctSurahs = new Set(questions.map(q => q.candidate.surahNumber)).size;
  const diversity = pct(distinctSurahs / questions.length);

  // التشابه: قرب بدايات الأسئلة بعضها من بعض داخل النموذج الواحد.
  const loci = new Set(questions.map(q => locusKeyOf(q.candidate)));
  const similarity = pct(loci.size / questions.length);

  const meanExposure = questions.reduce((sum, q) => sum + q.reason.exposurePressure, 0) / questions.length;
  const exposure = pct(1 - Math.min(1, meanExposure));

  const zoneCompliance = pct(questions.filter(q => q.reason.matchedZone && !q.reason.zoneRelaxed).length / questions.length);
  if (zoneCompliance < 100) { notesArabic.push('وُسِّعت منطقة واحدة على الأقل لتناسب نطاق هذا المتسابق.'); notesEnglish.push('At least one zone was relaxed to fit this participant scope.'); }

  const score = Number((
    difficultyParity * 0.3 + scopeCoverage * 0.15 + repeatPressure * 0.2 +
    diversity * 0.1 + similarity * 0.1 + exposure * 0.05 + zoneCompliance * 0.1
  ).toFixed(1));
  if (ayahSpan < 50) { notesArabic.push('النطاق ضيق جدًا، فالتنوع محدود بطبيعته.'); notesEnglish.push('The scope is very narrow, so diversity is inherently limited.'); }
  return { score, difficultyParity, scopeCoverage, repeatPressure, diversity, similarity, exposure, zoneCompliance, notesArabic, notesEnglish };
}

export function aggregateFairness(models: { fairness: FairnessBreakdown }[]): FairnessBreakdown {
  if (!models.length) return { score: 0, difficultyParity: 0, scopeCoverage: 0, repeatPressure: 0, diversity: 0, similarity: 0, exposure: 0, zoneCompliance: 0, notesArabic: [], notesEnglish: [] };
  const mean = (pick: (f: FairnessBreakdown) => number) => Number((models.reduce((sum, m) => sum + pick(m.fairness), 0) / models.length).toFixed(1));
  return {
    score: mean(f => f.score),
    difficultyParity: mean(f => f.difficultyParity),
    scopeCoverage: mean(f => f.scopeCoverage),
    repeatPressure: mean(f => f.repeatPressure),
    diversity: mean(f => f.diversity),
    similarity: mean(f => f.similarity),
    exposure: mean(f => f.exposure),
    zoneCompliance: mean(f => f.zoneCompliance),
    notesArabic: [...new Set(models.flatMap(m => m.fairness.notesArabic))].slice(0, 5),
    notesEnglish: [...new Set(models.flatMap(m => m.fairness.notesEnglish))].slice(0, 5),
  };
}

export function buildQuestionModel(input: FairnessInput & {
  id: string;
  organizationId: string;
  competitionId: string;
  categoryId: string;
  participantId: string;
  participantScopeVersion: number;
  categoryScopeVersion: number;
  policyVersion: string;
  poolVersion: string;
  reading: { qiraahId?: string; rawiId?: string; tariqId?: string };
  generationMode: QuestionModelRecord['generationMode'];
  quranSourceVersion?: string;
  quranSourcePackageHash?: string;
  seed?: string;
  batchId?: string;
  now?: string;
}): QuestionModelRecord {
  const fairness = computeModelFairness(input);
  const questions: QuestionModelQuestion[] = input.result.questions.map(picked => ({
    questionId: picked.candidate.id,
    surahNumber: picked.candidate.surahNumber,
    startAyah: picked.candidate.startAyah,
    endAyah: picked.candidate.endAyah,
    zoneId: picked.reason.zoneId,
    zoneName: input.slots.find(s => s.index === picked.slotIndex)?.zoneNameArabic || 'النطاق كاملًا',
    difficultyRating: picked.candidate.difficultyRating,
    difficultyAssurance: picked.candidate.difficultyAssurance,
    reason: picked.reason,
  }));
  return {
    id: input.id,
    organizationId: input.organizationId,
    competitionId: input.competitionId,
    categoryId: input.categoryId,
    participantId: input.participantId,
    ...(input.batchId ? { batchId: input.batchId } : {}),
    participantScopeVersion: input.participantScopeVersion,
    scopeSignature: scopeSignature(input.effectiveScope),
    categoryScopeVersion: input.categoryScopeVersion,
    policyVersion: input.policyVersion,
    poolVersion: input.poolVersion,
    ...(input.quranSourceVersion ? { quranSourceVersion: input.quranSourceVersion } : {}),
    ...(input.quranSourcePackageHash ? { quranSourcePackageHash: input.quranSourcePackageHash } : {}),
    reading: input.reading,
    questions,
    zones: [...new Map(input.slots.map(slot => [slot.zoneId ?? 'open', { id: slot.zoneId ?? 'open', name: slot.zoneNameArabic, scopeSignature: scopeSignature(slot.scope) }])).values()],
    aggregateDifficulty: input.result.aggregateDifficulty,
    difficultyVariance: input.result.difficultyVariance,
    minDifficulty: input.result.minDifficulty,
    maxDifficulty: input.result.maxDifficulty,
    coverageAyahCount: scopeAyahCount(input.effectiveScope),
    repeatsUsed: input.result.repeatsUsed,
    relaxations: input.result.relaxations,
    fairness,
    generationMode: input.generationMode,
    engineVersion: input.result.engineVersion,
    ...(input.seed ? { seed: input.seed } : {}),
    status: 'draft',
    createdAt: input.now || new Date().toISOString(),
  };
}

/**
 * لا تغيير صامت بعد الاعتماد: نموذجٌ بُني على نسخة نطاقٍ قديمة لا يجوز أن يبقى صالحًا.
 * يُبطَل، ويُسجَّل سبب إبطاله، ويُعاد التوليد حسب السياسة.
 */
export function invalidateStaleModels(input: {
  models: QuestionModelRecord[];
  currentScopeVersionOf: (participantId: string) => number | undefined;
  currentCategoryScopeVersionOf: (categoryId: string) => number | undefined;
  now?: string;
}): { models: QuestionModelRecord[]; invalidated: QuestionModelRecord[] } {
  const now = input.now || new Date().toISOString();
  const invalidated: QuestionModelRecord[] = [];
  const models = input.models.map(model => {
    if (model.status === 'invalidated') return model;
    const scopeVersion = input.currentScopeVersionOf(model.participantId);
    const categoryVersion = input.currentCategoryScopeVersionOf(model.categoryId);
    const staleParticipant = scopeVersion !== undefined && scopeVersion !== model.participantScopeVersion;
    const staleCategory = categoryVersion !== undefined && categoryVersion !== model.categoryScopeVersion;
    if (!staleParticipant && !staleCategory) return model;
    const next: QuestionModelRecord = {
      ...model, status: 'invalidated', invalidatedAt: now,
      invalidationReason: staleParticipant
        ? `PARTICIPANT_SCOPE_VERSION_CHANGED:${model.participantScopeVersion}->${scopeVersion}`
        : `CATEGORY_SCOPE_VERSION_CHANGED:${model.categoryScopeVersion}->${categoryVersion}`,
    };
    invalidated.push(next);
    return next;
  });
  return { models, invalidated };
}
