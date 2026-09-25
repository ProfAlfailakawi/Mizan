/*
 * إعادةُ جولةٍ مسجّلة على منطق الصفحة — بلا متصفّح.
 *
 * أجوبةُ المستمع كما وصلت في الجولة، والنوافذُ كما اختارتها الصفحةُ التي سجّلتها، ثمّ يُعاد على
 * ما في `src/` الآن: التثبيت (`commitWords`)، وتقليمُ ما قبل الوجه (`keepFaceEntry`)، وطرحُ أثر النغمة
 * (`dropWordsUnderAlert`)، والحكمُ والجبهة (`liveJudgment`)، والحافّة (`provisionalReach`). فيُجرَّب
 * تعديلٌ في المتابعة أو الحكم على الأصوات والأجوبة نفسها في ثوانٍ، قبل أن يُقاس في متصفّح.
 *
 *   npx tsx tools/live-listen/replay.ts out/*.json [--recorded grid|measured] [--reds]
 *
 * ـ `--recorded`: ساعةُ الصفحة التي سجّلت الجولة، لتُعاد نوافذُها كما كانت. `grid` (المقطعُ ١٥٠٠ بالضبط)
 *   لما قبل #290، و`measured` (ساعةُ المقاطع المقيسة من سجلّ المسجِّل) لما بعده.
 * ـ القارئُ متقن: كلُّ «خطأ» في الحكم الأخير كاذب. فالعددُ نصفُ مقياسٍ لا مقياسٌ كامل — الأخطاءُ الحقيقيّة
 *   تحتاج تلاواتِ طلاب.
 * ـ صُدّقت قبل أن يُبنى عليها (٢٥ سبتمبر ٢٠٢٦): على جولةٍ بسجلّ المقاطع أعادت ١١٦ كلمةً متابَعة من ١٢٥
 *   كما على الشاشة، و٩٣ منها في حدود ثانيتين من وقتها على الشاشة. وعلى منطق #290 نفسه (`--recorded
 *   measured`) أعادت جولتيه الحيّتين كما ظهرتا: ١٢٤ من ١٢٥ في كلتيهما، ووسيطُ التأخّر ٧٫٥ و٦٫٨ ث مقابل
 *   ٧٫٤ و٦٫٨ على الشاشة. والمسارُ التقريبيّ (`/align`) لا يُعاد.
 */
import { readFileSync } from 'node:fs';
import { keepFaceEntry, liveJudgment, provisionalReach } from '../../src/lib/live-judging';
import { alertWindow, dropWordsUnderAlert, planAlert, EMPTY_ALERT_MEMORY, type SoundWindow } from '../../src/lib/recitation-alerts';
import { quranSkeleton } from '../../src/lib/quran-orthography';
import { CHUNK_MS, ChunkTimeline, GRID_CLOCK, catchUpWindow, commitWords, edgeWords, type ChunkClock } from '../../src/lib/recognition-window';
import type { LiveRun } from './run';

export interface ReplayResult {
  label: string;
  committed: number;
  followed: number;
  faceWords: number;
  falseMarks: { index: number; kind: string; expected?: string; heard?: string }[];
  delayMedian: number | null;
  delayP90: number | null;
  early: string[];
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null);
const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.9))] : null);

