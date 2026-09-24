/*
 * الحكمُ أثناء التلاوة — والخطرُ فيه أن يُخطَّأ مصيبٌ لأنّه لم يبلغ بعد.
 *
 * فمقابلةُ ما سُمع بنصّ الوجه كاملًا وهو في منتصفه تقول «أسقطتَ كلَّ ما بقي». وهذا
 * الملفُّ يقيس أنّ ذلك لا يقع: ما بعد جبهة القراءة لا يُقال فيه شيء حتى تنتهي التلاوة.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTLE_MARGIN_WORDS, answerKeepsPermission, finalJudgment, followFrontier, liveJudgment } from '../src/lib/live-judging';
import type { ExpectedWord, HeardWord } from '../src/lib/recitation-diff';

const OPEN = { word: 'OPEN', tashkeel: 'CLOSED' } as const;
const SHUT = { word: 'CLOSED', tashkeel: 'CLOSED' } as const;

/* وجهٌ من اثنتي عشرة كلمةً بهجاءٍ بسيط — فالمقصودُ هنا الزمنُ لا الرسم. */
const FACE = ['واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحدعشر', 'اثناعشر'];
const expected: ExpectedWord[] = FACE.map((text, index) => ({ index, text }));
const heardOf = (words: string[]): HeardWord[] => words.map(text => ({ text, confidence: 0.95 }));

test('a reader in the middle of the face is never told he skipped the rest', () => {
  const live = liveJudgment(expected, heardOf(FACE.slice(0, 5)), OPEN);
  assert.deepEqual(live.settled, [], 'nothing beyond the frontier may be judged');
  assert.equal(live.frontier, 4, 'and the frontier is the last word proven read');
  /*
   * ولا يراه **الحكمُ نفسُه** ساقطًا أيضًا — وهذا أقوى ممّا كان.
   *
   * فأوّلُ صياغةٍ كانت تُخرج الذيلَ كلَّه أخطاءً ثمّ تحجبه بالجبهة. وكان ذلك يعمل
   * حتى قِيس في متصفّح: بكلمتين مسموعتين تتساوى كلُّ مواضع المحاذاة في الكلفة،
   * فتُطابقان كلمتين متأخّرتين تشبهانهما، فتقفز الجبهةُ وتصير الكلماتُ المقروءةُ
   * ساقطة — **فنُبِّه على كلمةٍ قرأها الطالبُ صحيحة**.
   *
   * فصار الذيلُ لا يُحاسب أثناء القراءة أصلًا: تُقابَل المسموعاتُ بأطول بدايةٍ
   * تُفسّرها. والحجبُ بالجبهة يبقى حارسًا ثانيًا فوق ذلك.
   */
  assert.deepEqual(live.judgment!.mistakes, [], 'الذيلُ الذي لم يُقرأ بعدُ دخل الحكم');
});

test('a short opening is matched to the start of the face, not to look-alikes further down', () => {
  /*
   * وهذا هو العيبُ بعينه، مصوغًا اختبارًا: وجهٌ تتكرّر فيه كلمتان. فبكلمتين
   * مسموعتين تتساوى المحاذاتان في الكلفة، والصوابُ أن تُختار البداية.
   */
  const repeated = ['ألف', 'باء', 'جيم', 'دال', 'ألف', 'باء', 'هاء', 'واو'];
  const page: ExpectedWord[] = repeated.map((text, index) => ({ index, text }));
  const live = liveJudgment(page, heardOf(['ألف', 'باء']), OPEN);
  assert.equal(live.frontier, 1, `الجبهةُ قفزت إلى ${live.frontier}`);
  assert.deepEqual(live.judgment!.mistakes, [], 'عُدّت كلماتٌ قُرئت ساقطة');
  assert.deepEqual(live.settled, []);
});

test('a word truly skipped is judged once the reader has passed it', () => {
  /* أسقط «أربعة» ومضى. */
  const heard = heardOf([...FACE.slice(0, 3), ...FACE.slice(4, 10)]);
  const live = liveJudgment(expected, heard, OPEN);
  assert.equal(live.frontier, 9);
  assert.deepEqual(live.settled.map(m => m.wordIndex), [3]);
  assert.equal(live.settled[0].kind, 'skipped');
});

test('a mistake right at the frontier waits for the safety margin', () => {
  /*
   * فآخرُ ما وصل من المحرّك قد يكون ناقصَ الذيل، وكلمةٌ تبدو ساقطةً عند الجبهة قد
   * تكون في الطريق. والتأخّرُ لحظةً أهونُ من أن يُقال لحافظٍ «أسقطتَ» وقد قالها.
   */
  const almost = liveJudgment(expected, heardOf([...FACE.slice(0, 5), ...FACE.slice(6, 8)]), OPEN);
  assert.equal(almost.frontier, 7);
  assert.deepEqual(almost.settled.map(m => m.wordIndex), [], `margin ${SETTLE_MARGIN_WORDS} must hold the word at 5`);
  const later = liveJudgment(expected, heardOf([...FACE.slice(0, 5), ...FACE.slice(6, 10)]), OPEN);
  assert.equal(later.frontier, 9);
  assert.deepEqual(later.settled.map(m => m.wordIndex), [5], 'and release it once he has read on');
});

test('the very end of the face is only judged when the recitation ends', () => {
  /* قرأ الوجهَ كلَّه إلا آخرَ كلمتين. */
  const heard = heardOf(FACE.slice(0, 10));
  assert.deepEqual(liveJudgment(expected, heard, OPEN).settled, [], 'nothing is said while he may still read on');
  const final = finalJudgment(expected, heard, OPEN)!;
  assert.deepEqual(final.mistakes.map(m => m.wordIndex), [10, 11], 'and at the end the unread tail is a real miss');
});

