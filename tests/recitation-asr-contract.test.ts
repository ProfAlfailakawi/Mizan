/*
 * مَن يُؤذن له أن يقول «أخطأت» — وهذه الاختباراتُ تحرس بابَ الإذن.
 *
 * والأرقامُ في تقارير هذا الملفّ **مُفتعَلةٌ للبنية ولا تدّعي قياسَ محرّكٍ حقيقيّ**:
 * اسمُ مُعطاها `fixture-not-a-real-measurement` كي لا يُقرأ يومًا على أنه قياس. والمقيسُ
 * هنا هو **سلوكُ البوّابة**: أتفتح حيث يجب، وتُغلق حيث يجب، وتُسمّي سببَها.
 *
 * والقياسُ الحقيقيُّ الذي بُني عليه كلُّ هذا واحد، وهو مُثبَتٌ في مكانه: قارئُ ورشٍ
 * يقرأ صوابًا فيُقابَل بنصّ حفصٍ — ٢٫٢٪ خطأً كاذبًا في الكلمة، و**٥٨٫٠٪ في الحركة**.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASR_BENCHMARK_VERSION, MAX_WORDS_PER_CHUNK, MAX_WORD_LENGTH,
  diffOptionsForGate, evaluateAsrBenchmark, readRecognitionResponse, recitationJudgingGate,
  type AsrBenchmarkReport,
} from '../server/recitation-asr-contract';
import { DEFAULT_DIFF_OPTIONS } from '../src/lib/recitation-diff';

function report(over: Partial<AsrBenchmarkReport> = {}): AsrBenchmarkReport {
  const base: AsrBenchmarkReport = {
    version: ASR_BENCHMARK_VERSION,
    reading: 'hafs',
    datasetReading: 'hafs',
    modelVersion: 'fixture-model-1',
    datasetId: 'fixture-not-a-real-measurement',
    referenceIncludesDiacritics: true,
    measuredAt: '2026-09-20T00:00:00.000Z',
    metrics: { wordErrorRate: 0.08, diacriticErrorRate: 0.05, p95LatencyMs: 180, sampleCount: 4000 },
    approvedThresholds: { maxWordErrorRate: 0.1, maxDiacriticErrorRate: 0.06, maxP95LatencyMs: 200, minSampleCount: 1000 },
    slices: [
      { name: 'child', sampleCount: 1200, wordErrorRate: 0.09, diacriticErrorRate: 0.055, p95LatencyMs: 190 },
      { name: 'adult', sampleCount: 1800, wordErrorRate: 0.06, diacriticErrorRate: 0.04, p95LatencyMs: 170 },
      { name: 'noise', sampleCount: 1000, wordErrorRate: 0.1, diacriticErrorRate: 0.06, p95LatencyMs: 195 },
    ],
    approvedBy: ['reviewer-one', 'reviewer-two'],
  };
  return { ...base, ...over };
}

test('a report that meets its own approved thresholds opens both doors', () => {
  const gate = recitationJudgingGate('hafs', report());
  assert.equal(gate.word, 'OPEN');
  assert.equal(gate.tashkeel, 'OPEN');
  assert.deepEqual(gate.reasons, []);
  assert.equal(gate.modelVersion, 'fixture-model-1');
});

test('no report at all: both doors closed, and the reason is named', () => {
  for (const missing of [null, undefined]) {
    const gate = recitationJudgingGate('hafs', missing);
    assert.equal(gate.word, 'CLOSED');
    assert.equal(gate.tashkeel, 'CLOSED');
    assert.deepEqual(gate.reasons, ['ASR_BENCHMARK_NOT_AVAILABLE']);
    assert.equal(gate.modelVersion, null);
  }
});

test("a riwayah's door is never opened by another riwayah's report", () => {
  /*
   * وهذا هو القياسُ مُحوَّلًا إلى شرط: تقريرُ حفصٍ — وهو ناجحٌ تامّ — لا يفتح ورشًا.
   * ولو فُتح، لقيل لقارئ ورشٍ مصيبٍ «أخطأت» في ٥٨٪ من كلماته.
   */
  const excellent = report({ metrics: { wordErrorRate: 0.001, diacriticErrorRate: 0.001, p95LatencyMs: 20, sampleCount: 100000 } });
  const gate = recitationJudgingGate('warsh', excellent);
  assert.equal(gate.word, 'CLOSED');
  assert.equal(gate.tashkeel, 'CLOSED');
  assert.deepEqual(gate.reasons, ['ASR_BENCHMARK_OTHER_RIWAYAH']);
});

