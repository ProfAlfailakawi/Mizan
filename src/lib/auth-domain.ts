/*
 * أيُّ نطاقٍ يخدم معالج الدخول؟ (authDomain)
 *
 * Firebase Auth يفتح نافذة الدخول (أو يُحوِّل الصفحة) إلى https://<authDomain>/__/auth/handler
 * ثم يعيد النتيجة عبر مخزن المتصفح. حين يختلف authDomain عن المضيف الذي يخدم التطبيق
 * (mizan-f2ce3.firebaseapp.com مقابل mizan-quran.web.app) يقسم Safari على iPhone التخزين
 * بين الموقعين، فتنتهي العملية عند صفحة المعالج برسالة
 * «Unable to process request due to missing initial state … storage-partitioned browser environment».
 *
 * الحل المعتمد من Firebase هو أن يكون authDomain هو مضيف الخدمة نفسه، على أن يكون ذلك المضيف
 * يخدم /__/auth/* فعلًا. وFirebase Hosting يخدمها على مواقعه (التحقق: GET /__/auth/handler → 200
 * على mizan-quran.web.app). أما النطاقات الأخرى (نطاقات الجهات الخاصة خلف Cloud Run مباشرة)
 * فلا تخدمها، فيبقى لها الإعداد الأصلي. لذلك القائمة صريحة لا مستنتجة من اسم المضيف.
 */

/** مضيفاتٌ تأكّد أنها تخدم /__/auth/handler (مواقع Firebase Hosting التي تغلّف هذا النشر). */
export const SAME_ORIGIN_AUTH_HOSTS: readonly string[] = ['mizan-quran.web.app'];

export function resolveAuthDomain(
  configured: string | undefined,
  host: string | undefined = typeof window !== 'undefined' ? window.location.hostname : undefined,
  extraHosts: string | undefined = undefined,
): string | undefined {
  const h = String(host || '').trim().toLowerCase();
  if (!h) return configured;
  const allow = new Set<string>(SAME_ORIGIN_AUTH_HOSTS);
  for (const x of String(extraHosts || '').split(',')) { const v = x.trim().toLowerCase(); if (v) allow.add(v); }
  return allow.has(h) ? h : configured;
}

/* رموز فشل النافذة المنبثقة التي يصلح معها تحويل الصفحة (iPhone / المتصفحات المضمَّنة). */
export const POPUP_FALLBACK_CODES: readonly string[] = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
];

export const shouldFallbackToRedirect = (e: unknown): boolean =>
  POPUP_FALLBACK_CODES.includes(String((e as { code?: unknown } | null)?.code || ''));
