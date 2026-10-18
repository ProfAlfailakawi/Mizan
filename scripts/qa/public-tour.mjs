// Unauthenticated visitor tour: marketing/discover/competition/register/verify/etc. at phone/tablet/desktop.
import fs from 'node:fs';
import { launch, newSession, BASE } from './browser.mjs';
const out = process.argv[2] || '/tmp/qa-public'; fs.mkdirSync(out, { recursive: true });
const comp = process.argv[3] || 'comp-001-2026';
const routes = ['/', '/#discover', `/#competition?comp=${comp}`, `/#register?comp=${comp}`, '/#journey', '/#guardian', '/#verify', '/#verify/MZN-2026-A-101-0000', '/#passport', '/#trust-verify', '/#reset-password', '/#board', '/nonexistent-page', '/#competition?comp=does-not-exist', '/#register?comp=does-not-exist'];
const NOISE = /ERR_ABORTED|Download the React|\[DOM\]/;
const b = await launch();
for (const width of [390, 768, 1280]) {
  const s = await newSession(b, { width, height: width < 600 ? 820 : 900 });
  for (const r of routes) {
    const before = { c: s.problems.console.length, p: s.problems.pageerrors.length, h: s.problems.http.length, f: s.problems.requestfailed.length };
    await s.page.goto(BASE + r, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await s.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await s.page.waitForTimeout(2500);
    for (let i = 0; i < 4; i++) { const skip = s.page.getByRole('button', { name: /^(تخطي|Skip)$/ }); if (await skip.count()) { await skip.first().click().catch(() => {}); await s.page.waitForTimeout(400); } else break; }
    const info = await s.page.evaluate(() => ({ dx: document.documentElement.scrollWidth - window.innerWidth, text: document.body.innerText.slice(0, 160).replace(/\s+/g, ' '), title: document.title }));
    const prob = { console: s.problems.console.slice(before.c).filter((x) => !NOISE.test(x)), pageerrors: s.problems.pageerrors.slice(before.p), http: s.problems.http.slice(before.h), failed: s.problems.requestfailed.slice(before.f).filter((x) => !NOISE.test(x)) };
    const bad = info.dx > 2 || prob.console.length || prob.pageerrors.length || prob.http.length || prob.failed.length;
    console.log(`${bad ? 'XX' : 'ok'} ${width} ${r}  dx=${info.dx} title="${info.title}" :: ${info.text.slice(0, 90)}`);
    if (bad) console.log('   ', JSON.stringify(prob).slice(0, 600));
    await s.page.screenshot({ path: `${out}/${width}-${r.replace(/[^a-z0-9]+/gi, '_')}.png` }).catch(() => {});
  }
  await s.context.close();
}
await b.close();
