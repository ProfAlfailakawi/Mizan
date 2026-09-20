/*
 * عقدُ خدمة التعرّف على الكلام — ومن يُؤذن له أن يقول «أخطأت».
 *
 * طلب المالكُ ما تفعله «ترتيل»: أن يُصاد خطأُ الطالب. وبين ذلك الطلب وبين تنفيذه
 * قياسٌ واحدٌ يحكم كلَّ شيءٍ في هذا الملفّ:
 *
 *   قارئُ ورشٍ يقرأ **صوابًا**، فإن قُوبل بنصّ حفصٍ على ٢٨٧٨ كلمة:
 *     ٦٢ خطأً كاذبًا على مستوى الكلمة  (٢٫٢٪)
 *     ١٦٧٠ خطأً كاذبًا على مستوى الحركة (٥٨٫٠٪)
 *
 * فمحرّكٌ لم يسمع إلا روايةً واحدةً ثمّ حكم على غيرها، يقول لحافظٍ متقنٍ «أخطأت» في
 * أكثر من نصف كلماته. وذلك بعينه ما نهى عنه المالك: **استخدامُ نصّ حفصٍ بدل روايةٍ
 * أخرى، والتنازلُ بين الروايات**.
 *
 * ولذلك لا يكفي أن يوجد محرّكٌ ليُؤذن له. يلزمه:
 *
 *   ١) تقريرُ قياسٍ **لهذه الرواية بعينها**، على نسق تقرير المحاذاة: مقاييسُ
 *      وعتباتٌ يعتمدها اثنان، وشرائحُ طفلٍ وبالغٍ وضجيج — فالمتسابقون أطفالٌ في
 *      قاعاتٍ لا صمتَ فيها.
 *   ٢) و**حكمُ الحركة بابٌ آخر يُفتح وحده**: لا يُفتح إلا إن كان نصُّ المرجع في
 *      القياس مشكولًا، وكان المُعطى من الرواية نفسِها، وقِيس خطأُ الحركة صراحةً.
 *      وبغير ذلك يبقى مغلقًا وإن جاز حكمُ الكلمة.
 *
 * ولا شيءَ هنا يُنشئ رقمًا: العتباتُ تأتي في التقرير ويعتمدها بشران، والمقاييسُ تُقاس
 * خارج هذا النظام. وهذا الملفُّ **يرفض** ولا يقدّر.
 *
 * والبوّابةُ **لا ترمي**: تعذّرٌ في التقرير يُغلقها ويُسمّي سببَه. فسقوطُ حكمٍ أهونُ
 * من انقطاع جلسةِ طالبٍ في منتصف وجهه.
 */

import type { DiffOptions } from '../src/lib/recitation-diff';
import { quranReadingDefinition } from './quran-intelligence-policy';
import type { QuranReadingId } from './quran-intelligence-types';

export const ASR_BENCHMARK_VERSION = 'MIZAN-QURAN-ASR-BENCHMARK-1';

/** الشرائحُ اللازمة — وهي شرائحُ تقرير المحاذاة نفسُها، فالمسموعُ واحد. */
export const REQUIRED_ASR_SLICES = ['child', 'adult', 'noise'] as const;

/** أقصى ما يُقبل من كلماتٍ في مقطعٍ واحد — سياجُ بنيةٍ لا حكمُ جودة. */
export const MAX_WORDS_PER_CHUNK = 256;
/** وأطولُ ما يُقبل من كلمةٍ واحدة — أطولُ كلمةٍ في المصحف دون ذلك بكثير. */
export const MAX_WORD_LENGTH = 64;

export interface AsrBenchmarkSlice {
  name: string;
  sampleCount: number;
  wordErrorRate: number;
  /** وقد يغيب — فيبقى بابُ الحركة مغلقًا. */
  diacriticErrorRate?: number;
  p95LatencyMs: number;
}

export interface AsrBenchmarkReport {
  version: string;
  /** الروايةُ التي يُطلب الإذنُ لها. */
  reading: QuranReadingId;
  /** والروايةُ التي سُجّل بها المُعطى فعلًا — وإن خالفتها فهذا تنازلٌ بين الروايات. */
  datasetReading: QuranReadingId;
  modelVersion: string;
  datasetId: string;
  /** أكان نصُّ المرجع في القياس مشكولًا؟ بغيره لا يُقاس خطأُ حركةٍ أصلًا. */
  referenceIncludesDiacritics: boolean;
  measuredAt: string;
  metrics: { wordErrorRate: number; diacriticErrorRate?: number; p95LatencyMs: number; sampleCount: number };
  approvedThresholds: { maxWordErrorRate: number; maxDiacriticErrorRate?: number; maxP95LatencyMs: number; minSampleCount: number };
  slices: AsrBenchmarkSlice[];
  approvedBy: string[];
}

