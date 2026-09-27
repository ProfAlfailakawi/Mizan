/*
 * المال في ميزان أعدادٌ صحيحة بالوحدة الصغرى (سنت، فلس…) — لا كسورٌ عشرية أبدًا.
 *
 * والخصم بنقاط الأساس (basis points): 40% = 4000. فسعرُ الجملة يُحسب هنا وحده:
 *   wholesale = publicListPrice × (10000 − discountBps) / 10000
 * بتقريبٍ نصفيٍّ إلى الأعلى على الوحدة الصغرى، بحسابٍ صحيحٍ خالص.
 *
 * مثال: 59900 × 6000 / 10000 = 35940 (أي $359.40) — لا 359.399999.
 */

export const BPS_DENOMINATOR = 10_000;

export class MoneyError extends Error {}

export function assertMinor(value: unknown, field = 'amountMinor'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new MoneyError(`${field.toUpperCase()}_MUST_BE_INTEGER_MINOR_UNITS`);
  return value;
}

export function assertNonNegativeMinor(value: unknown, field = 'amountMinor'): number {
  const v = assertMinor(value, field);
  if (v < 0) throw new MoneyError(`${field.toUpperCase()}_MUST_NOT_BE_NEGATIVE`);
  return v;
}

export function assertBps(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > BPS_DENOMINATOR) throw new MoneyError('DISCOUNT_BPS_INVALID');
  return value;
}

/** Integer division rounding half away from zero, for non-negative numerators. */
function divRoundHalfUp(numerator: number, denominator: number): number {
  const q = Math.floor(numerator / denominator);
  const r = numerator - q * denominator;
  return r * 2 >= denominator ? q + 1 : q;
}

/** Apply a discount in basis points to an integer minor-unit amount. */
export function applyDiscountBps(amountMinor: number, discountBps: number): number {
  assertNonNegativeMinor(amountMinor);
  assertBps(discountBps);
  const numerator = amountMinor * (BPS_DENOMINATOR - discountBps);
  if (!Number.isSafeInteger(numerator)) throw new MoneyError('AMOUNT_TOO_LARGE');
  return divRoundHalfUp(numerator, BPS_DENOMINATOR);
}

export function assertCurrency(value: unknown): string {
  const c = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new MoneyError('CURRENCY_INVALID');
  return c;
}

/** Display helper only — never feed its output back into arithmetic. */
export function formatMinor(amountMinor: number, currency: string, fractionDigits = 2): string {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  const unit = 10 ** fractionDigits;
  const major = Math.floor(abs / unit);
  const minor = String(abs % unit).padStart(fractionDigits, '0');
  return `${sign}${currency} ${major.toLocaleString('en-US')}${fractionDigits ? `.${minor}` : ''}`;
}
