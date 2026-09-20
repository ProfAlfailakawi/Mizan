import test from 'node:test';
import assert from 'node:assert/strict';

import { stepsFromSamples, faceWordLookup, SAMPLED_PATH_MARKS, type FaceWordKey } from '../src/lib/face-session';
import { accumulateWordSignals } from '../server/alignment/word-signals';
import { readFace } from '../src/lib/face-reading';

/*
 * الجسرُ بين مقياسٍ خشنٍ وعرضٍ دقيق — وهنا يقع الكذبُ إن وقع.
 *
 * فالمسارُ الحيُّ يرسل موضعًا كلَّ ثانيتين، والقارئُ يقرأ في الثانيتين خمسَ كلماتٍ أو
 * عشرًا. فيُحرس هنا أن يُقال ما قِيس وحده، وألّا يُملأ ما لم يُقس بصفرٍ ولا بتقدير.
 */

/* وجهٌ من آيتين: أربعُ كلماتٍ ثم ثلاث. */
const words: FaceWordKey[] = [
  { index: 0, surah: 1, ayah: 2, ayahWordIndex: 1 },
  { index: 1, surah: 1, ayah: 2, ayahWordIndex: 2 },
  { index: 2, surah: 1, ayah: 2, ayahWordIndex: 3 },
  { index: 3, surah: 1, ayah: 2, ayahWordIndex: 4 },
  { index: 4, surah: 1, ayah: 3, ayahWordIndex: 1 },
  { index: 5, surah: 1, ayah: 3, ayahWordIndex: 2 },
  { index: 6, surah: 1, ayah: 3, ayahWordIndex: 3 },
];
const at = (surah: number, ayah: number, wordIndex: number) => ({ surah, ayah, wordIndex, alignmentState: 'LOCKED' });

test('الموضعُ يُترجم إلى فهرسٍ عامّ — ولا يُقدَّر موضعٌ مجهول', () => {
  const locate = faceWordLookup(words);
  assert.equal(locate(at(1, 3, 2)), 5);
  assert.equal(locate(at(1, 2, 1)), 0);
  /* وما ليس على الوجه لا يُقرَّب إلى أقرب كلمة. */
  assert.equal(locate(at(2, 1, 1)), null, 'سورةٌ ليست على الوجه قُدِّر لها موضع');
  assert.equal(locate(at(1, 9, 1)), null, 'آيةٌ ليست على الوجه قُدِّر لها موضع');
  assert.equal(locate(at(1, 2, 99)), null, 'كلمةٌ خارج الآية قُدِّر لها موضع');
  assert.equal(locate({ alignmentState: 'LOCKED' }), null, 'ردٌّ بلا موضعٍ قُدِّر له موضع');
});

test('تقدّمُ الموضع بين مقطعين ليس تخطّيًا — ولا يُدَّعى', () => {
  /*
   * وهذا أدقُّ ما يُحرس هنا: القارئُ يقرأ في الثانيتين خمسَ كلمات، فتقدّمُ الموضع
   * سرعةُ قراءةٍ لا تخطٍّ. ولو عُدَّ تخطّيًا لامتلأ وجهُ كلِّ طالبٍ بعلامةٍ كاذبة.
   */
  const reading = readFace(accumulateWordSignals(stepsFromSamples(
    [at(1, 2, 1), at(1, 2, 4), at(1, 3, 3)], words,
  )), words.length);
  assert.equal(reading.indices.skips, 0, 'عُدّت سرعةُ القراءة تخطّيًا');
  assert.equal(reading.marks.some(m => m.kind === 'skip'), false, 'ظهرت علامةُ تخطٍّ كاذبة');
});

test('الرجوعُ إلى الوراء يُقاس — فهو ما لا يقع في التلاوة المستقيمة', () => {
  const reading = readFace(accumulateWordSignals(stepsFromSamples(
    [at(1, 2, 3), at(1, 3, 1), at(1, 2, 1), at(1, 2, 4)], words,
  )), words.length);
  assert.equal(reading.indices.repeats, 1, 'أُسقط رجوعٌ وقع');
  const back = reading.marks.find(m => m.kind === 'repeat');
  assert.ok(back, 'لا علامةَ إعادة');
  assert.equal(back!.word, 0, 'نُسبت الإعادةُ إلى غير الكلمة التي رجع إليها');
});

