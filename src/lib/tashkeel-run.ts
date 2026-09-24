/*
 * تشغيلُ «المعلّم» على وجهٍ تُلي — بلا شاشةٍ ولا شبكة، فيُختبر وحده.
 *
 * المقاطعُ (آيةً آية) تُرسل دفعاتٍ صغيرة مع تسجيل الوجه، فيرى الطالبُ التقدّمَ آيةً آية ولا
 * ينتظر الوجهَ كلَّه صامتًا. وكلُّ حالٍ تُسمّى:
 *   ـ المعلّمُ يستيقظ (٥٠٣): يُعاد كلَّ عشر ثوانٍ في مهلةٍ معلومة، ويُقال «يستعدّ».
 *   ـ غيرُ مهيّأٍ في هذا النشر: لا يُقال شيء — فلا يُعرض للطالب بابٌ لا يُفتح.
 *   ـ الروايةُ غيرُ حفص: يُقال ذلك بعينه.
 *   ـ ما سواها: تبقى الملاحظاتُ التي وصلت، ويُقال إنّ الباقي تعذّر، ويُعرض «أعِد».
 * وطالبٌ انتقل إلى وجهٍ آخر أو بدأ من جديد يُسقط ما في الطريق (`isCurrent`).
 */
import type { TashkeelAnalysis, TashkeelBenchmark, TashkeelFinding, TashkeelMode } from './quran-intelligence';
import type { AyahSegment } from './recitation-segments';

export interface WireSegment {
  id: string; surah: number; ayah: number; startMs: number; endMs: number;
  ayahWords: string[]; wordIndices: number[]; from: number; to: number;
}

/* الخادمُ يقبل أعدادًا صحيحة: تُقرَّب الأزمنة، ولا يُترك مقطعٌ بلا طول. */
export function toWireSegment(s: AyahSegment): WireSegment {
  const startMs = Math.max(0, Math.round(s.startMs));
  const endMs = Math.max(startMs + 1, Math.round(s.endMs));
  return { id: s.id, surah: s.surah, ayah: s.ayah, startMs, endMs, ayahWords: [...s.ayahWords], wordIndices: [...s.wordIndices], from: s.from, to: s.to };
}

/**
 * آيةٌ لم يحكم عليها المعلّم، وسببُ ذلك بعينه — ليُقال للطالب ما يفعل (ويُعيدها وحدها).
 *   LOW_CONFIDENCE: الصوتُ لم يتّضح · TOO_MANY_DIFFERENCES: سُمع ما يخالفها كثيرًا ·
 *   AUDIO_TOO_SHORT: مقطعٌ قصير · NOT_HEARD: لم يُسمع منها ما يكفي فلم تُرسل ·
 *   وما سواها تعذّرٌ تقنيّ.
 */
export interface UnclearAyah { id: string; surah: number; ayah: number; reason: string }

interface Tallies {
  done: number; total: number;
  findings: TashkeelFinding[]; reviewed: number; unclear: number;
  unclearAyat: UnclearAyah[];
  mode?: TashkeelMode; benchmark?: TashkeelBenchmark;
}

export interface TashkeelProgress extends Tallies { phase: 'analysing' | 'warming' }

export type TashkeelOutcome =
  | ({ phase: 'done' } & Tallies)
  | ({ phase: 'failed'; code: string } & Tallies)
  | { phase: 'off' }
  | { phase: 'unsupported' }
  | { phase: 'cancelled' };

