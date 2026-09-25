/*
 * نافذةُ السماع — ما يُرسل إلى المحرّك مع كلّ مقطع، وما يُثبَّت ممّا يعود.
 *
 * المقطعُ وحده (ثانيتان) يقطع الكلمةَ عند حدّه فيسمعها المحرّكُ خطأً. فيُرسل في سياقه:
 * ترويسةُ الملفّ (المقطعُ الأوّل، ولا يُفكّ ما بعده بدونها) ثمّ آخرُ المقاطع. والمحرّكُ
 * يطرح ما وقع في الترويسة، ويعدّ أزمنةَ الكلمات من بعدها.
 *
 * ولا يُثبَّت من جوابٍ إلا ما انتهى قبل حافّة النافذة بمهلة — فما عند الحافّة قد يكون
 * ناقصًا، وسيُسمع كاملًا في النافذة التالية. **فالشرطُ الذي يحرسه الاختبار**: كلُّ لحظةٍ
 * من التلاوة تقع في الجزء المُثبَّت من نافذةٍ ما. وإلا صارت كلماتُها «لم تُسمع» وهي قيلت.
 */

/** طولُ المقطع الواحد — التسجيلُ، وتوقيتُ الكلمة، وحدودُ النافذة كلُّها منه. وقصُر من ثانيتين ليتبع القلمُ القارئَ أسرع؛ والنافذةُ (٤ مقاطع) تحمل السياقَ نفسَه (٦ ثوانٍ). */
export const CHUNK_MS = 1500;
/** كم مقطعًا تحمل النافذةُ بعد الترويسة. */
export const WINDOW_CHUNKS = 4;
/** ما يُمسك عن التثبيت عند حافّة النافذة، إلا في المقطع الأخير. */
export const EDGE_HOLD_MS = 900;

/*
 * ساعةُ المقاطع: أين يبدأ كلُّ مقطعٍ من التسجيل حقًّا، وأين ينتهي.
 *
 * كانت الصفحةُ تحسب المقطعَ `CHUNK_MS` بالضبط: بدايةُ المقطع `k` عند `k × 1500`. وقِيس في كروم
 * في ٢٥ سبتمبر ٢٠٢٦ (سجلُّ المسجِّل، و`timecode` المتصفّح نفسُه): `MediaRecorder` بمهلة ١٥٠٠ يُخرج
 * مقاطعَ من ١٥٠٠ و١٥٦٠ ملّي ثانية — حدودُ أطر Opus — متوسّطُها ١٥٣٥. فتتأخّر ساعةُ الصفحة ٣٥ ملّي
 * ثانيةً كلَّ مقطع: ثلاثَ ثوانٍ ونصفًا عند المقطع المئة. والمحرّكُ يعدّ أزمنةَ الكلمات من بداية
 * المقطع الحقيقيّة (طابقت أزمنتُه تلاوةَ العفاسي بساعة المتصفّح ثابتةً إلى آخر الوجه، وبساعة الصفحة
 * انحرفت). فكانت الكلمةُ نفسُها في نافذتين متتاليتين تقع في زمنين، ويُطرح بعضُ الجديد على أنّه مكرّر.
 *
 * فالساعةُ تُقاس: من `timecode` المقطع حين يعطيه المتصفّح، وإلا فمن لحظة وصوله (نهايةُ المقطع هي
 * بدايةُ الذي يليه). وساعةُ الشبكة الثابتة تبقى لما لا قياسَ فيه.
 */
export interface ChunkClock {
  /** بدايةُ المقطع من أوّل التسجيل، بالملّي ثانية. */
  startOf(index: number): number;
  /** ونهايتُه — أو أبعدُ ما يُعرف منها إن لم يصل بعده مقطع. */
  endOf(index: number): number;
  /** المقطعُ الذي يقع فيه هذا الزمن. */
  indexAt(ms: number): number;
}

export const GRID_CLOCK: ChunkClock = {
  startOf: index => index * CHUNK_MS,
  endOf: index => (index + 1) * CHUNK_MS,
  indexAt: ms => Math.floor(Math.max(0, ms) / CHUNK_MS),
};

