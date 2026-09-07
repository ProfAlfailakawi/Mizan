/*
 * أي وجهٍ يعرضه هذا المضيف؟
 *
 * نشرٌ واحد يخدم ثلاثة أوجه، يميّزها اسم المضيف وحده:
 *   - mizan.<domain>  ← الموقع التسويقي العام: مفتوح للكل، بلا دخول.
 *   - admin.<domain>  ← لوحة مالك المنصّة: دخول ثم إدارة الجهات والاعتماد.
 *   - <tenant>.<domain> أو أي مضيف آخر ← تطبيق الجهة: دخول ثم عمل.
 *
 * الاسمان mizan وadmin محجوزان في سجل الجهات، فلا يلتبسان بجهة. وفي التطوير
 * (localhost) يبقى الوجه "app" حتى لا ينقلب العرض التجريبي إلى صفحة تسويق.
 */
export type HostSurface = 'marketing' | 'admin' | 'app';

export function hostSurface(host: string = typeof window !== 'undefined' ? window.location.hostname : ''): HostSurface {
  const label = String(host || '').trim().toLowerCase().split('.')[0];
  if (label === 'mizan') return 'marketing';
  if (label === 'admin') return 'admin';
  return 'app';
}
