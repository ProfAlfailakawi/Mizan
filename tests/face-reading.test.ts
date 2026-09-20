import test from 'node:test';
import assert from 'node:assert/strict';

import { accumulateWordSignals, type AlignmentStep } from '../server/alignment/word-signals';
import { DEFAULT_FACE_THRESHOLDS, median, readFace } from '../src/lib/face-reading';

/*
 * القراءةُ الوصفية — حيث يقع الكذبُ عادةً: أرقامٌ صادقةٌ تُسمّى تسميةً تدّعي أكثر.
 *
 * فيُقاس هنا ثلاثة: أن تُسمّى العلامةُ بما قِيس، وأن يكون المقياسُ **نسبيًّا** إلى
 * جلسة الطالب نفسِها لا مطلقًا، وألّا يخرج رقمٌ من مئة بحال.
 */

const step = (over: Partial<AlignmentStep> = {}): AlignmentStep => ({
  word: 0, emission: 1, competingWord: null, competingGap: Number.POSITIVE_INFINITY,
  tookJump: false, lost: false, ...over,
});

/** تلاوةٌ مستويةٌ: كلُّ كلمةٍ إطاران بكلفةٍ واحدة. */
const even = (words: number, emission = 1) =>
  Array.from({ length: words * 2 }, (_, i) => step({ word: i >> 1, emission }));

test('الوسيطُ لا يُجرّ بكلمةٍ شاذّة', () => {
  assert.equal(median([1, 1, 1, 1, 100]), 1);
  assert.equal(median([2, 4]), 3);
  assert.ok(Number.isNaN(median([])));
  assert.equal(median([Number.NaN, 5, Number.NaN]), 5);
});

test('المقياسُ نسبيٌّ إلى الجلسة — غرفةٌ ضاجّةٌ لا تجعل كلَّ كلمةٍ شاقّة', () => {
  /*
   * تلاوتان متطابقتان في الشكل، إحداهما كلفتُها كلُّها أعلى عشرةَ أضعاف (ميكروفونٌ
   * أبعد). فلو كان المقياسُ مطلقًا لصارت الثانيةُ كلُّها «مواضعَ شدّة».
   */
  const shape = (base: number) => accumulateWordSignals([
    ...even(5, base),
    ...Array.from({ length: 2 }, () => step({ word: 5, emission: base * 4 })),
  ]);
  const quiet = readFace(shape(1), 6);
  const noisy = readFace(shape(10), 6);
  assert.equal(quiet.indices.strainedWords, noisy.indices.strainedWords, 'المقياسُ مطلقٌ لا نسبيّ');
  assert.equal(quiet.indices.strainedWords, 1);
  assert.ok(noisy.emissionMedian > quiet.emissionMedian * 5, 'الوسيطُ لم يتبع الجلسة');
});

test('«موضعُ شدّة» يُعلَّم عند الكلمة نفسِها وبشدّةٍ متدرّجة', () => {
  const reading = readFace(accumulateWordSignals([
    ...even(6, 1),
    /* تحت العتبة (١٫٤ × الوسيط ١ < ١٫٦): لا تُعلَّم. */
    step({ word: 6, emission: 1.4 }), step({ word: 6, emission: 1.4 }),
    /* وفوقها بكثير: تُعلَّم. */
    step({ word: 7, emission: 9 }), step({ word: 7, emission: 9 }),
  ]), 8);
  const strains = reading.marks.filter(m => m.kind === 'strain');
  assert.deepEqual(strains.map(m => m.word), [7], 'عُلّمت كلمةٌ دون العتبة أو فاتت التي فوقها');
  assert.ok(strains[0].intensity > 0 && strains[0].intensity <= 1);
  /* والشدّةُ تتدرّج: الأبعدُ عن المرجع أشدُّ علامةً. */
  const worse = readFace(accumulateWordSignals([
    ...even(6, 1), step({ word: 7, emission: 40 }), step({ word: 7, emission: 40 }),
  ]), 8).marks.find(m => m.kind === 'strain')!;
  assert.ok(worse.intensity >= strains[0].intensity, 'الشدّةُ لا تتدرّج');
});