const rate = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const sliceCode = (name: string) => `SLICE_${String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

export interface AsrBenchmarkVerdict {
  reading: QuranReadingId;
  modelVersion: string;
  datasetId: string;
  measuredAt: string;
  /** أسبابُ منع حكمِ الكلمة — فارغةٌ تعني الإذن. */
  failures: string[];
  /** وأسبابُ منع حكمِ الحركة وحدَه — تُذكر ولو جاز حكمُ الكلمة. */
  tashkeelFailures: string[];
  passed: boolean;
  tashkeelPassed: boolean;
}

/**
 * يقرأ التقريرَ ويحكم عليه — ويرمي إن كان التقريرُ نفسُه مُختلًّا بنيةً.
 *
 * والفرقُ مقصود: تقريرٌ ناقصُ البنية خطأُ مَن كتبه، فيُصاح به. أمّا مقياسٌ لم يبلغ
 * عتبتَه فحكمٌ صحيحٌ بالمنع، فيُذكر في `failures`.
 */
export function evaluateAsrBenchmark(report: AsrBenchmarkReport): AsrBenchmarkVerdict {
  if (!report || typeof report !== 'object') throw new Error('QURAN_ASR_BENCHMARK_INVALID');
  if (report.version !== ASR_BENCHMARK_VERSION) throw new Error('QURAN_ASR_BENCHMARK_VERSION_INVALID');
  const reading = quranReadingDefinition(report.reading);
  const dataset = quranReadingDefinition(report.datasetReading);
  if (!reading || reading.id !== report.reading) throw new Error('QURAN_ASR_BENCHMARK_READING_INVALID');
  if (!dataset || dataset.id !== report.datasetReading) throw new Error('QURAN_ASR_BENCHMARK_DATASET_READING_INVALID');
  if (typeof report.modelVersion !== 'string' || !report.modelVersion.trim()
    || typeof report.datasetId !== 'string' || !report.datasetId.trim()
    || typeof report.measuredAt !== 'string' || Number.isNaN(Date.parse(report.measuredAt)))
    throw new Error('QURAN_ASR_BENCHMARK_IDENTITY_INVALID');
  if (typeof report.referenceIncludesDiacritics !== 'boolean') throw new Error('QURAN_ASR_BENCHMARK_IDENTITY_INVALID');

  const m = report.metrics, t = report.approvedThresholds;
  if (!m || !t || typeof m !== 'object' || typeof t !== 'object') throw new Error('QURAN_ASR_BENCHMARK_METRIC_INVALID');
  if (!rate(m.wordErrorRate) || !positive(m.p95LatencyMs) || !Number.isInteger(m.sampleCount) || m.sampleCount < 1)
    throw new Error('QURAN_ASR_BENCHMARK_METRIC_INVALID');
  if (m.diacriticErrorRate !== undefined && !rate(m.diacriticErrorRate)) throw new Error('QURAN_ASR_BENCHMARK_METRIC_INVALID');
  if (!rate(t.maxWordErrorRate) || !positive(t.maxP95LatencyMs) || !Number.isInteger(t.minSampleCount) || t.minSampleCount < 1)
    throw new Error('QURAN_ASR_BENCHMARK_THRESHOLD_INVALID');
  if (t.maxDiacriticErrorRate !== undefined && !rate(t.maxDiacriticErrorRate)) throw new Error('QURAN_ASR_BENCHMARK_THRESHOLD_INVALID');
  if (!Array.isArray(report.slices)) throw new Error('QURAN_ASR_BENCHMARK_SLICE_INVALID');
  for (const s of report.slices) {
    if (!s || typeof s.name !== 'string' || !s.name.trim() || !Number.isInteger(s.sampleCount) || s.sampleCount < 1
      || !rate(s.wordErrorRate) || !positive(s.p95LatencyMs)
      || (s.diacriticErrorRate !== undefined && !rate(s.diacriticErrorRate)))
      throw new Error(`QURAN_ASR_BENCHMARK_SLICE_INVALID:${s && s.name ? s.name : '?'}`);
  }

  const failures: string[] = [];
  if (report.datasetReading !== report.reading) failures.push('DATASET_OTHER_RIWAYAH');
  if (m.wordErrorRate > t.maxWordErrorRate) failures.push('WORD_ERROR_RATE');
  if (m.p95LatencyMs > t.maxP95LatencyMs) failures.push('LATENCY');
  if (m.sampleCount < t.minSampleCount) failures.push('SAMPLE_COUNT');
  const names = new Set(report.slices.map(s => s.name));
  for (const required of REQUIRED_ASR_SLICES) if (!names.has(required)) failures.push(`MISSING_SLICE_${required.toUpperCase()}`);
  for (const s of report.slices) {
    if (s.wordErrorRate > t.maxWordErrorRate) failures.push(`${sliceCode(s.name)}_WORD_ERROR_RATE`);
    if (s.p95LatencyMs > t.maxP95LatencyMs) failures.push(`${sliceCode(s.name)}_LATENCY`);
  }
  if (!Array.isArray(report.approvedBy) || new Set(report.approvedBy.map(x => String(x).trim()).filter(Boolean)).size < 2)
    failures.push('THRESHOLDS_NOT_DUAL_APPROVED');

  /*
   * وبابُ الحركة يُسأل على حدة، ولا يُفتح بقياسٍ لم يُقصد إليه.
   *
   * فمُعطًى نصُّ مرجعه غيرُ مشكول لا يُقاس عليه خطأُ حركةٍ أصلًا: يُقاس عليه اتّفاقُ
   * الهياكل، ثم يُسمّى خطأَ حركةٍ توسّعًا — وذلك أخطرُ من غياب القياس.
   */
  const tashkeelFailures: string[] = [];
  if (!report.referenceIncludesDiacritics) tashkeelFailures.push('REFERENCE_NOT_DIACRITIZED');
  if (m.diacriticErrorRate === undefined) tashkeelFailures.push('DIACRITIC_ERROR_RATE_NOT_MEASURED');
  if (t.maxDiacriticErrorRate === undefined) tashkeelFailures.push('DIACRITIC_THRESHOLD_NOT_APPROVED');
  if (m.diacriticErrorRate !== undefined && t.maxDiacriticErrorRate !== undefined && m.diacriticErrorRate > t.maxDiacriticErrorRate)
    tashkeelFailures.push('DIACRITIC_ERROR_RATE');
  for (const s of report.slices) {
    if (s.diacriticErrorRate === undefined) { tashkeelFailures.push(`${sliceCode(s.name)}_DIACRITIC_NOT_MEASURED`); continue }
    if (t.maxDiacriticErrorRate !== undefined && s.diacriticErrorRate > t.maxDiacriticErrorRate)
      tashkeelFailures.push(`${sliceCode(s.name)}_DIACRITIC_ERROR_RATE`);
  }

  const passed = failures.length === 0;
  return {
    reading: report.reading, modelVersion: report.modelVersion, datasetId: report.datasetId, measuredAt: report.measuredAt,
    failures, tashkeelFailures, passed, tashkeelPassed: passed && tashkeelFailures.length === 0,
  };
}

export interface RecitationJudgingGate {
  reading: QuranReadingId;
  /** حكمُ الكلمة: أسقطتَ، أبدلتَ، زدتَ. */
  word: 'OPEN' | 'CLOSED';
  /** وحكمُ الحركة وحدَه. */
  tashkeel: 'OPEN' | 'CLOSED';
  modelVersion: string | null;
  reasons: string[];
}

/** بوّابةٌ مغلقةٌ باسم سببها — وهي الحالةُ الافتراضيّة في كلّ طريقٍ لم يُثبَت. */
function closed(reading: QuranReadingId, ...reasons: string[]): RecitationJudgingGate {
  return { reading, word: 'CLOSED', tashkeel: 'CLOSED', modelVersion: null, reasons };
}

/**
 * مَن يُؤذن له أن يقول «أخطأت» لهذه الرواية.
 *
 * ولا تنازلَ: تقريرُ روايةٍ أخرى لا يفتح هذه، ولو كان ممتازًا. فذلك هو الخطأُ
 * المقيسُ نفسُه — ٥٨٪ من كلمات قارئٍ مصيبٍ تُخطَّأ.
 */
export function recitationJudgingGate(reading: QuranReadingId, report: AsrBenchmarkReport | null | undefined): RecitationJudgingGate {
  if (!quranReadingDefinition(reading)) return closed(reading, 'READING_UNKNOWN');
  if (!report) return closed(reading, 'ASR_BENCHMARK_NOT_AVAILABLE');
  if (report.reading !== reading) return closed(reading, 'ASR_BENCHMARK_OTHER_RIWAYAH');
  let verdict: AsrBenchmarkVerdict;
  try {
    verdict = evaluateAsrBenchmark(report);
  } catch (error) {
    return closed(reading, `ASR_BENCHMARK_INVALID:${error instanceof Error ? error.message : 'UNKNOWN'}`);
  }
  if (!verdict.passed) return { reading, word: 'CLOSED', tashkeel: 'CLOSED', modelVersion: verdict.modelVersion, reasons: verdict.failures };
  return {
    reading,
    word: 'OPEN',
    tashkeel: verdict.tashkeelPassed ? 'OPEN' : 'CLOSED',
    modelVersion: verdict.modelVersion,
    reasons: verdict.tashkeelPassed ? [] : verdict.tashkeelFailures,
  };
}

/**
 * خياراتُ المقابلة تُشتقّ من البوّابة ولا تُكتب بيد.
 *
 * وهذا حارسُ بناءٍ لا حارسُ اختبار: ما دام `detectTashkeel` يُولَد من البوّابة وحدَها،
 * فلا موضعَ في الشيفرة يستطيع فتحَه بلا إذنٍ مقيس. ومَن كتبه بيده كتب حكمًا لا سندَ له.
 */
export function diffOptionsForGate(gate: RecitationJudgingGate, thresholds: Pick<DiffOptions, 'minConfidence' | 'minTashkeelConfidence'>): DiffOptions {
  return {
    detectTashkeel: gate.tashkeel === 'OPEN',
    minConfidence: thresholds.minConfidence,
    minTashkeelConfidence: thresholds.minTashkeelConfidence,
  };
}

/** كلمةٌ سمعها المحرّك بعد التحقّق منها. */
export interface RecognisedWord { text: string; confidence: number; startMs?: number; endMs?: number }
export interface RecognisedChunk { reading: QuranReadingId; modelVersion: string; words: RecognisedWord[] }

/**
 * ردُّ المحرّك لا يُصدَّق، يُقرأ.
 *
 * وهذا نسقُ `processAlignmentChunk` نفسُه: نوعانِ يمرّان على أنهما مصفوفة (النصّ
 * والمصفوفةُ المزيّفة)، ورقمٌ يصل `NaN`، وروايةٌ غيرُ التي طُلبت. وكلُّها تُسمّى وتُرفض.
 */
export function readRecognitionResponse(raw: unknown, expected: { reading: QuranReadingId; modelVersion: string }): RecognisedChunk {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('QURAN_ASR_RESPONSE_INVALID');
  const body = raw as Record<string, unknown>;
  const modelVersion = typeof body.modelVersion === 'string' ? body.modelVersion.trim() : '';
  if (!modelVersion || modelVersion !== expected.modelVersion) throw new Error('QURAN_ASR_MODEL_NOT_BENCHMARKED');
  /* والروايةُ تُذكر صراحةً في الردّ: صمتُها ليس موافقةً. */
  if (typeof body.reading !== 'string' || body.reading !== expected.reading) throw new Error('QURAN_ASR_CROSS_RIWAYAH_REJECTED');
  if (!Array.isArray(body.words)) throw new Error('QURAN_ASR_RESPONSE_INVALID');
  if (body.words.length > MAX_WORDS_PER_CHUNK) throw new Error('QURAN_ASR_RESPONSE_TOO_LARGE');
  const words: RecognisedWord[] = [];
  for (const entry of body.words) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('QURAN_ASR_WORD_INVALID');
    const w = entry as Record<string, unknown>;
    const text = typeof w.text === 'string' ? w.text.trim() : '';
    if (!text || text.length > MAX_WORD_LENGTH) throw new Error('QURAN_ASR_WORD_INVALID');
    if (!rate(w.confidence)) throw new Error('QURAN_ASR_WORD_INVALID');
    const startMs = w.startMs === undefined ? undefined : Number(w.startMs);
    const endMs = w.endMs === undefined ? undefined : Number(w.endMs);
    if (startMs !== undefined && !positive(startMs)) throw new Error('QURAN_ASR_WORD_INVALID');
    if (endMs !== undefined && !positive(endMs)) throw new Error('QURAN_ASR_WORD_INVALID');
    if (startMs !== undefined && endMs !== undefined && endMs < startMs) throw new Error('QURAN_ASR_WORD_INVALID');
    words.push({ text, confidence: w.confidence as number, ...(startMs === undefined ? {} : { startMs }), ...(endMs === undefined ? {} : { endMs }) });
  }
  return { reading: expected.reading, modelVersion, words };
}
