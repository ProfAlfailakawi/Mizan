/*
 * يصوّر سطحَ المصحف في القمرة بمقاساتٍ مختلفة ويقيس: هل فاض النصّ؟ هل قطعته الحاشية؟
 *   npx tsx tools/judge-harness/shoot.ts <out-dir> [hafs-text.json]
 * نصُّ حفص (مصفوفة {s,a,t}) يُمرَّر ملفًّا؛ ولا يُحمَّل من الشبكة.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

const out = process.argv[2] || 'judge-shots';
const textFile = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const verses: { s: number; a: number; t: string }[] = textFile ? JSON.parse(fs.readFileSync(textFile, 'utf8')) : [];
const text = (s: number, a: number) => verses.find(v => v.s === s && v.a === a)?.t || 'نَصٌّ تَجْرِيبِيٌّ '.repeat(8);

const server = await createServer({ configFile: path.resolve(here, 'vite.config.ts') });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });

const CASES = [
  { name: 'yunus-98-104', surah: 10, start: 98, end: 104, page: 220 },
  { name: 'baqarah-282', surah: 2, start: 282, end: 282, page: 48 },
  { name: 'short-ikhlas', surah: 112, start: 1, end: 4, page: 604 },
];
const SIZES = [{ w: 1440, h: 900 }, { w: 1024, h: 768 }, { w: 820, h: 1180 }, { w: 390, h: 844 }];
const report: string[] = [];
for (const c of CASES) for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const m = url.pathname.match(/^\/api\/public\/kfgqpc\/passage\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/);
    if (m) {
      const [, reading, s, a0, a1] = m;
      const ayat = [];
      for (let a = Number(a0); a <= Number(a1); a += 1) ayat.push({ surah: Number(s), ayah: a, text: text(Number(s), a), page: c.page, lineStart: 1, lineEnd: 15, juz: 1 });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reading, surah: Number(s), startAyah: Number(a0), endAyah: Number(a1), ayat, text: ayat.map(x => x.text).join(' '), loci: [{ page: c.page, lineStart: 1, lineEnd: 15 }], provenance: { mode: 'HARNESS', authority: 'KFGQPC', note: '' } }) });
    }
    if (url.pathname.includes('/mushaf-layout/')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`http://127.0.0.1:4174/?surah=${c.surah}&start=${c.start}&end=${c.end}`);
  await page.waitForSelector('[data-sheet-frame="fit"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  if (c.name === 'yunus-98-104') await page.evaluate(() => (window as any).__track({ ayah: 100, wordIndex: 3 }));
  await page.waitForTimeout(400);
  /* يُمرَّر نصًّا: tsx يضيف `__name` إلى الدوالّ المسمّاة، والمتصفّح لا يعرفه. */
  const m: any = await page.evaluate(`(() => {
    const sheet = document.querySelector('.mizan-mushaf-sheet');
    const box = document.querySelector('.mizan-mushaf-sheet__page');
    const t = document.querySelector('.mizan-mushaf-sheet__text');
    const body = sheet && sheet.parentElement;
    const r = el => el ? el.getBoundingClientRect().toJSON() : null;
    return {
      frame: document.querySelector('[data-sheet-frame]')?.getAttribute('data-sheet-frame'),
      font: t ? getComputedStyle(t).fontSize : null,
      textOverflow: t && box ? { sh: t.scrollHeight, bh: box.clientHeight, sw: t.scrollWidth, bw: box.clientWidth } : null,
      sheet: r(sheet), body: r(body),
      activeWord: document.querySelector('[data-active-word="true"]')?.textContent || null,
      activeAyah: document.querySelector('[data-active-ayah]')?.getAttribute('data-ayah') || null,
    };
  })()`);
  const file = `${out}/${c.name}-${size.w}x${size.h}.png`;
  await page.screenshot({ path: file });
  const inside = m.sheet && m.body ? m.sheet.bottom <= m.body.bottom + 1 && m.sheet.top >= m.body.top - 1 : false;
  const overflow = m.textOverflow ? m.textOverflow.sh > m.textOverflow.bh + 1 || m.textOverflow.sw > m.textOverflow.bw + 1 : true;
  report.push(`${c.name} ${size.w}x${size.h}: frame=${m.frame} font=${m.font} overflow=${overflow} sheetInsideBody=${inside} ayah=${m.activeAyah} word=${m.activeWord}`);
  await page.close();
}
console.log(report.join('\n'));
await browser.close();
await server.close();
