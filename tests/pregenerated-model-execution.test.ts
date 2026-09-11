import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/lib/seed-data';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { generateFairDraw, validateScopedSelection, FAIRDRAW_SCOPE_ALGORITHM_VERSION } from '../src/lib/fairdraw';
import { QuestionAllocationEngine } from '../src/lib/question-engine';
import { buildCandidatePool, readingContextOf } from '../src/lib/scope-engine';
import { resolveZoneSlots, freeDistributionPlan } from '../src/lib/question-zones';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { scopeFromJuz, scopeContainsRange } from '../src/lib/quran-scope';
import type { Participant, QuestionPoolItem } from '../src/types';

/*
 * النموذج المختوم يُنفَّذ، لا يُعاد سحبه.
 *
 * وهذا ليس التفافًا على القرعة: القرعة جرت قبل أيام، وخُتمت، وأُتيحت للمراجعة. لكن الإثبات
 * ملزَمٌ أن يقول ذلك صراحةً — وإلا ظنّ المدقّق أن السحب جرى لحظتَه.
 */

const policy = { ...getCompetitionPolicy(SEED_COMPETITION), questions: { ...getCompetitionPolicy(SEED_COMPETITION).questions, questionsPerParticipant: 3 } };
const riwaya = 'حفص عن عاصم';
const participant: Participant = { ...SEED_PARTICIPANTS[0], id: 'p-pre', code: 'PRE-1', riwaya };
const scope = scopeFromJuz([1]);
const reading = readingContextOf({ riwaya });

const pool: QuestionPoolItem[] = buildCandidatePool({ scope, category: undefined, reading }).slice(0, 80).map(c => ({
  id: c.id, surahNumber: c.surahNumber, surahNameArabic: 'سورة', surahNameEnglish: 'Surah',
  startAyah: c.startAyah, endAyah: c.endAyah, juzNumber: c.juzNumber || 1, riwaya,
  expectedTextArabic: 'نص', difficultyRating: c.difficultyRating,
  mutashabihatDensity: 'none' as const, tajweedComplexity: 'intermediate' as const, timesUsed: 0,
}));

const slots = resolveZoneSlots({ plan: freeDistributionPlan(), effectiveScope: scope, questionCount: 3 }).slots;
const engine = () => new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'pre-seed', defaultTargetDifficulty: 3 });

const draw = (preGenerated?: { modelId: string; batchId?: string; questionIds: string[] }) => generateFairDraw({
  pool, participant, policy, seed: 'pre-seed',
  scoped: { scope, participantScopeVersion: 2, slots, engine: engine(), reading, sequencePosition: 0, hallId: 'c1', preGenerated },
});

test('a sealed model is executed verbatim, in its own order, with no re-draw', async () => {
  const chosen = [pool[7], pool[19], pool[31]];
  const selection = await draw({ modelId: 'qmodel-1', batchId: 'batch-1', questionIds: chosen.map(q => q.id) });
  assert.deepEqual(selection.questions.map(q => q.id), chosen.map(q => q.id));
  assert.equal(selection.algorithmVersion, FAIRDRAW_SCOPE_ALGORITHM_VERSION);
  assert.equal(selection.participantScopeVersion, 2);
  assert.equal(selection.scopeSignature, (await draw()).scopeSignature);
});

test('the proof names the model that was executed, so no auditor mistakes it for a live draw', async () => {
  const chosen = [pool[1], pool[5], pool[9]];
  const executed = await draw({ modelId: 'qmodel-7', batchId: 'batch-3', questionIds: chosen.map(q => q.id) });
  const live = await draw();
  assert.notEqual(executed.constraintHash, live.constraintHash, 'an executed model must not hash identically to a live draw');
  assert.notEqual(executed.publicCommitmentHash, live.publicCommitmentHash);
  assert.ok(executed.seedCommitmentHash);
  assert.ok(executed.usageDigest !== undefined);
});

test('executing a sealed model still validates against the participant scope and zones', async () => {
  const chosen = [pool[2], pool[12], pool[22]];
  const selection = await draw({ modelId: 'qmodel-2', questionIds: chosen.map(q => q.id) });
  const verdict = await validateScopedSelection(selection, { slots, reading });
  assert.equal(verdict.valid, true, verdict.valid ? '' : verdict.reason);
  for (const item of selection.questions) {
    assert.ok(scopeContainsRange(scope, { surah: item.surahNumber, ayah: item.startAyah }, { surah: item.surahNumber, ayah: item.endAyah }));
  }
});

test('a model whose loci are missing from the hall pool refuses to half-execute', async () => {
  await assert.rejects(
    draw({ modelId: 'qmodel-3', questionIds: [pool[0].id, 'loc-missing-1', pool[2].id] }),
    /FAIRDRAW_PREGENERATED_MODEL_POOL_MISMATCH/,
  );
});

test('a model carrying a locus outside the participant scope is refused, not executed', async () => {
  const foreign = buildCandidatePool({ scope: scopeFromJuz([30]), category: undefined, reading }).slice(0, 1).map(c => ({
    id: c.id, surahNumber: c.surahNumber, surahNameArabic: 'سورة', surahNameEnglish: 'Surah',
    startAyah: c.startAyah, endAyah: c.endAyah, juzNumber: 30, riwaya,
    expectedTextArabic: 'نص', difficultyRating: c.difficultyRating,
    mutashabihatDensity: 'none' as const, tajweedComplexity: 'intermediate' as const, timesUsed: 0,
  }))[0];
  await assert.rejects(
    generateFairDraw({
      pool: [...pool, foreign], participant, policy, seed: 'pre-seed',
      scoped: { scope, participantScopeVersion: 2, slots, engine: engine(), reading, sequencePosition: 0, preGenerated: { modelId: 'qmodel-4', questionIds: [pool[0].id, foreign.id, pool[2].id] } },
    }),
    /FAIRDRAW_PREGENERATED_MODEL_OUT_OF_SCOPE/,
  );
});

test('executing a model feeds the usage ledger, so the next live draw separates from it', async () => {
  const shared = engine();
  const chosen = [pool[3], pool[13], pool[23]];
  await generateFairDraw({
    pool, participant, policy, seed: 'pre-seed',
    scoped: { scope, participantScopeVersion: 2, slots, engine: shared, reading, sequencePosition: 0, preGenerated: { modelId: 'qmodel-5', questionIds: chosen.map(q => q.id) } },
  });
  const usage = new Map(shared.usageSnapshot().map(row => [row.locusKey, row.uses]));
  for (const item of chosen) assert.equal(usage.get(`${item.surahNumber}:${item.startAyah}`), 1, 'an executed model is recorded, not invisible');

  const next = await generateFairDraw({
    pool, participant: { ...participant, id: 'p-next' }, policy, seed: 'pre-seed',
    scoped: { scope, participantScopeVersion: 2, slots, engine: shared, reading, sequencePosition: 1 },
  });
  const reused = next.questions.filter(q => chosen.some(c => c.surahNumber === q.surahNumber && c.startAyah === q.startAyah));
  assert.equal(reused.length, 0, 'the live draw after an execution avoids what the execution already used');
});
