/*
 * فحص بصري وتشغيلي لشاشات محرك النطاق والأسئلة.
 *
 * لا يكفي أن يُصيَّر المكوّن بلا خطأ: هذا السكربت يفتح الشاشات فعلًا بثلاثة عروض، يضغط
 * الأزرار، يشغّل المحاكاة، يملأ نموذج التسجيل ويختار نطاقًا، ثم يتحقق من النتيجة المعروضة.
 * وقد كشف خللين حقيقيين لم يظهرا في أي اختبار وحدة: بنكًا يُبنى بسياق قراءة الفئة لا
 * المتسابق، ومعرّف موضعٍ لا يحمل روايته فيبتلع أحدُ الروايتين الأخرى.
 *
 * التشغيل:
 *   npm run build && npx vite preview --port 4173 --host 127.0.0.1 &
 *   node scripts/scope-visual-qa.mjs [--base=http://127.0.0.1:4173] [--out=<dir>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:4173');
const OUT = arg('out', path.join('dist', 'scope-visual-qa'));
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [[1440, 1000, 'desktop'], [820, 1180, 'tablet'], [375, 812, 'mobile']];
const problems = [];
const note = (message) => { problems.push(message); console.log(`  ✗ ${message}`); };
const ok = (message) => console.log(`  ✓ ${message}`);

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });

async function newPage(width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'ar' });
  // تخطّي الشاشة الافتتاحية والتعريف: الفحص يخص شاشات المحرك لا مقدماتها.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('mizan_onboarding_quiet_v2', '1'); sessionStorage.setItem('mizan_splash_seen', '1'); } catch { /* private mode */ }
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => note(`[${label}] خطأ تشغيل: ${String(e).slice(0, 160)}`));
  /* تعذّر الوصول إلى خدمة خارجية ليس عيبًا في الشاشة: يُذكر ولا يُعدّ ملاحظة تحتاج معالجة. */
  const offlineNoise = /ERR_(CONNECTION|TUNNEL|NAME_NOT_RESOLVED|INTERNET)|Could not reach|Failed to load resource: net::|404/;
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (offlineNoise.test(text)) { console.log(`  · (خدمة خارجية غير متاحة في بيئة الفحص) ${text.slice(0, 90)}`); return; }
    note(`[${label}] خطأ سجل: ${text.slice(0, 160)}`);
  });
  return { ctx, page };
}


/*
 * الدخول إلى التطبيق.
 *
 * كان الفحص ينتظر ١٥٠٠ مللي ثم يبحث عن «مدير المسابقة». وشاشةُ الافتتاح ما زالت ظاهرة
 * عند تلك اللحظة، وبعدها تظهر شاشةُ الدخول لا الأدوار — فكان يخرج بـ«تعذّر الدخول»
 * ويُقرأ ذلك حاجزَ Firebase. وهو ليس كذلك: صندوقُ العرض مدخلٌ لا يحتاج حسابًا، وهو ما
 * يستعمله فحصُ يوم المسابقة وينجح به.
 *
 * والانتظارُ بالظهور لا بالتوقيت: رقمٌ ثابت يمرّ أحيانًا ويسقط أحيانًا على الآلة نفسها.
 */
const DEMO_ENTRY = 'استعراض النظام ببيانات تجريبية';
async function enterDemo(page, label) {
  const entry = page.locator(`button[aria-label="${DEMO_ENTRY}"]`).first();
  try { await entry.waitFor({ state: 'visible', timeout: 20000 }); } catch {
    note(`[${label}] مدخل الاستعراض لم يظهر خلال ٢٠ ثانية`); return false;
  }
  await entry.click();
  await page.waitForTimeout(3500);
  return true;
}

/**
 * يبدّل الدور المعروض في البيئة التجريبية بقيمته لا بعنوانه.
 *
 * القيمةُ (`participant`, `comp_admin`) عقدُ الشيفرة؛ والعنوانُ نصٌّ معروضٌ يُترجَم
 * ويُصاغ، فالفحصُ المعلَّق عليه يسقط عند أوّل تحريرٍ لغويّ ويُقرأ عطلًا في المنتج.
 */
const ROLE_SWITCH = 'اختر الدور المعروض';
async function roleSwitch(page, roleValue) {
  const select = page.locator(`select[aria-label="${ROLE_SWITCH}"]`).first();
  await select.waitFor({ state: 'visible', timeout: 20000 });
  await select.selectOption(roleValue);
  await page.waitForTimeout(2200);
}

async function assertNoHorizontalScroll(page, label, where) {
  const size = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  if (size.s > size.c + 2) note(`[${label}] ${where}: الصفحة تتمدّد أفقيًا (${size.s} > ${size.c})`);
}

