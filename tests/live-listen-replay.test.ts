/*
 * إعادةُ جولةٍ على منطق الصفحة: جولةٌ مصنوعةٌ جوابُها معلوم.
 *
 * ثلاثُ كلمات (٥٥:١٩)، وجوابان من المستمع: الأوّلُ يثبّت كلمتين ويُمسك الثالثةَ عند حافّته، والثاني
 * يعيدها وقد تزحزحت بدايتُها — فتُثبَّت بمنتصفها، ويتبعها القلمُ كلَّها ولا «خطأ».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { replayRun } from '../tools/live-listen/replay';
import type { LiveRun } from '../tools/live-listen/run';

const words = [
  { surah: 55, ayah: 19, pos: 1, text: 'مَرَجَ', startMs: 30, endMs: 650 },
  { surah: 55, ayah: 19, pos: 2, text: 'ٱلۡبَحۡرَيۡنِ', startMs: 660, endMs: 1930 },
  { surah: 55, ayah: 19, pos: 3, text: 'يَلۡتَقِيَانِ', startMs: 1940, endMs: 5200 },
];
const START = 9900;                  // بدءُ التسجيل على ساعة الصفحة
const chunk = (k: number) => [START + (k + 1) * 1500, k * 1500, 4000] as [number, number, number];
const gate = { reading: 'hafs', word: 'OPEN', tashkeel: 'CLOSED' };
const heard = (text: string, startMs: number, endMs: number) => ({ text, confidence: 0.95, startMs, endMs });

const run: LiveRun = {
  meta: { label: 'replay-fixture', mode: 'normal', page: 532, origin: 'https://example', build: null, startedAt: '', bundles: [] },
  recitation: { range: '55:19-19', surah: 55, fromAyah: 19, toAyah: 19, reciter: 'x', speechMs: 5200, totalMs: 9000, words, ayahs: [] },
  faceWords: words.map((w, index) => ({ index, text: w.text, surah: 55, ayah: 19, ayahWordIndex: w.pos, endsAyah: index === 2 })),
  rec: { gum: START - 20, onset: 10_000, trans: [], recorders: [{ startedAt: START, slice: 1500, mime: 'audio/webm', chunks: [0, 1, 2, 3, 4, 5].map(chunk) }] },
  clickAt: START - 400,
  net: [
    /* النافذةُ ٠–٤٥٠٠: «مرج» و«البحرين» تُثبَّتان، و«يلتقيان» تنتهي بعد حدّ التثبيت (٣٦٠٠) فتُمسك. */
    { kind: 'recognise', sentAt: START + 3 * 1500 + 10, at: START + 3 * 1500 + 1100, status: 200,
      body: { gate, words: [heard('مَرَجَ', 30, 650), heard('الْبَحْرَيْنِ', 660, 1930), heard('يَلْتَقِيَانِ', 1940, 4400)] } },
    /* النافذةُ من ١٥٠٠: «يلتقيان» تعود وبدايتُها قبل آخر مُثبَّتٍ (١٩٣٠) بمئتين وأربعين — كما في الجولة الحيّة —
     * فتطرحها القاعدةُ القديمة (البدايةُ بعد الحدّ بثمانين على الأكثر)، ومنتصفُها بعد الحدّ. */
    { kind: 'recognise', sentAt: START + 6 * 1500 + 10, at: START + 6 * 1500 + 1100, status: 200,
      body: { gate, words: [heard('يَلْتَقِيَانِ', 190, 3700)] } },
  ],
  report: null,
};

test('a recorded run is replayed on the page\'s logic: the held word is committed from the next window, and nothing is marked', () => {
  const r = replayRun(run);
  assert.equal(r.followed, 3);
  assert.equal(r.committed, 3);
  assert.deepEqual(r.falseMarks, []);
  assert.deepEqual(r.early, []);
});

test('the recording page\'s clock can be the measured one, from the recorder\'s chunk log', () => {
  assert.equal(replayRun(run, 'measured').followed, 3);
  const { recorders: _gone, ...rec } = run.rec;
  assert.throws(() => replayRun({ ...run, rec }, 'measured'), /NO_CHUNK_LOG/);
});
