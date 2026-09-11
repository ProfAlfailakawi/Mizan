import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/lib/seed-data';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import type { Category, Participant, QuestionModelRecord } from '../src/types';
import { fullQuranScope, scopeFromJuz, scopeFromJuzRange, scopeAyahCount, scopeSignature, describeScope, isScopeSubsetOf } from '../src/lib/quran-scope';
import { DEFAULT_SELECTION_RULE, buildParticipantScopeRecord, type ParticipantScopeRecord } from '../src/lib/participant-scope';
import { categoryDistribution, categoryRepeatPolicy, categoryScopeOf, planAllocation, readingContextOf, resolveEffectiveScope, resolveQuestionCount, staleModels } from '../src/lib/scope-engine';
import { QuestionAllocationEngine } from '../src/lib/question-engine';
import { generateFairDraw, validateScopedSelection, verifyFairDrawPublicProof, verifyFairDrawSelection, poolItemToCandidate, FAIRDRAW_SCOPE_ALGORITHM_VERSION } from '../src/lib/fairdraw';
import { buildCandidatePool } from '../src/lib/scope-engine';
import { autoBalancedPlan } from '../src/lib/question-zones';
import { buildScopeReadiness } from '../src/lib/scope-readiness';

/*
 * التدفق الكامل كما يجري في ميزان: فئة بنطاق، قاعدة اختيار، نطاق متسابق يُعتمد، ثم سحب،
 * ثم تحقق مستقل، ثم تغيّر النطاق فيبطل النموذج المبني عليه.
 */

const policy = getCompetitionPolicy(SEED_COMPETITION);
const participantOf = (id: string, categoryId: string): Participant => ({ ...SEED_PARTICIPANTS[0], id, code: id.toUpperCase(), categoryId, riwaya: 'حفص عن عاصم' });

function poolFor(scope: ReturnType<typeof scopeFromJuz>, category: Category | undefined, riwaya = 'حفص عن عاصم') {
  const reading = readingContextOf({ riwaya });
  return buildCandidatePool({ scope, category, reading }).map(c => ({
    id: c.id, surahNumber: c.surahNumber, surahNameArabic: 'سورة', surahNameEnglish: 'Surah',
    startAyah: c.startAyah, endAyah: c.endAyah, juzNumber: c.juzNumber || 1, riwaya,
    expectedTextArabic: 'نص المصدر المعتمد', difficultyRating: c.difficultyRating,
    mutashabihatDensity: 'none' as const, tajweedComplexity: 'intermediate' as const, timesUsed: 0,
  }));
}

const selectableCategory = (): Category => ({
  id: 'cat-quarter', competitionId: SEED_COMPETITION.id, code: 'Q', name: 'Gold', nameArabic: 'الفئة الذهبية',
  description: '', riwaya: 'حفص عن عاصم', memorizationScope: 'ربع القرآن', juzCount: 8,
  targetParticipants: 300, targetDurationMinutes: 8, questionsCount: 4,
  scope: fullQuranScope(), scopeMode: 'participant_selected', scopeVersion: 1,
  selectionRule: { ...DEFAULT_SELECTION_RULE, version: 1, enabled: true, decidedBy: 'participant', selectionUnit: 'juz', exactUnits: 8, parentScope: fullQuranScope(), approval: 'committee' },
});

function approvedScope(category: Category, participantId: string, selection: ReturnType<typeof scopeFromJuz>, version = 1): ParticipantScopeRecord {
  const record = buildParticipantScopeRecord({
    id: `psc-${participantId}-${version}`, organizationId: SEED_COMPETITION.organizationId, competitionId: SEED_COMPETITION.id,
    categoryId: category.id, participantId, rule: category.selectionRule!, selection, version,
  });
  return { ...record, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: 'head-judge' };
}

test('a category name carries no logic: the same name with two scopes behaves differently', () => {
  const gold = selectableCategory();
  const goldFixed: Category = { ...gold, scopeMode: 'fixed', selectionRule: { ...gold.selectionRule!, enabled: false }, scope: scopeFromJuzRange(1, 8) };
  const participant = participantOf('p-name', gold.id);
  const first = resolveEffectiveScope({ participant, category: goldFixed, scopes: [] });
  assert.equal(first.source, 'category');
  assert.equal(scopeAyahCount(first.scope), scopeAyahCount(scopeFromJuzRange(1, 8)));

  const goldSecondHalf: Category = { ...goldFixed, scope: scopeFromJuzRange(23, 30) };
  const second = resolveEffectiveScope({ participant, category: goldSecondHalf, scopes: [] });
  assert.notEqual(scopeSignature(first.scope), scopeSignature(second.scope), 'the identical category name resolves to two different real ranges');
});