test('no permission, no judgment — and no frontier either', () => {
  const live = liveJudgment(expected, heardOf(FACE.slice(0, 5)), SHUT);
  assert.equal(live.judgment, null);
  assert.deepEqual(live.settled, []);
  assert.equal(live.frontier, -1);
  assert.equal(finalJudgment(expected, heardOf(FACE), SHUT), null);
});

test('silence is not a face full of mistakes', () => {
  assert.equal(liveJudgment(expected, [], OPEN).judgment, null);
  assert.equal(finalJudgment(expected, heardOf(['', ' ']), OPEN), null);
});

test('a flawless reading settles nothing, because there is nothing to settle', () => {
  const live = liveJudgment(expected, heardOf(FACE), OPEN);
  assert.deepEqual(live.settled, []);
  assert.equal(live.frontier, 11);
  assert.deepEqual(live.judgment!.mistakes, []);
});

test('the frontier is derived from the judgment, never counted separately', () => {
  /* وعدّادٌ ثانٍ يصف الشيءَ نفسَه يفارقه — فتُقاس الجبهةُ على حالاتٍ تُربكه. */
  const substituted = liveJudgment(expected, heardOf([...FACE.slice(0, 4), 'مئة', ...FACE.slice(5, 10)]), OPEN);
  assert.equal(substituted.frontier, 9);
  assert.deepEqual(substituted.settled.map(m => m.kind), ['substituted']);
  assert.deepEqual(substituted.settled.map(m => m.wordIndex), [4]);
});

test('لا يُحكم بجوابٍ جاء ببوّابةٍ غيرِ التي بدأت بها المحاولة', () => {
  /*
   * فالخادمُ يعيد قراءةَ تقرير القياس مع كلّ مقطع. فإن استُبدل في أثناء التلاوة جمعت
   * المحاولةُ الواحدةُ كلماتٍ من محرّكين، أو حُوسبت بإذنِ حركةٍ لم يعد قائمًا.
   */
  const permission = { reading: 'hafs', word: 'OPEN', tashkeel: 'CLOSED', modelVersion: 'm@1', reasons: [] };
  const answer = (gate: Partial<typeof permission>, modelVersion = 'm@1') => ({ gate: { ...permission, ...gate }, modelVersion });
  assert.equal(answerKeepsPermission(permission, answer({})), true, 'الجوابُ ذاتُه رُفض');
  assert.equal(answerKeepsPermission(permission, answer({ modelVersion: 'm@2' }, 'm@2')), false, 'نموذجٌ آخر قُبل');
  assert.equal(answerKeepsPermission(permission, answer({}, 'm@2')), false, 'نموذجُ الجواب يخالف بوّابته وقُبل');
  assert.equal(answerKeepsPermission(permission, answer({ tashkeel: 'OPEN' })), false, 'بابُ الحركة فُتح في الأثناء وقُبل');
  assert.equal(answerKeepsPermission(permission, answer({ word: 'CLOSED' })), false, 'بابُ الكلمة أُغلق في الأثناء وقُبل');
  assert.equal(answerKeepsPermission(permission, answer({ reading: 'warsh' })), false, 'روايةٌ أخرى قُبلت');
  assert.equal(answerKeepsPermission({ ...permission, modelVersion: null }, answer({ modelVersion: null })), false,
    'إذنٌ بلا نموذجٍ مقيس قُبل');
  /* وجوابٌ بلا بوّابةٍ خالف العقد: يُرفض ولا يُسقط الشاشةَ بخطأ قراءة. */
  assert.equal(answerKeepsPermission(permission, { modelVersion: 'm@1' } as never), false, 'جوابٌ بلا بوّابةٍ قُبل');
});

test('التتبّعُ بلا حكم يتبع الكلمات المسموعة — والحكمُ مغلق', () => {
  /* الحكمُ المغلق لا يعطي موضعًا؛ والتتبّعُ يعطيه من الكلمات وحدها: رقمُ آخر كلمةٍ قيلت (فتنكشف هي أيضًا). */
  assert.equal(liveJudgment(expected, heardOf(FACE.slice(0, 5)), SHUT).frontier, -1);
  assert.equal(followFrontier(expected, heardOf(FACE.slice(0, 5))), 4);
  /* لا كلمةَ مسموعة: لا موضع — فلا يُكشف شيءٌ بالوقت. */
  assert.equal(followFrontier(expected, []), -1);
  /* وكلمةٌ سقطت في الوسط لا توقف التتبّع: الموضعُ يمضي إلى ما قيل بعدها. */
  assert.equal(followFrontier(expected, heardOf([...FACE.slice(0, 3), ...FACE.slice(4, 7)])), 6);
});

test('ما سُمع عند الحافّة يُكشف إن طابق الكلمةَ التالية تمامًا — ويقف عند أوّل ما لا يطابق', async () => {
  const { provisionalReach } = await import('../src/lib/live-judging');
  assert.equal(provisionalReach(expected, 4, [FACE[5], FACE[6]]), 6);
  // كلمةٌ لا تطابق التاليةَ توقفه، ولو طابقت ما بعدها: لا قفز.
  assert.equal(provisionalReach(expected, 4, [FACE[7], FACE[5]]), 4);
  assert.equal(provisionalReach(expected, 4, [FACE[5], 'غير', FACE[7]]), 5);
  // لا شيء عند الحافّة: الجبهةُ كما هي. وآخرُ الوجه لا يُتجاوز.
  assert.equal(provisionalReach(expected, 4, []), 4);
  assert.equal(provisionalReach(expected, expected.length - 1, [FACE[0]]), expected.length - 1);
});
