/*
 * «أوّلُ آية» سطرًا واحدًا على الأكثر.
 *
 * طلبُ اللجنة: التلاوةُ التي تُسمَع المتسابقَ في أوّل موضعه لا تزيد على سطرٍ واحد، فمن
 * الآيات ما يطول جدًّا (آيةُ الدَّين وحدها وجهٌ كامل)، وسماعُها كلِّها ليس تلقينًا بل تلاوةٌ
 * عنه. فيُحسب هنا أين يقف الصوت:
 *
 *   ١) الآيةُ التي تتمّ في سطرها تُسمع كلُّها — فهي سطرٌ أو دونه.
 *   ٢) وإلا وقف عند آخر كلمةٍ من سطرها الأوّل كما هو مطبوعٌ في المصحف.
 *   ٣) فإن بدأت الآيةُ في آخر سطرها (أقلّ من نصفه) لم يُكتفَ بكلمةٍ أو اثنتين: يمضي إلى
 *      قدرِ سطرٍ واحد من الكلمات، ولا يزيد.
 *   ٤) وإن كان في هذا القدر علامةُ وقفٍ بعد نصفه وقف عندها — فهناك يسكت القارئُ نفسُه،
 *      فيأتي القطعُ على سكتةٍ لا في وسط نَفَس. (ولا يُوقف عند «لا» ۙ.)
 *
 * وحين لا يُعرف سطرُ كلّ كلمة (مصاحفُ لا تخطيطَ لها) يُقدَّر السطرُ من امتداد الآية على
 * الأسطر، وإلا فمن متوسّط السطر في مصحف المدينة (نحو تسع كلمات). والتقديرُ يقال في السبب.
 */

import { REFERENCE_AUDIO_ID, REFERENCE_AUDIO_READING } from './reference-audio-policy';

export type OpeningCutReason = 'FITS_ONE_LINE' | 'LINE_END' | 'WAQF' | 'LINE_LENGTH' | 'ESTIMATED_LINE';

export interface OpeningCutInput {
  /** كلماتُ الآية المتلوّة بترتيبها (بلا رقم الآية ولا «۞»). */
  words: readonly string[];
  /** سطرُ كلّ كلمةٍ في الصفحة المطبوعة، حين يُعرف التخطيط. */
  lines?: readonly (number | undefined)[];
  /** كم كلمةً في سطرٍ تامٍّ من هذه الصفحة. */
  lineWords?: number;
  /** على كم سطرًا تمتدّ الآية (`lineEnd - lineStart + 1`) حين لا يُعرف سطرُ كلّ كلمة. */
  lineSpan?: number;
}

export interface OpeningCut {
  /** آخرُ كلمةٍ تُسمع (من صفر). */
  lastWord: number;
  /** هل تُسمع الآيةُ كلُّها؟ */
  whole: boolean;
  reason: OpeningCutReason;
}

/** متوسّطُ كلمات السطر في مصحف المدينة: ≈٧٧٤٠٠ كلمة على ≈٨٨٣٠ سطرًا نصّيًّا. */
export const AVERAGE_LINE_WORDS = 9;

/* علاماتُ الوقف التي يُسكت عندها: صلى، قلى، م، ج، والمعانقة. و«لا» (ۙ) ليست منها. */
const WAQF_STOP = /[ۖۗۘۚۛ]/;

export function planOpeningCut(input: OpeningCutInput): OpeningCut {
  const n = input.words.length;
  if (!n) return { lastWord: -1, whole: true, reason: 'FITS_ONE_LINE' };
  const whole = (reason: OpeningCutReason): OpeningCut => ({ lastWord: n - 1, whole: true, reason });

  let limit: number;
  let reason: OpeningCutReason;
  const lines = input.lines;
  if (lines && lines.length === n && lines.every(l => Number.isInteger(l))) {
    const first = lines[0]!;
    let onFirst = 0;
    while (onFirst < n && lines[onFirst] === first) onFirst += 1;
    if (onFirst === n) return whole('FITS_ONE_LINE');
    const perLine = new Map<number, number>();
    for (const l of lines) perLine.set(l!, (perLine.get(l!) ?? 0) + 1);
    const full = Math.max(1, input.lineWords ?? Math.max(...perLine.values()));
    if (onFirst * 2 >= full) { limit = onFirst; reason = 'LINE_END'; }
    else { limit = Math.min(n, full); reason = 'LINE_LENGTH'; }
  } else {
    const span = input.lineSpan;
    if (span !== undefined && span <= 1) return whole('FITS_ONE_LINE');
    const perLine = span && span > 1 ? Math.round(n / (span - 0.5)) : AVERAGE_LINE_WORDS;
    limit = Math.min(n, Math.max(3, perLine));
    reason = 'ESTIMATED_LINE';
  }
  if (limit >= n) return whole(reason === 'ESTIMATED_LINE' ? 'ESTIMATED_LINE' : 'FITS_ONE_LINE');

  /* سكتةُ القارئ أولى من حدّ السطر، ما دامت بعد نصفه. */
  for (let i = limit - 2; i >= Math.ceil(limit / 2) - 1; i -= 1) {
    if (i >= 0 && WAQF_STOP.test(input.words[i])) return { lastWord: i, whole: false, reason: 'WAQF' };
  }
  return { lastWord: limit - 1, whole: false, reason };
}

