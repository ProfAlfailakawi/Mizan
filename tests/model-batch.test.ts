import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQuarantine, claimReserveModel, describeBatch, generateModelBatch, type BatchParticipant } from '../src/lib/model-batch';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { fullQuranScope, scopeFromJuz, scopeSignature } from '../src/lib/quran-scope';
import { DEFAULT_REPEAT_POLICY, STRICT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { autoBalancedPlan, freeDistributionPlan } from '../src/lib/question-zones';
import { scopeContainsRange } from '../src/lib/quran-scope';

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const candidates = projectCandidatesFromScope(fullQuranScope(), { passageAyahCount: 3, reading });
let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;

const baseInput = (participants: BatchParticipant[], overrides: Partial<Parameters<typeof generateModelBatch>[0]> = {}) => ({
  batchId: 'batch-1',
  organizationId: 'org-1',
  competitionId: 'comp-1',
  categoryId: 'cat-1',
  categoryScopeVersion: 1,
  policyVersion: 'v1',
  poolVersion: 'pool-1',
  participants,
  candidates,
  distribution: freeDistributionPlan(),
  repeatPolicy: DEFAULT_REPEAT_POLICY,
  targetDifficulty: 3,
  difficultyTolerance: 1,
  seed: 'seed-batch',
  generationMode: 'pre_generated' as const,
  newId,
  ...overrides,
});

const participantsOn = (count: number, juz: number[], prefix = 'p') =>
  Array.from({ length: count }, (_, i) => ({ participantId: `${prefix}${i}`, scope: scopeFromJuz(juz), scopeVersion: 1, questionCount: 3, reading }));

/*
 * الدفعة تُولَّد بالمحرك نفسه. لو اختلف مسار التجهيز عن مسار القاعة لكان التجهيز كذبًا
 * مهذّبًا: يُراجَع نموذجٌ ويُنفَّذ غيره.
 */

test('a pre-generated batch produces one sealed model per participant, every question inside that participant scope', () => {
  const participants = [...participantsOn(6, [1], 'a'), ...participantsOn(4, [30], 'b')];
  const outcome = generateModelBatch(baseInput(participants));
  assert.equal(outcome.models.length, 10);
  assert.equal(outcome.failures.length, 0);
  for (const model of outcome.models) {
    assert.equal(model.status, 'sealed');
    assert.equal(model.generationMode, 'pre_generated');
    assert.equal(model.batchId, 'batch-1');
    assert.equal(model.questions.length, 3);
    const scope = participants.find(p => p.participantId === model.participantId)!.scope;
    for (const question of model.questions) {
      assert.ok(scopeContainsRange(scope, { surah: question.surahNumber, ayah: question.startAyah }, { surah: question.surahNumber, ayah: question.endAyah }),
        `question ${question.questionId} left the participant scope`);
    }
  }
  assert.equal(outcome.batch.modelCount, 10);
  assert.equal(outcome.batch.approvalState, 'draft');
  assert.ok(outcome.batch.aggregateFairness.score > 0);
});

test('a batch is deterministic: the same seed and inputs reproduce the same question ids', () => {
  const participants = participantsOn(5, [5]);
  const first = generateModelBatch(baseInput(participants));
  const second = generateModelBatch(baseInput(participants));
  assert.deepEqual(
    first.models.map(m => m.questions.map(q => q.questionId)),
    second.models.map(m => m.questions.map(q => q.questionId)),
  );
});

test('reserves are generated per scope signature, never as one floating spare', () => {
  const participants = [...participantsOn(3, [1], 'a'), ...participantsOn(3, [30], 'b')];
  const outcome = generateModelBatch(baseInput(participants, { reserveCount: 2 }));
  assert.equal(outcome.reserves.length, 4, 'two reserves for each of the two distinct signatures');
  const signatures = new Set(outcome.reserves.map(r => r.scopeSignature));
  assert.equal(signatures.size, 2);
  assert.deepEqual([...new Set(outcome.reserves.map(r => r.status))], ['draft']);
  assert.deepEqual([...new Set(outcome.reserves.map(r => r.participantId))], [''], 'a reserve belongs to no participant yet');
});

test('a reserve is claimed only on an exact scope-signature match, never on a wider or narrower one', () => {
  const participants = [...participantsOn(2, [1], 'a'), ...participantsOn(2, [2], 'b')];
  const outcome = generateModelBatch(baseInput(participants, { reserveCount: 1 }));
  const juzOne = scopeFromJuz([1]);
  const juzThree = scopeFromJuz([3]);

  const wrong = claimReserveModel({ reserves: outcome.reserves, participantId: 'x1', scope: juzThree, scopeVersion: 1, reason: 'سقط سؤال' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.model, null);
  assert.equal(wrong.reason, 'NO_RESERVE_FOR_THIS_SCOPE');

  const right = claimReserveModel({ reserves: outcome.reserves, participantId: 'x1', scope: juzOne, scopeVersion: 4, reason: 'سقط سؤال' });
  assert.equal(right.ok, true);
  assert.equal(right.model!.participantId, 'x1');
  assert.equal(right.model!.participantScopeVersion, 4);
  assert.equal(right.model!.status, 'sealed');
  assert.equal(right.model!.scopeSignature, scopeSignature(juzOne));
  assert.ok(right.model!.relaxations.some(r => r.startsWith('reserve_claimed:')), 'the claim records why it happened');
  assert.equal(right.remaining.length, outcome.reserves.length - 1);
});

test('quarantine invalidates every model carrying the locus, names who is affected, and measures what is left', () => {
  const participants = participantsOn(8, [1]);
  const outcome = generateModelBatch(baseInput(participants));
  const victim = outcome.models[0].questions[0];
  const locusKey = `${victim.surahNumber}:${victim.startAyah}`;
  const impact = applyQuarantine({
    locusKeys: [locusKey], reason: 'خطأ في الضبط',
    models: outcome.models, candidates, requiredDraws: 24,
  });
  assert.ok(impact.invalidatedModels.length >= 1);
  for (const model of impact.invalidatedModels) {
    assert.equal(model.status, 'invalidated');
    assert.match(model.invalidationReason || '', /QUARANTINED_LOCUS/);
    assert.ok(model.questions.some(q => `${q.surahNumber}:${q.startAyah}` === locusKey));
  }
  assert.deepEqual(impact.affectedParticipantIds.sort(), [...new Set(impact.invalidatedModels.map(m => m.participantId))].sort());
  assert.equal(impact.canContinue, true);
  assert.ok(impact.remainingUniqueLoci > 0);
  assert.match(impact.summaryArabic, /حُجر/);
  assert.match(impact.summaryEnglish, /quarantined/);
});

test('quarantining the whole pool says plainly that the competition cannot continue', () => {
  const scope = scopeFromJuz([30]);
  const local = projectCandidatesFromScope(scope, { passageAyahCount: 3, reading });
  const impact = applyQuarantine({
    locusKeys: local.map(c => `${c.surahNumber}:${c.startAyah}`),
    reason: 'مصدر غير معتمد', models: [], candidates: local, requiredDraws: 30,
  });
  assert.equal(impact.canContinue, false);
  assert.equal(impact.remainingUniqueLoci, 0);
  assert.match(impact.summaryArabic, /لا يمكن الاستمرار/);
});

test('a strict-no-repeat batch on an insufficient pool declares failures instead of silently repeating', () => {
  const scope = scopeFromJuz([30]);
  const local = projectCandidatesFromScope(scope, { passageAyahCount: 3, reading });
  const participants = Array.from({ length: 400 }, (_, i) => ({ participantId: `s${i}`, scope, scopeVersion: 1, questionCount: 3, reading }));
  const outcome = generateModelBatch(baseInput(participants, { candidates: local, repeatPolicy: STRICT_REPEAT_POLICY, seed: 'strict' }));
  const used = new Map<string, number>();
  for (const model of outcome.models) {
    for (const question of model.questions) {
      const key = `${question.surahNumber}:${question.startAyah}`;
      used.set(key, (used.get(key) || 0) + 1);
    }
  }
  assert.ok(outcome.failures.length > 0, 'the shortfall is declared, not hidden');
  assert.equal([...used.values()].filter(n => n > 1).length, 0, 'strict mode never repeats a locus');
});

test('an auto-balanced batch keeps zone coverage and records the batch in one human sentence', () => {
  const participants = participantsOn(4, [1, 2, 3]);
  const outcome = generateModelBatch(baseInput(participants, { distribution: autoBalancedPlan(scopeFromJuz([1, 2, 3]), 3), reserveCount: 1 }));
  assert.equal(outcome.models.length, 4);
  for (const model of outcome.models) assert.ok(model.zones.length >= 1);
  const text = describeBatch(outcome.batch, scopeFromJuz([1, 2, 3]), true);
  assert.match(text, /نموذجًا/);
  assert.match(text, /احتياطيًا/);
});
