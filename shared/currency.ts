/*
 * اصطلاح المال في ميزان: amountMinor عددٌ صحيح بجزءٍ من مئة من الوحدة الكبرى لكل العملات
 * (سنت، أو «فلس عشري» للدينار = 0.01 د.ك). هذا ما تكتبه الواجهات وتقرؤه الفواتير منذ البداية،
 * فلا يُغيَّر هنا كي لا تتضاعف المبالغ المخزّنة عشر مرات.
 *
 * لكن البوابات التي تطلب «الوحدة الصغرى» تعني وحدة ISO 4217: الدينار الكويتي ثلاث منازل
 * (1000 فلس)، والين صفر منازل. فالتحويل يتمّ عند حدّ البوابة وحده، بأعداد صحيحة ونصوص،
 * بلا فاصلة عائمة.
 */

export const PLATFORM_MINOR_EXPONENT = 2;
const THREE = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
const ZERO = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

export function isoExponent(currency: string): number {
  const c = String(currency || '').trim().toUpperCase();
  return THREE.has(c) ? 3 : ZERO.has(c) ? 0 : 2;
}

/** مبلغ ميزان (جزء من مئة) ← نصّ الوحدة الكبرى بمنازل ISO: 525 KWD ← "5.250"، 525 USD ← "5.25". */
export function platformMinorToMajorString(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('AMOUNT_MINOR_MUST_BE_NON_NEGATIVE_INTEGER');
  const e = isoExponent(currency), whole = Math.floor(amountMinor / 100), cents = String(amountMinor % 100).padStart(2, '0');
  if (e === 0) {
    if (amountMinor % 100) throw new Error('AMOUNT_NOT_REPRESENTABLE_IN_CURRENCY');
    return String(whole);
  }
  return `${whole}.${cents}${'0'.repeat(e - 2)}`;
}

/** مبلغ ميزان ← وحدة ISO الصغرى كما تطلبها بوابات مثل Stripe: 525 KWD ← 5250 فلسًا. */
export function platformMinorToIsoMinor(amountMinor: number, currency: string): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('AMOUNT_MINOR_MUST_BE_NON_NEGATIVE_INTEGER');
  const e = isoExponent(currency);
  if (e >= 2) return amountMinor * 10 ** (e - 2);
  if (amountMinor % 100) throw new Error('AMOUNT_NOT_REPRESENTABLE_IN_CURRENCY');
  return amountMinor / 100;
}

/** وحدة ISO الصغرى ← مبلغ ميزان. null إن لم يُمثَّل بدقّة (5251 فلسًا لا تساوي جزءًا صحيحًا من مئة). */
export function isoMinorToPlatformMinor(value: unknown, currency: string): number | null {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw), e = isoExponent(currency);
  if (e >= 2) { const d = 10 ** (e - 2); return n % d ? null : n / d; }
  return n * 100;
}

/** نصّ الوحدة الكبرى ← مبلغ ميزان. يُرفض كل ما يحمل دقّة أعلى من جزءٍ من مئة (لا تقريب صامت). */
export function majorStringToPlatformMinor(value: unknown): number | null {
  const raw = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value ?? '').trim();
  const m = /^(\d{1,13})(?:\.(\d+))?$/.exec(raw);
  if (!m) return null;
  const frac = m[2] || '';
  if (/[1-9]/.test(frac.slice(2))) return null;
  const out = Number(m[1]) * 100 + Number(frac.slice(0, 2).padEnd(2, '0'));
  return Number.isSafeInteger(out) ? out : null;
}