test('الالتباسُ يُعلَّم ومعه منافسُه — وهو مظنّةُ المتشابه', () => {
  const reading = readFace(accumulateWordSignals([
    ...even(4),
    step({ word: 4, competingWord: 812, competingGap: 0.02 }),
    step({ word: 4, competingWord: 812, competingGap: 0.02 }),
  ]), 5);
  const confusable = reading.marks.filter(m => m.kind === 'confusable');
  assert.equal(confusable.length, 1);
  assert.equal(confusable[0].word, 4);
  assert.equal(confusable[0].rival, 812, 'لم يُحفظ المنافس');
  assert.ok(confusable[0].intensity > 0.8, 'فجوةٌ شبه معدومةٍ لم تُعطِ شدّةً عالية');
  assert.equal(reading.indices.confusableWords, 1);
});

test('فجوةٌ واسعةٌ ليست التباسًا', () => {
  const reading = readFace(accumulateWordSignals([
    ...even(3),
    step({ word: 3, competingWord: 9, competingGap: 0.8 }),
    step({ word: 3, competingWord: 9, competingGap: 0.8 }),
  ]), 4);
  assert.equal(reading.marks.some(m => m.kind === 'confusable'), false);
  assert.equal(reading.indices.confusableWords, 0);
});

test('الإعادةُ والتخطّي والفقدُ تصير علاماتٍ في مواضعها', () => {
  const reading = readFace(accumulateWordSignals([
    ...even(3),
    step({ word: 1, tookJump: true }), step({ word: 1 }),
    step({ word: 8, tookJump: true }), step({ word: 8 }),
    step({ lost: true }), step({ lost: true }),
  ]), 10);
  const kinds = (k: string) => reading.marks.filter(m => m.kind === k).map(m => m.word);
  assert.deepEqual(kinds('repeat'), [1]);
  assert.deepEqual(kinds('skip'), [8]);
  assert.deepEqual(kinds('lost'), [8], 'الفقدُ لم يُنسب إلى آخر كلمةٍ معروفة');
  assert.equal(reading.indices.repeats, 1);
  assert.equal(reading.indices.skips, 1);
  assert.equal(reading.indices.lostFrames, 2);
});

test('«أكملتَ» تُقاس بكلمات الوجه لا بما قرأ — وإلا صدقت دائمًا وبلا معنى', () => {
  const reading = readFace(accumulateWordSignals(even(4)), 30);
  assert.equal(reading.indices.traversed, 4);
  assert.equal(reading.indices.expected, 30);
  assert.ok(reading.indices.traversed < reading.indices.expected);
});

test('لا رقمَ من مئة يخرج من هذه الطبقة — وكلُّ مؤشّرٍ عدٌّ لا نسبة', () => {
  /*
   * أوّلُ صياغةٍ لهذا الحارس منعت كلَّ مفتاحٍ فيه «total»، فسقط على `totalFrames` —
   * وهو عدُّ إطاراتٍ لا درجة. والخاصّيةُ المرادةُ أدقُّ من اسمٍ ممنوع: **كلُّ مؤشّرٍ
   * عددٌ صحيحٌ غيرُ سالب**. فما دام كذلك فلا نسبةَ فيه ولا معدّلَ ولا درجةً من مئة،
   * ومن أراد نسبةً فليقسم بنفسه ويعلم ما قسم.
   */
  const reading = readFace(accumulateWordSignals(even(5)), 5);
  for (const [key, value] of Object.entries(reading.indices)) {
    assert.equal(typeof value, 'number', `${key} ليس عددًا`);
    assert.ok(Number.isInteger(value), `${key} = ${value} ليس عددًا صحيحًا — مظنّةُ نسبةٍ أو درجة`);
    assert.ok(value >= 0, `${key} سالب`);
  }
  for (const forbidden of ['score', 'percent', 'grade', 'mastery', 'rating']) {
    assert.equal(Object.keys(reading.indices).some(k => k.toLowerCase().includes(forbidden)), false,
      `ظهر مفتاحٌ «${forbidden}»`);
  }
  /* والشدّةُ 0..1 لتدرّج اللون وحده: لا تدخل المؤشّرات ولا تُعرض رقمًا. */
  assert.ok(reading.marks.every(m => m.intensity >= 0 && m.intensity <= 1));
});

