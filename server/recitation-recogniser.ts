/*
 * الخدمةُ التي تسمع الكلماتِ — وما تفعله قبل أن تسمع.
 *
 * ومحرّكُ المحاذاة القائمُ يعود بـ**موضع**: سورةٌ وآيةٌ وفهرسُ كلمة. ومنه عُرف
 * «لبثتَ» و«أعدتَ» و«انقطع الأثر». ولا يعود بما **قيل**، فلا يُعرف منه أنّ كلمةً
 * أُسقطت أو أُبدلت. فذلك محرّكٌ آخر: يردّ نصًّا.
 *
 * وهذا الملفُّ بابُه. ولا يفتح الباب إلا بعد ثلاثة:
 *
 *   ١) أن يكون للمحرّك عنوانٌ مضبوط — وإلا فلا تعرّفَ أصلًا، ولا بديلَ يُخترع.
 *   ٢) أن تكون بوّابةُ الرواية مفتوحةً بتقرير قياسٍ لها بعينها.
 *   ٣) أن تكون الحزمةُ حزمةَ تلك الرواية — كما يشترط مسارُ المحاذاة سواءً بسواء.
 *
 * ثمّ لا يُصدَّق ما يعود: يُقرأ بـ`readRecognitionResponse`، فتُرفض روايةٌ أخرى،
 * ونسخةُ نموذجٍ غيرُ مُعايَرة، وثقةٌ خارج [٠،١].
 *
 * ولا يقول هذا الملفُّ «أخطأت» بحال: يُخرج ما سُمع والإذنَ الذي بيده. والحكمُ في
 * `judgeRecitation` — وهو لا يحكم بلا إذن.
 */

import fs from 'fs';
import path from 'path';

import { quranReadingDefinition } from './quran-intelligence-policy';
import type { QuranReadingId } from './quran-intelligence-types';
import {
  evaluateAsrBenchmark, readRecognitionResponse, recitationJudgingGate,
  type AsrBenchmarkReport, type RecitationJudgingGate, type RecognisedWord,
} from './recitation-asr-contract';

export interface AsrBackendConfig { url?: string; bearerToken?: string }

/** أقصى ما يُقبل من صوتٍ في مقطع — وهو حدُّ مسار المحاذاة نفسُه. */
export const MAX_ASR_CHUNK_BYTES = 2_000_000;

/** خزانةُ تقارير القياس — ملفٌّ لكلّ رواية، على نسق تقارير المحاذاة. */
export class AsrBenchmarkRepository {
  constructor(private root: string) { fs.mkdirSync(root, { recursive: true, mode: 0o700 }) }
  private file(reading: QuranReadingId) { return path.join(this.root, `asr-benchmark-${reading}.json`) }

  /** ويُحكم على التقرير قبل أن يُكتب: تقريرٌ مُختلُّ البنية لا يدخل الخزانة. */
  register(report: AsrBenchmarkReport) {
    const verdict = evaluateAsrBenchmark(report);
    fs.writeFileSync(this.file(report.reading), JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 });
    return verdict;
  }

  load(reading: QuranReadingId): AsrBenchmarkReport | null {
    const file = this.file(reading);
    if (!fs.existsSync(file)) return null;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) as AsrBenchmarkReport } catch { return null }
  }

  gate(reading: QuranReadingId): RecitationJudgingGate { return recitationJudgingGate(reading, this.load(reading)) }
}

export interface RecogniseInput {
  reading: string;
  sourcePackageId: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface RecognisedChunkResult {
  gate: RecitationJudgingGate;
  words: RecognisedWord[];
  modelVersion: string;
}

type FetchLike = (input: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class RecitationRecogniser {
  constructor(
    private backend: AsrBackendConfig,
    private benchmarks: Pick<AsrBenchmarkRepository, 'gate'>,
    private fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  configured() { return !!this.backend.url }

  /**
   * الإذنُ كما يُعلن للشاشة.
   *
   * ومحرّكٌ غيرُ مضبوطٍ يُغلق البابَ ولو كان التقريرُ ناجحًا: تقريرُ قياسٍ لمحرّكٍ
   * لا وجودَ له إذنٌ لعدم.
   */
  gate(reading: string): RecitationJudgingGate {
    const definition = quranReadingDefinition(reading);
    if (!definition) return { reading: reading as QuranReadingId, word: 'CLOSED', tashkeel: 'CLOSED', modelVersion: null, reasons: ['READING_UNKNOWN'] };
    if (!this.backend.url) return { reading: definition.id, word: 'CLOSED', tashkeel: 'CLOSED', modelVersion: null, reasons: ['ASR_BACKEND_NOT_CONFIGURED'] };
    return this.benchmarks.gate(definition.id);
  }

  async recognise(input: RecogniseInput): Promise<RecognisedChunkResult> {
    const definition = quranReadingDefinition(input.reading);
    if (!definition) throw new Error('QURAN_READING_UNSUPPORTED');
    if (!this.backend.url) throw new Error('QURAN_ASR_BACKEND_NOT_CONFIGURED');
    if (input.sourcePackageId !== definition.packageId) throw new Error('QURAN_ASR_SOURCE_READING_MISMATCH');
    const gate = this.benchmarks.gate(definition.id);
    if (gate.word !== 'OPEN') throw new Error('QURAN_ASR_JUDGING_CLOSED');
    if (!gate.modelVersion) throw new Error('QURAN_ASR_MODEL_NOT_BENCHMARKED');

    /*
     * والحمولةُ تُفحص هنا كما تُفحص في مسار المحاذاة، وللسبب نفسِه: النصُّ والمصفوفةُ
     * كلاهما يملك `length`، فيمرّ فحصُ الحجم وهو يعدّ محارفَ لا بايتات.
     */
    if (Array.isArray(input.bytes) || typeof input.bytes === 'string' || !(input.bytes instanceof Uint8Array))
      throw new Error('QURAN_ASR_AUDIO_CHUNK_INVALID');
    if (!input.bytes.length || input.bytes.length > MAX_ASR_CHUNK_BYTES) throw new Error('QURAN_ASR_AUDIO_CHUNK_INVALID');

    const url = new URL(this.backend.url);
    url.searchParams.set('reading', definition.id);
    const headers: Record<string, string> = {
      'content-type': input.contentType || 'application/octet-stream',
      'x-mizan-mode': 'practice',
      'x-mizan-source-package': definition.packageId,
    };
    if (this.backend.bearerToken) headers.authorization = `Bearer ${this.backend.bearerToken}`;
    const response = await this.fetchImpl(url, { method: 'POST', headers, body: new Uint8Array(input.bytes) });
    if (!response.ok) throw new Error(`QURAN_ASR_BACKEND_HTTP_${response.status}`);
    const raw = await response.json();
    const chunk = readRecognitionResponse(raw, { reading: definition.id, modelVersion: gate.modelVersion });
    return { gate, words: chunk.words, modelVersion: chunk.modelVersion };
  }
}
