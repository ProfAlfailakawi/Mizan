// Breadth-first click sweep for one role. Logs in, then explores the UI: every visible control is clicked once;
// controls that change the screen materially are explored one level deeper (path replayed from a fresh load).
// Records console errors, HTTP >= 400, page errors, horizontal overflow, raw/untranslated leaks.
// Usage: node scripts/qa/sweep.mjs <role> [width=1280] [index=0] [maxClicks=150] [outDir] [maxDepth=3]
import fs from 'node:fs';
import { launch, newSession, login, loadUsers, BASE } from './browser.mjs';
const [role, width = '1280', index = '0', maxClicks = '150', outDir = '/tmp/qa-sweep', maxDepthArg = '3'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const user = loadUsers().filter((u) => u.role === role)[Number(index)];
if (!user) { console.error('no user for', role); process.exit(2); }
const SKIP = /اللغة|Language|^English|^العربية|تسجيل الخروج|خروج|Sign out|الطوارئ|Emergency|حذف|Delete|إعادة ضبط|مسح الكل|Clear all|تجميد|Freeze|^دخول$/i;
const NOISE = /vite|ERR_ABORTED|WebSocket|Download the React|\[DOM\]/;
const CLICKABLE = 'button,[role=tab],a[href],[role=button],summary,[role=menuitem],input[type=checkbox],select';
const b = await launch();
const s = await newSession(b, { width: Number(width), height: Number(width) < 600 ? 820 : 900 });
const { page, problems } = s;
const findings = [];
const snap = () => ({ c: problems.console.length, p: problems.pageerrors.length, h: problems.http.length, f: problems.requestfailed.length });
const skipTour = async () => { for (let i = 0; i < 6; i++) { const skip = page.getByRole('button', { name: /^(تخطي|Skip)$/ }); if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(400); } else break; } };
let loggedIn = false;
async function fresh() {
  if (!loggedIn) { await login(page, user.email); loggedIn = true; await page.waitForTimeout(3500); }
  else { await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000); }
  await skipTour(); await page.waitForTimeout(900);
}
const scopeRoot = `(() => { const d = [...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter((e) => e.getClientRects().length > 0).pop(); return d || document; })()`;
const labels = () => page.evaluate(([sel, rootSrc]) => { const root = eval(rootSrc); return [...root.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0 && !e.disabled).map((e, i) => ({ i, label: (e.getAttribute('aria-label') || e.innerText || e.title || e.getAttribute('name') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 60), tag: e.tagName })); }, [CLICKABLE, scopeRoot]);
const handleAt = async (idx) => (await page.evaluateHandle(([sel, i, rootSrc]) => { const root = eval(rootSrc); return [...root.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0 && !e.disabled)[i]; }, [CLICKABLE, idx, scopeRoot])).asElement();
const overflow = () => page.evaluate(() => ({ dx: document.documentElement.scrollWidth - window.innerWidth, wide: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('[class*=overflow-x],[style*=overflow]'); }).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 50)) }));
const textOf = () => page.evaluate(() => document.body.innerText);
const rawIssues = (t) => { const out = []; const m1 = t.match(/.{0,25}\b(undefined|NaN|\[object Object\])\b.{0,15}/); if (m1) out.push('raw:' + m1[0].replace(/\s+/g, ' ')); const m2 = t.match(/\b[a-z]{3,}_[a-z_]{2,}\b/); if (m2) out.push('snake:' + m2[0]); const m3 = t.match(/\b[A-Z]{3,}(_[A-Z]{2,})+\b/); if (m3) out.push('CODE:' + m3[0]); return out; };
// Click a labelled control by label so replays survive index shifts.
async function clickByLabel(label, tag) {
  const list = await labels();
  const hit = list.find((x) => x.label === label && x.tag === tag);
  if (!hit) return false;
  const h = await handleAt(hit.i); if (!h) return false;
  if (tag === 'SELECT') { const opts = await h.evaluate((e) => [...e.options].map((o) => o.value)); for (const v of opts.slice(0, 4)) { await h.selectOption(v).catch(() => {}); await page.waitForTimeout(250); } }
  else await h.click({ timeout: 2500, noWaitAfter: true });
  await page.waitForTimeout(800);
  return true;
}
await fresh();
const baseText = await textOf();
const ov0 = await overflow();
findings.push({ step: 'landing', path: [], overflow: ov0.dx > 2 ? ov0 : undefined, raw: rawIssues(baseText), len: baseText.length });
await page.screenshot({ path: `${outDir}/${role}-${width}-landing.png` });
const seen = new Set();
const queue = [[]];
let n = 0;
const maxDepth = Number(maxDepthArg);
while (queue.length && n < Number(maxClicks)) {
  const path = queue.shift();
  if (path.length) { await fresh(); let ok = true; for (const [l, t] of path) { try { if (!(await clickByLabel(l, t))) { ok = false; break; } } catch { ok = false; break; } } if (!ok) continue; }
  const here = await textOf();
  const list = await labels();
  for (const item of list) {
    if (n >= Number(maxClicks)) break;
    const key = path.map((p) => p[0]).join('>') + '>' + item.label + '|' + item.tag;
    if (!item.label || SKIP.test(item.label) || seen.has(key)) continue;
    seen.add(key); n++;
    const before = snap();
    let clickError = null;
    try { const h = await handleAt(item.i); if (!h) continue; if (item.tag === 'SELECT') { const opts = await h.evaluate((e) => [...e.options].map((o) => o.value)); for (const v of opts.slice(0, 4)) { await h.selectOption(v).catch(() => {}); await page.waitForTimeout(250); } } else await h.click({ timeout: 2500, noWaitAfter: true }); await page.waitForTimeout(850); } catch (e) { clickError = String(e.message).split('\n')[0].slice(0, 100); }
    const after = snap();
    const t = await textOf();
    const ov = await overflow();
    const f = { step: item.label, path: path.map((p) => p[0]), url: page.url().replace(BASE, '') || '/', changed: t !== here, raw: rawIssues(t) };
    if (clickError) f.error = clickError;
    if (ov.dx > 2) f.overflow = ov;
    if (after.c > before.c) f.console = problems.console.slice(before.c).filter((x) => !NOISE.test(x)).slice(0, 3);
    if (after.p > before.p) f.pageerrors = problems.pageerrors.slice(before.p);
    if (after.h > before.h) f.http = problems.http.slice(before.h).slice(0, 5);
    if (after.f > before.f) f.failed = problems.requestfailed.slice(before.f).filter((x) => !NOISE.test(x)).slice(0, 3);
    if (/^(Application error|حدث خطأ غير متوقع|Something went wrong)/m.test(t) || /ErrorBoundary/.test(t)) f.errorBoundary = true;
    const bad = f.console?.length || f.pageerrors?.length || f.http?.length || f.errorBoundary || f.overflow || f.raw.length || f.failed?.length;
    if (bad) { f.shot = `${outDir}/${role}-${width}-${String(n).padStart(3, '0')}.png`; await page.screenshot({ path: f.shot }).catch(() => {}); }
    findings.push(f);
    const material = Math.abs(t.length - here.length) > Math.max(40, here.length * 0.08) || page.url() !== BASE + '/';
    await page.keyboard.press('Escape').catch(() => {});
    if (material && path.length + 1 < maxDepth && !clickError && item.tag !== 'SELECT') queue.push([...path, [item.label, item.tag]]);
    if (t !== here) { await fresh(); for (const [l, tg] of path) { try { await clickByLabel(l, tg); } catch { break; } } }
  }
}
fs.writeFileSync(`${outDir}/${role}-${width}.json`, JSON.stringify({ user: user.email, clicks: n, findings }, null, 1));
const bad = findings.filter((f) => f.console?.length || f.pageerrors?.length || f.http?.length || f.errorBoundary || f.error || f.raw?.length || f.failed?.length || (f.overflow && f.overflow.dx > 2));
console.log(`[${role}@${width}] clicks=${n} problems=${bad.length}`);
for (const f of bad) console.log(' -', JSON.stringify({ ...f, shot: undefined }).slice(0, 600));
await b.close();
