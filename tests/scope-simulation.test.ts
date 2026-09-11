import test from 'node:test';
import assert from 'node:assert/strict';
import { runCompetitionTwin, syntheticParticipants } from '../src/lib/competition-twin';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { autoBalancedPlan, freeDistributionPlan } from '../src/lib/question-zones';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { fullQuranScope, scopeFromJuz, scopeFromJuzRange, scopeFromSurahs, scopeUnion } from '../src/lib/quran-scope';

/*
 * التوأم الرقمي يُشغِّل المسابقة بالمحرك نفسه الذي سيعمل يوم المسابقة.
 * والشرطان اللذان لا يُتنازل عنهما في أي حجم: صفر سؤال خارج النطاق، وصفر خرق للرواية.
 */

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const fullPool = projectCandidatesFromScope(fullQuranScope(), { passageAyahCount: 3, reading });

test('one thousand participants on a single juz: forced repetition, zero violations', () => {
  const juz1 = scopeFromJuz([1]);
  const candidates = projectCandidatesFromScope(juz1, { passageAyahCount: 3, reading });
  const participants = syntheticParticipants({ count: 1000, categoryId: 'local', questionCount: 3, scopes: [{ scope: juz1, share: 1 }], reading, halls: 6 });
  const result = runCompetitionTwin({
    competitionId: 'test-1k', participants, candidates,
    defaultPlan: autoBalancedPlan(juz1, 3),
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', minimumParticipantGap: 40 },
    targetDifficulty: 3, seed: 'test-1k',
  });
  const m = result.metrics;
  assert.equal(m.participants, 1000);
  assert.equal(m.draws, 3000);
  assert.equal(m.successRate, 1, 'every draw succeeds even though repetition is unavoidable');
  assert.equal(m.scopeViolations, 0, 'not one question outside the juz');
  assert.equal(m.readingViolations, 0);
  assert.equal(m.duplicateWithinModelViolations, 0);
  assert.equal(m.duplicateForParticipantViolations, 0);
  assert.ok(m.totalRepeats > 0, 'repetition is real and reported, not hidden');
  assert.ok(m.unavoidableRepeats > 0 && m.avoidableRepeats <= m.unavoidableRepeats * 0.02, 'almost all repetition is mathematically forced');
  assert.ok(m.maxUsesOfAnyQuestion - m.minUsesOfAnyQuestion <= 2, 'no question carries another question\'s load');
  assert.ok(m.reuseDispersion < 0.1, `reuse is evenly spread (${m.reuseDispersion})`);
  assert.ok(m.excessOverLowerBound <= 2, `the achieved maximum sits within two uses of the mathematical floor (${m.maxUsesOfAnyQuestion} vs ${m.theoreticalMinimumMaxUses})`);
  assert.equal(result.failures.length, 0);
});

test('five thousand participants across mixed scopes stay inside their own ranges', () => {
  const scopes = [
    { scope: fullQuranScope(), share: 20 },
    { scope: scopeFromJuzRange(23, 30), share: 20 },
    { scope: scopeFromJuzRange(1, 5), share: 20 },
    { scope: scopeFromJuzRange(10, 20), share: 20 },
    { scope: scopeUnion(scopeFromJuz([1, 3, 7, 12, 26]), scopeFromSurahs([19, 36])), share: 15 },
    { scope: scopeFromJuz([30]), share: 5 },
  ];
  const participants = syntheticParticipants({ count: 5000, categoryId: 'mixed', questionCount: 5, scopes, reading, halls: 20 });
  const result = runCompetitionTwin({
    competitionId: 'test-5k', participants, candidates: fullPool,
    defaultPlan: autoBalancedPlan(fullQuranScope(), 5),
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', minimumParticipantGap: 60 },
    targetDifficulty: 3, seed: 'test-5k',
  });
  const m = result.metrics;
  assert.equal(m.participants, 5000);
  assert.equal(m.draws, 25000);
  assert.equal(m.successRate, 1);
  assert.equal(m.scopeViolations, 0, 'no participant ever sees a question from another participant\'s range');
  assert.equal(m.readingViolations, 0);
  assert.equal(m.duplicateWithinModelViolations, 0);
  assert.equal(m.duplicateForParticipantViolations, 0);
  assert.equal(result.demand.clusters.length, 6, 'six distinct scopes cluster into six groups');
  assert.ok(m.maxModelDifficultyDelta <= 2, 'aggregate model load stays comparable across very different ranges');
  assert.ok(result.metrics.reuseLowerBound.bindingGroupLabel.length > 0, 'the bottleneck is named, not just numbered');
});

test('the twin is reproducible: the same seed replays the same competition', () => {
  const scope = scopeFromJuzRange(1, 3);
  const candidates = projectCandidatesFromScope(scope, { passageAyahCount: 3, reading });
  const participants = syntheticParticipants({ count: 60, categoryId: 'c', questionCount: 3, scopes: [{ scope, share: 1 }], reading });
  const run = () => runCompetitionTwin({ competitionId: 'rep', participants, candidates, defaultPlan: freeDistributionPlan(), repeatPolicy: DEFAULT_REPEAT_POLICY, targetDifficulty: 3, seed: 'replay' }).metrics;
  const a = run(), b = run();
  assert.deepEqual({ ...a, selectionMillisTotal: 0, selectionMillisAverage: 0, selectionMillisP50: 0, selectionMillisP95: 0, selectionMillisP99: 0, heapUsedMb: 0 }, { ...b, selectionMillisTotal: 0, selectionMillisAverage: 0, selectionMillisP50: 0, selectionMillisP95: 0, selectionMillisP99: 0, heapUsedMb: 0 });
});

test('a what-if change is visible in the metrics: more participants, more pressure', () => {
  const scope = scopeFromJuz([1]);
  const candidates = projectCandidatesFromScope(scope, { passageAyahCount: 3, reading });
  const run = (count: number) => runCompetitionTwin({
    competitionId: 'whatif', participants: syntheticParticipants({ count, categoryId: 'c', questionCount: 3, scopes: [{ scope, share: 1 }], reading }),
    candidates, defaultPlan: freeDistributionPlan(), repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse' }, targetDifficulty: 3, seed: 'whatif',
  }).metrics;
  const small = run(200), large = run(400);
  assert.ok(large.maxUsesOfAnyQuestion > small.maxUsesOfAnyQuestion, 'doubling the field doubles the pressure and the report says so');
  assert.equal(small.scopeViolations, 0);
  assert.equal(large.scopeViolations, 0);
});

test('a pool that cannot serve strict no-repeat fails loudly instead of repeating', () => {
  const scope = scopeFromJuz([30]);
  const candidates = projectCandidatesFromScope(scope, { passageAyahCount: 3, reading });
  const participants = syntheticParticipants({ count: 400, categoryId: 'c', questionCount: 3, scopes: [{ scope, share: 1 }], reading });
  const result = runCompetitionTwin({
    competitionId: 'strict', participants, candidates, defaultPlan: freeDistributionPlan(),
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'strict_no_repeat', maxUsesPerQuestion: 1 }, targetDifficulty: 3, seed: 'strict',
  });
  assert.ok(result.metrics.failedDraws > 0, 'the shortage is surfaced');
  assert.equal(result.metrics.maxUsesOfAnyQuestion, 1, 'and nothing is repeated to paper over it');
  assert.ok(result.failures.every(f => f.code === 'NO_ELIGIBLE_QUESTION'));
});
