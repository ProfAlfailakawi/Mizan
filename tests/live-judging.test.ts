/*
 * الحكمُ أثناء التلاوة — والخطرُ فيه أن يُخطَّأ مصيبٌ لأنّه لم يبلغ بعد.
 *
 * فمقابلةُ ما سُمع بنصّ الوجه كاملًا وهو في منتصفه تقول «أسقطتَ كلَّ ما بقي». وهذا
 * الملفُّ يقيس أنّ ذلك لا يقع: ما بعد جبهة القراءة لا يُقال فيه شيء حتى تنتهي التلاوة.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTLE_MARGIN_WORDS, finalJudgment, liveJudgment } from '../src/lib/live-judging';
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
  /* والحكمُ الكاملُ يرى الباقي ساقطًا — وهو ما لا يُعرض ولا يُصوَّت عليه أثناء القراءة. */
  assert.ok(live.judgment!.mistakes.length >= 7);
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
