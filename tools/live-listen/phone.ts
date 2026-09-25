/*
 * تأخّرُ تطبيقٍ على الهاتف — من تسجيل شاشته.
 *
 * ميكروفونُ الآيفون لا يعمل عبر «مرآة الآيفون» (قيدٌ من Apple)، فلا يُقاس تطبيقٌ على الهاتف من
 * الحاسوب. فيُقاس هكذا: يُسجَّل شاشةُ الهاتف **والميكروفونُ مفتوح** (مركز التحكّم ← ضغطٌ مطوّل على
 * التسجيل ← الميكروفون)، والحاسوبُ يتلو بجانبه الملفَّ المرجعيّ نفسه الذي قِيس به «يسمعك». ثمّ:
 *
 *   npx tsx tools/live-listen/phone.ts ~/Downloads/ScreenRecording.mov --range 55:19-41 [--measure ink|color]
 *
 * ـ **متى قيلت**: يُطابَق غلافُ صوت التسجيل بغلاف الملفّ المرجعيّ (ارتباطٌ على ٢٠ ملّي ثانية)، فيُعرف
 *   أين يقع كلُّ زمنٍ من التلاوة في الفيديو؛ وأزمنةُ الكلمات من مقاطع Quran.com للملفّ نفسه.
 * ـ **متى ظهرت**: في «الإخفاء» يزيد حبرُ الصفحة كلّما كُشفت كلمة (`ink`: البكسلاتُ الداكنة)، وفي
 *   العرض العاديّ يزيد لونُ التعليم (`color`: البكسلاتُ المشبعة). ويُطبَّع من أوّل التلاوة إلى آخرها.
 * ـ **التأخّر**: لكلّ مستوى من ٥٪ إلى ٩٥٪ من حروف الوجه، الفرقُ بين لحظة بلوغه في الكشف ولحظة بلوغه في
 *   التلاوة. فلا يُحتاج إلى معرفة موضع كلّ كلمةٍ على شاشة التطبيق — وهو ما يجعل القياسَ واحدًا لأيّ تطبيق.
 */
import { execFileSync, spawn } from 'node:child_process';
import { quranSkeleton } from '../../src/lib/quran-orthography';
import { parseArgs } from './args';
import { buildRecitation, parseRange } from './recitation';

const FRAME_MS = 20;

/** صوتُ ملفٍّ أحاديًّا على ٨ كيلوهرتز. */
function pcm(file: string): Float32Array {
  const buf = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** غلافُ الطاقة (لوغاريتميّ، مطبَّع) على إطاراتٍ من ٢٠ ملّي ثانية. */
export function envelope(samples: Float32Array, rate = 8000): Float32Array {
  const hop = Math.round((rate * FRAME_MS) / 1000);
  const n = Math.floor(samples.length / hop);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let e = 0;
    for (let j = i * hop; j < (i + 1) * hop; j += 1) e += samples[j] * samples[j];
    env[i] = Math.log(1e-8 + e / hop);
  }
  let mean = 0; for (const v of env) mean += v; mean /= n || 1;
  let sd = 0; for (const v of env) sd += (v - mean) ** 2; sd = Math.sqrt(sd / (n || 1)) || 1;
  for (let i = 0; i < n; i += 1) env[i] = (env[i] - mean) / sd;
  return env;
}

/** أين يقع أوّلُ المرجع في التسجيل (بالإطارات)، وقوّةُ المطابقة (معاملُ ارتباطٍ من −١ إلى ١). */
export function locate(recording: Float32Array, reference: Float32Array): { offset: number; score: number } {
  let best = { offset: 0, score: -Infinity };
  const step = 5; // بحثٌ خشن كلَّ ١٠٠ ملّي ثانية ثمّ دقيق حول أفضله
  const score = (lag: number) => {
    let s = 0, n = 0;
    for (let i = Math.max(0, -lag); i < reference.length && i + lag < recording.length; i += 1) { s += reference[i] * recording[i + lag]; n += 1; }
    return n > reference.length / 2 ? s / n : -Infinity;
  };
  for (let lag = -reference.length; lag < recording.length; lag += step) { const v = score(lag); if (v > best.score) best = { offset: lag, score: v }; }
  for (let lag = best.offset - step; lag <= best.offset + step; lag += 1) { const v = score(lag); if (v > best.score) best = { offset: lag, score: v }; }
  return best;
}

/** مقدارُ الكشف في كلّ إطارٍ من الفيديو (بعد التطبيع ٠..١) — `ink` للإخفاء، و`color` لتعليم القراءة. */
async function revealCurve(file: string, measure: 'ink' | 'color', fps: number, crop: [number, number]): Promise<{ t: number; v: number }[]> {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
  const W = 160, H = Math.round((probe[1] / probe[0]) * W / 2) * 2;
  const ch = measure === 'color' ? 3 : 1;
  const top = Math.floor(H * crop[0]), bottom = Math.floor(H * crop[1]);
  const proc = spawn('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `fps=${fps},scale=${W}:${H}`, '-pix_fmt', measure === 'color' ? 'rgb24' : 'gray', '-f', 'rawvideo', '-']);
  const size = W * H * ch; const out: { t: number; v: number }[] = []; let pending = Buffer.alloc(0); let dark: boolean | null = null;
  for await (const chunk of proc.stdout) {
    pending = Buffer.concat([pending, chunk as Buffer]);
    while (pending.length >= size) {
      const f = pending.subarray(0, size); pending = pending.subarray(size);
      /* الحبرُ ما خالف الورق: داكنٌ على صفحةٍ فاتحة، وفاتحٌ على صفحةٍ داكنة (الوضعُ الليليّ في ترتيل). */
      if (dark === null && measure === 'ink') { let sum = 0, n = 0; for (let y = top; y < bottom; y += 4) for (let x = 0; x < W; x += 4) { sum += f[(y * W + x) * ch]; n += 1; } dark = sum / n < 100; }
      let count = 0;
      for (let y = top; y < bottom; y += 1) for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * ch;
        if (measure === 'ink') { if (dark ? f[i] > 150 : f[i] < 110) count += 1; }
        else { const r = f[i], g = f[i + 1], b = f[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx > 60 && (mx - mn) / mx > 0.35) count += 1; }
      }
      out.push({ t: out.length / fps, v: count });
    }
  }
  return out;
}

