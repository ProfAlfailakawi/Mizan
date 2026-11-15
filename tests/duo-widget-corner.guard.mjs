/*
 * حارس تقاطع «ركن الودجت» — iPhone Duo (جولة 2026-11-14، الجزء الثالث).
 *
 * على iPhone Duo الحقيقي يطفو فوق الزاوية العليا اليمنى الفيزيائية عنصر نظامٍ لا يدخل في safe-area
 * (كبسولة المصباح + الحساب/الموقع + الوقت). المنطقة المحجوزة في `src/index.css` (القسم «ركن الودجت»):
 *   --duo-widget-w ≈ 96px  ·  --duo-widget-gap ≈ 8px  ·  --duo-widget-h = clamp(64px, 31vh, 270px)
 * وهي 0 خارج الجهاز. هذا الحارس يفتح ميزان في WebKit بالبيئة التجريبية المعزولة (لا كتابة في أي خادم)
 * ويتحقق أن **لا شيء مهمًّا** يتقاطع مع المستطيل [vw − widget-w, vw] × [0, widget-h]:
 *   مهمّ = نصٌّ مرئي (بمستطيلات أسطره) أو a/button/input/select/textarea/summary/[role=tab|button]/img/svg.
 *   مستثنى (ويُسجَّل في التقرير): ما عُلِّم `data-duo-bleed` أو داخله، وما كان `aria-hidden` مع
 *   `pointer-events:none` (زخرفة بلا نص ولا تفاعل)، وما قصّته حاويةٌ فلم يعد مرئيًّا.
 *
 * التشغيل:  npm run test:duo-widget          (يشغّل الخادم بنفسه على منفذ خاص)
 *           node tests/duo-widget-corner.guard.mjs --base=http://127.0.0.1:5130 [--out=...] [--shots=dir] [--only=a,b]
 *
 * لا يدّعي اختبار جهازٍ حقيقي: WebKit هنا محاكاة مقاسات، وعنصر النظام نفسه غير موجود فيه، فالحارس
 * يفحص المستطيل المحجوز لا الودجت.
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { webkit, chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const SERVE = process.argv.includes('--serve');
const OUT = arg('out', '');
const SHOTS = arg('shots', '');
const ONLY = arg('only', '');
const ENGINE = arg('engine', 'webkit');
/* --assume-zone: يقيس كودًا قديمًا لا يعرّف المتغيّرات (لقطات «قبل»): يفرض 96px × clamp(64px,31vh,270px). */
const ASSUME = process.argv.includes('--assume-zone');
let BASE = arg('base', 'http://127.0.0.1:5130');

