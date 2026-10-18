// Click-sweep for one role: logs in, then clicks every visible control one at a time (with a reload
// between clicks when the screen state changed), recording console/HTTP/page errors, overflow and
// untranslated / broken text.  Usage: node scripts/qa/sweep.mjs <role> [width=1280] [index=0] [maxClicks=80]
import fs from 'node:fs';
import { launch, newSession, login, loadUsers, BASE } from './browser.mjs';
const [role, width = '1280', index = '0', maxClicks = '80', outDir = '/tmp/qa-sweep'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const user = loadUsers().filter((u) => u.role === role)[Number(index)];
if (!user) { console.error('no user for', role); process.exit(2); }
const SKIP = /تسجيل الخروج|خروج|Sign out|الطوارئ|Emergency|حذف|Delete|إعادة ضبط|مسح|Clear all|تجميد|Freeze/i;
const NOISE = /vite|ERR_ABORTED|WebSocket|Download the React|\[DOM\]/;
const b = await launch();
const s = await newSession(b, { width: Number(width), height: Number(width) < 600 ? 820 : 900 });
const { page, problems } = s;
const findings = [];
const snapshotProblems = () => ({ c: problems.console.length, p: problems.pageerrors.length, h: problems.http.length, f: problems.requestfailed.length });
async function landing() {
  await login(page, user.email);
  await page.waitForTimeout(3500);
  for (let i = 0; i < 6; i++) { const skip = page.getByRole('button', { name: /^(تخطي|Skip)$/ }); if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(500); } else break; }
  await page.waitForTimeout(1500);
}
async function reopen() { await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500); for (let i = 0; i < 3; i++) { const skip = page.getByRole('button', { name: /^(تخطي|Skip)$/ }); if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(400); } else break; } await page.waitForTimeout(1200); }
const labels = () => page.evaluate(() => [...document.querySelectorAll('button,[role=tab],a[href],[role=button],summary,[role=menuitem],input[type=checkbox],select')].filter((e) => e.offsetParent !== null && !e.disabled).map((e, i) => ({ i, label: (e.getAttribute('aria-label') || e.innerText || e.title || e.getAttribute('name') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 60), tag: e.tagName })));
const overflow = () => page.evaluate(() => ({ dx: document.documentElement.scrollWidth - window.innerWidth, wide: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('[class*=overflow-x],[style*=overflow]'); }).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 60)) }));
const textOf = () => page.evaluate(() => document.body.innerText);
const rawIssues = (t) => { const out = []; if (/\b(undefined|NaN|\[object Object\]|null)\b/.test(t)) out.push('raw-value:' + (t.match(/.{0,30}\b(undefined|NaN|\[object Object\]|null)\b.{0,20}/) || [''])[0].replace(/\s+/g, ' ')); if (/\b[a-z]+_[a-z_]+\b/.test(t)) out.push('snake-case-leak:' + (t.match(/\b[a-z]+_[a-z_]+\b/) || [''])[0]); return out; };
await landing();
const base = await textOf();
const ov0 = await overflow();
findings.push({ step: 'landing', overflow: ov0, raw: rawIssues(base), len: base.length });
await page.screenshot({ path: `${outDir}/${role}-${width}-landing.png` });
let list = await labels();
const seen = new Set();
let n = 0;
for (const item of list) {
  if (n >= Number(maxClicks)) break;
  const key = item.label + '|' + item.tag;
  if (seen.has(key) || SKIP.test(item.label) || !item.label) continue;
  seen.add(key); n++;
  const before = snapshotProblems();
  const url0 = page.url();
  try {
    const handle = (await page.evaluateHandle((idx) => [...document.querySelectorAll('button,[role=tab],a[href],[role=button],summary,[role=menuitem],input[type=checkbox],select')].filter((e) => e.offsetParent !== null && !e.disabled)[idx], item.i)).asElement();
    if (!handle) continue;
    if (item.tag === 'SELECT') { const opts = await handle.evaluate((e) => [...e.options].map((o) => o.value)); for (const v of opts.slice(0, 4)) { await handle.selectOption(v).catch(() => {}); await page.waitForTimeout(300); } }
    else await handle.click({ timeout: 4000, noWaitAfter: true }).catch((e) => { throw e; });
    await page.waitForTimeout(900);
  } catch (e) { findings.push({ step: item.label, error: 'click-failed: ' + String(e.message).split('\n')[0].slice(0, 120) }); await reopen(); continue; }
  const after = snapshotProblems();
  const t = await textOf();
  const ov = await overflow();
  const f = { step: item.label, url: page.url().replace(BASE, '') || '/', textChanged: t !== base, raw: rawIssues(t) };
  if (ov.dx > 2) f.overflow = ov;
  if (after.c > before.c) f.console = problems.console.slice(before.c).filter((x) => !NOISE.test(x)).slice(0, 4);
  if (after.p > before.p) f.pageerrors = problems.pageerrors.slice(before.p);
  if (after.h > before.h) f.http = problems.http.slice(before.h).slice(0, 6);
  if (after.f > before.f) f.failed = problems.requestfailed.slice(before.f).filter((x) => !NOISE.test(x)).slice(0, 3);
  if (/^(Application error|حدث خطأ|Something went wrong)/m.test(t) || /تعذّر عرض|ErrorBoundary/.test(t)) f.errorBoundary = true;
  if ((f.console?.length || f.pageerrors?.length || f.http?.length || f.errorBoundary || f.overflow || f.raw.length) ) { f.shot = `${outDir}/${role}-${width}-${String(n).padStart(2, '0')}.png`; await page.screenshot({ path: f.shot }).catch(() => {}); }
  findings.push(f);
  // Return to the landing screen only if the click navigated away or opened an overlay.
  await page.keyboard.press('Escape').catch(() => {});
  if (page.url() !== url0 || t !== base) await reopen();
}
fs.writeFileSync(`${outDir}/${role}-${width}.json`, JSON.stringify({ user: user.email, findings }, null, 1));
const bad = findings.filter((f) => (f.overflow && f.overflow.dx > 2) || f.console?.length || f.pageerrors?.length || f.http?.length || f.errorBoundary || f.error || f.raw?.length || f.failed?.length);
console.log(`[${role}@${width}] clicks=${n} problems=${bad.length}`);
for (const f of bad) console.log(' -', JSON.stringify({ ...f, shot: undefined }).slice(0, 700));
await b.close();
