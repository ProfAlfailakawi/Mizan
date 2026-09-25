/*
 * قراءةُ جولةٍ من `run.ts`: لكلّ كلمةٍ على الوجه متى قيلت ومتى ظهرت، وكم تأخّر السماع.
 *
 * ـ **الزمن**: مرساتُه أوّلُ صوتٍ جاء من الميكروفون، وهو أوّلُ كلمةٍ في الملفّ. فكلُّ زمنٍ هنا
 *   زمنٌ في التسجيل نفسه، بالثواني.
 * ـ **الظهور**: في الوضع العادي أن تُعلَّم الكلمةُ مقروءة (`data-live` = done أو pen)؛ وفي
 *   «اختبر حفظك» أن يُرفع عنها الحجاب. والظهورُ قبل بداية نطقها «مبكّر» — أسوأُ ما يكون في الإخفاء.
 * ـ **تأخّرُ السماع**: لكلّ ردٍّ من `/recognise`، آخرُ كلمةٍ منه طابقت كلمةً من التلاوة، وكم مضى
 *   على نهاية نطقها حين وصل الردّ. والمطابقةُ رتيبةٌ لا ترجع أكثر من ١٢ كلمة (اللوازمُ تتكرّر).
 */
import { readFileSync } from 'node:fs';
import { quranSkeleton } from '../../src/lib/quran-orthography';
import type { LiveRun } from './run';

export interface WordResult {
  index: number;
  surah: number;
  ayah: number;
  pos: number;
  text: string;
  endsAyah: boolean;
  /** بالثواني في التسجيل؛ `null` كلمةٌ على الوجه لم تُقل فيه. */
  saidStart: number | null;
  saidEnd: number | null;
  shown: number | null;
  /** أوّلُ مرّةٍ عُلّمت خطأً، وهل بقيت معلّمةً في آخر الجولة. */
  markedAt: number | null;
  markedAtEnd: string | null;
}

export interface LagPoint { at: number; lag: number; ayah: number; pos: number }

export interface RunSummary {
  said: number;
  shown: number;
  delayMedian: number | null;
  delayP90: number | null;
  early: number;
  earliest: number | null;
  wrongRed: number;
  lagFirst30: number | null;
  lagMedian: number | null;
  lagP90: number | null;
  recogniseMedian: number | null;
  alignMedian: number | null;
  /** «اختبر حفظك»: كم بقي الوجهُ مكشوفًا بين «ابدأ» وعودة الحجاب. */
  veilDrop: number | null;
}

export interface RunResult {
  label: string;
  mode: 'normal' | 'veil';
  build: string | null;
  origin: string;
  bundles: string[];
  recitation: { range: string; surah: number; fromAyah: number; toAyah: number; speechMs: number; totalMs: number };
  words: WordResult[];
  lag: LagPoint[];
  summary: RunSummary;
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
export const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null);
export const quantile = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] : null);

/** تشابهُ هيكلين: ١ − مسافةُ التحرير ÷ الأطول. */
export function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

