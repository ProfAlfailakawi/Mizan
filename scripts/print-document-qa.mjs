/*
 * P30 — هل تخرج الوثيقةُ العربية سليمةً على الورق؟
 *
 * **ولا مكتبةَ PDF عمدًا.** مكتباتُ JavaScript تكسر وصلَ الحروف العربية وترتيبَها الثنائي،
 * فيخرج الاسمُ بحروفٍ منفصلة أو مقلوبًا. وشهادةٌ باسمٍ مكسور أسوأ من لا شهادة: تُطبع
 * وتُسلَّم وتُعلَّق ولا يراجعها أحد. وطباعةُ المتصفّح تستعمل محرّكَ النصّ نفسَه الذي رسم
 * الشاشة، فيخرج الاسمُ كما قرأه صاحبُه.
 *
 * ── ما يُقاس هنا بالضبط، ولا يُدَّعى غيره ────────────────────────────────────────
 *
 * الشاشاتُ الثلاث التي تُطبع (الشهادة · التحقّق العامّ · كشف النتائج) كلُّها خلف دخولٍ
 * أو خلف سجلّ الشهادات، وكلاهما محجوبٌ بلا إعداد Firebase. فلا يُفتح أيٌّ منها هنا،
 * **ولا يُدَّعى أنه فُتح**.
 *
 * والمقيسُ هو الآلةُ التي كُتبت: ورقةُ أنماط المنتج نفسُها (`dist/assets/*.css`) تُحمَّل
 * في متصفّحٍ حقيقيّ على وثيقةٍ عربيةٍ داخل هيكلٍ يشبه الشاشة — قوائمُ وأزرارٌ وغلافٌ
 * معتم — ثم يُحاكى وسيطُ الطباعة ويُولَّد PDF فعلًا. فإن عزلت القواعدُ الوثيقةَ هنا
 * عزلتها هناك، لأن القواعدَ هي هي.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'dist/print-document-qa';
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };

fs.mkdirSync(OUT, { recursive: true });

// ورقةُ أنماط المنتج كما بُنيت — لا نسخةٌ مكتوبة هنا.
const cssFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.css'));
if (!cssFile) { console.error('لم يُبنَ المنتج بعد: شغّل npm run build'); process.exit(1); }
const css = fs.readFileSync(path.join('dist/assets', cssFile), 'utf8');
if (!css.includes('data-mizan-print')) { console.error('ورقةُ الأنماط المبنيّة لا تحوي قواعد الطباعة'); process.exit(1); }
console.log(`\nورقةُ الأنماط: dist/assets/${cssFile} (${Math.round(css.length / 1024)} كِبّي)`);

/* هيكلٌ يشبه الشاشة: وثيقةٌ داخل غلافٍ معتم، وحولها قوائمُ وأزرارٌ يجب ألّا تُطبع. */
const page_html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <header><nav><button type="button">القائمة</button><button type="button">تسجيل الخروج</button></nav></header>
  <main><section class="mizan-surface"><h2>لوحةُ المتسابق</h2><p>محتوى الشاشة الذي لا يُطبع.</p>
    <button type="button">زرٌّ على الشاشة</button></section></main>
  <div class="fixed inset-0 z-50 backdrop-blur-sm">
    <div data-mizan-print class="mizan-surface">
      <div class="mizan-kicker">شهادة موثقة من ميزان</div>
      <h2>عبد الرحمن بن عبد الله الفيلكاوي</h2>
      <p>مسابقة الكويت الكبرى لحفظ القرآن الكريم — رواية حفص عن عاصم</p>
      <table><tbody>
        <tr><td>رقم الشهادة</td><td>MIZAN-2026-000418</td></tr>
        <tr><td>التقدير</td><td>ممتاز</td></tr>
      </tbody></table>
      <div class="no-print"><button type="button">طباعة</button><button type="button">إغلاق</button></div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const ctx = await browser.newContext({ locale: 'ar', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.setContent(page_html, { waitUntil: 'load' });

console.log('\n── وسيطُ الطباعة: ما يُطبع وما لا يُطبع');
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(150);

const measured = await page.evaluate(() => {
  const doc = document.querySelector('[data-mizan-print]');
  const vis = (el) => getComputedStyle(el).visibility;
  const outside = [...document.querySelectorAll('header, nav, main, main button')].filter(el => !doc.contains(el));
  return {
    docVisible: vis(doc) === 'visible',
    heading: vis(doc.querySelector('h2')) === 'visible',
    row: vis(doc.querySelector('td')) === 'visible',
    controlsHidden: getComputedStyle(doc.querySelector('.no-print')).display === 'none',
    outside: outside.length,
    outsideHidden: outside.filter(el => vis(el) === 'hidden' || getComputedStyle(el).display === 'none').length,
    backdrop: getComputedStyle(doc).backdropFilter,
    shadow: getComputedStyle(doc).boxShadow,
    breakInside: getComputedStyle(doc.querySelector('tr')).breakInside,
  };
});

if (measured.docVisible && measured.heading && measured.row) ok('الوثيقةُ ومحتواها يُطبعان');
else bad(`الوثيقة أو محتواها لا يُطبع (${JSON.stringify(measured)})`);
if (measured.outsideHidden === measured.outside) ok(`ما حولها مخفيٌّ بالكامل (${measured.outsideHidden}/${measured.outside})`);
else bad(`عناصرُ الشاشة ما زالت تُطبع: ${measured.outside - measured.outsideHidden} من ${measured.outside}`);
if (measured.controlsHidden) ok('أزرارُ الوثيقة نفسها لا تُطبع');
else bad('زرّا الطباعة والإغلاق يظهران على الورق');
if (measured.backdrop === 'none') ok('الغلافُ المعتم لا يُطبع'); else bad(`backdrop-filter = ${measured.backdrop}`);
if (measured.shadow === 'none') ok('لا ظلالَ تستهلك الحبر'); else bad(`box-shadow = ${measured.shadow}`);
if (measured.breakInside === 'avoid') ok('صفُّ النتيجة لا يُقطع بين صفحتين'); else bad(`break-inside = ${measured.breakInside}`);

console.log('\n── العربيةُ على الورق');
const arabic = await page.evaluate(() => {
  const doc = document.querySelector('[data-mizan-print]');
  const text = (doc.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    letters: (text.match(/[ء-ي]/g) || []).length,
    // صيغةُ العرض المنفصلة: علامةُ نصٍّ فُكّ وصلُه — وهي ما تُخرجه مكتباتُ PDF.
    isolated: (text.match(/[ﹰ-﻿]/g) || []).length,
    dir: getComputedStyle(doc).direction,
  };
});
if (arabic.letters > 40) ok(`نصٌّ عربيّ حقيقيّ (${arabic.letters} حرفًا)`); else bad(`نصٌّ عربيّ غير كافٍ (${arabic.letters})`);
if (arabic.isolated === 0) ok('لا حرفَ مفكوكَ الوصل — التشكيلُ للمتصفّح'); else bad(`${arabic.isolated} حرفًا بصيغة العرض المنفصلة`);
if (arabic.dir === 'rtl') ok('اتجاهُ الوثيقة من اليمين'); else bad(`الاتجاه ${arabic.dir}`);

console.log('\n── الملفُّ يخرج فعلًا');
await page.emulateMedia({ media: null });
const pdfPath = path.join(OUT, 'arabic-document.pdf');
await page.pdf({ path: pdfPath, format: 'A4', printBackground: false, margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' } });
const bytes = fs.readFileSync(pdfPath);
if (bytes.subarray(0, 5).toString() === '%PDF-') ok(`PDF صحيحُ البنية (${Math.round(bytes.length / 1024)} كِبّي)`);
else bad('الناتج ليس PDF');
if (bytes.length > 4096) ok('ليس ورقةً فارغة'); else bad(`صغيرٌ جدًّا (${bytes.length} بايت)`);
await page.screenshot({ path: path.join(OUT, 'print-media.png'), fullPage: true });

await browser.close();

console.log(`\nالوثائق في ${OUT}`);
console.log('ملحوظة: الشاشاتُ الثلاث نفسُها خلف دخولٍ أو سجلّ شهادات — BLOCKED_BY_EXTERNAL_FIREBASE_CONFIG.');
console.log('والمقيسُ هنا قواعدُ الطباعة المبنيّة، وهي نفسُها التي تعمل هناك.');
if (problems.length) { console.log(`\n${problems.length} ملاحظة تحتاج معالجة`); process.exit(1); }
console.log('\nالوثيقةُ العربية تخرج على الورق كما تُقرأ على الشاشة');
