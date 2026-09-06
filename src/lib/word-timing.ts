/*
 * توقيت الكلمة داخل تلاوة الآية.
 *
 * تُسلَّم التلاوة المرجعية ملفًا واحدًا لكل آية، فلا تحمل مقاطع زمنية لكل كلمة. وهذا النموذج
 * يوزّع مدة الآية على كلماتها بوزن نطقي — لا بعدد الحروف المجرّد — لأن زمن التلاوة تحكمه
 * المدود والشدّات والسكون، لا طول الكلمة كتابةً.
 *
 * الحدّ الصادق: هذا **تقدير** وليس قياسًا. لذلك يحمل كل ناتج `assurance` صريحًا، ويُعرض في
 * الواجهة موسومًا، ولا يدخل في أي درجة. والواجهة مبنية على `WordTimingModel` لا على هذه الدالة،
 * فمتى وصلت مقاطع زمنية حقيقية (QUL أو تسليم رسمي) تُركَّب مكانها بلا تغيير في أي مكوّن —
 * نفس نمط `AcousticBackend` في محرك المحاذاة.
 */

export type WordTimingAssurance = 'ESTIMATED_PROPORTIONAL' | 'INGESTED_SEGMENTS' | 'MEASURED_ALIGNED';

/**
 * مقطع زمني مقيس: `[أول كلمة, بعد آخر كلمة, بداية بالمللي, نهاية بالمللي]`.
 * هذا شكل مخرجات المحاذاة القسرية المفتوحة، والفهرسة صفريّة الأساس والنهاية غير شاملة.
 */
export type MeasuredSegment = [number, number, number, number];

/** لماذا رُفضت المقاطع المقيسة ورجعنا إلى التقدير. الرفض يُقال ولا يُبتلع. */
export type MeasurementRejection =
  | 'NO_SEGMENTS' | 'WORD_COUNT_MISMATCH' | 'NON_MONOTONIC' | 'DURATION_MISMATCH' | 'NO_DURATION';

export interface WordSpan {
  /** ترتيب الكلمة داخل الآية، صفريّ الأساس. */
  index: number;
  /** إزاحة بداية الكلمة داخل نص الآية (بالوحدات الحرفية). */
  start: number;
  /** إزاحة نهاية الكلمة (غير شاملة). */
  end: number;
  text: string;
}

export interface WordTiming extends WordSpan {
  startMs: number;
  endMs: number;
}

export interface WordTimingModel {
  assurance: WordTimingAssurance;
  durationMs: number;
  words: WordTiming[];
}

/** التشكيل وعلامات الوقف لا تُنطق وحدها، فتُستبعد من وزن الكلمة. */
const DIACRITIC = /[ً-ْٰۖ-ۭـ]/;
/** حروف المدّ: تُشبع في التلاوة فتأخذ زمنًا أطول من الحرف المتحرّك. */
const MADD = /[اويىآٓ]/;
const SHADDA = 'ّ';
/** رمز نهاية الآية ورقمها لا يُتلى. */
const AYAH_MARK = /[۝࣢٠-٩۰-۹]/;

/**
 * تقطيع نص الآية إلى كلمات مع إزاحاتها، حتى يستطيع العرض تلوين حرفٍ بعينه.
 * يتخطّى رمز نهاية الآية ورقمها فلا يُحسبان كلمةً تُتلى.
 */
export function splitAyahWords(text: string): WordSpan[] {
  const out: WordSpan[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    const start = i;
    while (i < text.length && !/\s/.test(text[i])) i++;
    const raw = text.slice(start, i);
    // كلمة كلّها رموز ترقيم آية (كرقم الآية) ليست كلمة تُتلى.
    if ([...raw].every((ch) => AYAH_MARK.test(ch) || DIACRITIC.test(ch))) continue;
    out.push({ index: out.length, start, end: i, text: raw });
  }
  return out;
}

/**
 * الوزن النطقي التقريبي لكلمة: كل حرف منطوق بوحدة، ويزيد المدّ والشدّة لأنهما زمنٌ مسموع.
 * الحدّ الأدنى وحدة واحدة حتى لا تسقط كلمة قصيرة من التوزيع.
 */
export function phoneticWeight(word: string): number {
  let w = 0;
  for (const ch of word) {
    if (AYAH_MARK.test(ch)) continue;
    if (ch === SHADDA) { w += 0.8; continue; }
    if (DIACRITIC.test(ch)) continue;
    w += MADD.test(ch) ? 1.7 : 1;
  }
  return Math.max(1, w);
}

/**
 * توزيع مدة الآية على كلماتها بالوزن النطقي.
 * `durationMs` غير صالح ⇒ لا نخترع توقيتًا: تُعاد قائمة فارغة ولا يظهر تظليل كلمة.
 */
export function proportionalWordTimings(text: string, durationMs: number): WordTimingModel {
  const words = splitAyahWords(text);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !words.length) {
    return { assurance: 'ESTIMATED_PROPORTIONAL', durationMs: 0, words: [] };
  }
  const weights = words.map((w) => phoneticWeight(w.text));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const timed: WordTiming[] = words.map((w, i) => {
    const span = (weights[i] / total) * durationMs;
    const startMs = cursor;
    cursor = i === words.length - 1 ? durationMs : cursor + span;
    return { ...w, startMs, endMs: cursor };
  });
  return { assurance: 'ESTIMATED_PROPORTIONAL', durationMs, words: timed };
}