/** الزمنُ الأوّلُ الذي يبلغ فيه منحنًى متزايدٌ مستوًى ما. */
const reachAt = (curve: { t: number; v: number }[], level: number) => curve.find(p => p.v >= level)?.t ?? null;

export interface PhoneResult { offsetS: number; match: number; levels: { level: number; said: number; shown: number | null; delay: number | null }[]; delayMedian: number | null; delayP90: number | null }

async function main() {
  const argv = process.argv.slice(2);
  const file = argv[0];
  if (!file || file.startsWith('--')) throw new Error('usage: phone.ts <screen-recording.mov> --range 55:19-41 [--measure ink|color] [--fps 10] [--crop 0.12,0.88] [--cache dir]');
  const a = parseArgs(argv.slice(1), ['range', 'measure', 'fps', 'crop', 'cache', 'pad']);
  const measure = a.measure === 'color' ? 'color' : 'ink';
  const fps = Number(a.fps || 10);
  const crop = (a.crop || '0.12,0.88').split(',').map(Number) as [number, number];
  const recitation = await buildRecitation({ segments: parseRange(a.range || '55:19-41'), padSeconds: Number(a.pad || 120), cacheDir: a.cache || `${process.env.HOME}/.cache/mizan-live-listen/audio` });

  /* ١) أين التلاوةُ في الفيديو. */
  const ref = envelope(pcm(recitation.wav)).subarray(0, Math.ceil(recitation.speechMs / FRAME_MS));
  const rec = envelope(pcm(file));
  const { offset, score } = locate(rec, ref);
  const offsetS = (offset * FRAME_MS) / 1000;
  if (score < 0.3) console.warn(`weak audio match (${score.toFixed(2)}): was the microphone on in the screen recording?`);

  /* ٢) منحنى القول: نسبةُ حروف الوجه التي قيلت، بزمن الفيديو. */
  const letters = recitation.words.map(w => quranSkeleton(w.text).length);
  const total = letters.reduce((s, n) => s + n, 0);
  let acc = 0;
  const said = recitation.words.map((w, i) => { acc += letters[i]; return { t: offsetS + w.endMs / 1000, v: acc / total }; });

  /* ٣) منحنى الكشف: من أوّل التلاوة إلى ما بعد آخرها بعشرين ثانية، مُنعَّمًا ثانيةً ومتزايدًا. */
  const raw = await revealCurve(file, measure, fps, crop);
  const from = offsetS + (recitation.words[0]?.startMs ?? 0) / 1000 - 1, to = offsetS + recitation.speechMs / 1000 + 20;
  const inRange = raw.filter(p => p.t >= from && p.t <= to);
  const smooth = inRange.map((p, i) => { const w = inRange.slice(Math.max(0, i - fps / 2), i + fps / 2 + 1).map(q => q.v).sort((x, y) => x - y); return { t: p.t, v: w[Math.floor(w.length / 2)] }; });
  const lo = smooth[0]?.v ?? 0, hi = Math.max(...smooth.map(p => p.v));
  let run = 0;
  const shown = smooth.map(p => { run = Math.max(run, (p.v - lo) / ((hi - lo) || 1)); return { t: p.t, v: run }; });

  /* ٤) التأخّرُ عند كلّ مستوى. */
  const levels = Array.from({ length: 19 }, (_, i) => (i + 1) * 0.05).map(level => {
    const s = reachAt(said, level)!, v = reachAt(shown, level);
    return { level: Math.round(level * 100), said: +(s - offsetS).toFixed(2), shown: v === null ? null : +(v - offsetS).toFixed(2), delay: v === null ? null : +(v - s).toFixed(2) };
  });
  const delays = levels.map(l => l.delay).filter((d): d is number => d !== null).sort((x, y) => x - y);
  const result: PhoneResult = {
    offsetS: +offsetS.toFixed(2), match: +score.toFixed(2), levels,
    delayMedian: delays.length ? delays[Math.floor((delays.length - 1) / 2)] : null,
    delayP90: delays.length ? delays[Math.min(delays.length - 1, Math.floor(delays.length * 0.9))] : null,
  };
  console.log(`recitation found at ${result.offsetS} s of the video (audio match ${result.match}); measure: ${measure}`);
  console.log('level | said (s) | shown (s) | delay (s)');
  for (const l of levels) console.log(`${String(l.level).padStart(3)}% | ${String(l.said).padStart(7)} | ${String(l.shown ?? '—').padStart(8)} | ${l.delay ?? '—'}`);
  console.log(`delay: median ${result.delayMedian} s, p90 ${result.delayP90} s`);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && /phone\.ts$/.test(process.argv[1])) main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
