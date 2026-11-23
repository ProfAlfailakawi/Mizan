/**
 * الدفع الإلكتروني عبر بوابةٍ خارجية يُعرض في الموقع فقط؛ داخل تطبيق iOS لا يُعرض
 * (إرشادات App Store 3.1.1) — ويبقى تسجيل السداد اليدوي متاحًا.
 */
export const onlinePaymentOffered = (gatewayConfigured: boolean, native: boolean): boolean => gatewayConfigured && !native;