for (const [width, height, label] of VIEWPORTS) {
  console.log(`\n── ${label} ${width}×${height}`);
  const { ctx, page } = await newPage(width, height, label);
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    if (!await enterDemo(page, label)) { await ctx.close(); continue; }

    const engine = page.locator('button:visible', { hasText: 'النطاق والأسئلة' }).first();
    if (!await engine.count()) { note(`[${label}] تبويب النطاق والأسئلة غير موجود`); await ctx.close(); continue; }
    await engine.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `${label}-scope.png`), fullPage: true });
    await assertNoHorizontalScroll(page, label, 'النطاق');
    ok('شاشة النطاق');

    for (const [tab, file] of [['توزيع الأسئلة', 'distribution'], ['سياسة الأسئلة', 'policy'], ['الازدحام', 'demand'], ['المحاكاة', 'simulation'], ['النماذج والعدالة', 'models'], ['الجاهزية', 'readiness'], ['المكتبة الرسمية', 'library'], ['صحّة الذكاء', 'intelligence']]) {
      const target = page.locator('[role="tab"]:visible', { hasText: tab }).first();
      if (!await target.count()) { note(`[${label}] التبويب «${tab}» غير موجود`); continue; }
      await target.click({ timeout: 8000 }).catch(e => note(`[${label}] «${tab}»: ${String(e).slice(0, 80)}`));
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(OUT, `${label}-${file}.png`), fullPage: true });
      await assertNoHorizontalScroll(page, label, tab);
      ok(tab);
    }

    // المحاكاة تُشغَّل فعلًا، ولا يُكتفى بظهور الزر.
    await page.locator('[role="tab"]:visible', { hasText: 'المحاكاة' }).first().click();
    await page.waitForTimeout(700);
    await page.locator('button:visible', { hasText: 'تشغيل المحاكاة' }).first().click();
    await page.waitForTimeout(7000);
    const body = await page.locator('body').innerText();
    const served = body.match(/سحوبات نجحت\s*([\d,]+)\s*\/\s*([\d,]+)/);
    if (!served) note(`[${label}] المحاكاة لم تُظهر عدد السحوبات الناجحة`);
    else if (served[1] === '0') note(`[${label}] المحاكاة لم تنجح فيها سحبة واحدة`);
    else if (served[1] !== served[2]) note(`[${label}] المحاكاة: ${served[1]} من ${served[2]} سحبة فقط وجدت سؤالًا`);
    else ok(`المحاكاة: ${served[1]} سحبة كلها نجحت`);
    if (!/لم يخرج سؤال واحد عن نطاق صاحبه/.test(body)) note(`[${label}] المحاكاة لم تؤكد سلامة النطاقات`);
    await page.screenshot({ path: path.join(OUT, `${label}-simulation-run.png`), fullPage: true });

    /*
     * النماذج والعدالة.
     *
     * كان هذا الفحص يقود دورةَ حياة دفعات النماذج كاملةً: يولّد، ويعتمد، ويختم، ويحجر
     * موضعًا، ويُطلق المنقضي. وكان يسقط بانتظار «ولّد دفعة» ثلاثين ثانية.
     *
     * والسببُ ليس عطلًا في المنتج: تلك الشاشة **حُذفت بطلب صاحب المسابقة** (الملاحظة ٧
     * في `a1911a6`): «دفعات النماذج والاحتياط ودورة حياة الحجز وأعلى المواضع انكشافًا
     * وحجر المواضع: مفاهيم داخلية تطلب من الجهة قرارًا لا تملك أساسه… حُذفت، وبقي ما
     * يعنيها: تقرير عدالة التوزيع».
     *
     * فكان الفحصُ يقود واجهةً أُزيلت عمدًا، ويقرأ إزالتَها عطلًا. وهو يفحص الآن العقدَ
     * القائم: التقريرُ يصدر، ولا يدّعي أنه شهادة علمية، ويذكر الحدَّ الأدنى الرياضي.
     */
    if (label === 'desktop') {
      await page.locator('[role="tab"]:visible', { hasText: 'النماذج والعدالة' }).first().click();
      await page.waitForTimeout(900);

      let body = await page.locator('body').innerText();
      // وما حُذف يبقى محذوفًا: عودتُه إلى وجه الجهة نكوصٌ عن قرارٍ مُتَّخَذ، لا ميزةٌ جديدة.
      for (const removed of ['ولّد دفعة', 'أطلق المنقضي', 'أعلى المواضع انكشافًا']) {
        if (body.includes(removed)) note(`[${label}] «${removed}» عادت إلى وجه الجهة بعد أن حُذفت بطلب المالك`);
      }

      await page.locator('button:visible', { hasText: 'أصدر التقرير' }).first().click();
      await page.waitForTimeout(2500);
      body = await page.locator('body').innerText();
      if (!/تقرير عدالة وتوزيع الأسئلة/.test(body)) note(`[${label}] التقرير لم يصدر`);
      else if (/شهادة علمية/.test(body) && !/ليس شهادة علمية/.test(body)) note(`[${label}] التقرير يدّعي أنه شهادة علمية`);
      else ok('تقرير العدالة صدر ولم يدّعِ أنه شهادة علمية');
      if (!/الحدّ الأدنى الرياضي|أقل تكرار ممكن رياضيًا/.test(body)) note(`[${label}] التقرير لم يذكر الحدّ الأدنى الرياضي للتكرار`);
      await assertNoHorizontalScroll(page, label, 'النماذج والعدالة');
      await page.screenshot({ path: path.join(OUT, `${label}-models-report.png`), fullPage: true });
    }
  } catch (error) {
    note(`[${label}] توقف الفحص: ${String(error).slice(0, 160)}`);
  }
  await ctx.close();
}

