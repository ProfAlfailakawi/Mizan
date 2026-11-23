/**
 * الطباعة داخل التطبيق (WKWebView): الإطار الخفيّ يطبع الصفحة الرئيسية لا الوثيقة،
 * فتُعرض الوثيقة في طبقةٍ داخل الصفحة نفسها، وقاعدة @media print تُخفي كل ما سواها.
 * لا تُستعمل إلا داخل تطبيق iOS؛ المتصفّح يبقى على مسار الإطار الخفيّ.
 */
export const PRINT_HOST_ID = 'mizan-print-overlay';

export const PRINT_OVERLAY_CSS = `
#${PRINT_HOST_ID}{position:fixed;inset:0;z-index:2147483000;background:#fffdf7;overflow:auto;-webkit-overflow-scrolling:touch}
#${PRINT_HOST_ID} .mz-print-bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#214C40;z-index:1}
#${PRINT_HOST_ID} .mz-print-bar button{min-height:44px;padding:0 18px;border:0;border-radius:10px;font:700 15px system-ui;background:#fffdf7;color:#17221e}
@media print{
  body > *:not(#${PRINT_HOST_ID}){display:none !important}
  #${PRINT_HOST_ID}{position:static !important;inset:auto !important;overflow:visible !important;background:#fff !important}
  #${PRINT_HOST_ID} .mz-print-bar{display:none !important}
}`;

/** يعرض الوثيقة في طبقةٍ داخل الصفحة مع زرّي «طباعة» و«إغلاق». */
export function printInPage(html: string): void {
  document.getElementById(PRINT_HOST_ID)?.remove();
  const style = document.createElement('style');
  style.id = `${PRINT_HOST_ID}-style`;
  style.textContent = PRINT_OVERLAY_CSS;
  const host = document.createElement('div');
  host.id = PRINT_HOST_ID;
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('dir', 'rtl');
  const bar = document.createElement('div');
  bar.className = 'mz-print-bar';
  const close = () => { host.remove(); style.remove(); };
  const mk = (label: string, fn: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); return b;
  };
  bar.append(mk('طباعة', () => window.print()), mk('إغلاق', close));
  /* معزولٌ في shadow DOM كي لا تتسرّب أنماط الوثيقة إلى التطبيق ولا العكس. */
  const body = document.createElement('div');
  const root = body.attachShadow ? body.attachShadow({ mode: 'open' }) : body;
  root.innerHTML = html;
  host.append(bar, body);
  document.head.appendChild(style);
  document.body.appendChild(host);
  window.addEventListener('afterprint', close, { once: true });
  setTimeout(() => { try { window.print(); } catch { /* الزرّ يبقى متاحًا */ } }, 350);
}
