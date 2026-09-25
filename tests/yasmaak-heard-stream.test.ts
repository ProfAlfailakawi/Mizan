/*
 * ما يُثبَّت ممّا سمعه المستمع — ومتى، وبأيّ ساعة.
 *
 * قِيس كلُّ ما هنا في ٢٥ سبتمبر ٢٠٢٦ على الموقع الحيّ (`tools/live-listen`): تلاوةُ العفاسي للوجه ٥٣٢
 * في كروم، وأجوبةُ المستمع الحقيقية أُعيدت على منطق الصفحة. من ١٢٥ كلمةً قيلت لم تُثبَّت ستٌّ
 * وعشرون، أربعَ عشرةَ منها قالها المحرّكُ صحيحةً في نافذةٍ ما. والأرقامُ في الاختبارات أدناه من
 * تلك الجولة بعينها حيث ذُكر ذلك.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PREFACE_WORDS, keepFaceEntry } from '../src/lib/live-judging';
import { ALERT_ECHO_MAX_MS, alertWindow, dropWordsUnderAlert } from '../src/lib/recitation-alerts';
import { CHUNK_MS, ChunkTimeline, GRID_CLOCK, catchUpWindow, commitWords, edgeWords, recognitionWindow } from '../src/lib/recognition-window';

const word = (text: string, startMs: number, endMs: number) => ({ text, confidence: 0.9, startMs, endMs });

/* مقاطعُ كروم كما سجّلها المسجِّل في تلك الجولة: `timecode` المتصفّح، ولحظةُ الوصول بعد بدء التسجيل. */
const CHROME = { timecodes: [0, 1560.5, 3118.8, 4619.3, 6179.6], arrivals: [1566, 3125, 4624, 6185, 7741] };
const chromeClock = () => {
  const clock = new ChunkTimeline(1000);
  CHROME.timecodes.forEach((tc, i) => clock.add(i, tc, 1000 + CHROME.arrivals[i]));
  return clock;
};

test('the chunk clock is measured: Chrome cuts 1500 and 1560 ms chunks, not 1500 exactly', () => {
  const clock = chromeClock();
  assert.equal(clock.startOf(1), 1560.5);
  assert.equal(clock.startOf(3), 4619.3);
  assert.equal(clock.endOf(2), 4619.3, 'a chunk ends where the next begins');
  assert.equal(clock.endOf(4), 7741, 'the newest chunk ends when it arrived, until the next one says otherwise');
  assert.equal(clock.indexAt(4700), 3);
  assert.equal(clock.indexAt(0), 0);
  assert.equal(clock.indexAt(9000), 5, 'past the last chunk, the grid continues from its end');
  /* وبساعة الشبكة: المقطعُ الرابع يبدأ عند ٤٥٠٠ — متأخّرًا ١١٩ ملّي ثانية، ويتراكم ٣٥ في كلّ مقطع. */
  assert.equal(GRID_CLOCK.startOf(3), 3 * CHUNK_MS);
  assert.ok(clock.startOf(3) - GRID_CLOCK.startOf(3) > 100);
});

test('without a timecode (Safari), the chunk clock is the arrival time of the chunk before', () => {
  const clock = new ChunkTimeline(500);
  [2060, 3620, 5120].forEach((at, i) => clock.add(i, undefined, at));
  assert.equal(clock.startOf(0), 0);
  assert.equal(clock.startOf(1), 1560);
  assert.equal(clock.startOf(2), 3120);
  assert.equal(clock.endOf(2), 4620);
});

test('a first timecode other than zero is the origin, not an offset carried into every chunk', () => {
  const clock = new ChunkTimeline(0);
  [1234.5, 2794.5, 4294.5].forEach((tc, i) => clock.add(i, tc, 1600 * (i + 1)));
  assert.equal(clock.startOf(1), 1560);
  assert.equal(clock.startOf(2), 3060);
});

test('the windows read the clock they are given — and the grid by default, as before', () => {
  const clock = chromeClock();
  const window = catchUpWindow(4, 4, false, 4000, clock);
  assert.equal(window.first, 1, 'the pending word at 4000 − 300 ms lies in chunk 2; the usual window starts at chunk 1');
  assert.equal(window.startMs, 1560.5);
  assert.equal(window.endMs, 7741);
  assert.equal(window.commitUntilMs, 7741 - 900);
  assert.deepEqual(recognitionWindow(4, false), { first: 1, headed: true, startMs: 1500, endMs: 7500, commitUntilMs: 6600 });
});

