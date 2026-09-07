/*
 * تطبيع وتحقّق مدخلات النصوص.
 *
 * القاعدة عبر كل البرنامج: الحقل العربي يقبل عربيًا فقط، والإنجليزي إنجليزيًا فقط، والبريد
 * بصيغة بريد، والهاتف أرقامًا فقط. والأرقام العربية (٠١٢٣) تتحوّل تلقائيًا إلى إنجليزية (0123)
 * حتى لا تختلط الأرقام في الهوية أو الهاتف أو التاريخ. الدوال هنا نقية وقابلة للاختبار، وتُستعمل
 * في نقطة الإدخال (onChange) فيُصحَّح النص فور كتابته لا بعد الإرسال.
 */

/** يحوّل الأرقام العربية‑الهندية (٠–٩) والفارسية (۰–۹) إلى أرقام إنجليزية (0–9). */
export function toWesternDigits(input: string): string {
  if (!input) return input;
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660); // Arabic-Indic
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0); // Extended (Persian)
    else out += ch;
  }
  return out;
}

/**
 * يبقي الحروف العربية فقط (مع المسافات وعلامات الأسماء الشائعة كالشرطة والنقطة).
 * يُستعمل لحقول الاسم بالعربية: لو كتب المستخدم إنجليزيًا بالغلط لا يُقبل الحرف.
 */
export function keepArabic(input: string): string {
  if (!input) return input;
  // نطاق الحروف العربية + المسافات وبعض علامات الأسماء. لا أرقام لاتينية ولا حروف لاتينية.
  return input.replace(/[^؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿\s.\-'’]/g, '');
}

/**
 * يبقي الحروف اللاتينية فقط (مع المسافات والشرطة والفاصلة العليا).
 * يُستعمل لحقول الاسم بالإنجليزية: لو كتب عربيًا بالغلط لا يُقبل الحرف.
 */
export function keepLatin(input: string): string {
  if (!input) return input;
  return input.replace(/[^A-Za-z\s.\-'’]/g, '');
}

/**
 * هاتف: أرقام إنجليزية فقط، مع السماح بعلامة + في البداية للرمز الدولي.
 * يحوّل الأرقام العربية أولًا ثم يزيل أي شيء غير رقم (مع الإبقاء على + الأولى).
 */
export function normalizePhone(input: string): string {
  if (!input) return input;
  const western = toWesternDigits(input);
  const hasPlus = western.trimStart().startsWith('+');
  const digits = western.replace(/[^0-9]/g, '');
  return (hasPlus ? '+' : '') + digits;
}

/** بريد: أحرف بريد لاتينية فقط (يحوّل الأرقام العربية، ويزيل المسافات والحروف العربية). */
export function normalizeEmailInput(input: string): string {
  if (!input) return input;
  return toWesternDigits(input).replace(/\s/g, '').replace(/[؀-ۿ]/g, '');
}

/** تحقّق نهائي من صيغة البريد (لا يُستعمل للتصحيح الفوري بل للتحقّق قبل الإرسال). */
export function isValidEmail(input: string): boolean {
  if (!input) return false;
  // صيغة بريد عملية: جزء محلي@نطاق.امتداد — بلا مسافات.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
}

/** أرقام فقط (يحوّل العربية أولًا). للحقول الرقمية الصرفة كالهوية إن لزم. */
export function digitsOnly(input: string): string {
  if (!input) return input;
  return toWesternDigits(input).replace(/[^0-9]/g, '');
}

/**
 * يطبّع قيمة حقل حسب نوعه/معرّفه. نقطة واحدة تجمع القاعدة كلها فتُستعمل في أي شاشة.
 * fieldId يميّز الاسم العربي عن الإنجليزي؛ type يميّز البريد والهاتف والتاريخ.
 */
export function normalizeFieldValue(fieldId: string, type: string, raw: string): string {
  if (type === 'email') return normalizeEmailInput(raw);
  if (type === 'phone') return normalizePhone(raw);
  if (type === 'date') return toWesternDigits(raw);
  if (fieldId === 'fullNameArabic') return keepArabic(raw);
  if (fieldId === 'fullName') return keepLatin(raw);
  // الافتراضي: لا نمنع، لكن نوحّد الأرقام إلى الإنجليزية دائمًا.
  return toWesternDigits(raw);
}
