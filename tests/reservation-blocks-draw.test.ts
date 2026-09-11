import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { QuestionAllocationEngine, locusKeyOf } from '../src/lib/question-engine';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { scopeFromJuz } from '../src/lib/quran-scope';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { freeDistributionPlan, resolveZoneSlots } from '../src/lib/question-zones';
import { blockedLocusKeys, reserveQuestions } from '../src/lib/question-reservation';
import type { QuestionReservationRecord } from '../src/types';

/*
 * الحجز يَعِد بشيءٍ واحد: «هل يجوز أن يُسحب هذا الموضع لمتسابق آخر؟ — لا، ما دام الحجز
 * قائمًا». ووعدٌ لا يفرضه المحرك ليس وعدًا بل تعليقٌ في ملف.
 *
 * ودفتر الاستعمال لا يكفي: هو يباعد بحسب **عدد** الاستعمالات، والحجز يمنع بحسب **قيامه
 * الآن**. جلستان تبدآن في قاعتين في اللحظة نفسها لهما دفترٌ واحد لم يُكتب فيه شيءٌ بعد.
 */

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const scope = scopeFromJuz([30]);
const candidates = projectCandidatesFromScope(scope, { passageAyahCount: 3, reading });
const slots = resolveZoneSlots({ plan: freeDistributionPlan(), effectiveScope: scope, questionCount: 3 }).slots;
let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;

const draw = (engine: QuestionAllocationEngine, participantId: string, excludedLocusKeys?: string[]) =>
  engine.selectForParticipant({
    participantId, sequencePosition: 0, effectiveScope: scope, slots, reading,
    targetDifficulty: 3, difficultyTolerance: 1, excludedLocusKeys,
  }, candidates);

test('a locus held by an open session is refused to the next draw', () => {
  /*
   * بنكٌ ضيّق عمدًا: أربعةُ مواضع لثلاثة أسئلة. فلو لم يُمنع المحجوز لاصطدم الاثنان حتمًا،
   * وبمنعه يبقى للثاني موضعٌ واحد فقط يصلح — فيظهر المنع ولا يُخفيه اتساعُ البنك.
   */
  const narrow = candidates.slice(0, 4);
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'hold', defaultTargetDifficulty: 3 });
  const first = engine.selectForParticipant({
    participantId: 'p1', sequencePosition: 0, effectiveScope: scope, slots, reading,
    targetDifficulty: 3, difficultyTolerance: 1,
  }, narrow);
  assert.equal(first.questions.length, 3);
  const held = first.questions.map(q => locusKeyOf(q.candidate));

  /* بلا حجزٍ يُفرض: محرّك ثانٍ بدفترٍ فارغ — كحال قاعتين تبدآن في اللحظة نفسها. */
  const blind = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'hold', defaultTargetDifficulty: 3 })
    .selectForParticipant({ participantId: 'p2', sequencePosition: 0, effectiveScope: scope, slots, reading, targetDifficulty: 3, difficultyTolerance: 1 }, narrow);
  assert.ok(blind.questions.some(q => held.includes(locusKeyOf(q.candidate))),
    'with four loci for three questions the two halls must collide — this is the hole the hold closes');

  const guarded = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'hold', defaultTargetDifficulty: 3 })
    .selectForParticipant({
      participantId: 'p2', sequencePosition: 0, effectiveScope: scope, slots, reading,
      targetDifficulty: 3, difficultyTolerance: 1, excludedLocusKeys: held,
    }, narrow);
  for (const question of guarded.questions) {
    assert.equal(held.includes(locusKeyOf(question.candidate)), false,
      `locus ${locusKeyOf(question.candidate)} is held by another open session and must not be drawn`);
  }
  /* والنقص يُعلَن لا يُبتلع: ثلاث خانات وموضعٌ واحد متاح. */
  assert.ok(guarded.failures.length > 0, 'what the hold makes impossible is declared, not silently shortened');
});

test('the exclusion is by locus, not by candidate id — the same locus at another passage length is still held', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'locus', defaultTargetDifficulty: 3 });
  const longer = projectCandidatesFromScope(scope, { passageAyahCount: 5, reading });
  const target = candidates[10];
  const key = locusKeyOf(target);
  const twin = longer.find(c => locusKeyOf(c) === key)!;
  assert.notEqual(twin.id, target.id, 'the same locus carries a different id at another passage length');

  const result = engine.selectForParticipant({
    participantId: 'p3', sequencePosition: 0, effectiveScope: scope, slots, reading,
    targetDifficulty: 3, difficultyTolerance: 1, excludedLocusKeys: [key],
  }, [...candidates, ...longer]);
  for (const question of result.questions) {
    assert.notEqual(locusKeyOf(question.candidate), key, 'an id-only exclusion would have let the twin through');
  }
});