test('a report measured on another riwayah than it claims is refused', () => {
  // تقريرٌ يقول «هذا إذنُ ورش» ومُعطاه حفص — تنازلٌ بين الروايات في ثوب تقرير.
  const gate = recitationJudgingGate('warsh', report({ reading: 'warsh', datasetReading: 'hafs' }));
  assert.equal(gate.word, 'CLOSED');
  assert.ok(gate.reasons.includes('DATASET_OTHER_RIWAYAH'), gate.reasons.join(','));
});

test('the word door may open while the tashkeel door stays shut — and says why', () => {
  const cases: [Partial<AsrBenchmarkReport>, string][] = [
    [{ referenceIncludesDiacritics: false }, 'REFERENCE_NOT_DIACRITIZED'],
    [{ metrics: { wordErrorRate: 0.08, p95LatencyMs: 180, sampleCount: 4000 } }, 'DIACRITIC_ERROR_RATE_NOT_MEASURED'],
    [{ approvedThresholds: { maxWordErrorRate: 0.1, maxP95LatencyMs: 200, minSampleCount: 1000 } }, 'DIACRITIC_THRESHOLD_NOT_APPROVED'],
    [{ metrics: { wordErrorRate: 0.08, diacriticErrorRate: 0.5, p95LatencyMs: 180, sampleCount: 4000 } }, 'DIACRITIC_ERROR_RATE'],
  ];
  for (const [over, reason] of cases) {
    const gate = recitationJudgingGate('hafs', report(over));
    assert.equal(gate.word, 'OPEN', `${reason}: the word door must stay open`);
    assert.equal(gate.tashkeel, 'CLOSED', `${reason}: the tashkeel door must shut`);
    assert.ok(gate.reasons.includes(reason), `${reason} not in ${gate.reasons.join(',')}`);
  }
});

test('a slice with no diacritic measurement shuts the tashkeel door by name', () => {
  const gate = recitationJudgingGate('hafs', report({
    slices: [
      { name: 'child', sampleCount: 1200, wordErrorRate: 0.09, p95LatencyMs: 190 },
      { name: 'adult', sampleCount: 1800, wordErrorRate: 0.06, diacriticErrorRate: 0.04, p95LatencyMs: 170 },
      { name: 'noise', sampleCount: 1000, wordErrorRate: 0.1, diacriticErrorRate: 0.06, p95LatencyMs: 195 },
    ],
  }));
  assert.equal(gate.word, 'OPEN');
  assert.equal(gate.tashkeel, 'CLOSED');
  assert.ok(gate.reasons.includes('SLICE_CHILD_DIACRITIC_NOT_MEASURED'), gate.reasons.join(','));
});

test('a missing child, adult or noise slice closes the word door', () => {
  /* المتسابقون أطفالٌ في قاعاتٍ لا صمتَ فيها — فقياسٌ على قرّاءٍ بالغين في استوديو ليس قياسَهم. */
  for (const drop of ['child', 'adult', 'noise']) {
    const gate = recitationJudgingGate('hafs', report({ slices: report().slices.filter(s => s.name !== drop) }));
    assert.equal(gate.word, 'CLOSED', `dropping ${drop} must close the door`);
    assert.ok(gate.reasons.includes(`MISSING_SLICE_${drop.toUpperCase()}`), gate.reasons.join(','));
  }
});

test('a single reviewer cannot approve the thresholds that judge him', () => {
  for (const approvedBy of [[], ['one'], ['one', 'one'], ['one', '  ']]) {
    const gate = recitationJudgingGate('hafs', report({ approvedBy }));
    assert.equal(gate.word, 'CLOSED');
    assert.ok(gate.reasons.includes('THRESHOLDS_NOT_DUAL_APPROVED'), gate.reasons.join(','));
  }
});