test('the international free-quarter scenario: three participants, three ranges, three draws', async () => {
  const category = selectableCategory();
  const cases = [
    { id: 'p-alpha', selection: scopeFromJuzRange(1, 8) },
    { id: 'p-beta', selection: scopeFromJuzRange(12, 19) },
    { id: 'p-gamma', selection: scopeFromJuzRange(23, 30) },
  ];
  const scopes = cases.map(c => approvedScope(category, c.id, c.selection));

  for (const [index, entry] of cases.entries()) {
    const participant = participantOf(entry.id, category.id);
    const resolution = resolveEffectiveScope({ participant, category, scopes });
    assert.equal(resolution.source, 'participant_approved');
    assert.equal(resolution.blocked, false);
    assert.equal(scopeSignature(resolution.scope), scopeSignature(entry.selection));

    const pool = poolFor(resolution.scope, category);
    const allocation = planAllocation({ category, policy, effectiveScope: resolution.scope, candidates: pool.map(p => poolItemToCandidate(p)) });
    assert.equal(allocation.questionCount, 4, 'the category question count wins over the competition policy');
    assert.equal(allocation.slots.length, 4);

    const engine = new QuestionAllocationEngine({ policy: categoryRepeatPolicy(category, policy), seed: `e2e-${entry.id}` });
    const selection = await generateFairDraw({
      pool, participant, policy: { ...policy, questions: { ...policy.questions, questionsPerParticipant: 4 } },
      scoped: { scope: resolution.scope, participantScopeVersion: resolution.version, slots: allocation.slots, engine, reading: readingContextOf({ riwaya: participant.riwaya }), sequencePosition: index },
    });
    assert.equal(selection.algorithmVersion, FAIRDRAW_SCOPE_ALGORITHM_VERSION);
    assert.equal(selection.questions.length, 4);
    assert.equal(selection.scopeSignature, scopeSignature(entry.selection));
    assert.equal(selection.participantScopeVersion, 1);
    assert.ok(selection.fairness && selection.fairness.score > 0, 'the draw carries an explainable fairness breakdown');
    assert.equal(selection.selectionReasons?.length, 4, 'every question records why it was chosen');

    // كل سؤال داخل نطاق صاحبه حصرًا.
    for (const question of selection.questions) {
      const inside = isScopeSubsetOf({ version: 1, segments: [{ start: { surah: question.surahNumber, ayah: question.startAyah }, end: { surah: question.surahNumber, ayah: question.endAyah } }], assurance: 'CANONICAL_TABLE' }, resolution.scope);
      assert.ok(inside, `question ${question.id} (${describeScope(entry.selection, false)}) stays inside its owner's range`);
    }
    // ولا يقع في نطاق أيٍّ من الآخرين إلا إذا تداخلت النطاقات أصلًا — وهنا لا تتداخل.
    for (const other of cases.filter(c => c.id !== entry.id)) {
      for (const question of selection.questions) {
        const insideOther = isScopeSubsetOf({ version: 1, segments: [{ start: { surah: question.surahNumber, ayah: question.startAyah }, end: { surah: question.surahNumber, ayah: question.endAyah } }], assurance: 'CANONICAL_TABLE' }, other.selection);
        assert.equal(insideOther, false, `question ${question.id} must not belong to ${other.id}'s range`);
      }
    }

    const validation = await validateScopedSelection(selection, { slots: allocation.slots });
    assert.equal(validation.valid, true, `independent validation passes: ${JSON.stringify((validation as { problems?: string[] }).problems || [])}`);
  }
});

