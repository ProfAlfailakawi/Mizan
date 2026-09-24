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

/*
 * اللحاق: خادمٌ أبطأُ من التلاوة لا يترك التأخّرَ يتراكم، ولا يُسقط كلمةً ممدودة.
 *
 * محاكاةٌ لطابور السماع كما هو في `MushafListens` سطرًا سطرًا: المقطعُ يصل كلَّ `CHUNK_MS`،
 * والطلباتُ واحدٌ بعد واحد، ويُترك المقطعُ إن غطّت ما بعده نافذةٌ أحدث، أو إن لم يبقَ فيه جديد.
 * والتلاوةُ مصنوعةٌ على نمط ما قِيس من العفاسي: كلماتٌ قصيرة، وكلُّ رابعةٍ ممدودةٌ نحو أربع
 * ثوانٍ، ووقفاتٌ بين الآيات. وكلفةُ الطلب كما قِيست في الإنتاج: ثابتٌ كبير (Whisper يمرّر ثلاثين
 * ثانيةً مهما قصر الصوت) وجزءٌ بطول الصوت وعدد كلماته — نحو أربع ثوانٍ لنافذة الستّ.
 */
import { MAX_WINDOW_CHUNKS, catchUpWindow } from '../src/lib/recognition-window';

interface Word { s: number; e: number }
function recitation(seconds: number): Word[] {
  const words: Word[] = [];
  let t = 30, n = 0, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  while (t < seconds * 1000 - 5000) {
    const long = n % 4 === 3;
    const len = long ? 3400 + rnd() * 1100 : 400 + rnd() * 900;
    words.push({ s: t, e: t + len });
    t += len + (long ? 400 + rnd() * 500 : 10);
    n += 1;
  }
  return words;
}

function schedule(words: Word[], seconds: number, cost: (audioMs: number, words: number, request: number) => number, catchUp: boolean) {
  const chunks = Math.ceil(seconds * 1000 / CHUNK_MS);
  let clock = 0, committed = 0, covered = 0, requests = 0, maxAudio = 0;
  const heard = new Set<number>();
  const lags: number[] = [];
  for (let i = 0; i < chunks; i += 1) {
    clock = Math.max(clock, (i + 1) * CHUNK_MS);
    const final = i === chunks - 1;
    const newest = Math.min(chunks - 1, Math.floor(clock / CHUNK_MS) - 1);
    if (!final && newest > i && recognitionWindow(i + 1, false).startMs <= committed) continue;
    const w = catchUp ? catchUpWindow(i, final ? i : newest, final, committed) : { ...recognitionWindow(i, final), last: i };
    if (catchUp && !final && w.commitUntilMs <= Math.max(committed, covered)) continue;
    const inside = words.map((x, k) => ({ ...x, k })).filter(x => x.s >= w.startMs && x.e <= w.endMs);
    maxAudio = Math.max(maxAudio, w.endMs - w.startMs);
    clock += cost(w.endMs - w.startMs, inside.length, requests);
    requests += 1;
    for (const x of inside) {
      if (x.s < committed - 80 || x.e > w.commitUntilMs) continue;
      heard.add(x.k); committed = Math.max(committed, x.e); lags.push(clock - x.e);
    }
    covered = Math.max(covered, w.commitUntilMs);
  }
  lags.sort((a, b) => a - b);
  return { requests, maxAudio, lost: words.length - heard.size, median: lags[lags.length >> 1], p90: lags[Math.floor(lags.length * 0.9)] };
}

const SECONDS = 229;
const WORDS = recitation(SECONDS);
const production = (audioMs: number, words: number) => 2600 + 0.12 * audioMs + 150 * words;
const spiky = (audioMs: number, words: number, request: number) => production(audioMs, words) * (request % 10 === 9 ? 2.5 : 1);

test('the old schedule falls behind and loses long words — the measured failure', () => {
  const old = schedule(WORDS, SECONDS, production, false);
  assert.ok(old.median > 20_000, `median lag ${old.median}ms`);
  assert.ok(old.lost > 0, 'no drawn-out word was lost');
});

test('catching up keeps the lag bounded and hears every word, even on a spiky server', () => {
  for (const cost of [production, spiky]) {
    const run = schedule(WORDS, SECONDS, cost, true);
    assert.equal(run.lost, 0, `${run.lost} words never committed — they would be marked skipped`);
    assert.ok(run.median < 12_000, `median lag ${run.median}ms`);
    assert.ok(run.p90 < 20_000, `p90 lag ${run.p90}ms`);
    assert.ok(run.maxAudio <= MAX_WINDOW_CHUNKS * CHUNK_MS, `a window of ${run.maxAudio}ms is past Whisper's 30 s`);
  }
});

test('a fast listener sees exactly the old window', () => {
  for (let i = 0; i < 12; i += 1) {
    const base = recognitionWindow(i, false);
    const { last, ...w } = catchUpWindow(i, i, false, base.startMs + 2000);
    assert.equal(last, i);
    assert.deepEqual(w, base);
  }
});

test('a word left pending pulls the window back to it, never past 24 s', () => {
  const w = catchUpWindow(20, 20, false, 20_000);
  assert.ok(w.startMs <= 20_000 - 300, `window starts at ${w.startMs}ms, after the pending word`);
  const far = catchUpWindow(40, 40, false, 0);
  assert.equal(far.last - far.first + 1, MAX_WINDOW_CHUNKS);
});

test('the final chunk commits to the very end and is never extended', () => {
  const w = catchUpWindow(9, 30, true, 10_000);
  assert.equal(w.last, 9);
  assert.equal(w.commitUntilMs, 10 * CHUNK_MS);
});