/* المقاسات المطلوبة: طولي وعرضي (يُبدَّل w/h) */
const BASE_SIZES = [[382, 580], [470, 780], [594, 368], [669, 867], [951, 585]];
const SIZES = BASE_SIZES.flatMap(([w, h]) => [[w, h], [h, w]]);
const SCHEMES = ['light', 'dark'];
const TEXT = [100, 200];

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); });
let server = null;
async function startServer() {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], { env: { ...process.env, PORT: String(port), DISABLE_HMR: 'true' }, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/demo`); if (r.ok) return; } catch { /* لم يبدأ بعد */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('الخادم لم يبدأ خلال دقيقتين');
}

const settle = (p, ms = 450) => p.waitForTimeout(ms);
const quiet = ctx => ctx.addInitScript(() => {
  try { localStorage.setItem('mizan_onboarding_quiet_v2', '1'); sessionStorage.setItem('mizan_splash_seen', '1'); } catch { /* وضع خاص */ }
});
async function enterDemo(p) {
  if (await p.$('.mizan-demo-bar')) return;
  await p.goto(`${BASE}/demo`, { waitUntil: 'load' }).catch(() => {});
  await p.waitForSelector('.mizan-demo-bar select', { timeout: 30000 });
  await settle(p, 1200);
}
async function asRole(p, role) {
  await enterDemo(p);
  if (p.url().includes('#')) { await p.evaluate(() => { window.location.hash = ''; }); await settle(p, 300); }
  await p.selectOption('.mizan-demo-bar select', role);
  await settle(p, 1800);
  await p.evaluate(() => window.scrollTo(0, 0));
}
const clickText = async (p, text) => {
  const el = p.getByRole('button', { name: text }).first();
  if (await el.count()) { await el.click({ timeout: 4000 }).catch(() => {}); await settle(p, 700); return true; }
  return false;
};
const openMore = async p => {
  const s = p.locator('.mizan-more summary:visible').first();
  if (await s.count()) { await s.click().catch(() => {}); await settle(p, 400); }
};
const gotoFresh = hash => async p => { await p.goto(`${BASE}/${hash}`, { waitUntil: 'load' }).catch(() => {}); await settle(p, hash ? 2200 : 1400); };

/* السطوح. `fresh` = سياق جديد بلا جلسة عرض (غير مسجّل). */
const SCENARIOS = [
  { id: 'login', label: 'الدخول (غير مسجّل)', fresh: true, go: gotoFresh('') },
  { id: 'reset', label: 'استعادة كلمة المرور', fresh: true, go: gotoFresh('#reset-password') },
  { id: 'notfound', label: 'الخطأ: مسابقة غير موجودة', fresh: true, go: gotoFresh('#competition?comp=duo-missing-0000') },
  { id: 'discover', label: 'دليل المسابقات (#discover)', fresh: true, go: gotoFresh('#discover') },
  { id: 'passport', label: 'الجواز العام (#passport)', fresh: true, go: gotoFresh('#passport') },
  { id: 'comp-home', label: 'مدير المسابقة: الرئيسية', go: p => asRole(p, 'comp_admin') },
  { id: 'comp-participants', label: 'مدير المسابقة: المشاركون', go: async p => { await asRole(p, 'comp_admin'); await clickText(p, /^المشاركون$/); } },
  { id: 'drawer-more', label: 'القائمة الجانبية (المزيد) مفتوحة', go: async p => { await asRole(p, 'comp_admin'); await openMore(p); } },
  { id: 'drawer-help', label: 'درج «اشرح لي هذه الواجهة»', go: async p => {
    await asRole(p, 'comp_admin');
    const wide = p.locator('button[title="اشرح لي هذه الواجهة"]:visible').first();
    if (await wide.count()) await wide.click().catch(() => {}); else { await openMore(p); await clickText(p, /اشرح لي هذه الواجهة/); }
    await settle(p, 900);
  } },
  { id: 'modal-search', label: 'نافذة البحث السريع', go: async p => {
    await asRole(p, 'comp_admin');
    const wide = p.locator('button[title="بحث سريع"]:visible').first();
    if (await wide.count()) await wide.click().catch(() => {}); else { await openMore(p); await clickText(p, /بحث سريع/); }
    await settle(p, 900);
  } },
  { id: 'modal-notifications', label: 'نافذة الإشعارات', go: async p => {
    await asRole(p, 'comp_admin');
    await p.locator('button[aria-label^="الإشعارات"]').first().click().catch(() => {}); await settle(p, 900);
  } },
  { id: 'judge-wait', label: 'المحكّم: الانتظار', go: p => asRole(p, 'judge') },
  { id: 'judge-cockpit', label: 'المحكّم: القمرة', go: async p => {
    await asRole(p, 'judge'); await clickText(p, /ابدأ مع المتسابق التالي/); await settle(p, 1500); await clickText(p, /متابعة بلا ميكروفون/);
  } },
  { id: 'participant', label: 'المتسابق', go: p => asRole(p, 'participant') },
  { id: 'head-judge', label: 'رئيس التحكيم', go: p => asRole(p, 'head_judge') },
  { id: 'ops', label: 'مركز العمليات', go: p => asRole(p, 'ops_manager') },
  { id: 'org', label: 'مدير الجهة', go: p => asRole(p, 'org_admin') },
  { id: 'broadcast', label: 'شاشة البثّ (شريط علوي ثابت)', go: p => asRole(p, 'broadcast_operator') },
];

/* القياس كلّه داخل الصفحة. */
const measure = p => p.evaluate(assume => {
  const doc = document.documentElement;
  const vw = doc.clientWidth, vh = window.innerHeight;
  const rootCs = getComputedStyle(doc);
  /* clamp(...) لا يُقرأ بـparseFloat (NaN): تُحلّ القيم بعنصر مسبار يأخذ var() فعلًا. */
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:var(--duo-widget-w);height:var(--duo-widget-h)';
  document.body.append(probe);
  const pr = probe.getBoundingClientRect();
  probe.remove();
  const num = n => parseFloat(rootCs.getPropertyValue(n)) || 0;
  let W = pr.width, H = pr.height;
  if (assume && !W) { W = 96; H = Math.min(270, Math.max(64, window.innerHeight * 0.31)); }
  const zone = { left: vw - W, top: 0, right: vw, bottom: H };
  const sel = el => {
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${t ? ` «${t}»` : ''}`;
  };
  const hidden = el => {
    for (let n = el; n && n !== doc; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true;
      if (n.matches('details:not([open]) > :not(summary)')) return true;
    }
    return false;
  };
  const clip = (el, r) => {
    let { left, right, top, bottom } = r;
    for (let n = el.parentElement; n && n !== doc && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const pr = n.getBoundingClientRect();
        left = Math.max(left, pr.left); right = Math.min(right, pr.right);
        if (cs.overflowY !== 'visible') { top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); }
      }
    }
    return { left, right, top, bottom, w: right - left, h: bottom - top };
  };
  const hits = new Set(), exempt = new Set();
  const test = (el, r, what) => {
    if (!W || r.width <= 0.5 || r.height <= 0.5) return;
    const c = clip(el, r);
    if (c.w <= 0.5 || c.h <= 0.5) return;
    if (!(c.left < zone.right - 0.5 && c.right > zone.left + 0.5 && c.top < zone.bottom - 0.5 && c.bottom > zone.top + 0.5)) return;
    if (el.closest('[data-duo-bleed]')) { exempt.add(`bleed ${what} ${sel(el)}`); return; }
    if (what === 'media' && el.closest('[aria-hidden="true"]') && getComputedStyle(el).pointerEvents === 'none') { exempt.add(`decor ${sel(el)}`); return; }
    hits.add(`${what} ${sel(el)} [x ${Math.round(c.left)}–${Math.round(c.right)}, y ${Math.round(c.top)}–${Math.round(c.bottom)}]`);
  };
  const controls = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="tab"], [role="button"]')].filter(el => !hidden(el));
  for (const el of controls) test(el, el.getBoundingClientRect(), 'control');
  for (const el of document.querySelectorAll('img, svg')) {
    if (hidden(el)) continue;
    if (el.closest('button, a[href], summary, [role="button"], [role="tab"]')) continue; // يُحسب مع حاويته
    if (el.closest('svg') && el.closest('svg') !== el) continue;
    test(el, el.getBoundingClientRect(), 'media');
  }
  /* شعارٌ يُرسم خلفيةً/قناعًا أو canvas: يُحسب إن كان صغيرًا (أقلّ من 160px) فهو علامة لا خلفية ممتدّة. */
  for (const el of document.querySelectorAll('canvas, picture, [style*="background-image"], [class*="logo"], [class*="mark"]')) {
    if (hidden(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.width < 160 && r.height < 160 && (el.matches('canvas, picture') || getComputedStyle(el).backgroundImage !== 'none' || getComputedStyle(el).maskImage !== 'none' || getComputedStyle(el).webkitMaskImage !== 'none')) test(el, r, 'media');
  }
  const off = [];
  for (const el of controls) { const r = el.getBoundingClientRect(); if (r.width > 1 && r.height > 1 && (r.left < -1 || r.right > vw + 1)) { const c = clip(el, r); if (c.w > 1 && c.h > 1 && (c.left < -1 || c.right > vw + 1)) off.push(sel(el)); } }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.nodeValue.trim()) continue;
    const el = t.parentElement; if (!el || hidden(el) || el.closest('script,style,.sr-only,.dna-sr')) continue;
    const er = el.getBoundingClientRect(); if (er.width <= 2 || er.height <= 2) continue;
    const range = document.createRange(); range.selectNodeContents(t);
    for (const r of range.getClientRects()) test(el, r, 'text');
  }
  const wide = overflow => overflow > 1 ? [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > vw + 1 && !hidden(e)).slice(0, 3).map(sel) : [];
  return { off, wide: wide(doc.scrollWidth - doc.clientWidth), vw, vh, W, H, gap: num('--duo-widget-gap'), Hraw: rootCs.getPropertyValue('--duo-widget-h').trim(), overflowX: doc.scrollWidth - doc.clientWidth, hits: [...hits], exempt: [...exempt] };
}, ASSUME);

