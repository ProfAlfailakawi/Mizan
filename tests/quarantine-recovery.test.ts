import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModelBatch, recoverFromQuarantine, type BatchParticipant } from '../src/lib/model-batch';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { fullQuranScope, scopeContainsRange, scopeFromJuz } from '../src/lib/quran-scope';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { freeDistributionPlan } from '../src/lib/question-zones';

/*
 * الحجر وحده يترك المتأثرين بلا نماذج. والاسترداد يكمل الطريق — ولا يدّعي أنه عالج الجميع
 * إن لم يعالجهم: «عولج الأثر» ليست «عولج الجميع».
 */

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const candidates = projectCandidatesFromScope(fullQuranScope(), { passageAyahCount: 3, reading });
let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;

const people = (count: number, juz: number[], prefix = 'p'): BatchParticipant[] =>
  Array.from({ length: count }, (_, i) => ({ participantId: `${prefix}${i}`, scope: scopeFromJuz(juz), scopeVersion: 1, questionCount: 3, reading }));

const batch = (participants: BatchParticipant[], reserveCount = 0, pool = candidates) => generateModelBatch({
  batchId: 'b1', organizationId: 'org-1', competitionId: 'comp-1', categoryId: 'cat-1',
  categoryScopeVersion: 1, policyVersion: 'v1', poolVersion: 'p1',
  participants, candidates: pool, distribution: freeDistributionPlan(), repeatPolicy: DEFAULT_REPEAT_POLICY,
  targetDifficulty: 3, difficultyTolerance: 1, seed: 'recovery-seed', generationMode: 'pre_generated',
  reserveCount, newId,
});

const recover = (models: ReturnType<typeof batch>['models'], participants: BatchParticipant[], locusKeys: string[], pool = candidates) =>
  recoverFromQuarantine({
    locusKeys, reason: 'خطأ في الضبط', models, candidates: pool, participants,
    distribution: freeDistributionPlan(), repeatPolicy: DEFAULT_REPEAT_POLICY,
    targetDifficulty: 3, difficultyTolerance: 1, seed: 'recovery-seed',
    organizationId: 'org-1', competitionId: 'comp-1', categoryId: 'cat-1', categoryScopeVersion: 1,
    policyVersion: 'v1', poolVersion: 'p1', requiredDraws: participants.length * 3, newId,
  });

test('an affected participant holding a quarantined locus comes out with a valid model again', () => {
  const participants = people(6, [1]);
  const built = batch(participants);
  const victim = built.models[0];
  const locusKey = `${victim.questions[0].surahNumber}:${victim.questions[0].startAyah}`;

  const outcome = recover([...built.models, ...built.reserves], participants, [locusKey]);
  assert.ok(outcome.quarantine.invalidatedModels.length >= 1);
  assert.equal(outcome.unrecovered.length, 0, outcome.unrecovered.map(u => u.ar).join(' | '));
  assert.equal(outcome.recovered.length, outcome.quarantine.affectedParticipantIds.length);

  for (const row of outcome.recovered) {
    const model = outcome.models.find(m => m.id === row.modelId)!;
    assert.equal(model.status, 'sealed');
    assert.equal(model.participantId, row.participantId);
    assert.equal(model.questions.some(q => `${q.surahNumber}:${q.startAyah}` === locusKey), false,
      'a recovered model must never carry the quarantined locus');
    const scope = participants.find(p => p.participantId === row.participantId)!.scope;
    for (const q of model.questions) {
      assert.ok(scopeContainsRange(scope, { surah: q.surahNumber, ayah: q.startAyah }, { surah: q.surahNumber, ayah: q.endAyah }));
    }
  }
});

test('a ready reserve is used before a fresh draw, and the reserve count drops by what was claimed', () => {
  const participants = people(4, [1]);
  const built = batch(participants, 3);
  const locusKey = `${built.models[0].questions[0].surahNumber}:${built.models[0].questions[0].startAyah}`;
  const before = built.reserves.length;

  const outcome = recover([...built.models, ...built.reserves], participants, [locusKey]);
  const viaReserve = outcome.recovered.filter(r => r.via === 'reserve').length;
  assert.ok(viaReserve > 0, 'an available matching reserve must be preferred over a fresh draw');
  assert.equal(outcome.reservesRemaining, before - viaReserve);
  assert.match(outcome.summaryArabic, /استُرد/);
});