export function analyzeRun(run: LiveRun): RunResult {
  const { rec, recitation } = run;
  if (rec.onset === null) throw new Error(`NO_AUDIO ${run.meta.label}: the fake microphone was silent (a relative wav path gives silence)`);
  const firstWordMs = recitation.words[0]?.startMs ?? 0;
  const t0 = rec.onset - firstWordMs;
  const sec = (pageMs: number) => (pageMs - t0) / 1000;
  const timeline = new Map(recitation.words.map(w => [`${w.surah}:${w.ayah}:${w.pos}`, w]));
  const veil = run.meta.mode === 'veil';

  const shown = new Map<number, number>();
  const markedAt = new Map<number, number>();
  const last = new Map<number, string>();
  for (const [t, i, state] of rec.trans) {
    const [live, veiled, mistake] = state.split('|');
    if (t > rec.onset && !shown.has(i) && (veil ? veiled !== 'V' : live === 'done' || live === 'pen')) shown.set(i, sec(t));
    if (t > rec.onset && mistake !== '-' && !markedAt.has(i)) markedAt.set(i, sec(t));
    last.set(i, state);
  }

  const words: WordResult[] = run.faceWords.map(w => {
    const said = timeline.get(`${w.surah}:${w.ayah}:${w.ayahWordIndex ?? 0}`);
    const end = (last.get(w.index) ?? '-|-|-').split('|')[2];
    return {
      index: w.index, surah: w.surah, ayah: w.ayah, pos: w.ayahWordIndex ?? 0, text: w.text, endsAyah: !!w.endsAyah,
      saidStart: said ? round(said.startMs / 1000) : null, saidEnd: said ? round(said.endMs / 1000) : null,
      shown: shown.has(w.index) ? round(shown.get(w.index)!) : null,
      markedAt: markedAt.has(w.index) ? round(markedAt.get(w.index)!) : null,
      markedAtEnd: end === '-' ? null : end,
    };
  });

  /* تأخّرُ السماع — ردٌّ ردّ. */
  const skeletons = recitation.words.map(w => quranSkeleton(w.text));
  const replies = run.net.filter(n => n.kind === 'recognise' && n.body && n.at > 0).sort((a, b) => a.at - b.at);
  const lag: LagPoint[] = [];
  let prev = 0;
  for (const reply of replies) {
    let heard = ((reply.body.words ?? []) as { text: string }[]).map(w => quranSkeleton(w.text)).filter(Boolean);
    /* الترويسة: كلمةُ أوّل التسجيل في رأس ردٍّ متأخّرٍ صوتُ الترويسة لا موضعُ القارئ. */
    if (lag.length > 2 && heard.length && similarity(heard[0], skeletons[0]) > 0.8) heard = heard.slice(1);
    if (!heard.length) continue;
    let best: { score: number; at: number; hits: number } | null = null;
    for (let p = Math.max(0, prev - 12); p < skeletons.length; p += 1) {
      let score = 0, hits = 0;
      for (let j = 0; j < heard.length && p - j >= 0; j += 1) {
        const s = similarity(heard[heard.length - 1 - j], skeletons[p - j]);
        if (s >= 0.7) { score += s; hits += 1; }
      }
      if (hits >= Math.min(2, heard.length) && (!best || score > best.score + 1e-9)) best = { score, at: p, hits };
    }
    if (!best) continue;
    prev = best.at;
    const w = recitation.words[best.at];
    lag.push({ at: round(sec(reply.at), 1), lag: round(sec(reply.at) - w.endMs / 1000, 1), ayah: w.ayah, pos: w.pos });
  }

  const said = words.filter(w => w.saidStart !== null);
  const delays = said.filter(w => w.shown !== null).map(w => w.shown! - w.saidEnd!);
  const early = said.filter(w => w.shown !== null && w.shown < w.saidStart!);
  const serverTimes = (kind: 'align' | 'recognise') => run.net.filter(n => n.kind === kind && n.sentAt && n.sentAt > 0 && n.at > 0).map(n => (n.at - n.sentAt!) / 1000);

  let veilDrop: number | null = null;
  if (veil) {
    const ref = words.find(w => w.saidStart !== null)?.index ?? 0;
    const around = rec.trans.filter(([t, i]) => i === ref && t >= run.clickAt - 50);
    const off = around.find(([, , s]) => s.split('|')[1] !== 'V');
    const on = off && around.find(([t, , s]) => t > off[0] && s.split('|')[1] === 'V');
    if (off && on) veilDrop = round((on[0] - off[0]) / 1000);
  }
  const r1 = (v: number | null) => (v === null ? null : round(v, 1));
  return {
    label: run.meta.label, mode: run.meta.mode, build: run.meta.build, origin: run.meta.origin, bundles: run.meta.bundles,
    recitation: { range: recitation.range ?? `${recitation.surah}:${recitation.fromAyah}-${recitation.toAyah}`, surah: recitation.surah, fromAyah: recitation.fromAyah, toAyah: recitation.toAyah, speechMs: recitation.speechMs, totalMs: recitation.totalMs },
    words, lag,
    summary: {
      said: said.length, shown: delays.length,
      delayMedian: r1(median(delays)), delayP90: r1(quantile(delays, 0.9)),
      early: early.length, earliest: early.length ? r1(Math.max(...early.map(w => w.saidStart! - w.shown!))) : null,
      wrongRed: said.filter(w => w.markedAtEnd).length,
      lagFirst30: r1(median(lag.filter(p => p.at - p.lag < 30).map(p => p.lag))),
      lagMedian: r1(median(lag.map(p => p.lag))), lagP90: r1(quantile(lag.map(p => p.lag), 0.9)),
      recogniseMedian: r1(median(serverTimes('recognise'))), alignMedian: r1(median(serverTimes('align'))),
      veilDrop,
    },
  };
}

/* npx tsx tools/live-listen/analyze.ts out/*.json */
if (process.argv[1] && /analyze\.ts$/.test(process.argv[1])) {
  const rows = process.argv.slice(2).map(f => analyzeRun(JSON.parse(readFileSync(f, 'utf8'))));
  const cols: [string, (r: RunResult) => unknown][] = [
    ['run', r => r.label], ['mode', r => r.mode], ['build', r => (r.build ?? '').slice(0, 7)],
    ['shown/said', r => `${r.summary.shown}/${r.summary.said}`], ['delay med', r => r.summary.delayMedian], ['p90', r => r.summary.delayP90],
    ['early', r => r.summary.early], ['wrong red', r => r.summary.wrongRed], ['lag 30s', r => r.summary.lagFirst30],
    ['lag med', r => r.summary.lagMedian], ['lag p90', r => r.summary.lagP90], ['recognise', r => r.summary.recogniseMedian],
    ['align', r => r.summary.alignMedian], ['veil drop', r => r.summary.veilDrop],
  ];
  console.log(cols.map(c => c[0]).join(' | '));
  for (const r of rows) console.log(cols.map(c => String(c[1](r) ?? '—')).join(' | '));
}