test('تلاوةٌ مستويةٌ لا تُنتج علاماتٍ — فلا يُقلَق الطالبُ بلا سبب', () => {
  const reading = readFace(accumulateWordSignals(even(20)), 20);
  assert.deepEqual(reading.marks, []);
  assert.equal(reading.indices.strainedWords, 0);
  assert.equal(reading.indices.traversed, 20);
});

test('كلمةٌ بإطارٍ واحدٍ ضجيجٌ لا إشارة: لا شدّةَ ولا لبث', () => {
  const reading = readFace(accumulateWordSignals([
    ...even(6, 1),
    step({ word: 6, emission: 500 }), // إطارٌ واحدٌ عالي الكلفة
  ]), 7);
  assert.equal(reading.marks.some(m => m.kind === 'strain'), false, 'إطارٌ واحدٌ صار موضعَ شدّة');
  assert.equal(reading.indices.strainedWords, 0);
  /* لكنّ قفزتها أو فقدَها يُعلَّم مهما قصُر لبثُها — فتلك أحداثٌ لا متوسّطات. */
  const jumped = readFace(accumulateWordSignals([...even(3), step({ word: 0, tookJump: true })]), 4);
  assert.equal(jumped.marks.some(m => m.kind === 'repeat'), true);
});

test('جلسةٌ فارغةٌ لا تُنتج وسيطًا ولا علامات', () => {
  const reading = readFace(accumulateWordSignals([]), 12);
  assert.deepEqual(reading.marks, []);
  assert.ok(Number.isNaN(reading.emissionMedian));
  assert.equal(reading.indices.traversed, 0);
  assert.equal(reading.indices.expected, 12);
});

test('العتباتُ معلنةٌ وقابلةٌ للضبط — ولم تُعايَر بعد', () => {
  assert.equal(DEFAULT_FACE_THRESHOLDS.strainRatio > 1, true);
  const strict = readFace(accumulateWordSignals([...even(6, 1), step({ word: 6, emission: 1.3 }), step({ word: 6, emission: 1.3 })]), 7,
    { ...DEFAULT_FACE_THRESHOLDS, strainRatio: 1.2 });
  const lenient = readFace(accumulateWordSignals([...even(6, 1), step({ word: 6, emission: 1.3 }), step({ word: 6, emission: 1.3 })]), 7,
    { ...DEFAULT_FACE_THRESHOLDS, strainRatio: 3 });
  assert.equal(strict.indices.strainedWords, 1);
  assert.equal(lenient.indices.strainedWords, 0);
});

test('المرجعُ وسيطٌ لا متوسّط — وكلمتان شاذّتان لا تُخفيان ثالثةً', () => {
  /*
   * هذا الحارسُ وُلد من طفرةٍ مرّت خضراء: بدّلتُ الوسيطَ بمتوسّطٍ فلم يسقط اختبار.
   * فالفرقُ لا يظهر إلا في شكلٍ بعينه — شاذّتان تجرّان المتوسّطَ فوق كلمةٍ ثالثةٍ
   * شاقّةٍ بحقّ، فتختفي. والوسيطُ لا يتحرّك لهما.
   *
   * عشرُ كلماتٍ بكلفة ١، وكلمتان بكلفة ١٠٠، وواحدةٌ بكلفة ٣:
   *   بالوسيط  → المرجع ١    والعتبة ١٫٦  ⇒ الثلاثُ شاقّة.
   *   بالمتوسّط → المرجع ١٦٫٤ والعتبة ٢٦٫٢ ⇒ تختفي كلمةُ الـ٣.
   */
  const steps = [
    ...even(10, 1),
    ...even(1, 100).map(s => ({ ...s, word: 10 })),
    ...even(1, 100).map(s => ({ ...s, word: 11 })),
    ...even(1, 3).map(s => ({ ...s, word: 12 })),
  ];
  const reading = readFace(accumulateWordSignals(steps), 13);
  assert.equal(reading.emissionMedian, 1, `المرجعُ ${reading.emissionMedian} — ليس وسيطًا`);
  const strained = reading.marks.filter(m => m.kind === 'strain').map(m => m.word).sort((a, b) => a - b);
  assert.deepEqual(strained, [10, 11, 12], 'كلمةٌ شاقّةٌ اختفت خلف شاذّتين');
});