test('a reserve carrying the quarantined locus is not handed out — it is defective too', () => {
  const participants = people(3, [30]);
  const local = projectCandidatesFromScope(scopeFromJuz([30]), { passageAyahCount: 3, reading });
  const built = batch(participants, 2, local);
  /* نحجر كل موضعٍ يحمله أيُّ احتياطي، فلا يبقى احتياطي سليم. */
  const reserveLoci = [...new Set(built.reserves.flatMap(r => r.questions.map(q => `${q.surahNumber}:${q.startAyah}`)))];
  const victimLocus = `${built.models[0].questions[0].surahNumber}:${built.models[0].questions[0].startAyah}`;
  const keys = [...new Set([victimLocus, ...reserveLoci])];

  const outcome = recover([...built.models, ...built.reserves], participants, keys, local);
  for (const row of outcome.recovered) {
    const model = outcome.models.find(m => m.id === row.modelId)!;
    for (const q of model.questions) {
      assert.equal(keys.includes(`${q.surahNumber}:${q.startAyah}`), false, 'no recovered model may carry a quarantined locus');
    }
  }
});

test('when nothing eligible remains, the participant is named with a reason instead of silently left', () => {
  const scope = scopeFromJuz([30]);
  const local = projectCandidatesFromScope(scope, { passageAyahCount: 3, reading });
  const participants = people(2, [30]);
  const built = batch(participants, 0, local);
  const everyLocus = [...new Set(local.map(c => `${c.surahNumber}:${c.startAyah}`))];

  const outcome = recover(built.models, participants, everyLocus, local);
  assert.equal(outcome.quarantine.canContinue, false);
  assert.equal(outcome.recovered.length, 0);
  assert.ok(outcome.unrecovered.length > 0, 'nobody may be silently dropped');
  for (const row of outcome.unrecovered) {
    assert.ok(row.ar.length > 10, 'the reason is a sentence a human reads, not a code alone');
    assert.ok(row.code.length > 0);
  }
  assert.match(outcome.summaryArabic, /يحتاج قرارًا/);
});

test('a participant whose approved range is no longer known is reported, not guessed at', () => {
  const participants = people(3, [1]);
  const built = batch(participants);
  const locusKey = `${built.models[0].questions[0].surahNumber}:${built.models[0].questions[0].startAyah}`;
  /* نحذف نطاق المتأثر من المدخلات: المحرك لا يخترع له نطاقًا. */
  const affected = built.models.filter(m => m.questions.some(q => `${q.surahNumber}:${q.startAyah}` === locusKey)).map(m => m.participantId);
  const withoutScopes = participants.filter(p => !affected.includes(p.participantId));

  const outcome = recover(built.models, withoutScopes, [locusKey]);
  assert.ok(outcome.unrecovered.some(u => u.code === 'PARTICIPANT_SCOPE_UNKNOWN'));
  assert.equal(outcome.recovered.length, 0);
});

test('recovery never reuses a locus already held by an untouched participant', () => {
  const participants = people(8, [1]);
  const built = batch(participants);
  const locusKey = `${built.models[0].questions[0].surahNumber}:${built.models[0].questions[0].startAyah}`;
  const outcome = recover(built.models, participants, [locusKey]);

  const survivors = outcome.models.filter(m => m.status === 'sealed' && !!m.participantId);
  const owner = new Map<string, string>();
  let collisions = 0;
  for (const model of survivors) {
    for (const q of model.questions) {
      const key = `${q.surahNumber}:${q.startAyah}`;
      const held = owner.get(key);
      if (held && held !== model.participantId) collisions++;
      owner.set(key, model.participantId);
    }
  }
  assert.equal(collisions, 0, 'a recovered model must not take a locus another participant already holds');
});

test('the recovery summary tells both halves of the truth: what was healed and what still needs a decision', () => {
  const participants = people(5, [1]);
  const built = batch(participants, 1);
  const locusKey = `${built.models[0].questions[0].surahNumber}:${built.models[0].questions[0].startAyah}`;
  const outcome = recover([...built.models, ...built.reserves], participants, [locusKey]);
  assert.match(outcome.summaryArabic, /حُجر/);
  assert.match(outcome.summaryArabic, /استُرد/);
  assert.match(outcome.summaryEnglish, /recovered/);
  assert.ok(outcome.summaryArabic.includes('بلا متبقٍّ') || outcome.summaryArabic.includes('يحتاج قرارًا'));
});