test('a scoped draw reproduces exactly when the auditor replays the seed and the ledger', async () => {
  const category = selectableCategory();
  const participant = participantOf('p-replay', category.id);
  const scopes = [approvedScope(category, participant.id, scopeFromJuzRange(1, 8))];
  const resolution = resolveEffectiveScope({ participant, category, scopes });
  const pool = poolFor(resolution.scope, category);
  const allocation = planAllocation({ category, policy, effectiveScope: resolution.scope });
  const run = async () => {
    const engine = new QuestionAllocationEngine({ policy: categoryRepeatPolicy(category, policy), seed: 'replay-seed' });
    return generateFairDraw({ pool, participant, policy, seed: 'fixed-audit-seed', scoped: { scope: resolution.scope, slots: allocation.slots, engine, reading: readingContextOf({ riwaya: participant.riwaya }), sequencePosition: 0 } });
  };
  const first = await run(), second = await run();
  assert.deepEqual(first.questions.map(q => q.id), second.questions.map(q => q.id));
  assert.equal(first.publicCommitmentHash, second.publicCommitmentHash);

  const verifyEngine = new QuestionAllocationEngine({ policy: categoryRepeatPolicy(category, policy), seed: 'replay-seed' });
  const verified = await verifyFairDrawSelection({
    selection: first, pool, participant, policy,
    scoped: { scope: resolution.scope, slots: allocation.slots, engine: verifyEngine, reading: readingContextOf({ riwaya: participant.riwaya }), sequencePosition: 0 },
  });
  assert.equal(verified.valid, true, 'the recorded seed and ledger reproduce the identical draw');
});

test('a scoped proof cannot be verified without its scope context, and says so', async () => {
  const category = selectableCategory();
  const participant = participantOf('p-ctx', category.id);
  const scopes = [approvedScope(category, participant.id, scopeFromJuzRange(1, 8))];
  const resolution = resolveEffectiveScope({ participant, category, scopes });
  const pool = poolFor(resolution.scope, category);
  const allocation = planAllocation({ category, policy, effectiveScope: resolution.scope });
  const engine = new QuestionAllocationEngine({ policy: categoryRepeatPolicy(category, policy), seed: 'ctx' });
  const selection = await generateFairDraw({ pool, participant, policy, scoped: { scope: resolution.scope, slots: allocation.slots, engine, reading: readingContextOf({ riwaya: participant.riwaya }) } });
  const result = await verifyFairDrawSelection({ selection, pool, participant, policy });
  assert.equal(result.valid, false);
  assert.equal((result as { reason?: string }).reason, 'SCOPE_CONTEXT_REQUIRED');
});

test('a participant whose category requires a scope but has none cannot be drawn for', () => {
  const category = selectableCategory();
  const participant = participantOf('p-missing', category.id);
  const resolution = resolveEffectiveScope({ participant, category, scopes: [] });
  assert.equal(resolution.blocked, true);
  assert.equal(resolution.source, 'none');
  assert.ok(resolution.reasonArabic.includes('يحتاج مراجعة'), 'the Arabic copy speaks to an organiser, not to a developer');
  assert.ok(!resolution.reasonArabic.includes('Effective Scope'), 'no English engineering term leaks into the Arabic surface');
});

test('a draft or rejected scope is not usable; only approved or locked is', () => {
  const category = selectableCategory();
  const participant = participantOf('p-draft', category.id);
  const base = approvedScope(category, participant.id, scopeFromJuzRange(1, 8));
  for (const status of ['draft', 'submitted', 'under_review', 'rejected'] as const) {
    const resolution = resolveEffectiveScope({ participant, category, scopes: [{ ...base, status }] });
    assert.equal(resolution.blocked, true, `${status} must not authorise a draw`);
  }
  for (const status of ['approved', 'locked'] as const) {
    assert.equal(resolveEffectiveScope({ participant, category, scopes: [{ ...base, status }] }).blocked, false);
  }
});

test('changing a participant scope invalidates the model built on the old version', () => {
  const category = selectableCategory();
  const model = { id: 'm1', participantId: 'p-shift', categoryId: category.id, participantScopeVersion: 1, categoryScopeVersion: 1, status: 'sealed' } as QuestionModelRecord;
  const version1 = approvedScope(category, 'p-shift', scopeFromJuzRange(1, 8), 1);
  assert.equal(staleModels([model], [version1], [category]).length, 0);
  const version2 = approvedScope(category, 'p-shift', scopeFromJuzRange(12, 19), 2);
  assert.equal(staleModels([model], [version2], [category]).length, 1, 'a model on a superseded scope version is stale');
  const bumpedCategory: Category = { ...category, scopeVersion: 2 };
  assert.equal(staleModels([model], [version1], [bumpedCategory]).length, 1, 'a category scope change invalidates too');
});

