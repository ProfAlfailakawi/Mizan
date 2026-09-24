import type { FaceMark, FaceMarkKind } from './face-reading';

/*
 * ذاكرةُ الوجوه — كيف يختار النظامُ الوجهَ التالي.
 *
 * «يحطّ له مواضع عشوائية» صحيحٌ في أوّل جولة وحدها. أمّا بعدها فالعشوائيّةُ المحضة
 * إهدار: تعيد عليه ما أتقنه وتترك ما تعثّر فيه لأن النردَ لم يقع عليه. والمدرّسُ
 * الحاذقُ لا يفعل ذلك — يُعيده إلى حيث زلّ، بعد أن يمهله.
 *
 * فهذه الوحدةُ تبني وزنًا لكلّ وجهٍ من **علاماته هو**، لا من تخمين:
 *
 *   الوزن = ١ + Σ (شدّةُ العلامة × ثقلُ نوعها × تضاؤلٌ بالزمن)
 *
 * وثلاثةُ قيود تحكمها:
 *
 *   ١) **لا إقصاء.** الأساسُ ١ لكلّ وجهٍ مهما أتقنه، فيبقى كلُّ نطاقه حاضرًا ولا
 *      يُهمَل ما أحكمه فينساه. والترجيحُ ميلٌ لا حصر.
 *   ٢) **تضاؤلٌ بالزمن.** أثرُ تعثّرٍ قديمٍ يخفّ: من تعثّر قبل شهرٍ ثم أعاد وأتقن لا
 *      يُلاحَق بزلّةٍ ماتت. ويُقاس بعمر الجلسة لا بترتيبها.
 *   ٣) **لا تُعاد الجلسةُ فورًا.** وجهٌ تُلي قبل قليلٍ يُخفَّض مؤقّتًا مهما ساء فيه:
 *      الإعادةُ الفوريّةُ حفظُ لحظةٍ لا ترسيخ، والتباعدُ هو ما يُثبّت.
 *
 * ولا يخرج من هذه الوحدة حكمٌ ولا درجة — وزنُ سحبٍ فقط.
 */

/** ثقلُ نوع العلامة في الوزن. الإعادةُ والالتباسُ أدلُّ على ضعف الحفظ من شدّةِ صوت. */
export const MARK_WEIGHT: Record<FaceMarkKind, number> = {
  /* رجع وأعاد: أوضحُ ما يدلّ على تعثّرٍ في الحفظ نفسِه. */
  repeat: 1.0,
  /* كاد ينتقل إلى المتشابه: موضعُ الزلل الكلاسيكيّ عند الحفّاظ. */
  confusable: 1.0,
  /* انقطع الأثر: قد يكون توقّفًا وقد يكون ضعفَ صوت. */
  lost: 0.7,
  /* تخطّى: قد يكون سقوطًا وقد يكون وصلًا سريعًا. */
  skip: 0.6,
  /* لبث طويلًا: تردّدٌ محتمل. */
  dwell: 0.5,
  /* بَعُد صوتُه عن المرجع: أضعفُها دلالةً على الحفظ، وأكثرُها تأثّرًا بالميكروفون. */
  strain: 0.35,
};

/**
 * كلمةٌ تعثّر فيها الطالب — موضعُها ونوعُ التعثّر، لا صوتٌ ولا درجة.
 *
 * `skipped`/`substituted`/`added` من مراجعة الكلمات (حين يكون الحكمُ مفتوحًا)، و`vowel`/
 * `tajweed`/`letter` من «المعلّم»، و`repeat`/`confusable` من علامات المتابعة نفسها.
 */
export type AttemptWordKind = 'skipped' | 'substituted' | 'added' | 'vowel' | 'tajweed' | 'letter' | 'repeat' | 'confusable';

export interface AttemptWord {
  /** موضعُ الكلمة في الوجه (ثابتٌ للرواية نفسها). */
  i: number;
  s: number;
  a: number;
  /** نصُّ الكلمة كما في الوجه — للعرض وحده. */
  t: string;
  k: AttemptWordKind;
}

export interface FaceAttempt {
  page: number;
  /** متى تُليت — ISO. */
  at: string;
  marks: readonly Pick<FaceMark, 'kind' | 'intensity'>[];
  /** الكلماتُ التي تعثّر فيها — اختياريّ: محاولاتٌ قديمةٌ حُفظت قبله تبقى صالحة. */
  words?: readonly AttemptWord[];
  /** أبعدُ ما بلغه (عددُ كلماتٍ من أوّل الوجه) — به تُعرف الكلمةُ التي قُرئت نظيفةً بعد تعثّر. */
  reach?: number;
}

/*
 * ثقلُ الكلمة المتعثَّر فيها في وزن الوجه.
 *
 * كلمةٌ سقطت أو أُبدلت أدلُّ دليلٍ على ضعف الحفظ؛ والحرفُ والحركةُ أخفّ؛ والتجويدُ أخفُّها
 * أثرًا في «أيَّ وجهٍ يُعاد» لأنه أداءٌ لا حفظ. و`repeat`/`confusable` محسوبان في العلامات.
 */
export const WORD_WEIGHT: Record<AttemptWordKind, number> = {
  skipped: 1.0, substituted: 1.0, added: 0.5, letter: 0.6, vowel: 0.4, tajweed: 0.2, repeat: 0, confusable: 0,
};
/* سقفُ ما تضيفه كلماتُ محاولةٍ واحدة — لئلّا تبتلع تلاوةٌ مضطربةٌ السحبَ كلَّه. */
const WORD_BURDEN_CAP = 4;

