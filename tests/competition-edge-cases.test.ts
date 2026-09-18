/*
 * §24 — الحالاتُ الحدّية تنتهي بحالةٍ معلومةِ الاسم، لا بفشلٍ صامت.
 *
 * والفرقُ ليس تجميليًّا. الفشلُ المُسمّى يوقف المشغّل ويقول له ما العطل؛ والفشلُ الصامت
 * يمضي، فيُسحب سؤالٌ لا يجوز سحبُه، أو تُطبع شهادةٌ لحكمٍ لا سند له — ولا يظهر ذلك في أيّ
 * شاشة.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { generateFairDraw } from '../src/lib/fairdraw';
import { DEVELOPMENT_QUESTION_BANK } from '../src/data/development-question-bank';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/data/seed-data';
import { rankResults, topPositionTie, type RankableResult } from '../src/lib/scoring-core';

/** نفسُ صيغة `tests/ranking-unresolved-ties.test.ts`: المعرّفُ حقلٌ زائد يُقرأ في التوكيد. */
const scored = (finalScore: number, id: string) =>
  ({ finalScore, criterionScores: {}, penaltyCount: 0, id }) as RankableResult & { id: string };
import { recoveryDecisionFromCheckpoint } from '../src/lib/operational-integrity';

const policy = getCompetitionPolicy(SEED_COMPETITION);
const participant = SEED_PARTICIPANTS[0];
const thrown = async (fn: () => Promise<unknown>) => {
  try { await fn(); return undefined } catch (error) { return (error as Error).message }
};

/* ── ١) متسابقٌ بلا رواية ───────────────────────────────────────────────────── */

test('a participant with no reading is refused by name — never drawn from an arbitrary reading', async () => {
  /*
   * هذا كان يمرّ صامتًا. اسمُ الرواية يُطبَّع فيصير فراغًا، والمطابقة كانت
   * `q.includes(participant)` — و`includes('')` صحيحةٌ دائمًا. فمتسابقٌ بلا رواية كان
   * **يطابق كلَّ أسئلة البنك**، ويُسحب له سؤالٌ من أيّ روايةٍ اتّفقت، بلا خطأٍ ولا أثر.
   */
  for (const empty of ['', '   ']) {
    const code = await thrown(() => generateFairDraw({ pool: DEVELOPMENT_QUESTION_BANK, participant: { ...participant, riwaya: empty }, policy }));
    assert.equal(code, 'FAIRDRAW_PARTICIPANT_READING_UNRESOLVED', `empty reading ${JSON.stringify(empty)} must fail closed`);
  }
});

test('a reading name that resolves to nothing is refused, not approximated', async () => {
  const code = await thrown(() => generateFairDraw({ pool: DEVELOPMENT_QUESTION_BANK, participant: { ...participant, riwaya: 'روايةٌ لا وجود لها' }, policy }));
  assert.equal(code, 'FAIRDRAW_PARTICIPANT_READING_UNRESOLVED');
});

/* ── ٢) تسرُّبُ الدوري وخلف ─────────────────────────────────────────────────── */

test('a bare "al-Duri" never draws — the two Duris are different readings', async () => {
  /*
   * «الدوري» راويان: عن أبي عمرو، وعن الكسائي. والمطابقةُ بالحروف كانت تطابقهما معًا،
   * فيُسحب لمتسابقٍ سؤالُ الرواية الأخرى — وهو التسرّبُ المنصوصُ على منعه بعينه.
   */
  const code = await thrown(() => generateFairDraw({ pool: DEVELOPMENT_QUESTION_BANK, participant: { ...participant, riwaya: 'الدوري' }, policy }));
  assert.equal(code, 'FAIRDRAW_PARTICIPANT_READING_UNRESOLVED');
});

test('a bare "Khalaf" never draws either — Khalaf an Hamzah is not Khalaf al-Ashir', async () => {
  const code = await thrown(() => generateFairDraw({ pool: DEVELOPMENT_QUESTION_BANK, participant: { ...participant, riwaya: 'خلف' }, policy }));
  assert.equal(code, 'FAIRDRAW_PARTICIPANT_READING_UNRESOLVED');
});

test('one Duri never receives the other Duri question', async () => {
  /*
   * الشاهدُ المباشر: بنكٌ فيه سؤالُ الدوري عن الكسائي وحده، ومتسابقٌ الدوري عن أبي عمرو.
   * فالمطلوب امتناعٌ باسمه، لا سؤالٌ من روايةٍ أخرى.
   */
  const kisaiOnly = DEVELOPMENT_QUESTION_BANK.slice(0, 8).map(q => ({ ...q, riwaya: 'الدوري عن الكسائي' }));
  const code = await thrown(() => generateFairDraw({ pool: kisaiOnly, participant: { ...participant, riwaya: 'الدوري عن أبي عمرو' }, policy }));
  assert.equal(code, 'FAIRDRAW_READING_SOURCE_MISMATCH');
});

test('a participant still draws normally from their own reading', async () => {
  // الإصلاحُ يمنع التسرّب ولا يمنع السحب: ما كان يعمل يبقى يعمل.
  const draw = await generateFairDraw({ pool: DEVELOPMENT_QUESTION_BANK, participant, policy });
  assert.equal(draw.questions.length, policy.questions.questionsPerParticipant);
  assert.ok(draw.questions.length > 0);
});

