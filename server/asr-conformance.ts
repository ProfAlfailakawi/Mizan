/*
 * أيلتزم هذا المحرّكُ بالعقد؟ — فحصٌ بنيويٌّ لا يقيس جودةَ تعرّف.
 *
 * والفرقُ بينهما مقصود:
 *  ـ **المطابقة** (هنا): أيردّ ما اتُّفق عليه؟ أيذكر الروايةَ صراحةً؟ أيرفض حمولةً
 *    فارغة؟ وهي تُفحص في دقائق وبلا مُعطًى ولا تسجيلات.
 *  ـ **القياس** (`asr-benchmark-runner.ts`): كم يُخطئ؟ ويحتاج مُعطى المالك.
 *
 * ولا يفتح هذا الفحصُ بوّابةً بحال: محرّكٌ مطابقٌ للعقد قد يكون رديءَ التعرّف. إنّما
 * يقول: «يصلح أن يُقاس». ومن خلط الأمرين فتح بابًا بشكلٍ صحيحٍ لا بقياسٍ صحيح.
 */

import { readRecognitionResponse, MAX_WORDS_PER_CHUNK } from './recitation-asr-contract';
import type { QuranReadingId } from './quran-intelligence-types';

export interface ConformanceCheck { name: string; passed: boolean; detail: string }
export interface ConformanceReport {
  url: string;
  reading: QuranReadingId;
  modelVersion: string | null;
  checks: ConformanceCheck[];
  p95LatencyMs: number | null;
  conformant: boolean;
}

export interface EngineCall {
  status: number;
  body: unknown;
  latencyMs: number;
}

/** كيف يُنادى المحرّك — يُحقن ليُقاس الفحصُ نفسُه بلا شبكة. */
export type EngineCaller = (input: { reading: string; bytes: Uint8Array }) => Promise<EngineCall>;

const check = (name: string, passed: boolean, detail: string): ConformanceCheck => ({ name, passed, detail });

/** عيّنةُ صوتٍ اصطناعيّة: بايتاتٌ لا معنى لها — المقصودُ البنيةُ لا المضمون. */
export const PROBE_BYTES = new Uint8Array(4096).fill(0x1f);

export async function runConformance(
  url: string,
  reading: QuranReadingId,
  call: EngineCaller,
  rounds = 5,
): Promise<ConformanceReport> {
  const checks: ConformanceCheck[] = [];
  const latencies: number[] = [];
  let modelVersion: string | null = null;

  /* ١) يردّ على حمولةٍ سليمة. */
  let first: EngineCall;
  try {
    first = await call({ reading, bytes: PROBE_BYTES });
  } catch (error) {
    checks.push(check('answers', false, `لم يُجب: ${error instanceof Error ? error.message : 'unknown'}`));
    return { url, reading, modelVersion: null, checks, p95LatencyMs: null, conformant: false };
  }
  latencies.push(first.latencyMs);
  checks.push(check('answers', first.status === 200, `الحالة ${first.status}`));

  /* ٢) وردُّه يمرّ على قارئ العقد نفسِه — لا على قارئٍ ثانٍ يُكتب هنا فيفترق عنه. */
  let declared = '';
  try {
    const body = first.body as { modelVersion?: unknown };
    declared = typeof body?.modelVersion === 'string' ? body.modelVersion.trim() : '';
    const parsed = readRecognitionResponse(first.body, { reading, modelVersion: declared });
    modelVersion = parsed.modelVersion;
    checks.push(check('shape', true, `${parsed.words.length} كلمة · النموذج ${parsed.modelVersion}`));
    checks.push(check('word-cap', parsed.words.length <= MAX_WORDS_PER_CHUNK, `${parsed.words.length} ≤ ${MAX_WORDS_PER_CHUNK}`));
    const timed = parsed.words.filter(w => w.startMs !== undefined && w.endMs !== undefined);
    checks.push(check('timings', timed.every(w => (w.endMs as number) >= (w.startMs as number)),
      timed.length ? `${timed.length} كلمةً بتوقيت` : 'بلا توقيت — ويُفقد حارسُ صدى التنبيه'));
  } catch (error) {
    checks.push(check('shape', false, `الردُّ لا يوافق العقد: ${error instanceof Error ? error.message : 'unknown'}`));
  }

  /* ٣) ونسخةُ النموذج تُذكر ولا تتبدّل بين نداءين. */
  checks.push(check('model-version', !!declared, declared || 'غائبة'));

  /*
   * ٤) ولا يُجيب عن روايةٍ بروايةٍ أخرى.
   *
   * وهذا أخطرُ بندٍ هنا: محرّكٌ يسمع حفصًا وحدَه ثمّ يردّ على طلب ورشٍ بنتيجةٍ
   * يسمّيها ورشًا هو **التنازلُ بين الروايات** بعينه — وقد قِيس أنّه يُخطّئ قارئَ
   * ورشٍ مصيبًا في ٥٨٪ من حركاته.
   */
  const other: QuranReadingId = reading === 'hafs' ? 'warsh' : 'hafs';
  try {
    const answer = await call({ reading: other, bytes: PROBE_BYTES });
    const named = (answer.body as { reading?: unknown })?.reading;
    const refused = answer.status >= 400;
    const echoed = named === other;
    checks.push(check('riwayah-echo', refused || echoed,
      refused ? `رفض طلبَ ${other} بالحالة ${answer.status}` : `ردّ باسم «${String(named)}» على طلب ${other}`));
  } catch (error) {
    checks.push(check('riwayah-echo', false, `تعذّر: ${error instanceof Error ? error.message : 'unknown'}`));
  }

  /* ٥) وحمولةٌ فارغةٌ تُردّ خطأً لا نتيجةً. */
  try {
    const empty = await call({ reading, bytes: new Uint8Array(0) });
    checks.push(check('empty-audio', empty.status >= 400, `الحالة ${empty.status}`));
  } catch {
    checks.push(check('empty-audio', true, 'رُفض قبل أن يُرسل'));
  }

  /* ٦) والزمن: يُقاس ويُعلن، ولا يُحكم عليه هنا — الحكمُ لعتبة التقرير. */
  for (let i = 1; i < Math.max(1, rounds); i += 1) {
    try {
      const again = await call({ reading, bytes: PROBE_BYTES });
      latencies.push(again.latencyMs);
      const version = (again.body as { modelVersion?: unknown })?.modelVersion;
      if (declared && version !== declared) {
        checks.push(check('model-version-stable', false, `تبدّلت النسخة: ${declared} ← ${String(version)}`));
        declared = '';
      }
    } catch { /* نداءٌ سقط: يظهر في نقص العدد */ }
  }
  if (!checks.some(c => c.name === 'model-version-stable')) {
    checks.push(check('model-version-stable', !!modelVersion, `${latencies.length} نداءً بنسخةٍ واحدة`));
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] : null;
  return { url, reading, modelVersion, checks, p95LatencyMs: p95, conformant: checks.every(c => c.passed) };
}
