/*
 * iPhone Duo — مصفوفة الوضعيات الكاملة (جولة 2026-11-14). فحصٌ لا يكتب شيئًا في أي خادم.
 *
 * يفتح ميزان في WebKit (محرّك Safari) بالبيئة التجريبية المعزولة، ويمرّ على الشاشات كلها في
 * كل مقاسٍ من مقاسات الجهاز، ويقيس بالأرقام لا بالنظر:
 *   - التمرير الأفقي غير المقصود (scrollWidth > clientWidth)،
 *   - العناصر المهمة المقصوصة أو الخارجة عن الشاشة،
 *   - أهداف اللمس دون 44px،
 *   - وفي مقاس الشاشة الداخلية: كل نصٍّ أو عنصرٍ تفاعلي يقع على منطقة الكعب (المنتصف ± نصف عرضه)،
 *     وكل عنصرٍ يخرج من ورقته إلى الورقة المقابلة.
 * ثم تسلسلٌ حيّ على صفحةٍ واحدة بلا إعادة تحميل، يتحقق أن الحالة باقية (نصٌّ مكتوب، تبويب
 * مختار، موضع التمرير، نافذة مفتوحة، عدّاد الجلسة وهوية عقدة القمرة)، واختبارات الضغط
 * (نص 200%، داكن، تقليل الحركة، لوحة المفاتيح، حواف أمان غير متماثلة).
 *
 * التشغيل (خادم التطوير على منفذٍ خاص، والبيئة التجريبية مفعّلة افتراضيًّا):
 *   PORT=5130 DISABLE_HMR=true npx tsx server.ts &
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/duo-final-audit.mjs --base=http://127.0.0.1:5130 \
 *     [--out=docs/iphone-duo-final/audit-report.json] [--shots=docs/iphone-duo-final] [--only=matrix|live|stress]
 *
 * لا يدّعي اختبار جهازٍ حقيقي: WebKit هنا محاكاة مقاسات، وViewport Segments لا تُحاكى فيه.
 */
import fs from 'node:fs';
import path from 'node:path';
import { webkit } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:5130');
const OUT = arg('out', 'docs/iphone-duo-final/audit-report.json');
const SHOTS = arg('shots', '');
const ONLY = arg('only', 'matrix,live,stress,subscreens').split(',');
const SCREENS_ONLY = arg('screens', '');
const SHOT_SIZES = arg('shot-sizes', '669x867,951x585').split(',');

/* الوضعيات A–J كما في docs/IPHONE-DUO-FINAL-ACCEPTANCE.md */
const POSES = {
  A: [[382, 580], [385, 571], [320, 568]],
  B: [[594, 368]],
  C: [[669, 867]],
  D: [[951, 585]],
  E: [[951, 350], [600, 350]],
  F: [[669, 520], [600, 480]],
  G: [[768, 1024], [1024, 768], [1280, 800], [1440, 900]],
  H: [[360, 640], [390, 844], [844, 390]],
  S: [[320, 350], [320, 600], [320, 900], [470, 350], [470, 600], [470, 900], [620, 350], [620, 600], [620, 900]],
};
/* الشاشة الداخلية: نفس شرط CSS في src/index.css (القسم 3). */
const isInner = (w, h) => (w >= 640 && w < 760 && h >= 520) || (w > h && w >= 640 && w <= 1000 && h >= 520 && h <= 720);

const report = { generatedAt: new Date().toISOString(), engine: 'webkit', base: BASE, matrix: [], live: null, stress: [], notes: [] };

const browser = await webkit.launch();
const quiet = async ctx => ctx.addInitScript(() => {
  try { localStorage.setItem('mizan_onboarding_quiet_v2', '1'); sessionStorage.setItem('mizan_splash_seen', '1'); } catch { /* وضع خاص */ }
});
const settle = (p, ms = 450) => p.waitForTimeout(ms);

