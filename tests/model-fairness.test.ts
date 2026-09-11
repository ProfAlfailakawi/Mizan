import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateFairness, buildQuestionModel, computeModelFairness, invalidateStaleModels } from '../src/lib/model-fairness';
import { QuestionAllocationEngine } from '../src/lib/question-engine';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { autoBalancedPlan, resolveZoneSlots } from '../src/lib/question-zones';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { fullQuranScope, scopeFromJuzRange, scopeSignature } from '../src/lib/quran-scope';

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const scope = scopeFromJuzRange(1, 10);
const candidates = projectCandidatesFromScope(scope, { passageAyahCount: 3, reading });

function model(participantId: string, position: number, engine: QuestionAllocationEngine) {
  const plan = autoBalancedPlan(scope, 5);
  const { slots } = resolveZoneSlots({ plan, effectiveScope: scope, questionCount: 5 });
  const result = engine.selectForParticipant({ participantId, effectiveScope: scope, slots, reading, sequencePosition: position, targetDifficulty: 3 }, candidates);
  return { result, slots };
}

/*
 * العدالة على مستوى النموذج: لا تُقارن الأسئلة سؤالًا بسؤال، بل يُقارن الحملُ بالحمل.
 * وأي درجة عدالة تُعرض تنفتح إلى مكوّناتها — لا رقم غامض.
 */

test('a fairness score always opens into its components', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'fair-1' });
  const { result, slots } = model('p-1', 0, engine);
  const fairness = computeModelFairness({ result, slots, targetDifficulty: 3, difficultyTolerance: 1, effectiveScope: scope });
  for (const key of ['difficultyParity', 'scopeCoverage', 'repeatPressure', 'diversity', 'similarity', 'exposure', 'zoneCompliance'] as const) {
    assert.ok(typeof fairness[key] === 'number' && fairness[key] >= 0 && fairness[key] <= 100, `${key} is a readable 0..100 component`);
  }
  assert.ok(fairness.score > 0 && fairness.score <= 100);
  assert.equal(fairness.similarity, 100, 'five distinct loci give full distinctness');
});

test('difficulty budget is measured across the model, not per question', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'fair-2' });
  const { result } = model('p-2', 0, engine);
  assert.equal(result.questions.length, 5);
  const mean = result.questions.reduce((sum, q) => sum + q.candidate.difficultyRating, 0) / 5;
  assert.ok(Math.abs(result.aggregateDifficulty - mean) < 0.01);
  assert.ok(result.maxDifficulty >= result.minDifficulty);
  assert.ok(result.difficultyVariance >= 0);
});

test('two models drawn from the same scope land close in aggregate load', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'fair-3' });
  const a = model('p-a', 0, engine).result, b = model('p-b', 1, engine).result;
  assert.notDeepEqual(a.questions.map(q => q.candidate.id), b.questions.map(q => q.candidate.id), 'different participants get different questions');
  assert.ok(Math.abs(a.aggregateDifficulty - b.aggregateDifficulty) <= 0.75, 'but their total load stays comparable');
});

test('every selected question carries an audit-friendly structured reason', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'fair-4' });
  const { result } = model('p-4', 0, engine);
  for (const picked of result.questions) {
    const reason = picked.reason;
    assert.equal(reason.matchedScope, true);
    assert.equal(reason.matchedReading, true);
    assert.equal(typeof reason.targetDifficulty, 'number');
    assert.equal(typeof reason.actualDifficulty, 'number');
    assert.equal(typeof reason.usesBeforeSelection, 'number');
    assert.ok(reason.alternativeCandidates > 0, 'the number of alternatives considered is recorded');
    assert.equal(typeof reason.score, 'number');
    assert.ok(Array.isArray(reason.relaxedPreferences));
    assert.ok(!('chainOfThought' in (reason as unknown as Record<string, unknown>)), 'only structured decision metadata is stored');
  }
});

test('a model record pins every version it was built on', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'fair-5' });
  const { result, slots } = model('p-5', 0, engine);
  const record = buildQuestionModel({
    result, slots, targetDifficulty: 3, difficultyTolerance: 1, effectiveScope: scope,
    id: 'qm-1', organizationId: 'org', competitionId: 'comp', categoryId: 'cat', participantId: 'p-5',
    participantScopeVersion: 4, categoryScopeVersion: 2, policyVersion: 'v1', poolVersion: 'pool-1',
    reading, generationMode: 'just_in_time', seed: 'fair-5',
  });
  assert.equal(record.participantScopeVersion, 4);
  assert.equal(record.categoryScopeVersion, 2);
  assert.equal(record.scopeSignature, scopeSignature(scope));
  assert.equal(record.questions.length, 5);
  assert.equal(record.status, 'draft');
  assert.ok(record.fairness.score > 0);
  assert.ok(record.zones.length >= 1);
});

test('a model built on a superseded scope version is invalidated, with the reason recorded', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'fair-6' });
  const { result, slots } = model('p-6', 0, engine);
  const record = buildQuestionModel({
    result, slots, targetDifficulty: 3, difficultyTolerance: 1, effectiveScope: scope,
    id: 'qm-2', organizationId: 'org', competitionId: 'comp', categoryId: 'cat', participantId: 'p-6',
    participantScopeVersion: 1, categoryScopeVersion: 1, policyVersion: 'v1', poolVersion: 'pool-1',
    reading, generationMode: 'pre_generated',
  });
  const unchanged = invalidateStaleModels({ models: [record], currentScopeVersionOf: () => 1, currentCategoryScopeVersionOf: () => 1 });
  assert.equal(unchanged.invalidated.length, 0, 'an unchanged scope leaves the model alone');

  const changed = invalidateStaleModels({ models: [record], currentScopeVersionOf: () => 2, currentCategoryScopeVersionOf: () => 1 });
  assert.equal(changed.invalidated.length, 1);
  assert.equal(changed.models[0].status, 'invalidated');
  assert.match(changed.models[0].invalidationReason!, /PARTICIPANT_SCOPE_VERSION_CHANGED:1->2/);

  const categoryChanged = invalidateStaleModels({ models: [record], currentScopeVersionOf: () => 1, currentCategoryScopeVersionOf: () => 9 });
  assert.match(categoryChanged.models[0].invalidationReason!, /CATEGORY_SCOPE_VERSION_CHANGED:1->9/);
});

test('aggregate fairness summarises a batch without hiding its notes', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'fair-7' });
  const models = Array.from({ length: 12 }, (_, i) => {
    const { result, slots } = model(`p-b${i}`, i, engine);
    return { fairness: computeModelFairness({ result, slots, targetDifficulty: 3, difficultyTolerance: 1, effectiveScope: scope }) };
  });
  const aggregate = aggregateFairness(models);
  assert.ok(aggregate.score > 0 && aggregate.score <= 100);
  assert.ok(aggregate.notesArabic.length <= 5);
});

test('an empty model scores zero and says so rather than pretending', () => {
  const fairness = computeModelFairness({
    result: { participantId: 'x', questions: [], failures: [], aggregateDifficulty: 0, difficultyVariance: 0, minDifficulty: 0, maxDifficulty: 0, repeatsUsed: 0, relaxations: [], engineVersion: 'MIZAN-QUESTION-ENGINE-1' },
    slots: [], targetDifficulty: 3, difficultyTolerance: 1, effectiveScope: fullQuranScope(),
  });
  assert.equal(fairness.score, 0);
  assert.ok(fairness.notesArabic[0].includes('لا أسئلة'));
});