/* سياق «التطبيق»: غلاف Capacitor (WKWebView) كما يراه الموقع. مُحاكى في WebKit سطح المكتب — ليس جهازًا ولا WKWebView حقيقيًّا. */
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const CONTEXTS = { safari: {}, app: { userAgent: APP_UA, deviceScaleFactor: 2, isMobile: true } };
const newCtx = async (browser, kind) => {
  const ctx = await browser.newContext({ locale: 'ar', deviceScaleFactor: 1, hasTouch: true, viewport: { width: 669, height: 867 }, ...CONTEXTS[kind] });
  await quiet(ctx);
  if (kind === 'app') await ctx.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', platform: 'ios' };
    try { Object.defineProperty(navigator, 'standalone', { get: () => undefined, configurable: true }); } catch { /* غير قابل */ }
  });
  return ctx;
};
/* ارتفاعات التطبيق الكاملة (بلا أشرطة المتصفّح): أطول من Safari، فلا يصحّ أن يعتمد الكشف على ارتفاعٍ ضيّق. */
const EXTRA = [[382, 780], [382, 844], [470, 900], [669, 1000], [951, 700], [457, 678], [457, 760]];

async function main() {
  if (SERVE) await startServer();
  const launcher = ENGINE === 'chromium' ? chromium : webkit;
  const browser = await launcher.launch();
  const report = { generatedAt: new Date().toISOString(), engine: ENGINE, version: browser.version(), base: BASE, contexts: Object.keys(CONTEXTS), sizes: SIZES.map(s => s.join('x')), extraAppHeights: EXTRA.map(s => s.join('x')), schemes: SCHEMES, textScales: TEXT, cells: 0, violations: [], inactive: [], exemptions: {}, perScenario: {} };
  const only = ONLY ? ONLY.split(',') : null;
  const kinds = (arg('contexts', 'safari,app')).split(',');
  for (const kind of kinds) {
    const demoCtx = await newCtx(browser, kind);
    const demo = await demoCtx.newPage();
    for (const sc of SCENARIOS.filter(s => !only || only.includes(s.id))) {
      let ctx = demoCtx, p = demo;
      if (sc.fresh) { ctx = await newCtx(browser, kind); p = await ctx.newPage(); }
      try { await sc.go(p); } catch (e) { report.violations.push({ ctx: kind, scenario: sc.id, error: String(e.message).slice(0, 160) }); }
      let n = 0, bad = 0;
      for (const scheme of SCHEMES) {
        await p.emulateMedia({ colorScheme: scheme });
        for (const scale of TEXT) {
          await p.evaluate(s => { document.documentElement.style.fontSize = s === 100 ? '' : `${s}%`; }, scale);
          for (const [w, h, extra] of [...SIZES, ...EXTRA.map(e => [...e, true])]) {
            if (extra && scheme === 'dark') continue;
            await p.setViewportSize({ width: w, height: h }); await settle(p, 350);
            let m = await measure(p);
            if (!m.W || !m.H) { await settle(p, 600); m = await measure(p); }
            n++; report.cells++;
            const cell = { ctx: kind, scenario: sc.id, size: `${w}x${h}`, scheme, scale };
            if (!m.W || !m.H) report.inactive.push({ ...cell, W: m.W, H: m.H });
            else { report.zoneH = report.zoneH || { min: 1e9, max: 0 }; report.zoneH.min = Math.min(report.zoneH.min, m.H); report.zoneH.max = Math.max(report.zoneH.max, m.H); if (Math.abs(m.W - 96) > 0.5) report.inactive.push({ ...cell, W: m.W, H: m.H, note: 'unexpected width' }); }
            if (m.overflowX > 1) report.violations.push({ ...cell, advisory: scale === 200, overflowX: m.overflowX, hits: ['overflow-x', ...m.wide] });
            if (m.off.length) report.violations.push({ ...cell, advisory: scale === 200, hits: ['offscreen', ...m.off.slice(0, 4)] });
            if (m.hits.length) { bad++; report.violations.push({ ...cell, zone: `x≥${m.vw - m.W}, y≤${Math.round(m.H)}`, hits: m.hits.slice(0, 8), count: m.hits.length }); }
            for (const e of m.exempt) report.exemptions[e] = (report.exemptions[e] || 0) + 1;
            if (SHOTS && kind === 'safari' && scheme === 'light' && scale === 100 && ['login', 'comp-home', 'drawer-more'].includes(sc.id) && ['382x580', '669x867', '585x951'].includes(`${w}x${h}`)) {
              fs.mkdirSync(SHOTS, { recursive: true });
              await p.screenshot({ path: path.join(SHOTS, `guard-${sc.id}-${w}x${h}.png`) });
            }
          }
          await p.evaluate(() => { document.documentElement.style.fontSize = ''; });
        }
      }
      await p.emulateMedia({ colorScheme: 'light' });
      report.perScenario[`${kind}/${sc.id}`] = { cells: n, violatingCells: bad };
      process.stdout.write(`  [${kind}] ${sc.id}: ${n} cells, ${bad} violating\n`);
      if (sc.fresh) await ctx.close();
    }
    await demoCtx.close();
  }
  await browser.close();
  if (server) server.kill();
  if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); }
  const nViol = report.violations.reduce((a, v) => a + (v.count || 1), 0);
  const byCtx = Object.fromEntries(kinds.map(k => [k, report.violations.filter(v => v.ctx === k).length]));
  console.log(`engine=${ENGINE} ${report.version} · cells=${report.cells} · inactive=${report.inactive.length} · violating cells=${report.violations.length} ${JSON.stringify(byCtx)} · elements in zone=${nViol} · exemptions=${Object.keys(report.exemptions).length}`);
  for (const v of report.violations.slice(0, 25)) console.log(`  ✗ [${v.ctx}] ${v.scenario} ${v.size || ''} ${v.scheme || ''} ${v.scale || ''}% :: ${(v.hits || [v.error]).slice(0, 3).join(' | ')}`);
  const hard = report.violations.filter(v => !v.advisory);
  console.log(`zone W=96 · H range ${report.zoneH ? Math.round(report.zoneH.min) + '–' + Math.round(report.zoneH.max) : 'n/a'}px`);
  console.log(`hard violations=${hard.length} · advisory (200% text overflow, present on the base too)=${report.violations.length - hard.length}`);
  if (hard.length || report.inactive.length) process.exit(1);
}
main().catch(e => { if (server) server.kill(); console.error(e); process.exit(2); });
