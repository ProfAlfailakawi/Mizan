/*
 * الموضعُ التقريبيُّ لا يقفز بعيدًا بجوابٍ واحد.
 *
 * قِيس في متصفّحٍ حقيقيّ على #278: والصوتُ في الآية 7 (خارج الوجه) عاد المستمعُ بـ`LOCKED`
 * على 33:15 — فتعلّمت ثمانون كلمةً «مقروءة» دفعةً واحدة، وصار القلمُ يسبق القارئ دقيقتين.
 * وكانت نسبةُ هذه المواضع الكاذبة بين 3 و5 في كلّ مئة جواب.
 *
 * فالموضعُ القريبُ من آخر ما قُبل يُقبل فورًا (ومنه الرجوعُ لإعادة آية). والبعيدُ للأمام
 * يُعلَّق حتى يؤكّده جوابٌ ثانٍ قريبٌ منه في مهلةٍ قصيرة. والمعلَّقُ لا يُرسل مرساةً للمستمع:
 * مرساةٌ كاذبةٌ تجعل الأجوبةَ التالية تدور حولها فتؤكّد نفسها.
 */

export const ROUGH_JUMP_WORDS = 8;
export const ROUGH_CONFIRM_MS = 6000;
export const ROUGH_CONFIRM_TOLERANCE = 6;

export interface RoughGate {
  pending: { target: number; at: number } | null;
}

export const OPEN_ROUGH_GATE: RoughGate = { pending: null };

/*
 * وما دام السماعُ كلمةً كلمة جاريًا، لا يسبقه الموضعُ التقريبيُّ إلا بكلمتين.
 *
 * قِيس بعد نافذة اللحاق: والصوتُ في الآية 16 (لازمةٌ خارج الوجه) عاد `LOCKED` على 21:1 — لازمةِ
 * الوجه — وكانت على ثماني كلماتٍ من أوّله، فقُبلت بلا تأكيد وتعلّمت ثماني كلماتٍ «مقروءة» قبل أن
 * تُقال بعشرين ثانية. واللوازمُ على هذا الوجه بين كلّ آيتين، فلا يكفي بُعدُ القفزة حارسًا.
 * والسماعُ لا يتأخّر الآن إلا ثوانيَ، فهو يقود القلم، والتقريبيُّ لا يزيد عليه إلا حافّةً صغيرة.
 */
export const ROUGH_LEAD_WORDS = 2;

/*
 * ومن الجبهة الفارغة (لم يُسمع من الوجه شيء) لا يحرّك القلمَ موضعٌ في داخل الوجه: فالقارئُ قد يكون
 * قبله، يتلو لازمةً تشبه لازمته. قِيس في ٢٥ سبتمبر ٢٠٢٦ على الإنتاج بتلاوةٍ من أوّل السورة: لازمةُ الآية 13
 * عادت `LOCKED` على 21:1، فتعلّمت ثماني كلماتٍ قبل أن تُقال باثنتين وخمسين ثانية. ولو قادها بكلمتين
 * لتعلّمت «مرج البحرين» كذلك. فلا يُصدَّق منه إلا ما دلّ على أوّل كلمات الوجه.
 */
/** أبعدُ ما يبلغه القلمُ بالموضع التقريبيّ: بلا سماعٍ جارٍ هو الموضعُ كما هو. */
export function roughReach(target: number, heardFrontier: number, following: boolean): number {
  if (!following) return target;
  if (heardFrontier < 0 && target > ROUGH_LEAD_WORDS) return heardFrontier;
  return Math.min(target, heardFrontier + ROUGH_LEAD_WORDS);
}

/** `anchor` أبعدُ موضعٍ قُبل (`-1` في أوّل التلاوة)، و`now` بالملّي ثانية. */
export function admitRough(target: number, anchor: number, gate: RoughGate, now: number): { accept: boolean; gate: RoughGate } {
  if (target <= anchor + ROUGH_JUMP_WORDS) return { accept: true, gate: OPEN_ROUGH_GATE };
  const pending = gate.pending;
  if (pending && Math.abs(target - pending.target) <= ROUGH_CONFIRM_TOLERANCE && now - pending.at <= ROUGH_CONFIRM_MS) {
    return { accept: true, gate: OPEN_ROUGH_GATE };
  }
  return { accept: false, gate: { pending: { target, at: now } } };
}