test('a word held at the edge of one window is committed from the next, though its start moved 240 ms earlier (the real case)', () => {
  /*
   * الجولةُ الحيّة، الآية ٥٥:٢٤ «وَلَهُ ٱلۡجَوَارِ»: في النافذة الأولى ثُبّتت «وَلَهُ» وأُمسكت «الْجَوَرُ»
   * عند الحافّة. وفي التالية وضع Whisper بدايةَ «الْجَوَارِ» قبل آخر مُثبَّتٍ بمئتين وأربعين ملّي ثانية
   * — فطرحتها القاعدةُ القديمة «مكرّرة»، ولم تُثبَّت قطّ، وصارت «أسقطتَ».
   */
  const first = commitWords([word('وَمَا', 0, 600), word('تُكَذِّبَا', 600, 2840), word('وَلَهُ', 4120, 4980), word('الْجَوَرُ', 4980, 5380)], 31_500, 36_600, 32_100);
  assert.deepEqual(first.committed.map(w => w.text), ['تُكَذِّبَا', 'وَلَهُ']);
  assert.equal(first.committedUntilMs, 36_480);
  const next = commitWords(
    [word('وَهُ', 0, 240), word('الْجَوَارِ', 240, 1320), word('انْشَآتُ', 2540, 3800), word('فِي', 3800, 4000), word('الْبَحْرِ', 4000, 4980), word('كَالْأَرْضِ', 4980, 5500)],
    36_000, 41_100, first.committedUntilMs,
  );
  assert.deepEqual(next.committed.map(w => w.text), ['الْجَوَارِ', 'انْشَآتُ', 'فِي', 'الْبَحْرِ'], 'the held word is committed, and the tail of «وَلَهُ» is not committed twice');
  assert.ok(36_000 + 240 < first.committedUntilMs - 80, 'the old rule (a start within 80 ms of the last commit) threw «الْجَوَارِ» away');
  assert.equal(next.committed[0].startMs, 36_240, 'committed words carry their time from the start of the recitation');
});

test('the edge is read by the same midpoint: what is new and not yet committed', () => {
  assert.deepEqual(edgeWords([word('وَلَهُ', 4120, 4980), word('الْجَوَرُ', 4980, 5380)], 31_500, 36_600, 36_480), ['الْجَوَرُ']);
  assert.deepEqual(edgeWords([word('وَهُ', 0, 240), word('الْجَوَارِ', 240, 1320)], 36_000, 36_900, 36_480), ['الْجَوَارِ']);
});

test('before the face is entered, only the last words heard are kept — a refrain before the face does not become a gap on it', () => {
  const heard = Array.from({ length: 60 }, (_, i) => word(`w${i}`, i * 500, i * 500 + 400));
  assert.equal(keepFaceEntry(heard, -1).length, PREFACE_WORDS);
  assert.equal(keepFaceEntry(heard, -1)[0].text, `w${60 - PREFACE_WORDS}`);
  assert.equal(keepFaceEntry(heard, 0).length, PREFACE_WORDS, 'one matched word at the face\'s start is not yet an entry');
  assert.equal(keepFaceEntry(heard, 1).length, 60, 'once the frontier passes the first word, nothing is dropped');
  assert.equal(keepFaceEntry(heard.slice(0, 10), -1).length, 10);
});

test('the tone drops only what a tone could make: a short sound mostly inside its window', () => {
  const tone = alertWindow(10_000);
  const face = new Set(['الثقلان']);
  const out = dropWordsUnderAlert([
    word('الثَّقَلَاءُ', 9_800, 10_900),    // «الثقلان» misheard, a second long, under the tone: a reading, kept
    word('شش', 10_000, 10_150),            // short and inside: what an echo makes, dropped
    word('يا', 10_380, 10_900),            // short, but mostly after the window: kept
  ], [tone], text => face.has(text));
  assert.deepEqual(out.dropped.map(w => w.text), ['شش']);
  assert.deepEqual(out.kept.map(w => w.text), ['الثَّقَلَاءُ', 'يا']);
  assert.ok(ALERT_ECHO_MAX_MS < 1100);
});

test('the page commits with the measured clock and the midpoint, and trims before the face', () => {
  const screen = readFileSync(new URL('../src/components/participant/MushafListens.tsx', import.meta.url), 'utf8');
  assert.match(screen, /commitWords\(words, windowStartMs, commitUntilMs, committedUntil\.current\)/);
  assert.match(screen, /catchUpWindow\(index, finalChunk \? index : newest, finalChunk, committedUntil\.current, clock\)/);
  assert.equal((screen.match(/heardWords\.current = keepFaceEntry\(/g) || []).length, 2, 'both the follow and the judging paths trim before the face');
});