async function enterDemo(p) {
  if (await p.$('.mizan-demo-bar')) return;
  await p.goto(`${BASE}/demo`, { waitUntil: 'load' }).catch(() => {});
  await p.waitForSelector('.mizan-demo-bar select', { timeout: 30000 });
  await settle(p, 1200);
}
async function asRole(p, role) {
  await enterDemo(p);
  if (!p.url().endsWith('/') && p.url().includes('#')) { await p.evaluate(() => { window.location.hash = ''; }); await settle(p, 300); }
  await p.selectOption('.mizan-demo-bar select', role);
  await settle(p, 1800);
  await p.evaluate(() => window.scrollTo(0, 0));
}
const clickText = async (p, text) => {
  const el = p.getByRole('button', { name: text }).first();
  if (await el.count()) { await el.click({ timeout: 4000 }).catch(() => {}); await settle(p, 700); return true; }
  return false;
};

/* الشاشات: كل واحدة تصل إلى حالتها من جلسة العرض. */
const SCREENS = [
  { id: 'login', label: 'الدخول', fresh: true, go: async p => { await p.goto(`${BASE}/`, { waitUntil: 'load' }).catch(() => {}); await settle(p, 1200); } },
  { id: 'reset', label: 'استعادة كلمة المرور', fresh: true, go: async p => { await p.goto(`${BASE}/#reset-password`, { waitUntil: 'load' }).catch(() => {}); await settle(p, 1200); } },
  { id: 'notfound', label: 'خطأ: مسابقة غير موجودة', fresh: true, go: async p => { await p.goto(`${BASE}/#competition?comp=duo-missing-0000`, { waitUntil: 'load' }).catch(() => {}); await settle(p, 2500); } },
  { id: 'discover', label: 'دليل المسابقات العام (#discover)', fresh: true, go: async p => { await p.goto(`${BASE}/#discover`, { waitUntil: 'load' }).catch(() => {}); await settle(p, 2500); } },
  { id: 'passport', label: 'جواز ميزان العام (#passport)', fresh: true, go: async p => { await p.goto(`${BASE}/#passport`, { waitUntil: 'load' }).catch(() => {}); await settle(p, 2500); } },
  { id: 'marketing', label: 'الواجهة التسويقية (mizan.*)', fresh: true, go: async p => { await p.goto(BASE.replace('127.0.0.1', 'mizan.localhost'), { waitUntil: 'load' }).catch(() => {}); await settle(p, 2500); } },
  { id: 'judge-wait', label: 'المحكّم: الانتظار', go: p => asRole(p, 'judge') },
  { id: 'judge-cockpit', label: 'المحكّم: القمرة', go: async p => {
    await asRole(p, 'judge');
    await clickText(p, /ابدأ مع المتسابق التالي/);
    await settle(p, 1500);
    await clickText(p, /متابعة بلا ميكروفون/);
  } },
  { id: 'participant', label: 'المتسابق', go: p => asRole(p, 'participant') },
  { id: 'comp-overview', label: 'مدير المسابقة: نظرة', go: p => asRole(p, 'comp_admin') },
  { id: 'comp-participants', label: 'مدير المسابقة: المشاركون', go: async p => { await asRole(p, 'comp_admin'); await clickText(p, /^المشاركون$/); } },
  { id: 'comp-results', label: 'مدير المسابقة: النتائج', go: async p => { await asRole(p, 'comp_admin'); await clickText(p, /^النتائج$/); } },
  { id: 'head-judge', label: 'رئيس التحكيم', go: p => asRole(p, 'head_judge') },
  { id: 'ops', label: 'مركز العمليات', go: p => asRole(p, 'ops_manager') },
  { id: 'org', label: 'مدير الجهة', go: p => asRole(p, 'org_admin') },
  { id: 'auditor', label: 'المدقّق', go: p => asRole(p, 'auditor') },
  { id: 'delegation', label: 'مدير الوفد', go: p => asRole(p, 'delegation_manager') },
  { id: 'guardian', label: 'وليّ الأمر', go: p => asRole(p, 'guardian') },
  { id: 'exception', label: 'مكتب الاستثناءات', go: p => asRole(p, 'exception_host') },
  { id: 'support', label: 'الدعم', go: p => asRole(p, 'support_agent') },
  { id: 'super-admin', label: 'مالك المنصة (فارغ بلا خادم)', go: p => asRole(p, 'super_admin') },
  { id: 'operator', label: 'المشغّل', go: p => asRole(p, 'operator_owner') },
  { id: 'broadcast', label: 'شاشة البثّ', go: p => asRole(p, 'broadcast_operator') },
  { id: 'sheet-notifications', label: 'لوحة: الإشعارات', go: async p => {
    await asRole(p, 'comp_admin');
    await p.locator('button[aria-label^="الإشعارات"]').first().click().catch(() => {}); await settle(p, 900);
  } },
  { id: 'dialog-search', label: 'نافذة: البحث السريع', go: async p => {
    await asRole(p, 'comp_admin');
    const wide = p.locator('button[title="بحث سريع"]:visible').first();
    if (await wide.count()) await wide.click().catch(() => {});
    else { await p.locator('.mizan-more summary').first().click().catch(() => {}); await settle(p, 300); await clickText(p, /بحث سريع/); }
    await settle(p, 900);
  } },
  { id: 'menu-more', label: 'قائمة: المزيد', go: async p => {
    await asRole(p, 'comp_admin'); await p.setViewportSize({ width: 669, height: 867 }); await settle(p, 300);
    await p.locator('.mizan-more summary').first().click().catch(() => {}); await settle(p, 500);
  } },
  { id: 'dialog-help', label: 'نافذة: اشرح لي هذه الواجهة', go: async p => {
    await asRole(p, 'comp_admin');
    const wide = p.locator('button[title="اشرح لي هذه الواجهة"]:visible').first();
    if (await wide.count()) await wide.click().catch(() => {});
    else { await p.locator('.mizan-more summary').first().click().catch(() => {}); await settle(p, 300); await clickText(p, /اشرح لي هذه الواجهة/); }
    await settle(p, 900);
  } },
];

