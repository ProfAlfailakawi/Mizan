/*
 * تشخيص «ركن الودجت» (iPhone Duo) — يُحمَّل فقط عند `?duo-debug=1` (انظر main.tsx).
 * يرسم إطار المنطقة المحجوزة (حدود حمراء شفافة، pointer-events:none) ولوحةً صغيرة بالقيم، توضع خارج المنطقة
 * (أسفل اليسار). للعرض فقط؛ لا يقرأ بياناتٍ ولا يكتب شيئًا.
 */
export function mountDuoDebug(): void {
  if (document.getElementById('mz-duo-debug')) return;
  /* معايرة حيّة على الجهاز: ?duo-debug=1&duo-w=110&duo-h=270 تُبدّل المتغيّرين على <html> (هنا فقط، لا في الإنتاج العادي). */
  const q = new URLSearchParams(window.location.search);
  for (const [key, prop] of [['duo-w', '--duo-widget-w'], ['duo-h', '--duo-widget-h']] as const) {
    const v = Number(q.get(key));
    if (Number.isFinite(v) && v > 0 && v <= 600) document.documentElement.style.setProperty(prop, `${Math.round(v)}px`);
  }
  const root = document.createElement('div');
  root.id = 'mz-duo-debug';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:11px/1.5 ui-monospace,monospace';
  const frame = document.createElement('div');
  frame.style.cssText = 'position:fixed;top:0;right:0;width:var(--duo-widget-w);height:var(--duo-widget-h);border:2px solid rgba(220,38,38,.9);background:rgba(220,38,38,.12);box-sizing:border-box;pointer-events:none';
  const panel = document.createElement('pre');
  panel.style.cssText = 'position:fixed;left:6px;bottom:6px;max-width:calc(100vw - 12px);margin:0;padding:6px 8px;border-radius:8px;background:rgba(15,26,22,.88);color:#fff;white-space:pre-wrap;direction:ltr;text-align:left;pointer-events:none';
  root.append(frame, panel);
  document.body.append(root);

  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.append(probe);

  const render = () => {
    const cs = getComputedStyle(document.documentElement);
    const p = getComputedStyle(probe);
    const vv = window.visualViewport;
    const w = cs.getPropertyValue('--duo-widget-w').trim();
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const ua = navigator.userAgent;
    const wk = /iPhone|iPad/.test(ua) && !/Safari\//.test(ua);
    panel.textContent = [
      `duo-widget active: ${parseFloat(w) > 0 ? 'YES' : 'no'}`,
      `--duo-widget-w ${w} · -gap ${cs.getPropertyValue('--duo-widget-gap').trim()} · -h ${cs.getPropertyValue('--duo-widget-h').trim()}`,
      `safe-area T/R/B/L: ${p.paddingTop} / ${p.paddingRight} / ${p.paddingBottom} / ${p.paddingLeft}`,
      `inner ${window.innerWidth}×${window.innerHeight} · visualViewport ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}` : 'n/a'}`,
      `dir ${document.documentElement.dir || getComputedStyle(document.body).direction} · standalone ${standalone}`,
      `Capacitor: ${cap?.isNativePlatform?.() ? `native ${(cap as unknown as { getPlatform?: () => string }).getPlatform?.() ?? ''}` : 'no (browser)'}`,
      `UA: ${wk ? 'WKWebView (no Safari/ token)' : /Safari\//.test(ua) ? 'Safari/Chrome (has Safari/ token)' : 'other'}`,
      'calibrate: ?duo-debug=1&duo-w=110&duo-h=270',
      'send a screenshot with the frame; adjust duo-w / duo-h until the red frame covers the capsule',
    ].join('\n');
  };
  render();
  window.addEventListener('resize', render);
  window.visualViewport?.addEventListener('resize', render);
}