/**
 * أقصى انحراف مقبول بين نهاية آخر مقطع مقيس ومدّة الملف الصوتي الفعلية.
 *
 * هذا الفحص هو **كاشف التسجيل المختلف**، وهو أهم ما في الوحدة: التوقيت المقيس يخصّ تسجيلًا
 * بعينه، فإن رُكِّب على تسجيل آخر لنفس القارئ — نسخة أخرى، أو بترٍ مختلف للصمت — انزاح التظليل
 * عن الصوت بلا أن يشتكي أحد. المقارنة بالمدّة تكشف ذلك تلقائيًا فنعود إلى التقدير.
 */
const DURATION_TOLERANCE_RATIO = 0.08;
const DURATION_TOLERANCE_FLOOR_MS = 1200;

/**
 * توقيت مقيس لكلمات الآية من مقاطع محاذاة حقيقية.
 *
 * الشرط الحاكم: **لا تُقبل المقاطع إلا إذا أثبتت أنها لهذه الآية ولهذا التسجيل**. فتُطابَق
 * أعداد الكلمات (النصوص تختلف في تقطيع المقطّعات ونحوها)، ويُطابَق زمن النهاية مع مدّة الملف.
 * وأي شكّ يُعيدنا إلى التقدير الموسوم بدل تظليل يمشي في غير موضعه — فتظليلٌ واثق وخاطئ أسوأ
 * من تقديرٍ معلَنٍ أنه تقدير.
 *
 * والمقطع الذي يضمّ أكثر من كلمة يُعطى لكل كلماته: تلك دقّة القياس المتاحة، وتوزيعها داخليًا
 * تخمينٌ لا يسنده الملف.
 */
export function measuredWordTimings(
  text: string,
  durationMs: number,
  segments: readonly MeasuredSegment[] | undefined,
): { model: WordTimingModel; rejected?: MeasurementRejection } {
  const fallback = () => proportionalWordTimings(text, durationMs);
  const words = splitAyahWords(text);
  if (!segments || !segments.length || !words.length) return { model: fallback(), rejected: 'NO_SEGMENTS' };
  if (!Number.isFinite(durationMs) || durationMs <= 0) return { model: fallback(), rejected: 'NO_DURATION' };

  const clean = segments.filter((s) => Array.isArray(s) && s.length === 4 && s.every((n) => Number.isFinite(n)));
  if (!clean.length) return { model: fallback(), rejected: 'NO_SEGMENTS' };

  // تقطيع النص وتقطيع المحاذاة لا بدّ أن يتفقا على عدد الكلمات، وإلا فالفهارس تشير إلى غير مواضعها.
  const covered = Math.max(...clean.map((s) => s[1]));
  if (covered !== words.length) return { model: fallback(), rejected: 'WORD_COUNT_MISMATCH' };

  const ordered = [...clean].sort((a, b) => a[2] - b[2]);
  for (let i = 0; i < ordered.length; i++) {
    const [ws, we, ms, me] = ordered[i];
    if (ws < 0 || we <= ws || we > words.length || me <= ms) return { model: fallback(), rejected: 'NON_MONOTONIC' };
    if (i && ordered[i][2] < ordered[i - 1][3]) return { model: fallback(), rejected: 'NON_MONOTONIC' };
  }

  const measuredEnd = ordered[ordered.length - 1][3];
  const tolerance = Math.max(DURATION_TOLERANCE_FLOOR_MS, durationMs * DURATION_TOLERANCE_RATIO);
  if (Math.abs(measuredEnd - durationMs) > tolerance) return { model: fallback(), rejected: 'DURATION_MISMATCH' };

  const timed: WordTiming[] = [];
  for (const w of words) {
    const seg = ordered.find((s) => w.index >= s[0] && w.index < s[1]);
    // كلمة لم يُحدَّد مقطعها تُترك بلا توقيت: تمرّ بلا تظليل بدل أن تُلوَّن في وقت لم يُقَس.
    if (seg) timed.push({ ...w, startMs: seg[2], endMs: seg[3] });
  }
  if (!timed.length) return { model: fallback(), rejected: 'NO_SEGMENTS' };
  return { model: { assurance: 'MEASURED_ALIGNED', durationMs, words: timed } };
}

/** الكلمة الجارية عند لحظة زمنية، أو -1 قبل أول كلمة أو بعد آخرها. */
export function wordAtTime(model: WordTimingModel, timeMs: number): number {
  if (!model.words.length || !Number.isFinite(timeMs)) return -1;
  // بحث ثنائي: الكلمات مرتّبة ومتلاصقة زمنيًا.
  let lo = 0, hi = model.words.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, w = model.words[mid];
    if (timeMs < w.startMs) hi = mid - 1;
    else if (timeMs >= w.endMs) lo = mid + 1;
    else { hit = mid; break; }
  }
  if (hit < 0 && timeMs >= model.words[model.words.length - 1].endMs) return -1;
  // المقطع المقيس قد يضمّ كلمتين بنفس المدى؛ تُرجَع أولاهما ليبدأ التظليل من أول المقطع.
  while (hit > 0 && model.words[hit - 1].startMs === model.words[hit].startMs) hit--;
  return hit;
}
