/*
 * الأصل الذي رآه المتصفح فعلاً. خلف Firebase Hosting أو الـWorker يصل الخادم باسم مضيف الخدمة
 * (…run.app) بينما الاسم الحقيقي في x-forwarded-host؛ فبناء الروابط وأكواد QR من `Host` وحده
 * يُخرج روابط على النطاق القديم.
 */
export function publicOriginOf(req: { protocol: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwarded || String(req.headers.host || '').trim();
  return `${req.protocol}://${host}`;
}
