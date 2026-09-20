import test from 'node:test';
import assert from 'node:assert/strict';

import { describeStumble, emptyStumbleState, observeAlignment, type AlignmentObservation } from '../src/lib/trial-stumbles';

/*
 * أين تعثّر — يُقاس بتسلسلٍ مصنوعٍ من نتائج المحرّك، لا بانتظار تلاوةٍ حقيقية.
 *
 * والخطرُ هنا واحد: أن يُنسب الانقطاعُ إلى موضعٍ ليس موضعَه، فيُعيد المتسابق آيةً لم
 * يتعثّر فيها. فيُقاس أن الموضع هو **آخرُ ما تُتبّع قبل الانقطاع**، وأن المجهول يبقى
 * مجهولًا.
 */

const run = (...results: AlignmentObservation[]) => results.reduce(observeAlignment, emptyStumbleState());

test('الانقطاعُ يُنسب إلى آخر موضعٍ تتبّعه المحرّك، لا إلى لحظة العطب', () => {
  const state = run(
    { alignmentState: 'TRACKING', ayah: 5, wordIndex: 2 },
    { alignmentState: 'TRACKING', ayah: 6, wordIndex: 3 },
    { alignmentState: 'LOST' },
  );
  assert.equal(state.lostCount, 1);
  assert.deepEqual(state.stumbles, [{ ayah: 6, wordIndex: 3 }]);
  assert.equal(describeStumble(state.stumbles[0], true), 'الآية ٦ · الكلمة ٤');
  assert.equal(describeStumble(state.stumbles[0], false), 'ayah 6, word 4');
});

test('انقطاعٌ واحدٌ لا يُعدّ مرّتين ولو امتدّ مقاطع', () => {
  const state = run(
    { alignmentState: 'TRACKING', ayah: 3, wordIndex: 0 },
    { alignmentState: 'LOST' },
    { alignmentState: 'LOST' },
    { alignmentState: 'LOST' },
  );
  assert.equal(state.lostCount, 1);
  assert.equal(state.stumbles.length, 1);
});

test('انقطاعان منفصلان يُعدّان اثنين بموضعيهما', () => {
  const state = run(
    { alignmentState: 'TRACKING', ayah: 2, wordIndex: 1 },
    { alignmentState: 'LOST' },
    { alignmentState: 'TRACKING', ayah: 4, wordIndex: 0 },
    { alignmentState: 'TRACKING', ayah: 7, wordIndex: 5 },
    { alignmentState: 'LOST' },
  );
  assert.equal(state.lostCount, 2);
  assert.deepEqual(state.stumbles, [{ ayah: 2, wordIndex: 1 }, { ayah: 7, wordIndex: 5 }]);
});

test('«يبحث عن موضعه» ليس تتبّعًا، فلا يُبنى عليه موضع', () => {
  /* REACQUIRING ظنٌّ لا يقين — فلو حُسب لصار الموضعُ المعروض موضعًا لم يُتتبَّع. */
  const state = run(
    { alignmentState: 'TRACKING', ayah: 9, wordIndex: 1 },
    { alignmentState: 'LOST' },
    { alignmentState: 'REACQUIRING', ayah: 40, wordIndex: 9 },
    { alignmentState: 'LOST' },
  );
  assert.deepEqual(state.stumbles, [{ ayah: 9, wordIndex: 1 }, { ayah: 9, wordIndex: 1 }]);
  assert.equal(state.lastTracked?.ayah, 9, 'ظنُّ المحرّك صار موضعًا معتمدًا');
});

test('انقطاعٌ قبل أن يتتبّع شيئًا يُعدّ ولا يُخترع له مكان', () => {
  const state = run({ alignmentState: 'LOST' }, { alignmentState: 'TRACKING', ayah: 1, wordIndex: 0 }, { alignmentState: 'LOST' });
  assert.equal(state.lostCount, 2);
  assert.deepEqual(state.stumbles, [{ ayah: 1, wordIndex: 0 }], 'اختُرع موضعٌ لانقطاعٍ قبل أيّ تتبّع');
});

test('كلمةٌ مجهولةٌ تُترك، ولا تُكتب «الكلمة ٠»', () => {
  const state = run({ alignmentState: 'TRACKING', ayah: 12 }, { alignmentState: 'LOST' });
  assert.deepEqual(state.stumbles, [{ ayah: 12 }]);
  assert.equal(describeStumble({ ayah: 12 }, true), 'الآية ١٢');
  assert.equal(describeStumble({ ayah: 12 }, false), 'ayah 12');
});

test('آيةٌ غيرُ صحيحةٍ لا تصير موضعًا', () => {
  const state = run({ alignmentState: 'TRACKING', ayah: 0 }, { alignmentState: 'TRACKING' }, { alignmentState: 'LOST' });
  assert.equal(state.lostCount, 1);
  assert.deepEqual(state.stumbles, []);
});
