/*
 * انحدار بصري بلا مقارنة بكسلات.
 *
 * مقارنة الصور بالبكسل تكذب في كلا الاتجاهين: تنبّه لفرق خطٍّ لا يراه أحد، وتسكت عن زرٍّ
 * اختفى خلف بطاقة. فالمقارنة هنا **بنيوية**: لكل تبويب في كل عرض تُلتقط بصمة من عدد
 * الأزرار والعناوين والحقول والجداول، ومن عرض المحتوى وارتفاعه، ومن كلماتٍ مفتاحية يجب أن
 * تبقى على الشاشة. وتُقارن بأساسٍ مكتوب في الملف ومراجَع في المراجعة.
 *
 * البصمة نصّ يُقرأ في الـdiff: «اختفى زر» و«اختفى عنوان» يظهران رقمًا يتغيّر، لا صورة.
 *
 * التشغيل:
 *   node scripts/scope-visual-baseline.mjs            # يقارن بالأساس ويفشل عند الاختلاف
 *   node scripts/scope-visual-baseline.mjs --update   # يكتب الأساس بعد تغيير مقصود
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const UPDATE = process.argv.includes('--update');
const BASE = arg('base', 'http://127.0.0.1:4173');
const BASELINE = arg('baseline', path.join('tests', 'fixtures', 'scope-visual-baseline.json'));

const VIEWPORTS = [[1440, 1000, 'desktop'], [820, 1180, 'tablet'], [375, 812, 'mobile']];
const TABS = [
  ['النطاق', 'scope', ['نطاق الفئة', 'المصحف كاملًا']],
  ['اختيار المتسابق', 'selection', ['من يختار النطاق؟']],
  ['توزيع الأسئلة', 'distribution', ['عدد الأسئلة لكل متسابق']],
  ['سياسة الأسئلة', 'policy', ['متى يجوز أن يتكرر السؤال؟']],
  ['الازدحام', 'demand', ['ازدحام التسجيل']],
  ['المحاكاة', 'simulation', ['تشغيل المحاكاة']],
  ['النماذج والعدالة', 'models', ['دفعة النماذج', 'الاحتياط', 'حجر المواضع', 'احجر وعالج الأثر', 'تقرير عدالة وتوزيع الأسئلة']],
  ['الجاهزية', 'readiness', ['الجاهزية']],
];

/* التقريب إلى أقرب ٢٠ بكسل: تغيّر ارتفاعٍ بسطرٍ واحد ليس انحدارًا، واختفاءُ قسمٍ هو. */
const bucket = (value) => Math.round(value / 20) * 20;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const captured = {};
const problems = [];

for (const [width, height, label] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'ar' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('mizan_onboarding_quiet_v2', '1'); sessionStorage.setItem('mizan_splash_seen', '1'); } catch { /* private mode */ }
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('button:visible', { hasText: 'مدير المسابقة' }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('button:visible', { hasText: 'النطاق والأسئلة' }).first().click();
  await page.waitForTimeout(1200);

  for (const [tab, key, mustContain] of TABS) {
    const target = page.locator('[role="tab"]:visible', { hasText: tab }).first();
    if (!await target.count()) { problems.push(`[${label}] التبويب «${tab}» غير موجود`); continue; }
    await target.click().catch(() => {});
    await page.waitForTimeout(1300);
    const shape = await page.evaluate(() => {
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const count = (selector) => [...document.querySelectorAll(selector)].filter(visible).length;
      const doc = document.documentElement;
      return {
        buttons: count('button'), headings: count('h1,h2,h3,h4'), inputs: count('input,select,textarea'),
        tables: count('table'), lists: count('ul,ol'), tabs: count('[role="tab"]'),
        scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, scrollHeight: doc.scrollHeight,
      };
    });
    const text = await page.locator('body').innerText();
    const missing = mustContain.filter(token => !text.includes(token));
    if (missing.length) problems.push(`[${label}/${key}] اختفى من الشاشة: ${missing.join('، ')}`);
    if (shape.scrollWidth > shape.clientWidth + 2) problems.push(`[${label}/${key}] تمدّد أفقي (${shape.scrollWidth} > ${shape.clientWidth})`);
    captured[`${label}/${key}`] = {
      buttons: shape.buttons, headings: shape.headings, inputs: shape.inputs,
      tables: shape.tables, lists: shape.lists, tabs: shape.tabs, height: bucket(shape.scrollHeight),
    };
  }
  await ctx.close();
}
await browser.close();

if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, `${JSON.stringify(captured, null, 2)}\n`, 'utf8');
  console.log(`كُتب الأساس البصري في ${BASELINE} (${Object.keys(captured).length} لقطة بنيوية)`);
  process.exitCode = problems.length ? 1 : 0;
  for (const problem of problems) console.log(`  ✗ ${problem}`);
} else {
  if (!fs.existsSync(BASELINE)) {
    console.log(`لا أساس بصري بعد. شغّل: node scripts/scope-visual-baseline.mjs --update`);
    process.exitCode = 1;
  } else {
    const expected = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    for (const [key, shape] of Object.entries(captured)) {
      const before = expected[key];
      if (!before) { problems.push(`لقطة جديدة بلا أساس: ${key}`); continue; }
      for (const [field, value] of Object.entries(shape)) {
        if (before[field] !== value) problems.push(`${key} · ${field}: كان ${before[field]} وصار ${value}`);
      }
    }
    for (const key of Object.keys(expected)) if (!captured[key]) problems.push(`لقطة مفقودة: ${key}`);
    for (const problem of problems) console.log(`  ✗ ${problem}`);
    console.log(problems.length
      ? `\n${problems.length} اختلافًا عن الأساس البصري. راجعها، فإن كانت مقصودة فشغّل --update.`
      : `\nالبنية البصرية مطابقة للأساس (${Object.keys(captured).length} لقطة).`);
    process.exitCode = problems.length ? 1 : 0;
  }
}