/*
 * تدفق التسجيل: الخطوة تظهر للفئة الاختيارية وحدها، والقاعدة تُفرض قبل المتابعة.
 *
 * ورابطُ التسجيل عامٌّ **يُعيد الجلبَ من الخادم دائمًا** ولا يقبل نسخةَ المتصفّح — وهذا
 * مقصودٌ ومكتوبٌ في `src/App.tsx`: وإلّا لعُرضت الصفحةُ كاملةً على جهاز الإدارة وحده
 * فيختبرها المسؤولُ فتنجح، ويفتحها المتسابقُ فلا يجد شيئًا.
 *
 * فهذا القسمُ لا يعمل على خادمٍ ساكن: لا واجهةَ `/api/public` فيه، فتُعرض «هذه المسابقة
 * غير متاحة» — وهو السلوكُ الصحيح، لا عطل. وكان الفحصُ يقرأه انتهاءَ مهلةٍ غامضًا.
 *
 * فيُسأل الخادمُ أوّلًا. والتخطّي **باسمه وسببه**: فحصٌ يُسكت نفسه بلا ذكرٍ أسوأ من فحصٍ
 * لا يوجد — وهو الخطأ نفسُه الذي وقع في فحص البحث حين كان يمرّ حيث لا شبكة ويسقط حيث توجد.
 */
