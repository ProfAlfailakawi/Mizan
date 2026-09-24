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

/** `anchor` أبعدُ موضعٍ قُبل (`-1` في أوّل التلاوة)، و`now` بالملّي ثانية. */
export function admitRough(target: number, anchor: number, gate: RoughGate, now: number): { accept: boolean; gate: RoughGate } {
  if (target <= anchor + ROUGH_JUMP_WORDS) return { accept: true, gate: OPEN_ROUGH_GATE };
  const pending = gate.pending;
  if (pending && Math.abs(target - pending.target) <= ROUGH_CONFIRM_TOLERANCE && now - pending.at <= ROUGH_CONFIRM_MS) {
    return { accept: true, gate: OPEN_ROUGH_GATE };
  }
  return { accept: false, gate: { pending: { target, at: now } } };
}