export class ChunkTimeline implements ChunkClock {
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];
  private origin: number | null = null;

  /** `startedAt`: لحظةُ بدء التسجيل على ساعة `performance.now()`. */
  constructor(private readonly startedAt: number) {}

  /** يُسجَّل المقطعُ حين يصل: `timecode` المتصفّح إن أعطاه، ولحظةُ وصوله. */
  add(index: number, timecode: number | null | undefined, arrivedAt: number): void {
    const measured = typeof timecode === 'number' && Number.isFinite(timecode) ? timecode : null;
    if (index === 0 && measured !== null) this.origin = measured;
    const start = index === 0
      ? 0
      : measured !== null && this.origin !== null ? measured - this.origin : this.ends[index - 1] ?? index * CHUNK_MS;
    this.starts[index] = start;
    if (index > 0) this.ends[index - 1] = start;
    this.ends[index] = Math.max(start, arrivedAt - this.startedAt);
  }

  startOf(index: number): number { return this.starts[index] ?? GRID_CLOCK.startOf(index); }

  endOf(index: number): number { return this.ends[index] ?? GRID_CLOCK.endOf(index); }

  indexAt(ms: number): number {
    if (!this.starts.length) return GRID_CLOCK.indexAt(ms);
    let lo = 0, hi = this.starts.length - 1;
    if (ms >= this.startOf(hi)) return hi + Math.max(0, Math.floor((ms - this.endOf(hi)) / CHUNK_MS) + (ms >= this.endOf(hi) ? 1 : 0));
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.startOf(mid) <= ms) lo = mid; else hi = mid - 1; }
    return lo;
  }
}

export interface RecognitionWindow {
  /** أوّلُ مقطعٍ يُرسل صوتُه محتوًى لا ترويسة. */
  first: number;
  /** أيُرسل المقطعُ الأوّل قبله ترويسةً تُطرح؟ */
  headed: boolean;
  /** بدايةُ المحتوى من أوّل التلاوة — وأزمنةُ الجواب تُعدّ منها. */
  startMs: number;
  endMs: number;
  /** آخرُ لحظةٍ يُثبَّت ما انتهى قبلها. */
  commitUntilMs: number;
}

/*
 * وما دامت النافذةُ تبلغ المقطعَ الأوّل، يُرسل صوتُه **محتوًى** لا ترويسة.
 *
 * فقد كان يُرسل ترويسةً من المقطع الثاني، والمحرّكُ يطرح ما في الترويسة — والجوابُ الأوّل
 * يُمسك ذيلَه عند الحافّة. فكان ما بين ٠٫٨ و٢ ثانية من أوّل التلاوة لا يُثبَّت أبدًا،
 * وتُعدّ كلماتُه ساقطةً وقد قيلت. قِيس ذلك باختبار التغطية قبل الإصلاح.
 */
export function recognitionWindow(index: number, final: boolean, clock: ChunkClock = GRID_CLOCK): RecognitionWindow {
  const first = Math.max(0, index - (WINDOW_CHUNKS - 1));
  const headed = first > 0;
  const startMs = clock.startOf(first);
  const endMs = clock.endOf(index);
  return { first, headed, startMs, endMs, commitUntilMs: endMs - (final ? 0 : EDGE_HOLD_MS) };
}

/*
 * نافذةُ اللحاق — حين يتأخّر السماعُ عن التلاوة.
 *
 * قِيس في متصفّحٍ حقيقيّ بعد #279: التأخّرُ يبدأ ١٦ ثانيةً ويبلغ ٧٤ ثانيةً بعد أربع دقائق. فكلُّ
 * طلبٍ يحمل ستَّ ثوانٍ فقط، وأربعُ ثوانٍ ونصفٌ منها سُمعت من قبل: كلُّ ثانيةٍ من التلاوة تُسمع
 * أربعَ مرّات. فإن أبطأ طلبٌ واحد، تراكم الباقي خلفه.
 *
 * و`faster-whisper` يمرّر كلَّ صوتٍ بنافذته الثابتة (ثلاثون ثانية) مهما قصر، فنافذةٌ من
 * أربعٍ وعشرين ثانيةً تكلّف قريبًا من كلفة نافذة الستّ — لا يزيد إلا فكُّ كلماتها.
 *
 * فإذا جاء دورُ مقطعٍ وخلفه أحدثُ منه، **يبقى أوّلُ نافذته كما هو** (فلا ثقبَ بعد آخر ما ثبت)
 * **ويمتدّ آخرُها إلى أحدث مقطعٍ وصل**، حتى `MAX_WINDOW_CHUNKS`. فيُلحق بالتلاوة في طلبٍ واحد.
 * وما دام السماعُ يلحق بها فالنافذةُ هي نافذةُ `recognitionWindow` بعينها.
 */
export const MAX_WINDOW_CHUNKS = 16;
/** كم تبدأ النافذةُ قبل آخر ما ثبت، إن رجعت إليه: قبل بداية الكلمة المعلّقة بهامش. */
export const PENDING_LEAD_MS = 300;

export interface CatchUpWindow extends RecognitionWindow {
  /** آخرُ مقطعٍ يُرسل صوتُه. */
  last: number;
}