test('readiness refuses to run a competition whose participants lack approved scopes', () => {
  const category = selectableCategory();
  const participants = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, code: `A-${i}`, categoryId: category.id, status: 'approved' }));
  const blocked = buildScopeReadiness({
    categories: [category], participants, participantScopes: [],
    candidatesFor: scope => buildCandidatePool({ scope, category, reading: readingContextOf({ riwaya: category.riwaya }) }),
    questionsPerParticipant: c => resolveQuestionCount(c, policy),
    repeatPolicyFor: c => categoryRepeatPolicy(c, policy),
  });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.checks.some(x => x.id === 'participant_scope' && x.severity === 'critical'));

  const ready = buildScopeReadiness({
    categories: [category], participants,
    participantScopes: participants.map((p, i) => approvedScope(category, p.id, scopeFromJuzRange(1 + i, 8 + i))),
    candidatesFor: scope => buildCandidatePool({ scope, category, reading: readingContextOf({ riwaya: category.riwaya }) }),
    questionsPerParticipant: c => resolveQuestionCount(c, policy),
    repeatPolicyFor: c => categoryRepeatPolicy(c, policy),
  });
  assert.equal(ready.checks.find(x => x.id === 'participant_scope')?.severity, 'passed');
});

test('question count is independent of scope size, in both directions', () => {
  const wide: Category = { ...selectableCategory(), scope: fullQuranScope(), questionsCount: 1 };
  const narrow: Category = { ...selectableCategory(), scope: scopeFromJuz([30]), questionsCount: 10 };
  assert.equal(resolveQuestionCount(wide, policy), 1, 'thirty juz with a single question is a legitimate configuration');
  assert.equal(resolveQuestionCount(narrow, policy), 10, 'one juz with ten questions is too');
  assert.equal(resolveQuestionCount({ ...wide, questionsCount: undefined }, policy), policy.questions.questionsPerParticipant, 'and the competition policy fills the gap');
  const zoned = categoryDistribution({ ...wide, distribution: undefined } as Category, 1);
  assert.equal(zoned.zones.length, 1, 'auto zoning follows the question count, not the juz count');
  assert.equal(autoBalancedPlan(fullQuranScope(), 7).zones.length, 7);
});

test('a published scope proof lets an auditor check fairness without the Quran text or the ledger', async () => {
  const category = selectableCategory();
  const participant = participantOf('p-proof', category.id);
  const scopes = [approvedScope(category, participant.id, scopeFromJuzRange(1, 8))];
  const resolution = resolveEffectiveScope({ participant, category, scopes });
  const pool = poolFor(resolution.scope, category);
  const allocation = planAllocation({ category, policy, effectiveScope: resolution.scope });
  const engine = new QuestionAllocationEngine({ policy: categoryRepeatPolicy(category, policy), seed: 'proof-seed' });
  const selection = await generateFairDraw({ pool, participant, policy, scoped: { scope: resolution.scope, participantScopeVersion: 1, slots: allocation.slots, engine, reading: readingContextOf({ riwaya: participant.riwaya }) } });

  const proof = {
    id: 'proof-scope', competitionId: SEED_COMPETITION.id, questionSetId: selection.questionSetId,
    algorithmVersion: selection.algorithmVersion!, ruleVersion: selection.ruleVersion!, poolVersion: selection.poolVersion!,
    poolSnapshotHash: selection.poolSnapshotHash!, constraintHash: selection.constraintHash!,
    seedCommitmentHash: selection.seedCommitmentHash, publicCommitmentHash: selection.publicCommitmentHash!,
    secretSeed: selection.seedReveal, selectionIds: selection.questions.map(q => q.id), status: 'REVEALED' as const,
    createdAt: selection.generatedAt, participantReading: participant.riwaya,
    scopeSignature: selection.scopeSignature, participantScopeVersion: selection.participantScopeVersion, zoneSignatures: selection.zoneSignatures,
    eligiblePoolSnapshot: pool.map(q => ({ id: q.id, riwaya: q.riwaya, surahNumber: q.surahNumber, startAyah: q.startAyah, endAyah: q.endAyah, juzNumber: q.juzNumber, difficultyRating: q.difficultyRating, mutashabihatDensity: q.mutashabihatDensity, tajweedComplexity: q.tajweedComplexity })),
  };
  assert.equal((await verifyFairDrawPublicProof(proof)).valid, true, 'an honest proof verifies');
  assert.equal((await verifyFairDrawPublicProof({ ...proof, selectionIds: [...proof.selectionIds.slice(1), 'planted-question'] })).valid, false, 'a question that was never in the disclosed pool is caught');
  assert.equal((await verifyFairDrawPublicProof({ ...proof, secretSeed: 'a-different-seed' })).valid, false, 'a swapped seed breaks the commitment');
  assert.equal((await verifyFairDrawPublicProof({ ...proof, scopeSignature: undefined })).valid, false, 'a proof with no scope signature is incomplete, not valid');
});

