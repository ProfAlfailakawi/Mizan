/*
 * دورة الاشتراك تبدأ من يوم الاشتراك نفسه، لا من أول يناير.
 *
 * اشتراكٌ بدأ 27 سبتمبر 2026 حصّتُه من 27 سبتمبر 2026 حتى 26 سبتمبر 2027 شاملًا — أي
 * `[startsAt, endsAt)` بنهايةٍ مفتوحة عند 27 سبتمبر 2027. كل الحدود بتوقيت UTC.
 *
 * والذكرى السنوية تُحسب دائمًا من مرساةٍ ثابتة (`anchor + n × 12 شهرًا`) لا من نهاية
 * الدورة السابقة، حتى لا ينجرف تاريخٌ مثل 29 فبراير أو 31 يناير عامًا بعد عام:
 *   مرساة 2028-02-29 → 2029-02-28، 2030-02-28، 2031-02-28، 2032-02-29.
 */

const DAY_MS = 86_400_000;

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Add calendar months in UTC, clamping to the last valid day of the target month. */
export function addUtcMonthsClamped(iso: string | number | Date, months: number): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) throw new Error('TERM_DATE_INVALID');
  if (!Number.isInteger(months)) throw new Error('TERM_MONTHS_INVALID');
  const total = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(Date.UTC(year, month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())).toISOString();
}

export function normalizeInstant(value: string | number | Date): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error('TERM_DATE_INVALID');
  return d.toISOString();
}

/** Midnight UTC of the given instant's calendar day. Terms start on day boundaries. */
export function startOfUtcDay(value: string | number | Date): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error('TERM_DATE_INVALID');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** The n-th anniversary boundary from an anchor (n = 0 is the anchor itself). */
export function anniversary(anchorIso: string, n: number, termMonths = 12): string {
  return addUtcMonthsClamped(anchorIso, termMonths * n);
}

/** Inclusive last day of a half-open `[start, end)` term, for display ("27 Sep 2026 → 26 Sep 2027"). */
export function inclusiveEndDate(endsAtIso: string): string {
  return new Date(Date.parse(endsAtIso) - DAY_MS).toISOString().slice(0, 10);
}

export function containsInstant(term: { startsAt: string; endsAt: string }, at: number): boolean {
  return at >= Date.parse(term.startsAt) && at < Date.parse(term.endsAt);
}

export function wholeDaysBetween(fromIso: string, to: number): number {
  return Math.floor((to - Date.parse(fromIso)) / DAY_MS);
}

export const DAY_IN_MS = DAY_MS;
