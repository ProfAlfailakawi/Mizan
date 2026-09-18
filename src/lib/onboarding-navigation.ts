/*
 * تنقّلُ معالج الإقلاع — منطقٌ نقيّ ليُختبر.
 *
 * المعالجُ خلف دخولٍ حقيقيّ، فلا يُفتح في بيئة فحصٍ بلا Firebase. ومنطقُه ليس تافهًا:
 * سهمُ «التالي» يعكس اتجاهه في العربية، والسحبُ كذلك، والتقدّمُ التلقائيّ يقف عند الوقوف
 * وعند تقليل الحركة، والخطوةُ لا تتجاوز حدَّي الشرائح.
 *
 * وكلُّ واحدةٍ من هذه لو انكسرت لم تُكتشف: القارئُ العربيّ يضغط السهمَ الأيمن فيرجع بدل
 * أن يتقدّم، أو تمضي الشريحةُ تحت يده وهو يقرأ. فالمنطقُ هنا بلا DOM ولا مؤقّت، يقرؤه
 * المكوّنُ ويقرؤه الاختبار.
 */

/** الزمنُ الذي تبقاه الشريحةُ قبل أن تتقدّم وحدها. الشريطُ المتحرّك هو هذا المؤقّت نفسه. */
export const ONBOARDING_AUTO_ADVANCE_MS = 7000;

/**
 * أقلُّ مسافةِ سحبٍ تُعدّ نيّة. وما دونها ارتعاشةُ إصبعٍ أو تمريرُ صفحة، ولو عُدَّت تنقّلًا
 * لقفزت الشريحةُ بلا قصد.
 */
export const ONBOARDING_SWIPE_THRESHOLD_PX = 48;

export type OnboardingIntent =
  | { kind: 'GO'; step: number }
  | { kind: 'FINISH' }
  | { kind: 'IGNORE' };

interface Position { step: number; slideCount: number; rtl: boolean }

/** يحصر الخطوةَ بين أوّل شريحةٍ وآخرها — فلا خطوةٌ سالبة ولا بعد النهاية. */
export function clampStep(step: number, slideCount: number) {
  if (!Number.isFinite(step) || slideCount <= 0) return 0;
  return Math.max(0, Math.min(slideCount - 1, Math.trunc(step)));
}

const forward = (p: Position): OnboardingIntent =>
  p.step >= p.slideCount - 1 ? { kind: 'FINISH' } : { kind: 'GO', step: clampStep(p.step + 1, p.slideCount) };

const backward = (p: Position): OnboardingIntent =>
  p.step <= 0 ? { kind: 'IGNORE' } : { kind: 'GO', step: clampStep(p.step - 1, p.slideCount) };

/**
 * ماذا يعني هذا المفتاح هنا؟
 *
 * والسهمُ ليس ثابتًا: «إلى الأمام» في العربية هو السهمُ الأيسر، لأن القراءةَ من اليمين.
 * وعكسُه يجعل القارئَ العربيّ يرجع كلّما أراد أن يتقدّم.
 */
export function onboardingKeyIntent(key: string, position: Position): OnboardingIntent {
  if (key === 'Escape') return { kind: 'FINISH' };
  if (key === 'Enter') return forward(position);
  const forwardKey = position.rtl ? 'ArrowLeft' : 'ArrowRight';
  const backKey = position.rtl ? 'ArrowRight' : 'ArrowLeft';
  if (key === forwardKey) return forward(position);
  if (key === backKey) return backward(position);
  return { kind: 'IGNORE' };
}

/**
 * ماذا تعني هذه السحبة؟ `dx` موجبٌ نحو اليمين.
 *
 * وفي العربية السحبُ نحو اليمين تقدّمٌ — لأن الشريحةَ التالية تأتي من اليسار.
 */
export function onboardingSwipeIntent(dx: number, position: Position): OnboardingIntent {
  if (!Number.isFinite(dx) || Math.abs(dx) < ONBOARDING_SWIPE_THRESHOLD_PX) return { kind: 'IGNORE' };
  const goingForward = position.rtl ? dx > 0 : dx < 0;
  return goingForward ? forward(position) : backward(position);
}

/**
 * هل تتقدّم الشريحةُ وحدها الآن؟
 *
 * ثلاثةٌ توقفها، ولكلٍّ سببُه: آخرُ شريحةٍ لا تتقدّم إلى فراغ؛ ووقوفُ المؤشّر أو التركيز
 * عليها يعني أن أحدًا يقرأ (وهو شرطُ WCAG 2.2.2 — ما يتحرّك وحده يجب أن يُوقَف)؛
 * وتقليلُ الحركة يُطفئ التقدّمَ التلقائيَّ كلَّه فلا يمضي شيءٌ إلا بيد القارئ.
 */
export function onboardingAutoAdvances(input: {
  step: number; slideCount: number; held: boolean; reducedMotion: boolean;
}): boolean {
  if (input.reducedMotion || input.held) return false;
  return input.step < input.slideCount - 1;
}
