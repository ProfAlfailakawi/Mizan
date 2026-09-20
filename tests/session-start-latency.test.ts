import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPoolItems, selectPoolPassages, type DrawnPassage } from '../src/lib/delivery-question-pool-core';

/*
 * بدءُ الجلسة يُقاس بزمنِ الذهاب والإياب لا بالساعة.
 *
 * كان قياسُ الصعوبة نداءً يتلو نداءً، فكلُّ موضعٍ ينتظر الذي قبله — والمحكّم ينتظرهم جميعًا.
 * وهذا الملفّ لا يقيس ميلي ثانيةً على هذه الآلة (فذلك يختلف بالعتاد)، بل يقيس ما يهمّ:
 * كم نداءً كان مُطلقًا في اللحظة نفسها. بالتتابع تكون الذروةُ واحدًا أبدًا.
 */

const passage = (surah: number, start: number, end: number, juz = 1): DrawnPassage => ({
  surah, startAyah: start, endAyah: end, text: `نصٌّ ${surah}:${start}-${end}`, juz,
  surahNameArabic: 'فاطر', surahNameEnglish: 'Fatir',
});

const draws = (...list: DrawnPassage[]) => list.map(p => ({ passage: p }));

test('الترشيح يحفظ ترتيب السحب ولا يكرّر موضعًا', () => {
  const picked = selectPoolPassages([
    ...draws(passage(35, 4, 10), passage(2, 1, 5), passage(35, 4, 10)),
    null,
    { passage: null },
    ...draws(passage(2, 1, 5), passage(36, 1, 6)),
  ]);
  assert.deepEqual(picked.map(p => `${p.surah}:${p.startAyah}-${p.endAyah}`), ['35:4-10', '2:1-5', '36:1-6']);
});

test('maqJuz الموروث يُسقط ما تجاوزه حين لا نطاق', () => {
  const picked = selectPoolPassages(draws(passage(2, 1, 5, 1), passage(35, 4, 10, 22)), { maxJuz: 5 });
  assert.deepEqual(picked.map(p => p.surah), [2]);
});

test('قياسُ الصعوبة موجةٌ واحدة — لا نداءٌ ينتظر الذي قبله', async () => {
  const picked = Array.from({ length: 14 }, (_, i) => passage(2, i * 10 + 1, i * 10 + 5));
  let inFlight = 0, peak = 0, calls = 0;
  const resolvers: (() => void)[] = [];
  const measure = (p: DrawnPassage) => {
    calls += 1; inFlight += 1; peak = Math.max(peak, inFlight);
    return new Promise<{ score: number }>(resolve => {
      resolvers.push(() => { inFlight -= 1; resolve({ score: p.startAyah / 200 }); });
    });
  };

  const pending = buildPoolItems(picked, 'Hafs', 'hafs', measure);
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 14, `أُطلق ${calls} نداءً فقط قبل انتظار أيّها`);
  assert.equal(peak, 14, `الذروة ${peak} — بالتتابع تكون ١ دائمًا`);

  resolvers.forEach(done => done());
  const items = await pending;
  assert.equal(items.length, 14);
  assert.deepEqual(items.map(x => x.startAyah), picked.map(p => p.startAyah), 'الترتيب تغيّر بعد القياس');
});

test('الصعوبة تُسند إلى موضعها هو لا إلى جاره', async () => {
  const picked = [passage(2, 1, 5), passage(3, 1, 5), passage(4, 1, 5)];
  /* أبطأُ نداءٍ أوّلًا: لو أُسندت النتائج بترتيب الوصول لانقلبت. */
  const delays = [30, 1, 15];
  const items = await buildPoolItems(picked, 'Hafs', 'hafs', p => {
    const i = picked.findIndex(x => x.surah === p.surah);
    return new Promise(resolve => setTimeout(() => resolve({ score: i / 4, mutashabihat: i / 4 }), delays[i]));
  });
  assert.deepEqual(items.map(x => x.difficultyRating), [1, 2, 3]);
  assert.deepEqual(items.map(x => x.mutashabihatDensity), ['none', 'medium', 'high']);
});

test('غيابُ متجه الصعوبة لا يُسقط الموضع ولا يخترع رقمًا', async () => {
  const items = await buildPoolItems([passage(2, 1, 5)], 'Hafs', 'hafs', async () => null);
  assert.equal(items.length, 1);
  assert.equal(items[0].difficultyRating, difficultyOfHalf());
  assert.equal(items[0].mutashabihatDensity, 'none');
});

/* ٠٫٥ هو الحياد المعلن في النواة حين لا قياس — يُقرأ منها لا يُنسخ رقمًا. */
function difficultyOfHalf() { return Math.max(1, Math.min(5, Math.round(0.5 * 4) + 1)); }
