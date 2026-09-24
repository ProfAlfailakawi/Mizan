/*
 * «استمع لتلاوتك هنا» — الكلمةُ التي عليها ملاحظةٌ بصوت الطالب نفسه.
 *
 * التسجيلُ في ذاكرة الصفحة وحدها، ويُفكّ مرّةً عند أوّل طلبٍ (`decodeAudioData`) ثم تُشغَّل منه
 * قطعةٌ بعينها: الكلمةُ وما حولها بقليل. ولا يُقفز داخل ملف WebM الذي يصنعه MediaRecorder —
 * فلا فهرسَ فيه للمواضع، والقفزُ فيه يتعثّر في المتصفّحات — بل يُشغَّل من الصوت المفكوك بدقّة.
 * ولا يخرج من الجهاز شيء.
 */

export interface SnippetPlayer {
  /** يشغّل ما بين الزمنين (بالمللي ثانية من أوّل التلاوة)؛ ويقف ما كان يُشغَّل قبله. */
  play(startMs: number, endMs: number): Promise<boolean>;
  stop(): void;
  close(): void;
}

/** هامشُ ما قبل الكلمة وما بعدها: يُسمع مدخلُها ومخرجُها، لا نصفُ حرف. */
export const SNIPPET_LEAD_MS = 350;
export const SNIPPET_TAIL_MS = 400;

export function snippetWindow(startMs: number, endMs: number, durationMs: number) {
  const from = Math.max(0, startMs - SNIPPET_LEAD_MS);
  const to = Math.min(durationMs > 0 ? durationMs : Infinity, endMs + SNIPPET_TAIL_MS);
  return { from, to: Math.max(from + 50, to) };
}

export function createSnippetPlayer(parts: readonly Blob[]): SnippetPlayer {
  let ctx: AudioContext | null = null;
  let buffer: Promise<AudioBuffer | null> | null = null;
  let source: AudioBufferSourceNode | null = null;
  const stop = () => { try { source?.stop(); } catch { /* انتهى أصلًا */ } source = null; };
  const decode = () => {
    if (!buffer) {
      buffer = (async () => {
        try {
          const Ctx: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!Ctx || !parts.length) return null;
          ctx = ctx || new Ctx();
          const data = await new Blob(parts as Blob[], { type: parts[0].type || 'audio/webm' }).arrayBuffer();
          return await ctx.decodeAudioData(data);
        } catch { return null; }
      })();
    }
    return buffer;
  };
  return {
    async play(startMs, endMs) {
      stop();
      const audio = await decode();
      if (!audio || !ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
      const { from, to } = snippetWindow(startMs, endMs, audio.duration * 1000);
      const node = ctx.createBufferSource();
      node.buffer = audio;
      /* دخولٌ وخروجٌ ناعمان (٢٥ مللي ثانية) فلا تُسمع طقطقةٌ عند الحدّين. */
      const gain = ctx.createGain();
      const t0 = ctx.currentTime, span = (to - from) / 1000;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + 0.025);
      gain.gain.setValueAtTime(1, t0 + Math.max(0.03, span - 0.03));
      gain.gain.linearRampToValueAtTime(0, t0 + span);
      node.connect(gain).connect(ctx.destination);
      node.start(t0, from / 1000, span);
      source = node;
      node.onended = () => { if (source === node) source = null; };
      return true;
    },
    stop,
    close() { stop(); void (ctx as AudioContext | null)?.close?.(); ctx = null; buffer = null; },
  };
}
