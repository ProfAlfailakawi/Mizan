/*
 * التلميح المتدرّج: الضغطةُ الأولى تكشف الكلمةَ التالية، والثانيةُ كلمتين، وهكذا —
 * ويبقى المكشوفُ ظاهرًا حتى يتلوه الطالب. وللتلميح رصيدٌ محدود يُعرض على الزرّ.
 */
export const HINT_BUDGET = 6;

/** آخرُ كلمةٍ يكشفها التلميح (شاملة)، أو `null` إن لم يُطلب تلميحٌ عند هذا الموضع. */
export const hintEnd = (reached: number, streak: number, total: number): number | null =>
  streak > 0 && total > 0 ? Math.min(reached + streak - 1, total - 1) : null;

/** هل الكلمةُ مكشوفةٌ بالتلميح؟ ما بين أوّل ما لم يُتلَ و`hint` (شاملًا). */
export const isHinted = (index: number, reached: number, hint: number | null | undefined): boolean =>
  hint != null && index >= reached && index <= hint;

export const hintsLeft = (used: number): number => Math.max(0, HINT_BUDGET - used);

/** مدى التلميح المطلق: يُثبَّت من موضع أوّل ضغطة، فلا ينطوي حين يتلو الطالب أوّلَ المكشوف. */
export interface HintSpan { from: number; count: number }

/** آخرُ كلمةٍ في المدى (شاملة)، أو `null` إن تجاوزه الطالب كلَّه أو لم يُطلب. */
export const spanEnd = (span: HintSpan | null, reached: number, total: number): number | null => {
  if (!span || total <= 0) return null;
  const end = Math.min(span.from + span.count - 1, total - 1);
  return reached > end ? null : end;
};

/** ضغطةٌ جديدة: تمدّ المدى القائم كلمةً، أو تبدأ مدًى جديدًا من أوّل ما لم يُتلَ. */
export const extendHint = (span: HintSpan | null, reached: number, total: number): HintSpan =>
  spanEnd(span, reached, total) != null && span ? { from: span.from, count: span.count + 1 } : { from: reached, count: 1 };