export function replayRun(run: LiveRun, recorded: 'grid' | 'measured' = 'grid'): ReplayResult {
  if (run.rec.onset === null) throw new Error(`NO_AUDIO ${run.meta.label}`);
  const expected = run.faceWords.map(w => ({ index: w.index, text: w.text }));
  const face = new Set(expected.map(w => quranSkeleton(w.text)));
  const t0 = run.rec.onset - (run.recitation.words[0]?.startMs ?? 0);
  const sec = (page: number) => (page - t0) / 1000;
  const replies = run.net.filter(n => n.kind === 'recognise' && n.body && (n.sentAt ?? 0) > 0).sort((a, b) => a.sentAt! - b.sentAt!);
  if (!replies.length) throw new Error(`NO_REPLIES ${run.meta.label}`);

  /* لحظاتُ وصول المقاطع من سجلّ المسجِّل؛ وبدونه شبكةٌ ثابتةٌ من أوّل طلب. */
  const log = run.rec.recorders?.[0];
  const arrivals = log ? log.chunks.map(c => c[0]) : Array.from({ length: 4000 }, (_, k) => replies[0].sentAt! - 2 + k * CHUNK_MS);
  let clock: ChunkClock = GRID_CLOCK;
  if (recorded === 'measured') {
    if (!log) throw new Error(`NO_CHUNK_LOG ${run.meta.label}: --recorded measured needs a run with rec.recorders`);
    const timeline = new ChunkTimeline(log.startedAt);
    log.chunks.forEach(([at, tc], i) => timeline.add(i, tc, at));
    clock = timeline;
  }
  const newestAt = (t: number) => { let k = -1; for (let i = 0; i < arrivals.length && arrivals[i] <= t + 1; i += 1) k = i; return k; };
  const startedAt = log ? log.startedAt : replies[0].sentAt! - CHUNK_MS;

  /* والنوافذُ تتبع «آخرَ مُثبَّتٍ» عند الصفحة التي سجّلت — بقاعدتها هي (البدايةُ قبل #290، والمنتصفُ بعده). */
  let pageCommitted = 0;
  let committedUntil = 0, previous = -1, trusted = -1, memory = EMPTY_ALERT_MEMORY, committed = 0;
  const alerts: SoundWindow[] = [];
  let heard: { text: string; confidence: number; startMs?: number; endMs?: number }[] = [];
  const reach: { at: number; index: number }[] = [];
  for (const reply of replies) {
    const newest = newestAt(reply.sentAt!);
    let index = previous + 1;
    while (index < newest && clock.startOf(Math.max(0, index - 2)) <= pageCommitted) index += 1;
    const window = catchUpWindow(index, newest, false, pageCommitted, clock);
    const words = (reply.body.words ?? []) as { text: string; confidence: number; startMs?: number; endMs?: number }[];
    for (const w of words) {
      if (w.startMs === undefined || w.endMs === undefined) continue;
      const s = window.startMs + w.startMs, e = window.startMs + w.endMs;
      if ((recorded === 'grid' ? s < pageCommitted - 80 : (s + e) / 2 < pageCommitted) || e > window.commitUntilMs) continue;
      pageCommitted = Math.max(pageCommitted, e);
    }
    const edge = edgeWords(words, window.startMs, window.commitUntilMs, committedUntil);
    const out = commitWords(words, window.startMs, window.commitUntilMs, committedUntil);
    committedUntil = out.committedUntilMs;
    committed += out.committed.length;
    const { kept } = dropWordsUnderAlert(out.committed, alerts, text => face.has(quranSkeleton(text)));
    heard = keepFaceEntry([...heard, ...kept], trusted);
    const judged = liveJudgment(expected, heard, reply.body.gate ?? { word: 'OPEN', tashkeel: 'CLOSED' }, undefined, trusted);
    trusted = Math.max(trusted, judged.frontier);
    reach.push({ at: sec(reply.at), index: provisionalReach(expected, judged.frontier, edge) });
    const now = reply.at - startedAt;
    const plan = planAlert(judged.settled, memory, now);
    memory = plan.memory;
    if (plan.sound) alerts.push(alertWindow(now));
    previous = index;
  }

  /* لكلّ كلمةٍ أوّلُ لحظةٍ بلغها القلم. */
  const shown = new Map<number, number>();
  let top = -1;
  for (const r of reach) { for (let k = top + 1; k <= r.index; k += 1) shown.set(k, r.at); top = Math.max(top, r.index); }
  const said = new Map(run.recitation.words.map(w => [`${w.ayah}:${w.pos}`, w]));
  const delays: number[] = [], early: string[] = [];
  for (const w of run.faceWords) {
    const s = said.get(`${w.ayah}:${w.ayahWordIndex}`); const at = shown.get(w.index);
    if (!s || at === undefined) continue;
    delays.push(at - s.endMs / 1000);
    if (at < s.startMs / 1000) early.push(`${w.ayah}:${w.ayahWordIndex}`);
  }
  const saidOnFace = new Set(run.faceWords.filter(w => said.has(`${w.ayah}:${w.ayahWordIndex}`)).map(w => w.index));
  const final = liveJudgment(expected, heard, { word: 'OPEN', tashkeel: 'CLOSED' } as never, 0);
  const falseMarks = (final.judgment?.mistakes ?? [])
    .filter(m => m.wordIndex !== null && saidOnFace.has(m.wordIndex) && (m.kind === 'skipped' || m.kind === 'substituted'))
    .map(m => ({ index: m.wordIndex!, kind: m.kind, expected: m.expected, heard: m.heard }));
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    label: run.meta.label, committed, followed: shown.size, faceWords: expected.length, falseMarks,
    delayMedian: r1(median(delays)), delayP90: r1(p90(delays)), early,
  };
}

if (process.argv[1] && /replay\.ts$/.test(process.argv[1])) {
  const argv = process.argv.slice(2);
  const files = argv.filter(a => a.endsWith('.json'));
  const recorded = argv.includes('measured') ? 'measured' : 'grid';
  console.log('run | followed | false marks (skipped) | delay med | p90 | early');
  for (const f of files) {
    const r = replayRun(JSON.parse(readFileSync(f, 'utf8')) as LiveRun, recorded);
    const skipped = r.falseMarks.filter(m => m.kind === 'skipped').length;
    console.log(`${r.label} | ${r.followed}/${r.faceWords} | ${r.falseMarks.length} (${skipped}) | ${r.delayMedian ?? '—'} | ${r.delayP90 ?? '—'} | ${r.early.length}`);
    if (argv.includes('--reds')) for (const m of r.falseMarks) console.log(`   ${m.index} ${m.kind} ${m.expected ?? ''} ← ${m.heard ?? ''}`);
  }
}
