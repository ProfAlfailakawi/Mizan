/*
 * فحص شكل البريد الإلكتروني بزمنٍ خطّي — بلا تعبيرٍ نمطي.
 *
 * التعبير `^[^\s@]+@[^\s@]+\.[^\s@]+$` يتراجع تراجعًا متعدّد الحدود على مدخلٍ مصنوع
 * (مثل '!@!.' يتبعها '!.' مكرّرة آلاف المرات)، فيحبس المعالج على مدخلٍ من مستخدم (ReDoS).
 * وهذا الفحص يمرّ على النص مرّةً واحدة ويقرّر الشيء نفسه: جزءٌ محلّي غير فارغ، و@ واحدة،
 * ونطاقٌ فيه نقطةٌ ليست في طرفه، ولا مسافات، وطولٌ لا يتجاوز 254.
 */
export function isPlausibleEmail(value: unknown): boolean {
  const s = String(value ?? '');
  if (s.length < 5 || s.length > 254) return false;
  let at = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 32 || c === 127) return false;
    if (c === 64) { if (at !== -1) return false; at = i; }
  }
  if (at < 1 || at === s.length - 1) return false;
  const domain = s.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1 && !domain.startsWith('.') && !domain.includes('..');
}
