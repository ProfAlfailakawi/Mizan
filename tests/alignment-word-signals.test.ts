import test from 'node:test';
import assert from 'node:assert/strict';

import { accumulateWordSignals, type AlignmentStep } from '../server/alignment/word-signals';

/*
 * إشاراتُ الكلمة تُقاس بتسلسلٍ مصنوعٍ من خطوات القرار — لا بانتظار تلاوةٍ حقيقية.
 *
 * والخطرُ هنا أن تُنسب القفزةُ إلى الكلمة الخطأ، فيُقال للطالب «أعدتَ عند الآية ٦»
 * وهو أعاد عند ٤ — فيراجع ما لم يتعثّر فيه.
 */

const step = (over: Partial<AlignmentStep> = {}): AlignmentStep => ({
  word: 0, emission: 1, competingWord: null, competingGap: Number.POSITIVE_INFINITY,
  tookJump: false, lost: false, ...over,
});

const walk = (...words: number[]) => words.map(w => step({ word: w }));

test('اللبثُ يُجمع لكلّ كلمة، وأدنى كلفةٍ ومتوسّطُها يُحسبان منها', () => {
  const s = accumulateWordSignals([
    step({ word: 0, emission: 4 }),
    step({ word: 0, emission: 2 }),
    step({ word: 1, emission: 9 }),
  ]);
  assert.equal(s.frames, 3);
  assert.equal(s.visitedWords, 2);
  const first = s.words[0];
  assert.equal(first.frames, 2);
  assert.equal(first.minEmission, 2);
  assert.equal(first.meanEmission, 3);
  assert.equal(s.words[1].frames, 1);
  assert.equal(s.words[1].minEmission, 9);
});

test('القفزةُ الخلفيةُ تُنسب إلى الكلمة التي رجع إليها — هناك أعاد', () => {
  const s = accumulateWordSignals([
    ...walk(0, 1, 2, 3),
    step({ word: 1, tookJump: true }),
    ...walk(2, 3),
  ]);
  assert.equal(s.backwardJumps, 1);
  assert.equal(s.forwardJumps, 0);
  const atOne = s.words.find(w => w.word === 1)!;
  assert.equal(atOne.backwardJumps, 1, 'الإعادةُ لم تُنسب إلى موضع الرجوع');
  assert.equal(s.words.find(w => w.word === 3)!.backwardJumps, 0, 'نُسبت الإعادةُ إلى الكلمة التي غادرها');
});

test('القفزةُ الأماميةُ تُنسب إلى الكلمة التي وصل إليها — هناك ظهر التخطّي', () => {
  const s = accumulateWordSignals([...walk(0, 1), step({ word: 7, tookJump: true }), ...walk(8)]);
  assert.equal(s.forwardJumps, 1);
  assert.equal(s.backwardJumps, 0);
  assert.equal(s.words.find(w => w.word === 7)!.forwardJumps, 1);
});

test('قفزةٌ إلى الكلمة نفسِها ليست قفزة', () => {
  const s = accumulateWordSignals([step({ word: 3 }), step({ word: 3, tookJump: true })]);
  assert.equal(s.backwardJumps + s.forwardJumps, 0);
});

test('أضيقُ فجوةٍ تُحفظ مع صاحبها — وهو موضعُ الالتباس', () => {
  const s = accumulateWordSignals([
    step({ word: 5, competingWord: 40, competingGap: 0.9 }),
    step({ word: 5, competingWord: 41, competingGap: 0.12 }),
    step({ word: 5, competingWord: 42, competingGap: 0.5 }),
  ]);
  const w = s.words[0];
  assert.equal(w.narrowestGap, 0.12);
  assert.equal(w.nearestRival, 41, 'حُفظ منافسٌ ليس صاحبَ أضيق فجوة');
});

test('منافسٌ هو الكلمةُ نفسُها يُهمل — ليس التباسًا', () => {
  const s = accumulateWordSignals([step({ word: 5, competingWord: 5, competingGap: 0.01 })]);
  assert.equal(s.words[0].nearestRival, null);
  assert.equal(s.words[0].narrowestGap, Number.POSITIVE_INFINITY);
});

test('إطارُ الفقد لا يُحتسب كلفةً، ويُعدّ عند آخر كلمةٍ عُرفت', () => {
  const s = accumulateWordSignals([
    step({ word: 2, emission: 1 }),
    step({ lost: true, word: 99, emission: 1000 }),
    step({ lost: true, word: 99, emission: 1000 }),
    step({ word: 3, emission: 1 }),
  ]);
  assert.equal(s.lostFrames, 2);
  assert.equal(s.frames, 4);
  const two = s.words.find(w => w.word === 2)!;
  assert.equal(two.lostFrames, 2, 'الفقدُ لم يُنسب إلى آخر كلمةٍ معروفة');
  assert.equal(two.meanEmission, 1, 'كلفةُ إطارٍ مفقودٍ دخلت الحساب');
  assert.equal(s.words.some(w => w.word === 99), false, 'موضعُ إطارٍ مفقودٍ صار كلمةً مزارة');
});

test('الفقدُ لا يصنع قفزةً كاذبة بعده', () => {
  /* لو حُدِّث «السابق» من إطارٍ مفقود لظهرت قفزةٌ من موضعٍ ظنّيّ. */
  const s = accumulateWordSignals([
    step({ word: 2 }),
    step({ lost: true, word: 50 }),
    step({ word: 3, tookJump: true }),
  ]);
  assert.equal(s.forwardJumps, 1);
  assert.equal(s.words.find(w => w.word === 3)!.forwardJumps, 1);
  assert.equal(s.backwardJumps, 0, 'الفقدُ صنع قفزةً خلفيّةً كاذبة');
});

test('تسلسلٌ فارغ أو كلُّه فقدٌ لا يخترع كلمات', () => {
  const empty = accumulateWordSignals([]);
  assert.deepEqual(empty.words, []);
  assert.equal(empty.firstWord, null);
  assert.equal(empty.lastWord, null);
  const allLost = accumulateWordSignals([step({ lost: true }), step({ lost: true })]);
  assert.deepEqual(allLost.words, []);
  assert.equal(allLost.lostFrames, 2);
  assert.equal(allLost.visitedWords, 0);
});

test('كلمةٌ بفهرسٍ غير صحيحٍ تُهمل ولا تُفسد الترتيب', () => {
  const s = accumulateWordSignals([step({ word: -1 }), step({ word: 1.5 }), step({ word: 2 })]);
  assert.deepEqual(s.words.map(w => w.word), [2]);
  assert.equal(s.frames, 3, 'الإطاراتُ المهملة لم تُعدّ');
});

test('الأوّلُ والآخرُ بالفهرس لا بترتيب الزيارة', () => {
  const s = accumulateWordSignals(walk(5, 2, 9, 2));
  assert.equal(s.firstWord, 2);
  assert.equal(s.lastWord, 9);
  assert.deepEqual(s.words.map(w => w.word), [2, 5, 9]);
});
