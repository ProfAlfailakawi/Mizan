/* الدخول الموحّد: متى يصلح تحويل الصفحة بدل النافذة المنبثقة. دالةٌ نقية بلا اعتماد على Firebase. */
/* رموز فشل النافذة المنبثقة التي يصلح معها تحويل الصفحة (iPhone / المتصفحات المضمَّنة). */
export const POPUP_FALLBACK_CODES: readonly string[] = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
];

export const shouldFallbackToRedirect = (e: unknown): boolean =>
  POPUP_FALLBACK_CODES.includes(String((e as { code?: unknown } | null)?.code || ''));
