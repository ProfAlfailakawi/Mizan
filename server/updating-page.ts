/*
 * صفحة «نُحدّث البرنامج» (public/updating.html) حين تُفتح من الخادم مباشرة.
 *
 * عاملُ الخدمة يقدّمها أثناء النشر من ذاكرته، بجوابٍ يبنيه هو بلا سياسة CSP. أما حين تُطلب
 * من الخادم، فسياسةُ الموقع (script-src 'self') تحجب سكربتها المضمَّن فلا يعمل زرُّها ولا
 * انتظارُها. فتُرسل لهذه الصفحة وحدها سياسةٌ أضيق من سياسة الموقع: لا مصدرَ إلا نطاقنا،
 * والسكربتُ الوحيد المسموح هو سكربتُها ببصمته (sha256) المحسوبة من الملف نفسه — فلا تنسى
 * البصمةُ تعديلًا.
 */
import crypto from 'crypto';

export const UPDATING_PAGE_PATH = '/updating.html';

/** محتوى السكربت المضمَّن الوحيد في الصفحة، أو null إن لم يكن. */
export function inlineScriptOf(html: string): string | null {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  return scripts.length === 1 ? scripts[0][1] : null;
}

export function updatingPageCsp(html: string): string | null {
  const script = inlineScriptOf(html);
  if (script === null) return null;
  const hash = crypto.createHash('sha256').update(script, 'utf8').digest('base64');
  return [
    "default-src 'none'",
    `script-src 'sha256-${hash}'`,
    "style-src 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
