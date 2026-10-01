/**
 * مرساة زمن العرض التجريبي — نقطةٌ واحدة لتواريخ الكون الاصطناعي.
 * يوم التشغيل الرئيسي (اليوم الثاني من المسابقة) يقع قبل 5 أيام من 2026-10-01،
 * فتبدو النتائج والشهادات المختومة تاريخًا ماضيًا متّسقًا لا مستقبليًا.
 * لتحريك الكون كلّه غيّر `DEMO_DAY` وحده.
 */
export const DEMO_DAY = { year: 2026, month: 9, day: 26 } as const; // month: 1-12
const pad = (n: number) => String(n).padStart(2, '0');

/** تاريخ ISO (YYYY-MM-DD) بعد/قبل يوم التشغيل بعدد أيامٍ معيّن. */
export function demoDate(offsetDays = 0): string {
  const d = new Date(Date.UTC(DEMO_DAY.year, DEMO_DAY.month - 1, DEMO_DAY.day + offsetDays));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** لحظة UTC في يوم التشغيل (+ إزاحة أيام) بالساعة والدقيقة والثانية. */
export function demoUtc(hour = 0, minute = 0, second = 0, offsetDays = 0): Date {
  return new Date(Date.UTC(DEMO_DAY.year, DEMO_DAY.month - 1, DEMO_DAY.day + offsetDays, hour, minute, second));
}
export const demoIso = (offsetDays: number, time = '09:00:00Z') => `${demoDate(offsetDays)}T${time}`;
