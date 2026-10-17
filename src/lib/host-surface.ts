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

// Firebase Hosting gives each site one fixed label under web.app, so the two non-tenant
// surfaces also answer to these sites (mizan-kw.web.app, mizan-admin-kw.web.app).
// Tenants stay on their own *.dr-alfailakawi.com subdomains.
const MARKETING_LABELS = ['mizan', 'mizan-kw'];
const ADMIN_LABELS = ['admin', 'mizan-admin-kw'];

export function hostSurface(host: string = typeof window !== 'undefined' ? window.location.hostname : ''): HostSurface {
  const label = String(host || '').trim().toLowerCase().split('.')[0];
  if (MARKETING_LABELS.includes(label)) return 'marketing';
  if (ADMIN_LABELS.includes(label)) return 'admin';
  return 'app';
}