test('ما لا يقيسه هذا المسارُ لا يُملأ بصفرٍ ولا بتقدير', () => {
  const steps = stepsFromSamples([at(1, 2, 1), at(1, 2, 1)], words);
  for (const s of steps) {
    assert.equal(Number.isNaN(s.emission), true, 'اختُرعت كلفةٌ صوتيّة');
    assert.equal(s.competingWord, null, 'اختُرعت كلمةٌ منافسة');
    assert.equal(Number.isNaN(s.competingGap), true, 'اختُرعت فجوةُ منافسة');
  }
  /* فتسقط علامتاهما من نفسيهما — لا بشرطٍ مكتوبٍ في الواجهة. */
  const reading = readFace(accumulateWordSignals(steps), words.length);
  assert.equal(reading.marks.some(m => m.kind === 'strain'), false, 'ظهرت شدّةٌ بلا كلفة');
  assert.equal(reading.marks.some(m => m.kind === 'confusable'), false, 'ظهر التباسٌ بلا منافس');
  assert.equal(reading.indices.strainedWords, 0);
  assert.equal(reading.indices.confusableWords, 0);
});

test('انقطاعُ الأثر يُقاس، وموضعٌ مجهولٌ انقطاعٌ لا تخمين', () => {
  const steps = stepsFromSamples([
    at(1, 2, 1),
    { surah: 1, ayah: 2, wordIndex: 2, alignmentState: 'LOST' },
    { surah: 9, ayah: 9, wordIndex: 1, alignmentState: 'LOCKED' },
    at(1, 2, 3),
  ], words);
  assert.deepEqual(steps.map(s => s.lost), [false, true, true, false]);
  /* وخطوةُ الفقد لا تحمل كلفةً ولا منافسًا: المحرّكُ لا يعرف أين هو، فلا قيمةَ لقياسه. */
  for (const step of steps) {
    assert.equal(Number.isNaN(step.emission), true, 'خطوةٌ تحمل كلفةً لم تُقس');
    assert.equal(step.competingWord, null);
  }
  const reading = readFace(accumulateWordSignals(steps), words.length);
  assert.equal(reading.indices.lostFrames, 2, 'لم يُعدّ الانقطاع');
  assert.equal(reading.indices.totalFrames, 4);
  /* والفقدُ لا يُحدث رجوعًا كاذبًا حين يعود الأثرُ إلى كلمةٍ قبله. */
  assert.equal(reading.indices.repeats, 0, 'صنع الفقدُ رجوعًا كاذبًا');
});

test('اللبثُ يُقاس: موضعٌ لا يتقدّم بين مقاطع', () => {
  /* ثمانيةُ مقاطعَ على كلمةٍ واحدة، ومقطعٌ على كلِّ ما عداها. */
  const stuck = Array.from({ length: 8 }, () => at(1, 2, 2));
  const moving = [at(1, 2, 3), at(1, 2, 4), at(1, 3, 1), at(1, 3, 2), at(1, 3, 3)];
  const reading = readFace(accumulateWordSignals(stepsFromSamples([at(1, 2, 1), ...stuck, ...moving], words)), words.length);
  const dwell = reading.marks.filter(m => m.kind === 'dwell');
  assert.equal(dwell.length, 1, `علاماتُ لبثٍ: ${dwell.length}`);
  assert.equal(dwell[0].word, 1, 'نُسب اللبثُ إلى غير موضعه');
});

test('أبعدُ ما بلغ يُعرض، لا عددُ ما رُصد', () => {
  /*
   * ولولا هذا لقيل لمن أتمّ وجهًا من ١٥١ كلمةً: «بلغتَ ٣ من ١٥١» — لأنّ المقياس
   * الخشنَ رصد ثلاثًا.
   */
  const reading = readFace(accumulateWordSignals(stepsFromSamples(
    [at(1, 2, 1), at(1, 2, 4), at(1, 3, 3)], words,
  )), words.length);
  assert.equal(reading.indices.reach, 7, 'أبعدُ ما بلغ لم يُحسب');
  assert.equal(reading.indices.traversed, 3, 'عددُ المرصود تغيّر');
  assert.equal(reading.indices.expected, 7);
});

test('العلاماتُ المُعلنةُ لهذا المسار هي ما يقدر عليه فعلًا — لا أكثر', () => {
  const reading = readFace(accumulateWordSignals(stepsFromSamples([
    at(1, 2, 1), at(1, 2, 1), at(1, 2, 1), at(1, 2, 1),
    { surah: 1, ayah: 2, wordIndex: 2, alignmentState: 'LOST' },
    at(1, 3, 1), at(1, 2, 2),
  ], words)), words.length);
  const produced = new Set(reading.marks.map(m => m.kind));
  for (const kind of produced) {
    assert.ok((SAMPLED_PATH_MARKS as readonly string[]).includes(kind), `أنتج المسارُ «${kind}» وهو غيرُ مُعلَن`);
  }
  assert.ok(produced.size > 0, 'لم يُنتج المسارُ شيئًا أصلًا');
});
