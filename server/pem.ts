/*
 * مفاتيح PEM القادمة من متغيّرات البيئة.
 *
 * مديرو الأسرار ومنصات النشر تخزّن القيمة سطرًا واحدًا فيه \n حرفية، بينما التوليد المحلي
 * يعطي أسطرًا حقيقية. الشكلان صحيحان ويجب أن يعملا؛ وإلا فشل بناء المفتاح وتعطّل التوقيع
 * بصمت — وهو أسوأ فشل ممكن في مسار نزاهة.
 */
export function decodePemFromEnv(raw: string | undefined | null): string {
  if (!raw) return '';
  const text = String(raw).trim();
  // اقتباس محيط تضعه بعض المنصات
  const unquoted = (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))
    ? text.slice(1, -1)
    : text;
  return unquoted.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}