test('a metric worse than its own approved threshold closes the door, each by name', () => {
  const cases: [Partial<AsrBenchmarkReport>, string][] = [
    [{ metrics: { wordErrorRate: 0.4, diacriticErrorRate: 0.05, p95LatencyMs: 180, sampleCount: 4000 } }, 'WORD_ERROR_RATE'],
    [{ metrics: { wordErrorRate: 0.08, diacriticErrorRate: 0.05, p95LatencyMs: 9000, sampleCount: 4000 } }, 'LATENCY'],
    [{ metrics: { wordErrorRate: 0.08, diacriticErrorRate: 0.05, p95LatencyMs: 180, sampleCount: 3 } }, 'SAMPLE_COUNT'],
  ];
  for (const [over, reason] of cases) {
    const gate = recitationJudgingGate('hafs', report(over));
    assert.equal(gate.word, 'CLOSED');
    assert.ok(gate.reasons.includes(reason), `${reason} not in ${gate.reasons.join(',')}`);
  }
});

test('a slice that fails while the average passes still closes the door', () => {
  // ومتوسّطٌ يمرّ بشريحةٍ ساقطةٍ يخفي أنّ الأطفالَ هم الذين يسقطون.
  const gate = recitationJudgingGate('hafs', report({
    slices: report().slices.map(s => (s.name === 'child' ? { ...s, wordErrorRate: 0.9 } : s)),
  }));
  assert.equal(gate.word, 'CLOSED');
  assert.ok(gate.reasons.includes('SLICE_CHILD_WORD_ERROR_RATE'), gate.reasons.join(','));
});

test('a structurally broken report closes the gate instead of throwing at the student', () => {
  /* فسقوطُ حكمٍ أهونُ من انقطاع جلسةِ طالبٍ في منتصف وجهه. */
  const broken = [
    { version: 'MIZAN-QURAN-ASR-BENCHMARK-99' },
    { datasetReading: 'not-a-riwayah' as never },
    { modelVersion: '   ' },
    { measuredAt: 'yesterday' },
    { metrics: { wordErrorRate: Number.NaN, p95LatencyMs: 10, sampleCount: 10 } },
    { slices: 'three' as never },
  ];
  for (const over of broken) {
    const gate = recitationJudgingGate('hafs', report(over));
    assert.equal(gate.word, 'CLOSED');
    assert.equal(gate.tashkeel, 'CLOSED');
    assert.ok(gate.reasons.some(r => r.startsWith('ASR_BENCHMARK_INVALID:')), gate.reasons.join(','));
  }

  /*
   * ويُسأل عن الرواية قبل البنية — وهو الترتيبُ المقصود: تقريرٌ لروايةٍ أخرى يُردّ
   * باسم الرواية ولو كان مُختلَّ البنية أيضًا، فذاك أدقُّ في بيان سبب المنع.
   */
  const other = recitationJudgingGate('hafs', report({ reading: 'not-a-riwayah' as never }));
  assert.equal(other.word, 'CLOSED');
  assert.deepEqual(other.reasons, ['ASR_BENCHMARK_OTHER_RIWAYAH']);
});

test('a broken report is loud when it is read directly — the silence is only at the gate', () => {
  // والفرقُ مقصود: تقريرٌ مُختلٌّ خطأُ كاتبِه، فيُصاح به حيث يُكتب لا حيث يُقرأ.
  assert.throws(() => evaluateAsrBenchmark(report({ version: 'x' })), /VERSION_INVALID/);
  assert.throws(() => evaluateAsrBenchmark(report({ datasetReading: 'zzz' as never })), /DATASET_READING_INVALID/);
});