export interface TashkeelRunInput {
  segments: readonly AyahSegment[];
  submit: (segments: WireSegment[]) => Promise<Pick<TashkeelAnalysis, 'segments'> & Partial<Pick<TashkeelAnalysis, 'mode' | 'benchmark'>>>;
  onProgress: (p: TashkeelProgress) => void;
  isCurrent: () => boolean;
  batchSize?: number;
  /** مهلةُ الاستيقاظ كلُّها، وكم يُنتظر بين محاولتين. */
  warmingBudgetMs?: number;
  retryEveryMs?: number;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function runTashkeel(input: TashkeelRunInput): Promise<TashkeelOutcome> {
  const size = Math.max(1, Math.min(12, input.batchSize ?? 6));
  const wait = input.wait ?? sleep;
  const now = input.now ?? Date.now;
  const total = input.segments.length;
  const deadline = now() + (input.warmingBudgetMs ?? 150_000);
  const findings: TashkeelFinding[] = [];
  const unclearAyat: UnclearAyah[] = [];
  const seen = new Set<string>();
  let reviewed = 0, unclear = 0, done = 0;
  let mode: TashkeelMode | undefined, benchmark: TashkeelBenchmark | undefined;
  const tallies = (): Tallies => ({ done, total, findings: [...findings], reviewed, unclear, unclearAyat: [...unclearAyat], mode, benchmark });
  const snapshot = (phase: TashkeelProgress['phase']): TashkeelProgress => ({ phase, ...tallies() });

  input.onProgress(snapshot('analysing'));
  for (let k = 0; k < total; k += size) {
    const batch = input.segments.slice(k, k + size).map(toWireSegment);
    for (;;) {
      try {
        const out = await input.submit(batch);
        if (!input.isCurrent()) return { phase: 'cancelled' };
        mode = out.mode ?? mode;
        benchmark = out.benchmark ?? benchmark;
        const asked = new Map(batch.map(s => [s.id, s] as const));
        for (const seg of out.segments ?? []) {
          const sent = asked.get(seg.id);
          if (!sent) continue;
          if (seg.status === 'ok') reviewed += 1;
          else {
            unclear += 1;
            unclearAyat.push({ id: seg.id, surah: sent.surah, ayah: sent.ayah, reason: seg.reason || (seg.status === 'unclear' ? 'LOW_CONFIDENCE' : 'SKIPPED') });
          }
          for (const f of seg.findings ?? []) {
            /* الملاحظةُ الواحدةُ على الكلمة الواحدة تُقال مرّة. */
            const key = `${f.wordIndex}|${f.kind}|${f.messageAr}`;
            if (!seen.has(key)) { seen.add(key); findings.push(f); }
          }
        }
        done += batch.length;
        input.onProgress(snapshot('analysing'));
        break;
      } catch (error) {
        if (!input.isCurrent()) return { phase: 'cancelled' };
        const code = error instanceof Error ? error.message : 'TASHKEEL_FAILED';
        if (/NOT_CONFIGURED|MUAALEM_OFF/.test(code)) return { phase: 'off' };
        if (/READING_NOT_SUPPORTED/.test(code)) return { phase: 'unsupported' };
        if (/WARMING/.test(code) && now() < deadline) {
          input.onProgress(snapshot('warming'));
          await wait(input.retryEveryMs ?? 10_000);
          if (!input.isCurrent()) return { phase: 'cancelled' };
          continue;
        }
        return { phase: 'failed', code, ...tallies() };
      }
    }
  }
  findings.sort((a, b) => a.wordIndex - b.wordIndex);
  return { phase: 'done', ...tallies() };
}

/** تسجيلُ الوجه نصًّا (base64) — في الذاكرة وحدها، ولا يُكتب في أيّ مخزن. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/*
 * آياتٌ من الوجه لم تُرسل إلى المعلّم لأنّ ما سُمع منها لا يكفي — تُقال بأسمائها ولها
 * «أعِدها». وما بعد آخر آيةٍ سُمعت ليس «لم يُسمع»: الطالبُ توقّف هناك، فلا يُعدّ عليه.
 */
export function notHeardAyat(
  faceWords: readonly { index: number; surah: number; ayah: number }[],
  heard: ReadonlyMap<number, unknown>,
  sent: ReadonlySet<string>,
): UnclearAyah[] {
  const order: string[] = [];
  const count = new Map<string, number>();
  for (const w of faceWords) {
    const key = `${w.surah}:${w.ayah}`;
    if (!count.has(key)) { count.set(key, 0); order.push(key); }
    if (heard.has(w.index)) count.set(key, count.get(key)! + 1);
  }
  const last = order.reduce((at, key, i) => (count.get(key)! > 0 ? i : at), -1);
  return order.slice(0, last + 1).filter(key => !sent.has(key)).map(key => {
    const [surah, ayah] = key.split(':').map(Number);
    return { id: `${key}~unheard`, surah, ayah, reason: 'NOT_HEARD' };
  });
}