test('a locus is identified with its reading, so two readings never collide into one pool', () => {
  /*
   * عُثر على هذا الخلل بتشغيل الشاشة لا بقراءتها: كانت المواضع تُعرَّف بالسورة والآية وحدها،
   * فيتطابق معرّف موضعٍ في رواية حفص مع نظيره في ورش. وعند تجميع بنك المسابقة يبتلع أحدهما
   * الآخر، فيجد متسابق ورشٍ بنكًا فارغًا ويفشل سحبه بلا سبب ظاهر.
   */
  const scope = scopeFromJuzRange(1, 2);
  const hafs = buildCandidatePool({ scope, category: undefined, reading: { qiraahId: 'asim', rawiId: 'hafs' } });
  const warsh = buildCandidatePool({ scope, category: undefined, reading: { qiraahId: 'nafi', rawiId: 'warsh' } });
  assert.ok(hafs.length > 0 && warsh.length === hafs.length);
  assert.notEqual(hafs[0].id, warsh[0].id, 'the same locus in two readings carries two identities');
  const merged = new Map([...hafs, ...warsh].map(c => [c.id, c]));
  assert.equal(merged.size, hafs.length + warsh.length, 'merging two reading pools loses nothing');
  assert.equal(hafs[0].rawiId, 'hafs');
  assert.equal(warsh[0].rawiId, 'warsh');
});

test('a participant is never starved because another reading shares the competition pool', () => {
  const scope = scopeFromJuzRange(1, 2);
  const pool = [
    ...buildCandidatePool({ scope, category: undefined, reading: { qiraahId: 'asim', rawiId: 'hafs' } }),
    ...buildCandidatePool({ scope, category: undefined, reading: { qiraahId: 'nafi', rawiId: 'warsh' } }),
  ];
  const engine = new QuestionAllocationEngine({ policy: { ...categoryRepeatPolicy(undefined, policy) }, seed: 'reading-mix' });
  const slots = planAllocation({ category: undefined, policy, effectiveScope: scope }).slots;
  for (const reading of [{ qiraahId: 'asim', rawiId: 'hafs' }, { qiraahId: 'nafi', rawiId: 'warsh' }]) {
    const result = engine.selectForParticipant({ participantId: `p-${reading.rawiId}`, effectiveScope: scope, slots, reading, sequencePosition: 0 }, pool);
    assert.equal(result.failures.length, 0, `${reading.rawiId} finds eligible questions`);
    assert.ok(result.questions.length > 0);
    for (const picked of result.questions) assert.equal(picked.candidate.rawiId, reading.rawiId, 'and only from its own reading');
  }
});

test('the store draws through the scope engine, not through a juz number', () => {
  /* الشاشة قد تخطئ، والمخزن لا. هذا الفحص يثبت أن مسار السحب في المخزن يمرّ فعلًا
     على النطاق المعتمد وعلى المحرك، وأنه لم يعد يمرر maxJuz إلى القرعة. */
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  assert.match(store, /const scopeResolution=participantEffectiveScope\(participantId\)/, 'the session resolves the participant scope before drawing');
  assert.match(store, /if\(!scopeResolution\|\|scopeResolution\.blocked\)/, 'and refuses to start when the scope is unavailable');
  assert.match(store, /scoped:\{ scope:effectiveScope/, 'the draw runs in scope mode');
  assert.ok(!/generateFairDraw\(\{ pool, participant, policy:effPolicy, maxJuz/.test(store), 'the live draw no longer passes a juz number as the range');
  assert.match(store, /pool=pool\.filter\(item=>scopeContainsRange\(effectiveScope/, 'the pool itself is clipped to the participant scope first');
  assert.match(store, /globalState\.questionModels=\[model,\.\.\.globalState\.questionModels\]/, 'every draw persists an auditable model record');
});
