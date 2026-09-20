/*
 * القياسُ الذي يفتح البوّابة — يقيس ولا يخترع.
 *
 * فبوّابةُ الحكم (`recitation-asr-contract.ts`) لا تُفتح إلا بتقرير قياسٍ لرواية
 * الطالب بعينها. وهذا الملفُّ هو الذي **يصنع ذلك التقرير**: يأخذ مُعطًى يقدّمه
 * المالك — تسجيلاتٌ ونصوصُها المرجعيّة — فيُشغّل المحرّكَ عليها ويعدّ أخطاءه.
 *
 * ولا يُخرج رقمًا من عنده بحال:
 *
 *  ـ لا صوتَ يُصطنع، ولا نصَّ مرجعيًّا يُكتب هنا. كلاهما من المالك.
 *  ـ ولا عتبةَ تُقترح: العتباتُ في المُعطى ويعتمدها **بشران**.
 *  ـ وإن نقصت شريحةٌ (طفلٌ أو بالغٌ أو ضجيج) فلا تقرير — لا تقريرٌ ناقصٌ يُقرأ تامًّا.
 *
 * وأخطرُ ما يحرسه: **دعوى التشكيل**. فمُعطًى يقول «نصوصي مشكولة» ونصوصُه بلا حركةٍ
 * يُخرج خطأَ حركةٍ صفرًا — فتُفتح بوّابةُ الحركة على لا شيء. فيُقاس النصُّ نفسُه:
 * إن استوى منطوقُه وهيكلُه فلا حركةَ فيه، والدعوى باطلة.
 */

import { diffRecitation, type ExpectedWord, type HeardWord } from '../src/lib/recitation-diff';
import { quranSkeleton, quranVoweled } from '../src/lib/quran-orthography';
import { quranReadingDefinition } from './quran-intelligence-policy';
import { splitAyahWords } from './practice-face-service';
import { ASR_BENCHMARK_VERSION, REQUIRED_ASR_SLICES, evaluateAsrBenchmark, type AsrBenchmarkReport } from './recitation-asr-contract';
import type { QuranReadingId } from './quran-intelligence-types';

export interface BenchmarkItem {
  /** مسارُ ملفِّ الصوت — يُقرأ من قرص المالك ولا يُرفع إلى هنا. */
  audio: string;
  /** ونصُّه المرجعيُّ كما في حزمة الرواية. */
  reference: string;
}

export interface BenchmarkSliceInput { name: string; items: BenchmarkItem[] }

export interface BenchmarkManifest {
  reading: QuranReadingId;
  datasetReading: QuranReadingId;
  datasetId: string;
  referenceIncludesDiacritics: boolean;
  approvedThresholds: AsrBenchmarkReport['approvedThresholds'];
  approvedBy: string[];
  slices: BenchmarkSliceInput[];
}

/** يُرفض المُعطى قبل أن يُشغَّل محرّك — فلا يُهدر وقتُ قياسٍ لا يُقبل ناتجُه. */
export function validateManifest(manifest: BenchmarkManifest): void {
  if (!manifest || typeof manifest !== 'object') throw new Error('ASR_MANIFEST_INVALID');
  if (!quranReadingDefinition(manifest.reading)) throw new Error('ASR_MANIFEST_READING_INVALID');
  if (!quranReadingDefinition(manifest.datasetReading)) throw new Error('ASR_MANIFEST_DATASET_READING_INVALID');
  if (typeof manifest.datasetId !== 'string' || !manifest.datasetId.trim()) throw new Error('ASR_MANIFEST_DATASET_ID_REQUIRED');
  if (typeof manifest.referenceIncludesDiacritics !== 'boolean') throw new Error('ASR_MANIFEST_DIACRITIC_CLAIM_REQUIRED');
  if (!Array.isArray(manifest.approvedBy) || new Set(manifest.approvedBy.map(x => String(x).trim()).filter(Boolean)).size < 2)
    throw new Error('ASR_MANIFEST_THRESHOLDS_NOT_DUAL_APPROVED');
  if (!Array.isArray(manifest.slices) || !manifest.slices.length) throw new Error('ASR_MANIFEST_SLICES_REQUIRED');

  const names = new Set(manifest.slices.map(s => s && s.name));
  for (const required of REQUIRED_ASR_SLICES)
    if (!names.has(required)) throw new Error(`ASR_MANIFEST_MISSING_SLICE:${required}`);

  for (const slice of manifest.slices) {
    if (!slice || typeof slice.name !== 'string' || !slice.name.trim()) throw new Error('ASR_MANIFEST_SLICE_INVALID');
    if (!Array.isArray(slice.items) || !slice.items.length) throw new Error(`ASR_MANIFEST_SLICE_EMPTY:${slice.name}`);
    for (const item of slice.items) {
      if (!item || typeof item.audio !== 'string' || !item.audio.trim()) throw new Error(`ASR_MANIFEST_ITEM_AUDIO_REQUIRED:${slice.name}`);
      if (typeof item.reference !== 'string' || !expectedWords(item.reference).length) throw new Error(`ASR_MANIFEST_ITEM_REFERENCE_REQUIRED:${slice.name}`);
    }
  }

  /*
   * ودعوى التشكيل تُقاس على النصّ نفسِه.
   *
   * فنصٌّ يستوي منطوقُه وهيكلُه نصٌّ بلا حركة. ولو قُبلت الدعوى عليه لخرج خطأُ
   * الحركة صفرًا — لا لأنّ المحرّكَ مصيب، بل لأنّه لم يُقابَل بحركةٍ قطّ.
   */
  if (manifest.referenceIncludesDiacritics) {
    for (const slice of manifest.slices) {
      for (const item of slice.items) {
        if (quranVoweled(item.reference) === quranSkeleton(item.reference))
          throw new Error(`ASR_MANIFEST_REFERENCE_NOT_DIACRITIZED:${slice.name}`);
      }
    }
  }
}

