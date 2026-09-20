/*
 * القياسُ الذي يفتح البوّابة — وهذه الاختباراتُ تحرس أن يقيس ولا يخترع.
 *
 * والنصوصُ هنا من حزمة الرواية نفسِها، لا من كتابةٍ بيد: نصٌّ قرآنيٌّ يُكتب في
 * اختبارٍ نصٌّ مُختلَق مهما بدا صحيحًا.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregate, buildAsrBenchmarkReport, measureItem, p95, validateManifest,
  type BenchmarkManifest, type ItemMeasurement,
} from '../server/asr-benchmark-runner';
import { recitationJudgingGate } from '../server/recitation-asr-contract';
import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { splitAyahWords } from '../server/practice-face-service';
import { quranSkeleton } from '../src/lib/quran-orthography';
import type { HeardWord } from '../src/lib/recitation-diff';

/** آيةٌ من حزمة حفصٍ نفسِها — مشكولةٌ كما هي. */
const ayah = (surah: number, no: number) => {
  const found = loadIslamwebReadingPackage('hafs').verses
    .find((v: { sura_no: number; aya_no: number }) => v.sura_no === surah && v.aya_no === no);
  assert.ok(found, `لم تُقرأ الآية ${surah}:${no}`);
  return found!.aya_text as string;
};

const REFERENCE = ayah(1, 2);
const heardOf = (texts: string[], confidence = 0.9): HeardWord[] => texts.map(text => ({ text, confidence }));
const perfect = () => heardOf(splitAyahWords(REFERENCE));

const manifest = (over: Partial<BenchmarkManifest> = {}): BenchmarkManifest => ({
  reading: 'hafs', datasetReading: 'hafs', datasetId: 'owner-corpus-2026',
  referenceIncludesDiacritics: true,
  approvedThresholds: { maxWordErrorRate: 0.1, maxDiacriticErrorRate: 0.06, maxP95LatencyMs: 200, minSampleCount: 2 },
  approvedBy: ['reviewer-one', 'reviewer-two'],
  slices: ['child', 'adult', 'noise'].map(name => ({ name, items: [{ audio: `${name}-1.webm`, reference: REFERENCE }] })),
  ...over,
});

test('a flawless recitation measures zero error', () => {
  const measured = measureItem(REFERENCE, perfect(), 120, true);
  assert.equal(measured.wordErrors, 0);
  assert.equal(measured.diacriticErrors, 0);
  assert.equal(measured.words, splitAyahWords(REFERENCE).length);
});

test('the confidence floor is not applied while measuring — that would hide half the errors', () => {
  /*
   * فالعتبةُ أداةُ **عرض**: ما دونها لا يُقال للطالب. أمّا القياسُ فيعدّ ما أخطأ فيه
   * المحرّكُ كلَّه — ومن قاس بعتبةِ العرض أخرج محرّكًا رديئًا في صورة محرّكٍ ممتاز.
   */
  const words = splitAyahWords(REFERENCE);
  const wrong = heardOf([...words.slice(0, words.length - 1), 'ٱلنَّاسِ'], 0.01);
  const measured = measureItem(REFERENCE, wrong, 100, false);
  assert.equal(measured.wordErrors, 1, 'خطأٌ بثقةٍ ضعيفةٍ لم يُعدّ');
  assert.equal(measured.diacriticErrors, null, 'قِيست الحركةُ ولم تُطلب');
});

test('a skipped word, a substituted word and an added word all count', () => {
  const words = splitAyahWords(REFERENCE);
  const measured = measureItem(REFERENCE, heardOf([...words.slice(1), 'آمين']), 100, false);
  assert.ok(measured.wordErrors >= 2, `أخطاءٌ معدودة: ${measured.wordErrors}`);
});

test('a slice where one item was never measured for vowels reports no vowel rate at all', () => {
  /* فنصفُ قياسٍ ليس قياسًا، ولا يُسدّ نقصُه بصفر. */
  const items: ItemMeasurement[] = [
    { words: 4, wordErrors: 0, diacriticErrors: 0, latencyMs: 100 },
    { words: 4, wordErrors: 0, diacriticErrors: null, latencyMs: 100 },
  ];
  assert.equal(aggregate('child', items).diacriticErrorRate, undefined);
  const whole: ItemMeasurement[] = items.map(i => ({ ...i, diacriticErrors: 1 }));
  assert.equal(aggregate('child', whole).diacriticErrorRate, 2 / 8);
});

