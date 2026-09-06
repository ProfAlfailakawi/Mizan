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

export type WordTimingAssurance = 'ESTIMATED_PROPORTIONAL' | 'INGESTED_SEGMENTS';

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
  return hit;
}
