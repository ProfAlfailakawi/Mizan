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

// Firebase Hosting gives each site one fixed label under web.app, so the marketing surface
// also answers to mizan-quran.web.app. The owner console lives under /admin on that same host
// (mizan-quran.web.app/admin). Tenants stay on their own *.dr-alfailakawi.com subdomains.
const MARKETING_LABELS = ['mizan', 'mizan-quran'];
const ADMIN_LABELS = ['admin'];
const ADMIN_PATH = /^\/admin(\/|$)/;

export function hostSurface(
  host: string = typeof window !== 'undefined' ? window.location.hostname : '',
  path: string = typeof window !== 'undefined' ? window.location.pathname : ''
): HostSurface {
  const label = String(host || '').trim().toLowerCase().split('.')[0];
  if (ADMIN_LABELS.includes(label)) return 'admin';
  if (MARKETING_LABELS.includes(label)) return ADMIN_PATH.test(path) ? 'admin' : 'marketing';
  return 'app';
}
