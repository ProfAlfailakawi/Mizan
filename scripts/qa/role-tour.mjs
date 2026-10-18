// Usage: node scripts/qa/role-tour.mjs <role> [width] [outDir] [index]
// Logs in as one seeded user of the role, dismisses onboarding, screenshots the landing screen and
// prints visible text, clickable labels and problems (console / HTTP >= 400 / page errors / overflow).
import fs from 'node:fs';
import { launch, newSession, login, loadUsers, BASE } from './browser.mjs';
const [role, width = '1280', out = '/tmp', index = '0'] = process.argv.slice(2);
const user = loadUsers().filter((u) => u.role === role)[Number(index)];
if (!user) { console.error('no user for', role); process.exit(2); }
const b = await launch();
const s = await newSession(b, { width: Number(width), height: Number(width) < 600 ? 800 : 900 });
const { page, problems } = s;
await login(page, user.email);
await page.waitForTimeout(4000);
for (let i = 0; i < 6; i++) { const skip = page.getByRole('button', { name: /^(تخطي|Skip)$/ }); if (await skip.count()) { await skip.first().click(); await page.waitForTimeout(800); } else break; }
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/${role}-${width}.png`, fullPage: false });
const info = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  text: document.body.innerText.slice(0, 1800),
  clickables: [...document.querySelectorAll('button,[role=tab],a[href],[role=button]')].filter((e) => e.offsetParent !== null).map((e) => (e.getAttribute('aria-label') || e.innerText || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean),
}));
console.log(`== ${role} (${user.email}) @${width}  overflowX=${info.overflow}`);
console.log(info.text);
console.log('-- clickables:', JSON.stringify(info.clickables));
const noise = /vite|ERR_ABORTED|WebSocket/;
console.log('-- problems:', JSON.stringify({ console: problems.console.filter((x) => !noise.test(x)).slice(0, 12), pageerrors: problems.pageerrors, http: problems.http.slice(0, 15), failed: problems.requestfailed.filter((x) => !noise.test(x)).slice(0, 8) }, null, 1));
await b.close();
