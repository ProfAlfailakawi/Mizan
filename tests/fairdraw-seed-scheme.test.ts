/*
 * بذرةُ السحب الحيّ لا تُحسب من المعرّفين قبل السحب — ويبقى السحب قابلًا للتحقّق.
 *
 * كان أساسُ بنك مصحف التسليم وبذرةُ المحرّك `${competitionId}:${participantId}`، والبذرةُ
 * العشوائية لا تدخل الاختيار في وضع النطاق. فيحسب المتسابقُ أسئلته قبل السحب عبر نقطة
 * GET /api/public/kfgqpc/fairdraw/:readingId غير المصادَق عليها.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/data/seed-data';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import type { Category, Participant } from '../src/types';
import { scopeFromJuzRange, fullQuranScope } from '../src/lib/quran-scope';
import { DEFAULT_SELECTION_RULE } from '../src/lib/participant-scope';
import { buildCandidatePool, categoryRepeatPolicy, planAllocation, readingContextOf } from '../src/lib/scope-engine';
import { QuestionAllocationEngine } from '../src/lib/question-engine';
import { FAIRDRAW_SEED_SCHEME_V2, generateFairDraw, liveDrawSeedBase, newDrawSecret, poolItemToCandidate, validateScopedSelection, verifyFairDrawSelection } from '../src/lib/fairdraw';
import { sha256 } from '../src/lib/crypto';

const STORE = fs.readFileSync('src/lib/store.ts', 'utf8');

test('the live draw no longer seeds the delivery pool or the engine from the ids alone', () => {
  assert.equal(STORE.includes('seedBase:`${globalState.competition.id}:${participant.id}`'), false,
    'the delivery-Mushaf pool seed must not be computable before the draw');
  assert.equal(/seed:`\$\{globalState\.competition\.id\}:\$\{participant\.id\}`/.test(STORE), false,
    'the allocation engine seed must not be computable before the draw');
  assert.match(STORE, /const drawSecret=newDrawSecret\(\);/);
  assert.match(STORE, /seedBase:drawSeedBase,/);
  assert.match(STORE, /seed:drawSeedBase,/);
  assert.match(STORE, /generateFairDraw\(\{ pool, participant, policy:effPolicy, seed:drawSecret,/,
    'the committed (and later revealed) seed is the same secret that drives the draw');
  assert.match(STORE, /selection\.drawSeedScheme=FAIRDRAW_SEED_SCHEME_V2;/, 'new draws record their scheme');
});

test('legacy draws (no scheme) keep the exact old seed base', () => {
  assert.equal(liveDrawSeedBase({ competitionId: 'c1', participantId: 'p1' }), 'c1:p1');
  assert.equal(liveDrawSeedBase({ competitionId: 'c1', participantId: 'p1', seedReveal: 'ignored' }), 'c1:p1');
});

test('scheme 2 mixes a fresh 256-bit secret and refuses to run without it', () => {
  const a = newDrawSecret(), b = newDrawSecret();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
  const base = liveDrawSeedBase({ competitionId: 'c1', participantId: 'p1', drawSeedScheme: FAIRDRAW_SEED_SCHEME_V2, seedReveal: a });
  assert.equal(base, `c1:p1:${a}`);
  assert.notEqual(base, liveDrawSeedBase({ competitionId: 'c1', participantId: 'p1', drawSeedScheme: FAIRDRAW_SEED_SCHEME_V2, seedReveal: b }));
  assert.throws(() => liveDrawSeedBase({ competitionId: 'c1', participantId: 'p1', drawSeedScheme: FAIRDRAW_SEED_SCHEME_V2 }), /FAIRDRAW_SEED_NOT_REVEALED/);
  assert.throws(() => liveDrawSeedBase({ competitionId: 'c1', participantId: 'p1', drawSeedScheme: 'MIZAN-DRAW-SEED-9' }), /FAIRDRAW_SEED_SCHEME_UNKNOWN/);
});

test('a scheme-2 draw is reproducible after the fact from the revealed seed in its receipt', async () => {
  const policy = getCompetitionPolicy(SEED_COMPETITION);
  const category: Category = {
    id: 'cat-seed', competitionId: SEED_COMPETITION.id, code: 'S', name: 'S', nameArabic: 'فئة', description: '', riwaya: 'حفص عن عاصم',
    memorizationScope: '', juzCount: 30, targetParticipants: 10, targetDurationMinutes: 8, questionsCount: 4,
    scope: fullQuranScope(), scopeMode: 'fixed', scopeVersion: 1, selectionRule: { ...DEFAULT_SELECTION_RULE, version: 1, enabled: false },
  };
  const participant: Participant = { ...SEED_PARTICIPANTS[0], id: 'p-seed', categoryId: category.id, riwaya: 'حفص عن عاصم' };
  const scope = scopeFromJuzRange(1, 30);
  const reading = readingContextOf({ riwaya: participant.riwaya });
  const pool = buildCandidatePool({ scope, category, reading }).map(c => ({
    id: c.id, surahNumber: c.surahNumber, surahNameArabic: 'سورة', surahNameEnglish: 'Surah', startAyah: c.startAyah, endAyah: c.endAyah,
    juzNumber: c.juzNumber || 1, riwaya: participant.riwaya, expectedTextArabic: '', difficultyRating: c.difficultyRating,
    mutashabihatDensity: 'none' as const, tajweedComplexity: 'intermediate' as const, timesUsed: 0,
  }));
  const effPolicy = { ...policy, questions: { ...policy.questions, questionsPerParticipant: 4 } };
  const allocation = planAllocation({ category, policy: effPolicy, effectiveScope: scope, candidates: pool.map(p => poolItemToCandidate(p)) });
  const engineFor = (seed: string) => new QuestionAllocationEngine({ policy: categoryRepeatPolicy(category, policy), seed, defaultTargetDifficulty: policy.questions.targetDifficulty });
  const ctx = (seed: string) => ({ scope, participantScopeVersion: 1, slots: allocation.slots, engine: engineFor(seed), reading, sequencePosition: 0 });

  const draw = async () => {
    const secret = newDrawSecret();
    const base = liveDrawSeedBase({ competitionId: SEED_COMPETITION.id, participantId: participant.id, drawSeedScheme: FAIRDRAW_SEED_SCHEME_V2, seedReveal: secret });
    const selection = await generateFairDraw({ pool, participant, policy: effPolicy, seed: secret, scoped: ctx(base) });
    selection.drawSeedScheme = FAIRDRAW_SEED_SCHEME_V2;
    return selection;
  };
  const selection = await draw();
  // الإيصال يكشف البذرة وبصمتها داخل الالتزام العام.
  assert.equal(selection.seedCommitmentHash, `SHA256:${await sha256(selection.seedReveal!)}`);
  assert.equal((await validateScopedSelection(selection, { slots: allocation.slots })).valid, true);

  // المدقّق يعيد بناء المحرّك من المعرّفين والمخطّط والبذرة المكشوفة، فيصل إلى الاختيار نفسه.
  const rebuilt = liveDrawSeedBase({ competitionId: SEED_COMPETITION.id, participantId: participant.id, drawSeedScheme: selection.drawSeedScheme, seedReveal: selection.seedReveal });
  const verified = await verifyFairDrawSelection({ selection, pool, participant, policy: effPolicy, scoped: ctx(rebuilt) });
  assert.equal(verified.valid, true, JSON.stringify(verified));

  // والمعرّفان وحدهما لم يعودا يكفيان: من يبني المحرّك بالأساس القديم لا يصل إلى الإيصال.
  const legacyGuess = await verifyFairDrawSelection({ selection, pool, participant, policy: effPolicy, scoped: ctx(`${SEED_COMPETITION.id}:${participant.id}`) });
  const differentSecretDraws = new Set<string>();
  for (let i = 0; i < 6; i++) differentSecretDraws.add((await draw()).questions.map(q => q.id).join('|'));
  assert.ok(differentSecretDraws.size > 1 && legacyGuess.selectionMatches === false,
    'the selection now depends on the secret, not only on the ids');
});