/* القياس كلّه داخل الصفحة: يعيد أرقامًا وعيّنات مسمّاة. */
const measure = (p, inner) => p.evaluate(({ inner }) => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const doc = document.documentElement;
  const sel = el => {
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
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
  /* المستطيل المرئي بعد قصّ كل أبٍ يقصّ (overflow ≠ visible). */
  const clip = (el, r) => {
    let { left, right, top, bottom } = r; let scroller = false;
    for (let n = el.parentElement; n && n !== doc && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position === 'fixed') break;
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const pr = n.getBoundingClientRect();
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowY === 'auto' || cs.overflowY === 'scroll') scroller = true;
        left = Math.max(left, pr.left); right = Math.min(right, pr.right);
        if (cs.overflowY !== 'visible') { top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); }
      }
    }
    return { left, right, top, bottom, w: right - left, h: bottom - top, scroller };
  };
  const interactive = [...document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"]')]
    .filter(el => !hidden(el));
  const overflowX = doc.scrollWidth - doc.clientWidth;

  const tiny = [], clipped = [], offscreen = [];
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const c = clip(el, r);
    if (c.w <= 1 || c.h <= 1) continue; // مخفيٌّ داخل حاويةٍ مطويّة/مُمرَّرة: ليس على الشاشة
    if (!c.scroller && (r.left < -1 || r.right > vw + 1)) offscreen.push(sel(el));
    else if (!c.scroller && c.w * c.h < 0.6 * r.width * r.height) clipped.push(sel(el));
    /* هدف اللمس: الصندوق نفسه، أو الوسم (label) الذي يحتويه للمربّعات. */
    const host = el.matches('input[type="checkbox"],input[type="radio"]') ? (el.closest('label') || el) : el;
    const hr = host.getBoundingClientRect();
    if (Math.round(hr.width) < 44 || Math.round(hr.height) < 44) tiny.push(`${sel(el)} ${Math.round(hr.width)}×${Math.round(hr.height)}`);
  }
  const headings = [...document.querySelectorAll('h1,h2,h3')].filter(el => !hidden(el));
  for (const el of headings) {
    const r = el.getBoundingClientRect();
    if (r.width > 1 && (r.left < -1 || r.right > vw + 1)) { const c = clip(el, r); if (!c.scroller && c.w > 1) offscreen.push(sel(el)); }
  }

  let spine = null, crossing = [], leafEscape = [];
  if (inner) {
    const after = getComputedStyle(document.body, '::after');
    const drawn = after.content && after.content !== 'none' && after.content !== 'normal';
    const sw = drawn ? parseFloat(after.width) : 28;
    const cx = vw / 2, lo = cx - sw / 2, hi = cx + sw / 2;
    spine = { drawn, width: Math.round(sw * 10) / 10, from: Math.round(lo * 10) / 10, to: Math.round(hi * 10) / 10 };
    const hits = new Set();
    const hit = (el, r, what) => {
      const c = clip(el, r);
      if (c.w <= 0.5 || c.h <= 0.5) return;
      if (c.left < hi - 0.5 && c.right > lo + 0.5) hits.add(`${what} ${sel(el)} [${Math.round(c.left)}–${Math.round(c.right)}]`);
    };
    for (const el of interactive) { const r = el.getBoundingClientRect(); if (r.width > 1 && r.height > 1) hit(el, r, 'control'); }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      const el = t.parentElement; if (!el || hidden(el) || el.closest('script,style,.sr-only,.dna-sr')) continue;
      { const er = el.getBoundingClientRect(); if (er.width <= 2 || er.height <= 2) continue; } // نصٌّ مخفيّ بصريًّا للقارئ الآلي
      const range = document.createRange(); range.selectNodeContents(t);
      for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) hit(el, r, 'text');
    }
    crossing = [...hits];
    for (const leaf of document.querySelectorAll('.mz-leaf, .mz-spread-index > *, .mz-login-book > *')) {
      const lr = leaf.getBoundingClientRect(); if (lr.width < 2) continue;
      for (const el of leaf.querySelectorAll('button, a[href], input, select, textarea, h1, h2, h3, p, li, [role="tab"]')) {
        if (hidden(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
        const c = clip(el, r); if (c.w < 1 || c.scroller) continue;
        if (r.left < lr.left - 1 || r.right > lr.right + 1) leafEscape.push(`${sel(el)} [${Math.round(r.left)}–${Math.round(r.right)}] leaf [${Math.round(lr.left)}–${Math.round(lr.right)}]`);
      }
    }
  }
  const leaves = [...document.querySelectorAll('.mz-leaf, .mz-spread-index > *')].map(l => { const r = l.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
  return { vw, vh, overflowX, offscreen, clipped, tiny, spine, crossing, leafEscape, leaves, spread: !!document.querySelector('.mz-spread,.mz-login-book'), consoleErrors: 0 };
}, { inner });

const cap = (arr, n = 6) => ({ count: arr.length, samples: arr.slice(0, n) });

async function runMatrix() {
  const sizes = Object.entries(POSES).flatMap(([pose, list]) => list.map(([w, h]) => ({ pose, w, h })));
  const screens = SCREENS.filter(s => !SCREENS_ONLY || SCREENS_ONLY.split(',').includes(s.id));
  const demoCtx = await browser.newContext({ locale: 'ar', deviceScaleFactor: 1, hasTouch: true, viewport: { width: 951, height: 585 } });
  await quiet(demoCtx);
  const demo = await demoCtx.newPage();
  for (const screen of screens) {
    let ctx = demoCtx, p = demo;
    if (screen.fresh) { ctx = await browser.newContext({ locale: 'ar', deviceScaleFactor: 1, hasTouch: true, viewport: { width: 951, height: 585 } }); await quiet(ctx); p = await ctx.newPage(); }
    const errors = []; const onErr = e => errors.push(String(e.message || e).slice(0, 160)); p.on('pageerror', onErr);
    await p.setViewportSize({ width: 951, height: 585 });
    try { await screen.go(p); } catch (e) { report.notes.push(`${screen.id}: ${String(e.message).slice(0, 160)}`); }
    for (const { pose, w, h } of sizes) {
      await p.setViewportSize({ width: w, height: h }); await settle(p, 350);
      const inner = isInner(w, h);
      const m = await measure(p, inner);
      report.matrix.push({ screen: screen.id, label: screen.label, pose, size: `${w}x${h}`, inner, spread: m.spread,
        overflowX: m.overflowX, offscreen: cap(m.offscreen), clipped: cap(m.clipped), tiny: cap(m.tiny),
        spine: m.spine, crossing: cap(m.crossing, 10), leafEscape: cap(m.leafEscape), leaves: m.leaves });
      if (SHOTS && SHOT_SIZES.includes(`${w}x${h}`)) {
        await p.screenshot({ path: path.join(SHOTS, `after-${screen.id}-${w}x${h}.png`) });
      }
    }
    p.off('pageerror', onErr);
    report.pageErrors = report.pageErrors || {};
    if (errors.length) report.pageErrors[screen.id] = [...new Set(errors)].slice(0, 5);
    if (screen.fresh) await ctx.close();
    process.stdout.write(`  ${screen.id} ✓\n`);
  }
  await demoCtx.close();
}

/* I: تسلسلٌ حيّ على صفحةٍ واحدة بلا إعادة تحميل. */
async function runLive() {
  const seq = [[951, 585], [669, 867], [470, 700], [382, 580], [594, 368], [951, 350], [951, 585]];
  const ctx = await browser.newContext({ locale: 'ar', deviceScaleFactor: 1, hasTouch: true, viewport: { width: 951, height: 585 } });
  await quiet(ctx); const p = await ctx.newPage();
  const live = { sequence: seq.map(([w, h]) => `${w}x${h}`), flows: [] };

  /* (1) مدير المسابقة: بحثٌ مكتوب في «المشاركون» + موضع التمرير + القسم المختار */
  await asRole(p, 'comp_admin'); await clickText(p, /^المشاركون$/);
  const search = p.locator('[data-mz-view] input[placeholder="اسم أو كود"], input[type="search"], input[placeholder*="بحث"], input[placeholder*="ابحث"]').first();
  const typed = 'A-10';
  const hasSearch = await search.count();
  if (hasSearch) { await search.fill(typed); await search.evaluate(el => el.setAttribute('data-duo-probe', 'search')); }
  await p.evaluate(() => window.scrollTo(0, 240));
  const steps1 = [];
  for (const [w, h] of seq) {
    await p.setViewportSize({ width: w, height: h }); await settle(p, 500);
    steps1.push(await p.evaluate(() => ({
      size: `${innerWidth}x${innerHeight}`,
      probeAlive: !!document.querySelector('[data-duo-probe="search"]'),
      value: document.querySelector('[data-duo-probe="search"]')?.value ?? null,
      section: document.querySelector('[data-mz-view]')?.getAttribute('data-mz-view') ?? null,
      scrollY: Math.round(scrollY),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    })));
  }
  live.flows.push({ flow: 'comp_admin participants: typed search + section + scroll', typed: hasSearch ? typed : null, steps: steps1 });

  /* (2) نافذة مفتوحة تبقى مفتوحة */
  await p.setViewportSize({ width: 951, height: 585 });
  await asRole(p, 'comp_admin');
  const helpBtn = p.locator('button[title="اشرح لي هذه الواجهة"]:visible').first();
  if (await helpBtn.count()) await helpBtn.click().catch(() => {}); else { await p.locator('.mizan-more summary').first().click().catch(() => {}); await settle(p, 300); await clickText(p, /اشرح لي هذه الواجهة/); }
  await settle(p, 800);
  const steps2 = [];
  for (const [w, h] of seq) {
    await p.setViewportSize({ width: w, height: h }); await settle(p, 400);
    steps2.push(await p.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"], dialog[open]')].find(x => x.getBoundingClientRect().width > 0);
      const r = d?.getBoundingClientRect();
      return { size: `${innerWidth}x${innerHeight}`, dialogOpen: !!d, inViewport: !!r && r.left >= -1 && r.right <= innerWidth + 1, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }));
  }
  live.flows.push({ flow: 'help dialog stays open', steps: steps2 });
  await p.keyboard.press('Escape').catch(() => {});

  /* (3) قمرة المحكّم: العقدة نفسها، والعدّاد يجري، ولا خطأ */
  await p.setViewportSize({ width: 951, height: 585 });
  await asRole(p, 'judge'); await clickText(p, /ابدأ مع المتسابق التالي/); await settle(p, 1500); await clickText(p, /متابعة بلا ميكروفون/);
  const tagged = await p.evaluate(() => { const os = document.querySelector('.mizan-judge-os'); if (os) os.setAttribute('data-duo-probe', 'cockpit'); return !!os; });
  const steps3 = [];
  for (const [w, h] of seq) {
    await p.setViewportSize({ width: w, height: h }); await settle(p, 1200);
    steps3.push(await p.evaluate(() => {
      const os = document.querySelector('.mizan-judge-os');
      const clock = [...document.querySelectorAll('.mizan-judge-hud *, .mizan-judge-os time, .mizan-judge-os [class*="tabular"]')].map(n => n.textContent.trim()).find(t => /\d{1,2}:\d{2}/.test(t)) || null;
      return { size: `${innerWidth}x${innerHeight}`, cockpit: !!os, sameNode: os?.getAttribute('data-duo-probe') === 'cockpit', cols: os ? getComputedStyle(os).gridTemplateColumns : null, clock,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }));
  }
  live.flows.push({ flow: 'judge cockpit session survives resizes', cockpitFound: tagged, steps: steps3 });

  /* (4) المتسابق: التبويب المختار يبقى */
  await p.setViewportSize({ width: 951, height: 585 });
  await asRole(p, 'participant');
  const tab = p.getByRole('tab').nth(1); const tabName = (await tab.count()) ? (await tab.textContent()).trim() : null;
  if (tabName) await tab.click().catch(() => {});
  const steps4 = [];
  for (const [w, h] of seq) {
    await p.setViewportSize({ width: w, height: h }); await settle(p, 400);
    steps4.push(await p.evaluate(() => ({ size: `${innerWidth}x${innerHeight}`, selected: [...document.querySelectorAll('[role="tab"]')].find(t => t.getAttribute('aria-selected') === 'true' || t.classList.contains('is-active'))?.textContent.trim() || null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth })));
  }
  live.flows.push({ flow: 'participant selected tab survives', tab: tabName, steps: steps4 });
  report.live = live;
  await ctx.close();
}

/* J: الضغط — نص 200%، داكن، تقليل الحركة، لوحة المفاتيح، حواف أمان غير متماثلة. */
async function runStress() {
  const cases = [
    { id: 'text-200', sizes: [[669, 867], [951, 585], [382, 580]], css: 'html{font-size:200% !important;-webkit-text-size-adjust:200% !important}' },
    { id: 'dark-scheme', sizes: [[669, 867], [951, 585]], colorScheme: 'dark' },
    { id: 'reduced-motion', sizes: [[669, 867], [951, 585]], reducedMotion: 'reduce' },
    { id: 'safe-area-asym', sizes: [[669, 867], [951, 585], [382, 580]], css: 'body{padding:47px 0 34px 0 !important} .mizan-shell-main{padding-left:12px !important;padding-right:44px !important} .mz-el-header{padding-top:47px !important}' },
  ];
  const screens = ['judge-wait', 'participant', 'comp-overview', 'org'];
  for (const c of cases) {
    const ctx = await browser.newContext({ locale: 'ar', deviceScaleFactor: 1, hasTouch: true, viewport: { width: 951, height: 585 }, colorScheme: c.colorScheme || 'light', reducedMotion: c.reducedMotion || 'no-preference' });
    await quiet(ctx); const p = await ctx.newPage();
    for (const id of screens) {
      const s = SCREENS.find(x => x.id === id); await s.go(p);
      if (c.css) await p.addStyleTag({ content: c.css });
      for (const [w, h] of c.sizes) {
        await p.setViewportSize({ width: w, height: h }); await settle(p, 400);
        const m = await measure(p, isInner(w, h));
        const motion = await p.evaluate(() => [...document.querySelectorAll('*')].filter(el => { const cs = getComputedStyle(el); return cs.animationName !== 'none' && cs.animationIterationCount === 'infinite' && cs.animationPlayState === 'running'; }).length);
        report.stress.push({ case: c.id, screen: id, size: `${w}x${h}`, overflowX: m.overflowX, offscreen: cap(m.offscreen), clipped: cap(m.clipped), crossing: cap(m.crossing, 8), leafEscape: cap(m.leafEscape), infiniteAnimations: motion });
      }
      if (c.css) await p.evaluate(() => document.querySelectorAll('style').forEach(st => { if (/200%|47px 0 34px/.test(st.textContent)) st.remove(); }));
    }
    await ctx.close();
  }
  /* لوحة المفاتيح: حقلٌ مركَّز ثم يقصر الارتفاع إلى ~350 كما تفعل لوحة iOS */
  const ctx = await browser.newContext({ locale: 'ar', deviceScaleFactor: 1, hasTouch: true, viewport: { width: 669, height: 867 } });
  await quiet(ctx); const p = await ctx.newPage();
  for (const [screen, go, w, h] of [['login', SCREENS[0].go, 669, 867], ['login', SCREENS[0].go, 951, 585], ['comp-participants', SCREENS.find(s => s.id === 'comp-participants').go, 669, 867], ['comp-participants', SCREENS.find(s => s.id === 'comp-participants').go, 951, 585]]) {
    await p.setViewportSize({ width: w, height: h }); await go(p); await settle(p, 400);
    const input = p.locator('input[type="email"], [data-mz-view] input[placeholder="اسم أو كود"], input[type="search"], input[placeholder*="بحث"], input[placeholder*="ابحث"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])').first();
    if (!(await input.count())) { report.stress.push({ case: 'keyboard', screen, size: `${w}x350`, note: 'no input found' }); continue; }
    await input.focus(); await input.type('a1', { delay: 10 }).catch(() => {});
    await p.setViewportSize({ width: w, height: 350 }); await settle(p, 500);
    await input.evaluate(el => el.scrollIntoView({ block: 'center' }));
    const r = await input.evaluate(el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), focused: document.activeElement === el, vh: innerHeight, value: el.value }; });
    const m = await measure(p, false);
    report.stress.push({ case: 'keyboard', screen, size: `${w}x350 (from ${w}x${h})`, focused: r.focused, inputVisible: r.top >= 0 && r.bottom <= r.vh, valueKept: r.value.includes('a1'), overflowX: m.overflowX, offscreen: cap(m.offscreen) });
  }
  await ctx.close();
}

