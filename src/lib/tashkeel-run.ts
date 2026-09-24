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
import type { TashkeelAnalysis, TashkeelFinding } from './quran-intelligence';
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

export interface TashkeelProgress {
  phase: 'analysing' | 'warming';
  done: number; total: number;
  findings: TashkeelFinding[]; reviewed: number; unclear: number;
}

export type TashkeelOutcome =
  | { phase: 'done'; done: number; total: number; findings: TashkeelFinding[]; reviewed: number; unclear: number }
  | { phase: 'failed'; code: string; done: number; total: number; findings: TashkeelFinding[]; reviewed: number; unclear: number }
  | { phase: 'off' }
  | { phase: 'unsupported' }
  | { phase: 'cancelled' };

export interface TashkeelRunInput {
  segments: readonly AyahSegment[];
  submit: (segments: WireSegment[]) => Promise<Pick<TashkeelAnalysis, 'segments'>>;
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
  const seen = new Set<string>();
  let reviewed = 0, unclear = 0, done = 0;
  const snapshot = (phase: TashkeelProgress['phase']): TashkeelProgress => ({ phase, done, total, findings: [...findings], reviewed, unclear });

  input.onProgress(snapshot('analysing'));
  for (let k = 0; k < total; k += size) {
    const batch = input.segments.slice(k, k + size).map(toWireSegment);
    for (;;) {
      try {
        const out = await input.submit(batch);
        if (!input.isCurrent()) return { phase: 'cancelled' };
        const asked = new Set(batch.map(s => s.id));
        for (const seg of out.segments ?? []) {
          if (!asked.has(seg.id)) continue;
          if (seg.status === 'ok') reviewed += 1;
          else if (seg.status === 'unclear') unclear += 1;
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
        if (/NOT_CONFIGURED/.test(code)) return { phase: 'off' };
        if (/READING_NOT_SUPPORTED/.test(code)) return { phase: 'unsupported' };
        if (/WARMING/.test(code) && now() < deadline) {
          input.onProgress(snapshot('warming'));
          await wait(input.retryEveryMs ?? 10_000);
          if (!input.isCurrent()) return { phase: 'cancelled' };
          continue;
        }
        return { phase: 'failed', code, done, total, findings, reviewed, unclear };
      }
    }
  }
  findings.sort((a, b) => a.wordIndex - b.wordIndex);
  return { phase: 'done', done, total, findings, reviewed, unclear };
}

/** تسجيلُ الوجه نصًّا (base64) — في الذاكرة وحدها، ولا يُكتب في أيّ مخزن. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
