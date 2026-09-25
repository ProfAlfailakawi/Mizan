/*
 * قراءةُ جولةِ «يسمعك» الحيّة: أرقامٌ معروفةٌ من جولةٍ مصنوعة، تُقرأ كما هي.
 *
 * فالأرقامُ التي تُنشر من هذه الأداة هي التي يُحكم بها على كلّ تعديلٍ في السماع — فإن
 * أخطأت القراءةُ حُكم على التعديل بغير ما فعل.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeRun, median, quantile, similarity } from '../tools/live-listen/analyze';
import type { LiveRun } from '../tools/live-listen/run';

/* تلاوةٌ من ثلاث كلمات، والملفُّ يبدأ صوتُه عند ٣٠ ملّي ثانية. */
const words = [
  { surah: 55, ayah: 19, pos: 1, text: 'مَرَجَ', startMs: 30, endMs: 650 },
  { surah: 55, ayah: 19, pos: 2, text: 'ٱلْبَحْرَيْنِ', startMs: 660, endMs: 1930 },
  { surah: 55, ayah: 19, pos: 3, text: 'يَلْتَقِيَانِ', startMs: 1940, endMs: 5200 },
];
const ONSET = 10_000;       // أوّلُ صوتٍ في الصفحة عند ١٠ ث من زمنها
const at = (sec: number) => ONSET - 30 + sec * 1000; // زمنُ الصفحة لزمنٍ في التسجيل

function run(mode: 'normal' | 'veil', trans: [number, number, string][], net: LiveRun['net'] = []): LiveRun {
  return {
    meta: { label: `t-${mode}`, mode, page: 532, origin: 'https://example', build: 'abc', startedAt: '', bundles: [] },
    recitation: { surah: 55, fromAyah: 19, toAyah: 19, reciter: 'x', speechMs: 5200, totalMs: 9000, words, ayahs: [] },
    faceWords: words.map((w, index) => ({ index, text: w.text, surah: 55, ayah: 19, ayahWordIndex: w.pos, endsAyah: index === 2 })),
    rec: { gum: ONSET - 100, onset: ONSET, trans }, clickAt: ONSET - 400, net, report: null,
  };
}

test('a word shown after it was said has a delay from the end of its utterance', () => {
  const r = analyzeRun(run('normal', [[at(0), 0, '-|-|-'], [at(2.65), 0, 'done|-|-'], [at(6.2), 2, 'done|-|-']]));
  assert.equal(r.words[0].shown, 2.65);
  assert.equal(r.summary.said, 3);
  assert.equal(r.summary.shown, 2);
  assert.equal(r.summary.delayMedian, 1, 'word 3 said by 5.2 s, shown at 6.2 s; word 1 by 0.65 s, shown at 2.65 s → median of [2, 1]');
  assert.equal(r.summary.early, 0);
});

test('a word shown before it starts is early, and says by how much', () => {
  const r = analyzeRun(run('normal', [[at(0.5), 2, 'pen|-|-']]));
  assert.equal(r.summary.early, 1);
  assert.equal(r.summary.earliest, 1.4, '«يلتقيان» starts at 1.94 s, shown at 0.54 s');
});

test('a correct word that ends marked is counted red; one whose mark was lifted is not', () => {
  const r = analyzeRun(run('normal', [[at(3), 1, 'done|-|substituted'], [at(3), 0, 'done|-|substituted'], [at(4), 0, 'done|-|-']]));
  assert.equal(r.summary.wrongRed, 1);
  assert.equal(r.words[1].markedAtEnd, 'substituted');
  assert.equal(r.words[0].markedAtEnd, null);
});

test('under the veil, showing means unveiling — and the drop at «ابدأ» is measured', () => {
  const r = analyzeRun(run('veil', [
    [ONSET - 400, 0, '-|-|-'], [ONSET - 390, 0, '-|-|-'], [ONSET - 5, 0, '-|V|-'], // الحجابُ سقط عند الضغط وعاد بعد الإذن
    [at(1.2), 0, '-|-|-'],
  ]));
  assert.equal(r.words[0].shown, 1.2);
  assert.equal(r.summary.veilDrop, 0.4);
});

test('the listener lag reads the last matched word of each reply', () => {
  const net: LiveRun['net'] = [
    { kind: 'recognise', sentAt: at(1), at: at(3), status: 200, body: { words: [{ text: 'مرج' }, { text: 'البحرين' }] } },
    { kind: 'recognise', sentAt: at(5), at: at(8.2), status: 200, body: { words: [{ text: 'البحرين' }, { text: 'يلتقيان' }] } },
  ];
  const r = analyzeRun(run('normal', [], net));
  assert.deepEqual(r.lag.map(p => [p.ayah, p.pos, p.lag]), [[19, 2, 1.1], [19, 3, 3]]);
  assert.equal(r.summary.recogniseMedian, 2, 'request round trips of 2 s and 3.2 s');
});

test('a silent microphone is refused, not read as a perfect run', () => {
  assert.throws(() => analyzeRun({ ...run('normal', []), rec: { gum: 1, onset: null, trans: [] } }), /NO_AUDIO/);
});

test('helpers', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 10);
  assert.equal(similarity('يلتقيان', 'يلتقيان'), 1);
  assert.ok(similarity('تكذبان', 'تكذبا') > 0.8);
  assert.equal(similarity('', 'x'), 0);
});