/*
 * وأوّلُ النافذة يرجع إلى آخر ما ثبت إن كان أبعدَ من أوّلها المعتاد.
 *
 * فكلمةٌ ممدودةٌ أربعَ ثوانٍ («تكذّبان» عند العفاسي) لا تُثبَّت إلا في نافذةٍ تبدأ قبلها
 * وتنتهي بعدها بمهلة الحافّة، ونافذةُ الستّ ثوانٍ لا تسعها إلا إن وافقت حدودُها المقاطعَ.
 * فكانت تبقى معلّقةً لا تُثبَّت، وتُعدّ «ساقطةً» وقد قيلت. فإن كان آخرُ ما ثبت قبل أوّل
 * النافذة، بدأت النافذةُ منه — فالمعلّقةُ فيها كاملة.
 */
export function catchUpWindow(index: number, newest: number, final: boolean, committedUntilMs = Number.POSITIVE_INFINITY, clock: ChunkClock = GRID_CLOCK): CatchUpWindow {
  const base = recognitionWindow(index, final, clock);
  const last = final ? index : Math.max(index, newest);
  const pending = Number.isFinite(committedUntilMs) ? clock.indexAt(Math.max(0, committedUntilMs - PENDING_LEAD_MS)) : base.first;
  const first = Math.max(0, Math.min(base.first, pending), last - MAX_WINDOW_CHUNKS + 1);
  const endMs = clock.endOf(last);
  return { first, headed: first > 0, startMs: clock.startOf(first), endMs, commitUntilMs: endMs - (final ? 0 : EDGE_HOLD_MS), last };
}

/*
 * التثبيت: ما الجديدُ في جوابٍ من نافذةٍ تتداخل مع ما قبلها؟
 *
 * كان الجديدُ ما **بدأ** بعد آخر مُثبَّتٍ بثمانين ملّي ثانيةً على الأكثر. وأزمنةُ Whisper تتزحزح
 * بين نافذتين مئةً إلى ثلاثمئة، وكلماتُه متّصلة (بدايةُ كلٍّ نهايةُ ما قبلها): فالكلمةُ التي أُمسكت
 * عند حافّة نافذةٍ تعود في التالية وبدايتُها قبل الحدّ — فتُطرح «مكرّرة» ولم تُثبَّت قطّ. قِيس في
 * ٢٥ سبتمبر ٢٠٢٦ على جولةٍ حيّة (الوجه ٥٣٢، العفاسي): من ١٢٥ كلمةً قيلت لم تُثبَّت ستٌّ وعشرون،
 * أربعَ عشرةَ منها قالها المحرّكُ صحيحةً في نافذةٍ ما — فصارت «أسقطتَ»، وفجواتٍ توقف الجبهة.
 *
 * فالجديدُ ما وقع **منتصفُه** بعد آخر مُثبَّت: الكلمةُ الجديدةُ منتصفُها بعد الحدّ بنصف كلمة، والمكرّرةُ
 * قبله بنصف كلمة — وتزحزحُ الأزمنة أقلُّ من ذلك. وأُعيدت به إحدى عشرةَ جولةً حيّةً على أجوبة المستمع
 * نفسها: الكلماتُ المتابَعة ١٠٠٣ ← ١١٧٧، و«أسقطتَ» الكاذبة ١٣١ ← ٨٩، ولم تنقص متابعةُ جولةٍ واحدة.
 */
export interface TimedHeardWord { text: string; confidence: number; startMs?: number; endMs?: number }

export function commitWords<T extends TimedHeardWord>(
  words: readonly T[], windowStartMs: number, commitUntilMs: number, committedUntilMs: number,
): { committed: (T & { startMs: number; endMs: number })[]; committedUntilMs: number } {
  const committed: (T & { startMs: number; endMs: number })[] = [];
  let until = committedUntilMs;
  for (const word of words) {
    if (word.startMs === undefined || word.endMs === undefined) continue;
    const startMs = windowStartMs + word.startMs, endMs = windowStartMs + word.endMs;
    if ((startMs + endMs) / 2 < until || endMs > commitUntilMs) continue;
    committed.push({ ...word, startMs, endMs });
    until = Math.max(until, endMs);
  }
  return { committed, committedUntilMs: until };
}

/** وما بعد حافّة التثبيت من النافذة نفسها: جديدٌ لم يُثبَّت بعد (`provisionalReach` يكشف منه ما طابق). */
export function edgeWords(words: readonly TimedHeardWord[], windowStartMs: number, commitUntilMs: number, committedUntilMs: number): string[] {
  return words
    .filter(w => w.startMs !== undefined && w.endMs !== undefined
      && windowStartMs + (w.startMs + w.endMs) / 2 >= committedUntilMs && windowStartMs + w.endMs > commitUntilMs)
    .map(w => w.text);
}
