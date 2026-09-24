/*
 * مقاطعُ التلاوة آيةً آية — من السماع الحيّ إلى المعلّم.
 *
 * المعلّمُ (كشفُ التشكيل والتجويد) يسمع مقطعًا قصيرًا ويقابله بمرجع آيته. فلا يُعطى تسجيلَ
 * الوجه كلَّه (دقيقةً أو أكثر)، بل يُعطى أين تبدأ كلُّ آيةٍ وأين تنتهي. وهذا يعرفه السماعُ
 * الحيّ: كلُّ كلمةٍ سُمعت عادت بزمنها من أوّل التلاوة. فتُقابَل الكلماتُ المسموعة بكلمات الوجه
 * (أطولُ تتابعٍ مشترك على هيكل الحروف)، ويؤخذ من كلّ آيةٍ أوّلُ ما سُمع منها وآخرُه.
 *
 * وما لا يُطمأنّ إليه لا يُرسل:
 *   ـ آيةٌ لم يُسمع أكثرُ كلماتها (دون ٦٠٪) — لا يُعرف أين هي من الصوت.
 *   ـ كلماتُ طرفَي الآية التي لم تُسمع — لا يُحكم على ما لا يُعرف زمنه، فيُقصر المقطعُ على
 *     ما بين أوّل كلمةٍ عُرف زمنُها وآخرِها.
 * والآيةُ الطويلة تُقسم عند حدود الكلمات مقاطعَ لا يزيد أحدُها على ١٤ ثانية: النموذجُ درّب
 * على مقاطعَ قصيرةٍ عند مواضع الوقف.
 */
import { quranSkeleton } from './quran-orthography';

export interface SegmentWord { index: number; text: string; surah: number; ayah: number }
export interface TimedWord { text: string; startMs?: number; endMs?: number }

export interface AyahSegment {
  id: string;
  surah: number;
  ayah: number;
  startMs: number;
  endMs: number;
  /** كلماتُ الآية كلُّها كما في الوجه (ومنها ۞)، وفهارسُها في الوجه. */
  ayahWords: string[];
  wordIndices: number[];
  /** المقطعُ يغطّي `ayahWords[from..to]`. */
  from: number;
  to: number;
}

export interface SegmentOptions {
  maxMs?: number;
  minCoverage?: number;
  leadMs?: number;
  tailMs?: number;
}

const DEFAULTS: Required<SegmentOptions> = { maxMs: 14_000, minCoverage: 0.6, leadMs: 150, tailMs: 250 };
const isWord = (text: string) => quranSkeleton(text).length > 0;

/**
 * يقابل الكلماتِ المسموعة بكلمات الوجه: أطولُ تتابعٍ مشترك على هيكل الحروف.
 * يُعاد لكلّ كلمةٍ في الوجه زمنُ ما قابلها — أو لا شيء إن لم تُسمع.
 */
export function alignHeardToFace(face: readonly SegmentWord[], heard: readonly TimedWord[]): Map<number, { startMs: number; endMs: number }> {
  const a = face.map(w => quranSkeleton(w.text));
  const b = heard.map(w => quranSkeleton(w.text));
  const n = a.length, m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = new Map<number, { startMs: number; endMs: number }>();
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) {
      const h = heard[j];
      if (Number.isFinite(h.startMs) && Number.isFinite(h.endMs)) out.set(face[i].index, { startMs: h.startMs as number, endMs: h.endMs as number });
      i += 1; j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else j += 1;
  }
  return out;
}

/** مقاطعُ الوجه آيةً آية (وتُقسم الطويلة) — لما سُمع منه وحده. */
export function buildAyahSegments(face: readonly SegmentWord[], heard: readonly TimedWord[], options: SegmentOptions = {}): AyahSegment[] {
  const o = { ...DEFAULTS, ...options };
  const times = alignHeardToFace(face, heard);
  const ayat: SegmentWord[][] = [];
  for (const w of face) {
    const last = ayat[ayat.length - 1];
    if (last && last[0].surah === w.surah && last[0].ayah === w.ayah) last.push(w);
    else ayat.push([w]);
  }
  const out: AyahSegment[] = [];
  for (const words of ayat) {
    const recited = words.map((w, pos) => ({ w, pos })).filter(x => isWord(x.w.text));
    const timed = recited.filter(x => times.has(x.w.index));
    if (!recited.length || timed.length / recited.length < o.minCoverage) continue;
    const base = {
      surah: words[0].surah, ayah: words[0].ayah,
      ayahWords: words.map(w => w.text), wordIndices: words.map(w => w.index),
    };
    /* تُقسم عند حدود الكلمات: يُبدأ مقطعٌ جديد إن جاوز الحالُّ الحدَّ الأقصى. */
    let piece: typeof timed = [];
    const flush = () => {
      if (!piece.length) return;
      const first = times.get(piece[0].w.index)!, last = times.get(piece[piece.length - 1].w.index)!;
      out.push({
        ...base,
        id: `${base.surah}:${base.ayah}${out.some(s => s.surah === base.surah && s.ayah === base.ayah) ? `:${piece[0].pos}` : ''}`,
        startMs: Math.max(0, first.startMs - o.leadMs), endMs: last.endMs + o.tailMs,
        from: piece[0].pos, to: piece[piece.length - 1].pos,
      });
      piece = [];
    };
    for (const x of timed) {
      if (piece.length) {
        const start = times.get(piece[0].w.index)!.startMs;
        if (times.get(x.w.index)!.endMs - start > o.maxMs) flush();
      }
      piece.push(x);
    }
    flush();
  }
  /* ولا يتداخل مقطعان: ذيلُ مقطعٍ لا يدخل كلامَ ما بعده. */
  for (let k = 1; k < out.length; k += 1) {
    if (out[k].startMs < out[k - 1].endMs) {
      const mid = Math.round((out[k].startMs + out[k - 1].endMs) / 2);
      out[k - 1].endMs = Math.max(out[k - 1].startMs + 1, mid);
      out[k].startMs = Math.min(out[k].endMs - 1, mid);
    }
  }
  return out;
}