test('the diff options cannot be given a tashkeel permission the gate withheld', () => {
  /*
   * حارسُ بناء: `detectTashkeel` يُولَد من البوّابة، فلا موضعَ في الشيفرة يفتحه بيده.
   */
  const open = diffOptionsForGate(recitationJudgingGate('hafs', report()), DEFAULT_DIFF_OPTIONS);
  assert.equal(open.detectTashkeel, true);
  const shut = diffOptionsForGate(recitationJudgingGate('hafs', report({ referenceIncludesDiacritics: false })), DEFAULT_DIFF_OPTIONS);
  assert.equal(shut.detectTashkeel, false);
  const none = diffOptionsForGate(recitationJudgingGate('warsh', null), DEFAULT_DIFF_OPTIONS);
  assert.equal(none.detectTashkeel, false);
  // والعتباتُ تُنقل كما هي ولا تُخترع هنا.
  assert.equal(open.minConfidence, DEFAULT_DIFF_OPTIONS.minConfidence);
  assert.equal(open.minTashkeelConfidence, DEFAULT_DIFF_OPTIONS.minTashkeelConfidence);
});

test('an engine answer is read, not believed', () => {
  const expected = { reading: 'hafs' as const, modelVersion: 'fixture-model-1' };
  const ok = readRecognitionResponse({ reading: 'hafs', modelVersion: 'fixture-model-1', words: [{ text: 'الحمد', confidence: 0.9 }] }, expected);
  assert.equal(ok.words.length, 1);
  assert.equal(ok.words[0].text, 'الحمد');

  const refused: [unknown, RegExp][] = [
    [null, /RESPONSE_INVALID/],
    ['words', /RESPONSE_INVALID/],
    [[{ text: 'a', confidence: 1 }], /RESPONSE_INVALID/],
    [{ modelVersion: 'other', reading: 'hafs', words: [] }, /MODEL_NOT_BENCHMARKED/],
    [{ modelVersion: 'fixture-model-1', words: [] }, /CROSS_RIWAYAH_REJECTED/],
    [{ modelVersion: 'fixture-model-1', reading: 'warsh', words: [] }, /CROSS_RIWAYAH_REJECTED/],
    [{ modelVersion: 'fixture-model-1', reading: 'hafs', words: 'الحمد' }, /RESPONSE_INVALID/],
    [{ modelVersion: 'fixture-model-1', reading: 'hafs', words: [{ text: '', confidence: 1 }] }, /WORD_INVALID/],
    [{ modelVersion: 'fixture-model-1', reading: 'hafs', words: [{ text: 'x'.repeat(MAX_WORD_LENGTH + 1), confidence: 1 }] }, /WORD_INVALID/],
    [{ modelVersion: 'fixture-model-1', reading: 'hafs', words: [{ text: 'الحمد', confidence: 1.2 }] }, /WORD_INVALID/],
    [{ modelVersion: 'fixture-model-1', reading: 'hafs', words: [{ text: 'الحمد', confidence: Number.NaN }] }, /WORD_INVALID/],
    [{ modelVersion: 'fixture-model-1', reading: 'hafs', words: [{ text: 'الحمد' }] }, /WORD_INVALID/],
    [{ modelVersion: 'fixture-model-1', reading: 'hafs', words: [{ text: 'الحمد', confidence: 1, startMs: 900, endMs: 100 }] }, /WORD_INVALID/],
    [{ modelVersion: 'fixture-model-1', reading: 'hafs', words: Array.from({ length: MAX_WORDS_PER_CHUNK + 1 }, () => ({ text: 'و', confidence: 1 })) }, /TOO_LARGE/],
  ];
  for (const [raw, pattern] of refused) {
    assert.throws(() => readRecognitionResponse(raw, expected), pattern, `must refuse: ${JSON.stringify(raw)?.slice(0, 60)}`);
  }
});

test('a chunk at the very limits is accepted — the caps are a fence, not a verdict', () => {
  const expected = { reading: 'hafs' as const, modelVersion: 'fixture-model-1' };
  const full = readRecognitionResponse({
    reading: 'hafs', modelVersion: 'fixture-model-1',
    words: Array.from({ length: MAX_WORDS_PER_CHUNK }, () => ({ text: 'و', confidence: 0 })),
  }, expected);
  assert.equal(full.words.length, MAX_WORDS_PER_CHUNK);
  assert.equal(full.words[0].confidence, 0, 'a zero confidence is a measurement, not a missing value');
});