const expectedWords = (reference: string): ExpectedWord[] =>
  splitAyahWords(reference).map((text, index) => ({ index, text }));

export interface ItemMeasurement {
  words: number;
  wordErrors: number;
  /** و`null` حين لا تُقاس الحركةُ أصلًا — لا صفرًا يُقرأ «لا خطأ». */
  diacriticErrors: number | null;
  latencyMs: number;
}

/**
 * قياسُ مقطعٍ واحد.
 *
 * وخطأُ الكلمة هو المعتاد: إسقاطٌ وإبدالٌ وزيادةٌ منسوبةً إلى عدد كلمات المرجع.
 * وتُلغى عتبةُ الثقة هنا عمدًا — القياسُ يعدّ ما أخطأ فيه المحرّكُ كلَّه، والعتبةُ
 * أداةُ **عرضٍ** لا أداةُ قياس. فمن قاس بها أخفى نصفَ أخطاء محرّكه.
 */
export function measureItem(reference: string, heard: readonly HeardWord[], latencyMs: number, diacritics: boolean): ItemMeasurement {
  const expected = expectedWords(reference);
  const raw = diffRecitation(expected, heard, { detectTashkeel: false, minConfidence: 0, minTashkeelConfidence: 0 });
  const wordErrors = raw.mistakes.filter(m => m.kind === 'skipped' || m.kind === 'substituted' || m.kind === 'added').length;
  let diacriticErrors: number | null = null;
  if (diacritics) {
    const vowels = diffRecitation(expected, heard, { detectTashkeel: true, minConfidence: 0, minTashkeelConfidence: 0 });
    diacriticErrors = vowels.mistakes.filter(m => m.kind === 'tashkeel').length;
  }
  return { words: expected.length, wordErrors, diacriticErrors, latencyMs };
}

/** المئينُ الخامسُ والتسعون — بالترتيب لا بالتقريب. */
export function p95(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

export interface SliceMeasurement {
  name: string;
  sampleCount: number;
  wordErrorRate: number;
  diacriticErrorRate?: number;
  p95LatencyMs: number;
}

export function aggregate(name: string, items: readonly ItemMeasurement[]): SliceMeasurement {
  const words = items.reduce((n, i) => n + i.words, 0);
  if (!words) throw new Error(`ASR_MEASUREMENT_EMPTY:${name}`);
  const wordErrors = items.reduce((n, i) => n + i.wordErrors, 0);
  /* ولا تُقاس الحركةُ إلا إن قِيست في **كلّ** مقطع: نصفُ قياسٍ ليس قياسًا. */
  const measured = items.every(i => i.diacriticErrors !== null);
  const diacriticErrors = measured ? items.reduce((n, i) => n + (i.diacriticErrors as number), 0) : null;
  return {
    name,
    sampleCount: items.length,
    wordErrorRate: Math.min(1, wordErrors / words),
    ...(diacriticErrors === null ? {} : { diacriticErrorRate: Math.min(1, diacriticErrors / words) }),
    p95LatencyMs: p95(items.map(i => i.latencyMs)),
  };
}

/**
 * التقريرُ يُبنى من المقاييس، ثمّ **يُحكم عليه بحاكمه هو**.
 *
 * فلا تُصدَّر ورقةٌ لم تمرّ على `evaluateAsrBenchmark`: من بنى تقريرًا بشكلٍ لا يقبله
 * حاكمُه فقد بنى ورقةً تُردّ عند الباب، ويُعلم ذلك هنا لا هناك.
 */
export function buildAsrBenchmarkReport(
  manifest: BenchmarkManifest,
  modelVersion: string,
  slices: readonly SliceMeasurement[],
  measuredAt: string = new Date().toISOString(),
): AsrBenchmarkReport {
  const totalSamples = slices.reduce((n, s) => n + s.sampleCount, 0);
  const weighted = (pick: (s: SliceMeasurement) => number | undefined) => {
    let sum = 0, n = 0;
    for (const slice of slices) {
      const value = pick(slice);
      if (value === undefined) return undefined;
      sum += value * slice.sampleCount; n += slice.sampleCount;
    }
    return n ? sum / n : undefined;
  };
  const diacriticErrorRate = weighted(s => s.diacriticErrorRate);
  const report: AsrBenchmarkReport = {
    version: ASR_BENCHMARK_VERSION,
    reading: manifest.reading,
    datasetReading: manifest.datasetReading,
    modelVersion,
    datasetId: manifest.datasetId,
    referenceIncludesDiacritics: manifest.referenceIncludesDiacritics,
    measuredAt,
    metrics: {
      wordErrorRate: weighted(s => s.wordErrorRate) as number,
      ...(diacriticErrorRate === undefined ? {} : { diacriticErrorRate }),
      p95LatencyMs: p95(slices.map(s => s.p95LatencyMs)),
      sampleCount: totalSamples,
    },
    approvedThresholds: manifest.approvedThresholds,
    slices: slices.map(s => ({ ...s })),
    approvedBy: manifest.approvedBy,
  };
  evaluateAsrBenchmark(report);   /* يرمي إن كان الشكلُ مُختلًّا — قبل أن يُكتب */
  return report;
}
