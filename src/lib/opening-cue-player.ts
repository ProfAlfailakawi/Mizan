/*
 * تشغيلُ «أوّل آية» بسقف السطر الواحد — الجانبُ الذي يحتاج المتصفّح.
 *
 * القاعدةُ نفسُها في `opening-cue.ts` (بلا شبكةٍ ولا صوت، ومختبَرة). وهنا ما حولها: جلبُ نصّ
 * الآية وسطرِ كلّ كلمة من تخطيط الصفحة، وتوقيتِ كلماتها، ثم القطعُ على أهدأ لحظة وخفضُ
 * الصوت قبله قليلًا — فلا يُسمع بترٌ في وسط حرف.
 */
import { fetchDeliveryPassage, fetchMushafLayout } from './kfgqpc-library';
import { measuredWordTimings, splitAyahWords, type MeasuredSegment } from './word-timing';
import { cutTimeMs, energyFrames, OPENING_FADE_MS, OPENING_RECORDING, OPENING_TEXT_READING, planOpeningCut, snapToQuiet, type OpeningCut } from './opening-cue';

export interface OpeningCutPlan {
  text: string;
  cut: OpeningCut;
  segments?: MeasuredSegment[];
}


const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const plans = new Map<string, Promise<OpeningCutPlan | null>>();
const cached = (key: string, make: () => Promise<OpeningCutPlan | null>) => {
  let p = plans.get(key);
  if (!p) { p = make().catch(() => null); plans.set(key, p); }
  return p;
};
/**
 * خطّةُ القطع لتسجيل حفص المرجعيّ (ومعها توقيتُ كلماته المقيس إن وُجد). الصوتُ صوتُ حفص
 * للروايات العشرين، فيُقاس على نصّ حفص وتخطيطِ صفحته أيًّا كانت الروايةُ المعروضة.
 */
export function prepareOpeningCut(recording: string, surah: number, ayah: number): Promise<OpeningCutPlan | null> {
  return recording === OPENING_RECORDING
    ? cached(`${recording}:${surah}:${ayah}`, () => buildPlan(OPENING_TEXT_READING, recording, surah, ayah))
    : Promise.resolve(null);
}
/** خطّةُ القطع على نصّ الرواية وحده — لمرجعٍ صوتيٍّ لا توقيتَ لكلماته. */
export function prepareOpeningCutForReading(reading: string, surah: number, ayah: number): Promise<OpeningCutPlan | null> {
  return reading ? cached(`reading:${reading}:${surah}:${ayah}`, () => buildPlan(reading, undefined, surah, ayah)) : Promise.resolve(null);
}

async function buildPlan(reading: string, recording: string | undefined, surah: number, ayah: number): Promise<OpeningCutPlan | null> {
  const passage = await fetchDeliveryPassage(reading, surah, ayah, ayah);
  const a = passage?.ayat.find(x => x.surah === surah && x.ayah === ayah);
  if (!a) return null;
  const words = splitAyahWords(a.text).map(w => w.text);
  let lines: (number | undefined)[] | undefined;
  let lineWords: number | undefined;
  /* تخطيطُ الصفحة لمصحف المدينة (حفص) وحده؛ وغيرُه يُقدَّر من امتداد الآية على الأسطر. */
  if (reading === 'hafs') {
    const layout = await fetchMushafLayout(a.page).catch(() => null);
    const own = layout?.words.filter(w => w.surah === surah && w.ayah === ayah).sort((x, y) => x.wordIndex - y.wordIndex) ?? [];
    if (own.length === words.length && own.every(w => Number.isInteger(w.line))) {
      lines = own.map(w => w.line);
      const perLine = new Map<number, number>();
      for (const w of layout!.words) if (Number.isInteger(w.line)) perLine.set(w.line!, (perLine.get(w.line!) ?? 0) + 1);
      lineWords = median([...perLine.values()]) || undefined;
    }
  }
  const cut = planOpeningCut({ words, lines, lineWords, lineSpan: lines ? undefined : a.lineEnd - a.lineStart + 1 });
  let segments: MeasuredSegment[] | undefined;
  if (!cut.whole && recording) {
    try {
      const r = await fetch(`/api/public/kfgqpc/word-timings/${encodeURIComponent(recording)}/${surah}/${ayah}`, { cache: 'force-cache' });
      const body = r.ok ? await r.json() : null;
      if (Array.isArray(body?.segments)) segments = body.segments as MeasuredSegment[];
    } catch { /* بلا توقيتٍ مقيس يُقدَّر التوقيت — ويُقرَّب القطعُ إلى السكتة بعدُ */ }
  }
  return { text: a.text, cut, segments };
}

/** موضعُ القطع بالمللي ثانية بعد أن تُعرف مدّةُ الملف — أو لا شيء إن سُمعت الآيةُ كلُّها. */
export function planStopMs(plan: OpeningCutPlan | null, durationMs: number): number | undefined {
  if (!plan || plan.cut.whole || !(durationMs > 0)) return undefined;
  const { model } = measuredWordTimings(plan.text, durationMs, plan.segments);
  return cutTimeMs(model.words, plan.cut);
}

/** يُقرّب القطعَ إلى أهدأ لحظةٍ في الملف نفسه؛ ويعود بالتقدير إن تعذّر فكُّ الصوت. */
export async function refineStopMs(src: string, estimateMs: number): Promise<number> {
  try {
    const Ctx: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return estimateMs;
    const data = await (await fetch(src)).arrayBuffer();
    const ctx = new Ctx();
    try {
      const buffer = await ctx.decodeAudioData(data);
      return snapToQuiet(energyFrames(buffer.getChannelData(0), buffer.sampleRate, 20), 20, estimateMs);
    } finally { void ctx.close?.(); }
  } catch { return estimateMs; }
}

const FADE_MS = OPENING_FADE_MS;
/**
 * يراقب التشغيلَ إطارًا إطارًا (لا `timeupdate` البطيء): يخفض الصوتَ في آخر ٢٢٠ مللي ثانية
 * ثم يقف عند الموضع. `stopAt` يُسأل كلَّ إطار، فيُحدَّث القطعُ حين يصل تقريبُه إلى السكتة.
 */
export function watchStop(player: HTMLAudioElement, stopAt: () => number | undefined, onStop: () => void): () => void {
  let raf = 0, done = false;
  const base = player.volume;
  const tick = () => {
    if (done) return;
    const stop = stopAt();
    if (stop !== undefined && !player.paused) {
      const t = player.currentTime * 1000;
      if (t >= stop) {
        done = true; player.pause(); player.volume = base; onStop(); return;
      }
      player.volume = t >= stop - FADE_MS ? Math.max(0, base * ((stop - t) / FADE_MS)) : base;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { done = true; cancelAnimationFrame(raf); player.volume = base; };
}