test('a hold released by expiry stops blocking, so nothing is held hostage by a no-show', () => {
  const now = '2026-05-01T08:00:00.000Z';
  const later = new Date(new Date(now).getTime() + 1000_000).toISOString();
  let records: QuestionReservationRecord[] = [];
  records = reserveQuestions({
    records, organizationId: 'org', competitionId: 'comp',
    items: [{ locusKey: '78:1', questionId: 'q1' }],
    participantId: 'p1', idempotencyKey: 'k1', actorId: 'a', ttlSeconds: 60, now, newId,
  }).records;
  assert.equal(blockedLocusKeys(records, now, 'p2').has('78:1'), true, 'a live hold blocks');
  assert.equal(blockedLocusKeys(records, later, 'p2').has('78:1'), false, 'a lapsed hold does not');
});

test('a participant is never blocked from the loci of their own open session', () => {
  const now = '2026-05-01T08:00:00.000Z';
  const records = reserveQuestions({
    records: [], organizationId: 'org', competitionId: 'comp',
    items: [{ locusKey: '78:1', questionId: 'q1' }],
    participantId: 'p1', idempotencyKey: 'k1', actorId: 'a', now, newId,
  }).records;
  assert.equal(blockedLocusKeys(records, now, 'p1').size, 0);
  assert.equal(blockedLocusKeys(records, now, 'p2').size, 1);
});

test('the live draw path actually consults the holds — not only the store API', () => {
  const source = fs.readFileSync('src/lib/store.ts', 'utf8');
  const start = source.indexOf('const scopeResolution=participantEffectiveScope(participantId);');
  const end = source.indexOf('const sessionId=newId(\'sess\');', start);
  const drawPath = source.slice(start, end);
  assert.ok(start > 0 && end > start, 'the draw path could not be located');
  assert.match(drawPath, /reservationBlockedLoci\(|blockedLocusKeys\(/, 'the draw must ask what is currently held before it draws');
  assert.match(drawPath, /sweepExpiredReservations\(|expireReservations\(/, 'lapsed holds must be released before they are read as blocking');
});

/*
 * ووحدةٌ لا يستدعيها أحد ليست ميزةً بل تعليقٌ طويل. هذه الفحوص تحرس الوصول نفسه.
 */

test('the exposure model is shown to the organiser, not only consumed by the engine', () => {
  const studio = fs.readFileSync('src/components/scope/ModelFairnessStudio.tsx', 'utf8');
  assert.match(studio, /topExposedLoci\(/, 'the most-exposed loci must reach a screen');
  assert.match(studio, /exposureProfiles\(\)/, 'the profiles are read from the store, not recomputed in the view');
  assert.match(studio, /أعلى المواضع انكشافًا/, 'named plainly in Arabic');
  assert.match(studio, /لا يُدَّعى هنا معرفةُ من حفظه ممن سمعه/, 'the screen states the limit of the claim');
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  assert.match(store, /exposureProfiles,/, 'the store must export it');
});

test('there is exactly one path that applies a legacy scope migration', () => {
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  assert.doesNotMatch(store, /const applyCategoryScopeMigration/, 'a second, screenless path to the same job was removed');
  assert.match(store, /categoryScopeMigrationPlan/, 'the plan is still offered — it is the applying that had two paths');
  const workspace = fs.readFileSync('src/components/admin/QuestionEngineWorkspace.tsx', 'utf8');
  assert.match(workspace, /setDraft\(migration\.outcome\.suggestion!\)/, 'the suggestion loads into the draft for review');
  assert.match(workspace, /store\.setCategoryScope\(/, 'and is applied through the one versioned path');
});

test('every scope-engine action the store exports is reachable, internally or from a screen', () => {
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  const components = fs.readdirSync('src/components', { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.tsx'))
    .map(f => fs.readFileSync(`src/components/${f}`, 'utf8'))
    .join('\n');
  /* المُستدعى داخليًا مقبول: مسار السحب يستدعيه. غير المُستدعى أصلًا ليس ميزة. */
  const actions = [
    'setCategoryScope', 'saveParticipantScope', 'decideParticipantScope', 'participantScopeHistory',
    'generateQuestionModelBatch', 'decideModelBatch', 'preGeneratedModelFor', 'claimReserveForParticipant',
    'exposureProfiles', 'quarantineQuestionLoci', 'recoverQuarantinedLoci', 'reserveQuestionsForParticipant',
    'advanceReservations', 'sweepExpiredReservations', 'reservationBlockedLoci', 'buildCompetitionFairnessReport',
  ];
  const orphans = actions.filter(name => {
    const inStore = (store.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    const inUi = components.includes(name);
    // التعريف + التصدير = ٢. فأكثر من ٢ يعني استدعاءً داخليًا حقيقيًا.
    return inStore <= 2 && !inUi;
  });
  assert.deepEqual(orphans, [], `these are exported but nothing calls them: ${orphans.join(', ')}`);
});