export interface FaceMemoryOptions {
  /** بعد كم يومًا يهبط أثرُ التعثّر إلى نصفه. */
  halfLifeDays: number;
  /** وجهٌ تُلي خلال هذه المدّة يُخفَّض — لا يُعاد فورًا. */
  cooldownHours: number;
  /** معاملُ التخفيض داخل مدّة التهدئة (٠..١). */
  cooldownFactor: number;
  /** سقفُ الوزن، لئلّا يبتلع وجهٌ واحدٌ السحبَ كلَّه. */
  maxWeight: number;
}

export const DEFAULT_FACE_MEMORY: FaceMemoryOptions = {
  halfLifeDays: 10,
  cooldownHours: 6,
  cooldownFactor: 0.15,
  maxWeight: 8,
};

/** ثقلُ محاولةٍ واحدة: مجموعُ علاماتها موزونةً بأنواعها. */
export function attemptBurden(attempt: FaceAttempt): number {
  let burden = 0;
  for (const mark of attempt.marks) {
    const weight = MARK_WEIGHT[mark.kind];
    if (weight === undefined) continue;
    const intensity = Number.isFinite(mark.intensity) ? Math.max(0, Math.min(1, mark.intensity)) : 0;
    burden += weight * intensity;
  }
  let words = 0;
  for (const w of attempt.words ?? []) words += WORD_WEIGHT[w.k] ?? 0;
  return burden + Math.min(WORD_BURDEN_CAP, words);
}

/**
 * أوزانُ السحب للوجه التالي، من محاولاته السابقة.
 *
 * ويُرجع دالّةً لا خريطةً: الوجهُ الذي لم يُتلَ قطّ لا مدخلَ له، ووزنُه الأساسُ ١ —
 * فلا يُشترط أن تُذكر ٦٠٤ صفحةً ليُسحب ما لم يُقرأ بعد.
 */
export function faceWeights(
  attempts: readonly FaceAttempt[],
  now: number,
  options: FaceMemoryOptions = DEFAULT_FACE_MEMORY,
): (page: number) => number {
  const burdenByPage = new Map<number, number>();
  const lastSeenByPage = new Map<number, number>();

  for (const attempt of attempts) {
    const at = Date.parse(attempt.at);
    if (!Number.isFinite(at)) continue;
    /* محاولةٌ في المستقبل ساعةٌ مختلّة: تُهمل ولا تُصحَّح بالتخمين. */
    if (at > now) continue;
    const ageDays = (now - at) / 86_400_000;
    const decay = Math.pow(0.5, ageDays / Math.max(0.01, options.halfLifeDays));
    burdenByPage.set(attempt.page, (burdenByPage.get(attempt.page) || 0) + attemptBurden(attempt) * decay);
    lastSeenByPage.set(attempt.page, Math.max(lastSeenByPage.get(attempt.page) || 0, at));
  }

  return (page: number) => {
    const burden = burdenByPage.get(page) || 0;
    let weight = Math.min(options.maxWeight, 1 + burden);
    const lastSeen = lastSeenByPage.get(page);
    if (lastSeen !== undefined && now - lastSeen < options.cooldownHours * 3_600_000) {
      weight *= options.cooldownFactor;
    }
    /* لا إقصاء: يبقى موجبًا دائمًا مهما طالت التهدئة. */
    return Math.max(Number.EPSILON, weight);
  };
}

/**
 * لماذا اختير هذا الوجه — جملةٌ تُقال للطالب.
 *
 * والاختيارُ الذي لا يُفسَّر يُخيف: من يُعاد إلى صفحةٍ مرّتين يظنّ الجهازَ يلاحقه.
 * فيُقال له السبب من علاماته هو.
 */
export function explainChoice(page: number, attempts: readonly FaceAttempt[], now: number, ar = true): string {
  const own = attempts.filter(a => a.page === page && Number.isFinite(Date.parse(a.at)) && Date.parse(a.at) <= now);
  if (!own.length) {
    return ar ? 'وجهٌ جديدٌ من نطاقك لم تقرأه هنا من قبل.' : 'A face from your range you have not read here before.';
  }
  const counts = new Map<FaceMarkKind, number>();
  for (const attempt of own) for (const mark of attempt.marks) counts.set(mark.kind, (counts.get(mark.kind) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return ar ? 'عُدتَ إليه لتُثبّته.' : 'Back to it to settle it.';
  const label: Record<FaceMarkKind, [string, string]> = {
    repeat: ['أعدتَ فيه', 'you repeated here'],
    confusable: ['كِدتَ تنتقل فيه إلى موضعٍ مشابه', 'you nearly slipped to a similar passage'],
    lost: ['انقطع فيه أثرُك', 'tracking was lost here'],
    skip: ['تخطّيتَ فيه', 'you skipped here'],
    dwell: ['لبثتَ فيه طويلًا', 'you dwelt here'],
    strain: ['بَعُد فيه صوتُك عن المرجع', 'your audio drifted from the reference'],
  };
  const [arText, enText] = label[top[0]];
  return ar ? `عُدتَ إليه لأنك ${arText} في قراءةٍ سابقة.` : `Chosen because ${enText} in an earlier run.`;
}