/* جرد الشاشات الفرعية: لكل دور، كل قسمٍ وتبويبٍ وتبويبٍ داخله يُفتح بالنقر ويُقاس بمقاسات
   الوضعيات الأساسية. الجرد يُستخرج من الواجهة نفسها (أشرطة الأقسام والتبويبات) لا من قائمةٍ
   مكتوبة باليد، فلا تسقط شاشةٌ أُضيفت لاحقًا. */
const KEY_SIZES = [[382, 580], [385, 571], [320, 568], [594, 368], [669, 867], [951, 585], [951, 350], [600, 350], [669, 520], [600, 480], [768, 1024], [1280, 800], [390, 844], [844, 390]];
const DEMO_ROLES = ['comp_admin', 'head_judge', 'judge', 'ops_manager', 'exception_host', 'delegation_manager', 'participant', 'guardian', 'broadcast_operator', 'auditor', 'support_agent', 'org_admin', 'branch_admin', 'super_admin', 'operator_owner', 'operator_admin', 'storage_admin', 'billing_admin'];
/* أدوارٌ تُخفي أقسامها خلف زرّ: يُفتح أولًا ثم تُجرد أقسامه. */
const PRE = { ops_manager: p => clickText(p, /التدفق/) };
const NAV = '.mz-el-mnav button:visible, [role="tab"]:visible, .mizan-tabs button:visible';
const navLabels = p => p.locator(NAV).evaluateAll(els => els.map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').replace(/\d+$/, '').trim()).filter(Boolean));
async function clickNav(p, label) {
  const loc = p.locator(NAV);
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const t = ((await loc.nth(i).getAttribute('aria-label')) || (await loc.nth(i).textContent()) || '').trim().replace(/\s+/g, ' ').replace(/\d+$/, '').trim();
    if (t === label) { await loc.nth(i).click({ timeout: 4000 }).catch(() => {}); await settle(p, 900); return true; }
  }
  if (process.env.DUO_DEBUG) console.log('  nav miss', label, n, JSON.stringify(await navLabels(p)));
  return false;
}
async function runSubscreens() {
  const roles = (arg('roles', '') || DEMO_ROLES.join(',')).split(',');
  const ctx = await browser.newContext({ locale: 'ar', deviceScaleFactor: 1, hasTouch: true, viewport: { width: 951, height: 585 } });
  await quiet(ctx); const p = await ctx.newPage();
  report.subscreens = [];
  const measureState = async (id, role, trail) => {
    for (const [w, h] of KEY_SIZES) {
      await p.setViewportSize({ width: w, height: h }); await settle(p, 300);
      const m = await measure(p, isInner(w, h));
      report.subscreens.push({ screen: id, role, trail, size: `${w}x${h}`, inner: isInner(w, h), spread: m.spread, overflowX: m.overflowX,
        offscreen: cap(m.offscreen), clipped: cap(m.clipped), tiny: cap(m.tiny), crossing: cap(m.crossing, 8), leafEscape: cap(m.leafEscape) });
      if (SHOTS && SHOT_SIZES.includes(`${w}x${h}`)) await p.screenshot({ path: path.join(SHOTS, `sub-${id.replace(/[^\w؀-ۿ-]+/g, '_')}-${w}x${h}.png`) });
    }
    await p.setViewportSize({ width: 951, height: 585 }); await settle(p, 300);
  };
  for (const role of roles) {
    await p.setViewportSize({ width: 951, height: 585 });
    await asRole(p, role);
    if (PRE[role]) await PRE[role](p);
    await measureState(`${role}`, role, []);
    const l1 = [...new Set(await navLabels(p))];
    for (const a of l1) {
      await asRole(p, role);
      if (PRE[role]) await PRE[role](p);
      if (!(await clickNav(p, a))) continue;
      await p.evaluate(() => window.scrollTo(0, 0));
      await measureState(`${role}/${a}`, role, [a]);
      const l2 = [...new Set(await navLabels(p))].filter(x => !l1.includes(x));
      for (const b of l2) {
        if (!(await clickNav(p, b))) continue;
        await p.evaluate(() => window.scrollTo(0, 0));
        await measureState(`${role}/${a}/${b}`, role, [a, b]);
      }
    }
    process.stdout.write(`  ${role}: ${1 + l1.length} top-level states\n`);
  }
  await ctx.close();
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
if (ONLY.includes('matrix')) { console.log('matrix'); await runMatrix(); }
if (ONLY.includes('live')) { console.log('live'); await runLive(); }
if (ONLY.includes('stress')) { console.log('stress'); await runStress(); }
if (ONLY.includes('subscreens')) { console.log('subscreens'); await runSubscreens(); }
await browser.close();

/* ملخّص يُقرأ بلا فتح الملف */
const m = report.matrix;
const sum = {
  cells: m.length,
  overflowX: m.filter(x => x.overflowX > 1).map(x => `${x.screen}@${x.size}:${x.overflowX}`),
  offscreen: m.filter(x => x.offscreen.count).map(x => `${x.screen}@${x.size}:${x.offscreen.count}`),
  clipped: m.filter(x => x.clipped.count).map(x => `${x.screen}@${x.size}:${x.clipped.count}`),
  tiny: m.filter(x => x.tiny.count).map(x => `${x.screen}@${x.size}:${x.tiny.count}`),
  innerCells: m.filter(x => x.inner).length,
  crossing: m.filter(x => x.inner && x.crossing.count).map(x => `${x.screen}@${x.size}:${x.crossing.count}`),
  leafEscape: m.filter(x => x.inner && x.leafEscape.count).map(x => `${x.screen}@${x.size}:${x.leafEscape.count}`),
  pageErrors: report.pageErrors || {},
};
const ss = report.subscreens || [];
sum.subscreens = { states: new Set(ss.map(x => x.screen)).size, cells: ss.length,
  overflowX: ss.filter(x => x.overflowX > 1).map(x => `${x.screen}@${x.size}:${x.overflowX}`),
  offscreen: ss.filter(x => x.offscreen.count).map(x => `${x.screen}@${x.size}:${x.offscreen.count}`),
  clipped: ss.filter(x => x.clipped.count).map(x => `${x.screen}@${x.size}:${x.clipped.count}`),
  tiny: ss.filter(x => x.tiny.count).map(x => `${x.screen}@${x.size}:${x.tiny.count}`),
  crossing: ss.filter(x => x.inner && x.crossing.count).map(x => `${x.screen}@${x.size}:${x.crossing.count}`),
  leafEscape: ss.filter(x => x.inner && x.leafEscape.count).map(x => `${x.screen}@${x.size}:${x.leafEscape.count}`) };
report.summary = sum;
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(sum, null, 1));