const apiServed = await (async () => {
  try {
    const res = await fetch(`${BASE}/api/public/legal/terms`, { headers: { accept: 'application/json' } });
    return (res.headers.get('content-type') || '').includes('application/json');
  } catch { return false; }
})();
if (!apiServed) {
  console.log('\n── تسجيل');
  console.log('  ⏭ متخطّى: لا واجهة `/api/public` على هذا الخادم. رابطُ التسجيل يجلب من الخادم دائمًا ولا يقبل نسخة المتصفّح.');
  console.log('     يُشغَّل هذا القسم مقابل الخادم الحقيقي: `npm start` ثم --base=http://127.0.0.1:<port>.');
}
for (const [width, height, label] of (apiServed ? [VIEWPORTS[0], VIEWPORTS[2]] : [])) {
  console.log(`\n── تسجيل ${label}`);
  const { ctx, page } = await newPage(width, height, `register-${label}`);
  try {
    await page.goto(`${BASE}/#register?comp=comp-dubai-2027`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    for (const [labelText, value] of [['الاسم بالعربية', 'تجربة تجريبية'], ['الاسم بالإنجليزية', 'QA Reciter'], ['البريد', 'qa-reciter@example.org'], ['الهاتف', '+96550000000'], ['رقم الهوية', '123456789']]) {
      const field = page.locator('label:visible', { hasText: labelText }).first();
      if (await field.count()) await field.locator('input').first().fill(value).catch(() => {});
    }
    const next = () => page.locator('button:visible', { hasText: /^التالي$/ }).first();
    await next().click({ timeout: 8000 });
    await page.waitForTimeout(900);
    const selectable = page.locator('button:visible', { hasText: 'ربع القرآن يختاره المتسابق' }).first();
    if (!await selectable.count()) { note(`[${label}] الفئة الاختيارية لا تظهر في التسجيل`); await ctx.close(); continue; }
    await selectable.click();
    await next().click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    if (!/اختر نطاق حفظك/.test(await page.locator('body').innerText())) note(`[${label}] خطوة اختيار النطاق لم تظهر`);
    else ok('خطوة اختيار النطاق تظهر للفئة الاختيارية');
    if (!(await next().isDisabled())) note(`[${label}] المتابعة متاحة قبل اختيار أي نطاق`); else ok('المتابعة موقوفة قبل الاختيار');
    for (let juz = 1; juz <= 5; juz++) await page.locator(`#registration-juz-${juz}`).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    if (!/المطلوب 8/.test(await page.locator('body').innerText())) note(`[${label}] اختيار ناقص لم يُرفض`); else ok('الاختيار الناقص مرفوض بنصّ يشرح المطلوب');
    for (let juz = 6; juz <= 8; juz++) await page.locator(`#registration-juz-${juz}`).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(600);
    if (!/اختيارك مطابق للائحة هذه الفئة/.test(await page.locator('body').innerText())) note(`[${label}] الاختيار المطابق لم يُقبل`); else ok('الاختيار المطابق مقبول');
    await assertNoHorizontalScroll(page, label, 'التسجيل');
    await page.screenshot({ path: path.join(OUT, `register-${label}.png`), fullPage: true });
  } catch (error) {
    note(`[${label}] توقف فحص التسجيل: ${String(error).slice(0, 160)}`);
  }
  await ctx.close();
}

/*
 * نطاقُ المتسابق: الفئةُ تحدّده، ولا يختاره المتسابق — وهذا قرارٌ مُتَّخَذ.
 *
 * كان هذا القسم يقود دورةَ حياةٍ كاملة: يفتح باب «اطلب تعديل نطاقي» في صفحة المتسابق،
 * ويرسل إلى اللجنة، ويقرأ سجلَّ النسخ، ثم ينتقل إلى تبويب «اختيار المتسابق» فيرفض بسبب.
 * وكان يسقط بأربع ملاحظات.
 *
 * **والملاحظاتُ كاذبة.** تلك الشاشات أُزيلت عمدًا استجابةً لملاحظات صاحب المسابقة في
 * 14 سبتمبر 2026، ويحرس إزالتَها `tests/user-notes-2026-09-14-regression.test.ts`:
 * «participant scope selection … are removed from active UI»، ويشترط أن تقول صفحةُ
 * المتسابق «نطاق الفئة». وهو القرارُ نفسُه الذي أزال آلةَ النماذج: مفاهيمُ تطلب من
 * الجهة أو من المتسابق قرارًا لا أساسَ له عندهما.
 *
 * فالفحصُ يحرس القرارَ لا يناقضه: نطاقُ الفئة يُعرض للمتسابق، ولا بابَ اختيارٍ يعود
 * إلى وجهه، ولا تبويبَ «اختيار المتسابق» في ورشة المحرّك.
 */
console.log('\n── نطاق المتسابق: قرارُ الفئة لا اختيارُ المتسابق');
{
  const { ctx, page } = await newPage(1440, 1100, 'scope-decision');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    if (!await enterDemo(page, 'scope-decision')) { /* enterDemo سجّل الملاحظة */ }
    else {
      await roleSwitch(page, 'participant');
      const participantBody = await page.locator('body').innerText();
      if (!/نطاق الفئة/.test(participantBody)) note('صفحة المتسابق لا تعرض نطاق فئته');
      else ok('المتسابق يرى نطاق فئته قبل أن يدخل');
      for (const returned of ['اطلب تعديل نطاقي', 'أرسل إلى اللجنة', 'سجل نطاقي']) {
        if (participantBody.includes(returned)) note(`«${returned}» عادت إلى صفحة المتسابق بعد أن أُزيلت بطلب المالك`);
      }
      await assertNoHorizontalScroll(page, 'scope-decision', 'صفحة المتسابق');
      await page.screenshot({ path: path.join(OUT, 'participant-scope.png'), fullPage: true });

      await roleSwitch(page, 'comp_admin');
      await page.locator('button:visible', { hasText: 'النطاق والأسئلة' }).first().click();
      await page.waitForTimeout(1200);
      if (/اختيار المتسابق/.test(await page.locator('body').innerText())) note('تبويب «اختيار المتسابق» عاد إلى ورشة المحرّك بعد أن أُزيل بطلب المالك');
      else ok('ورشة المحرّك بلا تبويب اختيار المتسابق، كما قرّر المالك');
      await assertNoHorizontalScroll(page, 'scope-decision', 'ورشة المحرّك');
    }
  } catch (error) {
    note(`توقف فحص نطاق المتسابق: ${String(error).slice(0, 160)}`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\nاللقطات في ${OUT}`);
console.log(problems.length ? `\n${problems.length} ملاحظة تحتاج معالجة` : '\nكل الفحوص البصرية والتشغيلية نجحت');
process.exitCode = problems.length ? 1 : 0;
