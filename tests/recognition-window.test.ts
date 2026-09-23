/*
 * نافذةُ السماع: لا لحظةَ من التلاوة تسقط بين نافذتين.
 *
 * فكلمةٌ لا تقع في الجزء المُثبَّت من نافذةٍ ما لا تُثبَّت أبدًا، فتُحسب «لم تُسمع»
 * ويُنبَّه الطالبُ عليها وهو قد قالها — وهي أسوأُ ما يفعله ميزان.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHUNK_MS, recognitionWindow } from '../src/lib/recognition-window';

/* أوّلُ لحظةٍ (بالمئة ميلي ثانية) لا يثبّتها شيء، أو null. */
function firstUncovered(chunks: number): number | null {
  for (let t = 0; t < chunks * CHUNK_MS; t += 100) {
    let covered = false;
    for (let i = 0; i < chunks && !covered; i += 1) {
      const w = recognitionWindow(i, i === chunks - 1);
      /* والكلمةُ تُثبَّت إن بدأت في محتوى النافذة وانتهت قبل حدّ التثبيت. */
      if (t >= w.startMs && t + 100 <= w.commitUntilMs) covered = true;
    }
    if (!covered) return t;
  }
  return null;
}

test('كلُّ لحظةٍ من التلاوة يثبّتها سماعُ نافذةٍ ما', () => {
  for (const chunks of [1, 2, 3, 4, 5, 8, 30]) {
    assert.equal(firstUncovered(chunks), null, `${chunks} مقاطع: لحظةٌ لا تُثبَّت عند ${firstUncovered(chunks)}ms — كلماتُها تُعدّ ساقطةً وقد قيلت`);
  }
});

test('ولا تُرسل النافذةُ صوتَ مقطعٍ مرّتين في موضعين', () => {
  for (let i = 0; i < 10; i += 1) {
    const w = recognitionWindow(i, false);
    /* فالمقطعُ الأوّل إمّا محتوًى وإمّا ترويسة — لا الاثنان. */
    if (w.headed) assert.ok(w.first >= 1, `نافذة ${i}: الترويسةُ والمحتوى يتكرّر فيهما المقطعُ الأوّل`);
    assert.equal(w.startMs, w.first * CHUNK_MS);
  }
});