/** زمنُ نهاية الكلمة في تلاوتها — أو لا شيء إن لم يُعرف توقيتُها. */
export function cutTimeMs(words: readonly { startMs: number; endMs: number }[], cut: OpeningCut): number | undefined {
  if (cut.whole) return undefined;
  const w = words[cut.lastWord];
  if (!w || !Number.isFinite(w.endMs)) return undefined;
  /* مقطعٌ مقيسٌ يضمّ الكلمةَ وما بعدها: يُقطع عند منتصفه لا عند آخره، فلا تُسمع الكلمةُ التالية كاملة. */
  const next = words[cut.lastWord + 1];
  if (next && next.startMs === w.startMs && next.endMs === w.endMs) return Math.round((w.startMs + w.endMs) / 2);
  return w.endMs;
}

/**
 * يقرّب موضعَ القطع إلى أهدأ لحظةٍ حوله في الصوت نفسه.
 *
 * التوقيتُ المقدَّر يخطئ بمئات المللي ثانية، والقطعُ في وسط حرفٍ يُسمع بترًا. فتُقاس طاقةُ
 * الصوت في نوافذ قصيرة (`energy`، كلُّ نافذةٍ `frameMs`)، ويُختار أخفضُها في نافذة بحثٍ حول
 * التقدير — وأقربُها إليه عند التساوي.
 */
export function snapToQuiet(energy: ArrayLike<number>, frameMs: number, estimateMs: number, before = 400, after = 600): number {
  if (!energy.length || !(frameMs > 0)) return estimateMs;
  const lo = Math.max(0, Math.floor((estimateMs - before) / frameMs));
  const hi = Math.min(energy.length - 1, Math.ceil((estimateMs + after) / frameMs));
  if (hi < lo) return estimateMs;
  let best = lo, bestScore = Infinity;
  for (let i = lo; i <= hi; i += 1) {
    const at = (i + 0.5) * frameMs;
    /* الأهدأُ أوّلًا، ثم الأقربُ إلى التقدير (وزنٌ خفيف يكسر التعادل). */
    const score = energy[i] * (1 + Math.abs(at - estimateMs) / 4000);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  /* وتُؤخذ السكتةُ كلُّها لا أوّلُها: يُوقف بعد أوّلها بقدر خفض الصوت، فيقع الخفضُ في الصمت
     نفسه ولا يمسّ آخرَ حرفٍ من الكلمة. فإن قصرت السكتةُ عن ذلك وُقف في وسطها. */
  const quiet = energy[best] * 1.6 + 1e-4;
  const reach = Math.ceil(400 / frameMs);
  let a = best, b = best;
  while (a > 0 && best - a < reach && energy[a - 1] <= quiet) a -= 1;
  while (b < energy.length - 1 && b - best < reach && energy[b + 1] <= quiet) b += 1;
  const start = a * frameMs, end = (b + 1) * frameMs, inside = start + OPENING_FADE_MS + 40;
  return Math.round(end >= inside ? inside : (start + end) / 2);
}

/** خفضُ الصوت قبل الوقوف — يُسمع انتهاءً لا بترًا. */
export const OPENING_FADE_MS = 220;

/** طاقةُ الصوت (جذرُ متوسّط المربّعات) في نوافذ متتالية. */
export function energyFrames(samples: Float32Array, sampleRate: number, frameMs = 20): Float32Array {
  const size = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const out = new Float32Array(Math.ceil(samples.length / size));
  for (let f = 0; f < out.length; f += 1) {
    let sum = 0;
    const end = Math.min(samples.length, (f + 1) * size);
    for (let i = f * size; i < end; i += 1) sum += samples[i] * samples[i];
    out[f] = Math.sqrt(sum / Math.max(1, end - f * size));
  }
  return out;
}

/**
 * تسجيلُ «أوّل آية»: تسجيلُ حفص (المعيقلي) للروايات العشرين كلّها — قرارُ المالك في
 * `reference-audio-policy.ts`: الصوتُ مرجعٌ سمعيٌّ واحد، لا دليلٌ على نصّ الرواية المعروضة.
 * فيُقاس القطعُ على نصّ حفص وصفحته أيًّا كانت روايةُ المتسابق، لأنّ الصوتَ صوتُ حفص.
 */
export const OPENING_RECORDING = REFERENCE_AUDIO_ID;
export const OPENING_TEXT_READING = REFERENCE_AUDIO_READING;