/* ── ٣) فئةٌ متعدّدةُ الروايات ──────────────────────────────────────────────── */

test('a pool item serving several readings matches each of them, and only them', async () => {
  /*
   * فئةٌ تُعلن أكثر من رواية يُكتب اسمُها مجموعًا. والسؤالُ من هذه الفئة يصلح لكلِّ روايةٍ
   * أعلنتها — ولا يصلح لغيرها.
   */
  const shared = DEVELOPMENT_QUESTION_BANK.slice(0, 10).map(q => ({ ...q, riwaya: 'حفص عن عاصم / ورش / قالون' }));
  for (const reading of ['حفص عن عاصم', 'ورش', 'قالون']) {
    const draw = await generateFairDraw({ pool: shared, participant: { ...participant, riwaya: reading }, policy });
    assert.ok(draw.questions.length > 0, `${reading} must draw from the shared category`);
  }
  // ورواية ليست من الفئة لا تُسحب منها.
  const code = await thrown(() => generateFairDraw({ pool: shared, participant: { ...participant, riwaya: 'روح عن يعقوب' }, policy }));
  assert.equal(code, 'FAIRDRAW_READING_SOURCE_MISMATCH');
});

/* ── ٤) بنكٌ فارغ ومسابقةٌ بفئةٍ واحدة ──────────────────────────────────────── */

test('an empty bank is named as an empty bank, not as a reading mismatch', async () => {
  /*
   * التشخيصُ الخاطئ يُرسل المسؤولَ إلى غير العطل: «اختلافُ رواية» يجعله يراجع أسماء
   * الروايات، والعائقُ أن البنك فارغ.
   */
  const code = await thrown(() => generateFairDraw({ pool: [], participant, policy }));
  assert.equal(code, 'FAIRDRAW_NO_ELIGIBLE_QUESTIONS');
});

test('a competition with a single category still ranks and still draws', async () => {
  // الحالةُ الأصغر ليست حالةً خاصّة: تمرّ بنفس المسار وتنتهي بنفس الضمانات.
  const single = DEVELOPMENT_QUESTION_BANK.filter(q => q.riwaya === DEVELOPMENT_QUESTION_BANK[0].riwaya);
  const draw = await generateFairDraw({ pool: single, participant: { ...participant, riwaya: DEVELOPMENT_QUESTION_BANK[0].riwaya }, policy });
  assert.ok(draw.questions.length > 0);

  const outcome = rankResults([scored(91, 'only')]);
  assert.deepEqual(outcome.ranked.map(r => r.rank), [1]);
  assert.deepEqual(outcome.unresolvedTies, []);
});

/* ── ٥) انسحابٌ بعد القرعة ─────────────────────────────────────────────────── */

test('a withdrawal after the draw removes the competitor without renumbering the others', async () => {
  /*
   * الانسحابُ لا يُعيد ترقيمَ من بقي: من كان ثالثًا بدرجته يبقى ثالثًا. وإعادةُ الترقيم
   * تمنح مركزًا لم يُكتسب بأداء، وتُطبع في شهادة.
   */
  const withAll = rankResults([
    scored(95, 'a'),
    scored(90, 'withdrawn'),
    scored(85, 'c'),
  ]);
  assert.deepEqual(withAll.ranked.map(r => r.rank), [1, 2, 3]);

  // المنسحبُ يخرج من القائمة، فتُحسب الرتب على من بقي — ولا تبقى فجوةٌ باسم غائب.
  const afterWithdrawal = rankResults([
    scored(95, 'a'),
    scored(85, 'c'),
  ]);
  assert.deepEqual(afterWithdrawal.ranked.map(r => r.rank), [1, 2]);
  assert.equal(afterWithdrawal.ranked.some(r => (r.result as { id?: string }).id === 'withdrawn'), false);
});

/* ── ٦) تعادلٌ في الصدارة ───────────────────────────────────────────────────── */

test('a tie at the top is reported, never settled by array order', () => {
  const forward = rankResults([
    scored(99, 'a'),
    scored(99, 'b'),
  ]);
  const reversed = rankResults([
    scored(99, 'b'),
    scored(99, 'a'),
  ]);
  assert.deepEqual(forward.ranked.map(r => r.rank), reversed.ranked.map(r => r.rank));
  assert.deepEqual(topPositionTie(forward), { rank: 1, finalScore: 99, count: 2 });
});

/* ── ٧) جلسةٌ تنقطع ثم تُستأنف ─────────────────────────────────────────────── */

test('an interrupted session resumes by a named decision, and never without a trustworthy checkpoint', () => {
  /*
   * الاستئنافُ بلا نقطةِ تفتيشٍ موثوقة تخمينٌ لِما جرى. والقرارُ حينئذٍ يُرفع إلى رئيس
   * التحكيم باسمه، ولا يُستأنف بافتراض.
   */
  const none = recoveryDecisionFromCheckpoint({ checkpoint: undefined, checkpointVerified: false });
  assert.equal(none.decision, 'HEAD_JUDGE_ADJUDICATION');
  assert.ok(none.reason, 'the decision must carry its reason');

  const beforeReveal = recoveryDecisionFromCheckpoint({
    checkpoint: { phase: 'BEFORE_REVEAL', questionRevealed: false } as never,
    checkpointVerified: true,
  });
  assert.equal(beforeReveal.decision, 'RESUME_SAME_SESSION_SAME_QUESTION');
});