test('p95 is taken by order, never by an average', () => {
  assert.equal(p95([10, 20, 30, 40, 1000]), 1000);
  assert.equal(p95([5]), 5);
  assert.equal(p95([]), 0);
  assert.equal(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
});

test('a manifest missing child, adult or noise is refused before a single engine call', () => {
  for (const drop of ['child', 'adult', 'noise']) {
    const bad = manifest({ slices: manifest().slices.filter(s => s.name !== drop) });
    assert.throws(() => validateManifest(bad), new RegExp(`MISSING_SLICE:${drop}`));
  }
  assert.doesNotThrow(() => validateManifest(manifest()));
});

test('a claim that the references are diacritized is measured, not believed', () => {
  /*
   * فمُعطًى يقول «نصوصي مشكولة» ونصوصُه بلا حركةٍ يُخرج خطأَ حركةٍ صفرًا — لا لأنّ
   * المحرّكَ مصيب، بل لأنّه لم يُقابَل بحركةٍ قطّ. فتُفتح بوّابةُ الحركة على لا شيء.
   */
  const bare = quranSkeleton(REFERENCE);
  const lying = manifest({ slices: manifest().slices.map(s => ({ ...s, items: [{ audio: 'x.webm', reference: bare }] })) });
  assert.throws(() => validateManifest(lying), /REFERENCE_NOT_DIACRITIZED/);
  /* وإن لم يدّعِ التشكيلَ فلا شيءَ يُنكر عليه — ويبقى بابُ الحركة مغلقًا في البوّابة. */
  assert.doesNotThrow(() => validateManifest({ ...lying, referenceIncludesDiacritics: false }));
});

test('one approver cannot approve the thresholds that judge his own engine', () => {
  for (const approvedBy of [[], ['one'], ['one', 'one'], ['one', '   ']]) {
    assert.throws(() => validateManifest(manifest({ approvedBy })), /NOT_DUAL_APPROVED/);
  }
});

test('a report built from measurements is one the gate itself accepts', () => {
  const slices = ['child', 'adult', 'noise'].map(name =>
    aggregate(name, [{ words: 100, wordErrors: 5, diacriticErrors: 3, latencyMs: 150 }, { words: 100, wordErrors: 4, diacriticErrors: 2, latencyMs: 160 }]));
  const report = buildAsrBenchmarkReport(manifest(), 'candidate-model-7', slices, '2026-09-20T00:00:00.000Z');
  /*
   * ولا يُقرَّب الرقمُ في التقرير: يُحفظ كما حُسب.
   *
   * فالتقريبُ إلى منزلةٍ قد يُنزل مقياسًا فوق عتبته إلى تحتها، فيفتح بابًا أغلقه
   * القياس. والفرقُ العائم يُحتمل في المقارنة هنا، ولا يُحتمل في الورقة.
   */
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  close(report.metrics.wordErrorRate, 0.045);
  close(report.metrics.diacriticErrorRate as number, 0.025);
  assert.equal(report.metrics.sampleCount, 6);
  const gate = recitationJudgingGate('hafs', report);
  assert.equal(gate.word, 'OPEN');
  assert.equal(gate.tashkeel, 'OPEN');
  assert.equal(gate.modelVersion, 'candidate-model-7');
});

test('a measured engine that misses its own approved threshold produces a report that closes the gate', () => {
  /* ولا يُكتم: التقريرُ يُبنى ويُحفظ، والبابُ يبقى مغلقًا ويُقال لماذا. */
  const slices = ['child', 'adult', 'noise'].map(name =>
    aggregate(name, [{ words: 100, wordErrors: 40, diacriticErrors: 3, latencyMs: 150 }]));
  const report = buildAsrBenchmarkReport(manifest(), 'candidate-model-7', slices);
  const gate = recitationJudgingGate('hafs', report);
  assert.equal(gate.word, 'CLOSED');
  assert.ok(gate.reasons.includes('WORD_ERROR_RATE'), gate.reasons.join(','));
});

test('a corpus recorded in another riwayah closes the gate by name, whatever its numbers', () => {
  const slices = ['child', 'adult', 'noise'].map(name =>
    aggregate(name, [{ words: 1000, wordErrors: 0, diacriticErrors: 0, latencyMs: 20 }]));
  const report = buildAsrBenchmarkReport(manifest({ reading: 'warsh', datasetReading: 'hafs' }), 'm', slices);
  const gate = recitationJudgingGate('warsh', report);
  assert.equal(gate.word, 'CLOSED');
  assert.ok(gate.reasons.includes('DATASET_OTHER_RIWAYAH'), gate.reasons.join(','));
});

test('the builder refuses to emit a report its own judge would reject on shape', () => {
  const slices = ['child', 'adult', 'noise'].map(name => aggregate(name, [{ words: 10, wordErrors: 0, diacriticErrors: 0, latencyMs: 10 }]));
  assert.throws(() => buildAsrBenchmarkReport(manifest({ datasetId: '   ' }), 'm', slices), /IDENTITY_INVALID/);
  assert.throws(() => buildAsrBenchmarkReport(manifest(), '   ', slices), /IDENTITY_INVALID/);
});
