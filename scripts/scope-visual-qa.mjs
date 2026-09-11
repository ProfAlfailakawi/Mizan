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

async function assertNoHorizontalScroll(page, label, where) {
  const size = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  if (size.s > size.c + 2) note(`[${label}] ${where}: الصفحة تتمدّد أفقيًا (${size.s} > ${size.c})`);
}

for (const [width, height, label] of VIEWPORTS) {
  console.log(`\n── ${label} ${width}×${height}`);
  const { ctx, page } = await newPage(width, height, label);
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const entry = page.locator(':visible', { hasText: /^مدير المسابقة$/ }).last();
    if (!await entry.count()) { note(`[${label}] تعذّر الدخول بدور مدير المسابقة`); await ctx.close(); continue; }
    await entry.click();
    await page.waitForTimeout(1500);

    const engine = page.locator('button:visible', { hasText: 'النطاق والأسئلة' }).first();
    if (!await engine.count()) { note(`[${label}] تبويب النطاق والأسئلة غير موجود`); await ctx.close(); continue; }
    await engine.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `${label}-scope.png`), fullPage: true });
    await assertNoHorizontalScroll(page, label, 'النطاق');
    ok('شاشة النطاق');

    for (const [tab, file] of [['اختيار المتسابق', 'selection'], ['توزيع الأسئلة', 'distribution'], ['سياسة الأسئلة', 'policy'], ['الازدحام', 'demand'], ['المحاكاة', 'simulation'], ['النماذج والعدالة', 'models'], ['الجاهزية', 'readiness']]) {
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
     * النماذج والعدالة: لا يكفي أن تظهر الأزرار. تُضغط فعلًا — تُولَّد دفعة، وتُعتمد، وتُختم،
     * ويُحجر موضع، ويُصدر تقرير — ويُقرأ ما ظهر على الشاشة بعد كل خطوة.
     */
    if (label === 'desktop') {
      await page.locator('[role="tab"]:visible', { hasText: 'النماذج والعدالة' }).first().click();
      await page.waitForTimeout(900);
      const accept = async () => {
        const confirmBtn = page.locator('[role="dialog"] button:visible, .mizan-confirm button:visible').filter({ hasText: /ولّد الآن|اعتماد|ختم|احجر|أصدر|تأكيد|نعم|Approve|Seal|Generate/ }).first();
        if (await confirmBtn.count()) { await confirmBtn.click().catch(() => {}); await page.waitForTimeout(1400); return true; }
        return false;
      };

      await page.locator('button:visible', { hasText: 'ولّد دفعة' }).first().click();
      if (!await accept()) note(`[${label}] زر توليد الدفعة لم يفتح تأكيدًا`);
      await page.waitForTimeout(1800);
      let body = await page.locator('body').innerText();
      const generated = body.match(/وُلّد\s*(\d+)\s*نموذجًا\s*و(\d+)\s*احتياطيًا/);
      if (!generated) note(`[${label}] لم يظهر أثر توليد الدفعة على الشاشة`);
      else if (generated[1] === '0') note(`[${label}] الدفعة ولّدت صفر نموذج`);
      else ok(`دفعة: ${generated[1]} نموذجًا و${generated[2]} احتياطيًا`);
      await page.screenshot({ path: path.join(OUT, `${label}-models-generated.png`), fullPage: true });

      await page.locator('button:visible', { hasText: /^اعتماد$/ }).first().click().catch(() => note(`[${label}] زر اعتماد الدفعة معطّل بعد التوليد`));
      await accept();
      await page.locator('button:visible', { hasText: /^ختم$/ }).first().click().catch(() => note(`[${label}] زر ختم الدفعة معطّل بعد الاعتماد`));
      await accept();
      body = await page.locator('body').innerText();
      if (!/مختومة/.test(body)) note(`[${label}] الدفعة لم تصل إلى حالة «مختومة»`); else ok('الدفعة اعتُمدت ثم خُتمت');

      const lociField = page.locator('input[placeholder="2:255، 36:1"]').first();
      if (!await lociField.count()) note(`[${label}] حقل حجر المواضع غير موجود`);
      else {
        await lociField.fill('2:255');
        await page.locator('input[placeholder="خطأ في ضبط النص"]').first().fill('فحص تشغيلي');
        await page.locator('button:visible', { hasText: /^احجر$/ }).first().click();
        await accept();
        await page.waitForTimeout(1200);
        body = await page.locator('body').innerText();
        if (!/حُجر\s*1\s*موضعًا/.test(body)) note(`[${label}] الحجر لم يُظهر أثره بالأرقام`); else ok('الحجر يُظهر أثره: نماذج مُبطلة ومخزون متبقٍ');
        if (!/ارفع الحجر/.test(body)) note(`[${label}] لا سبيل لرفع الحجر من الشاشة`);
      }

      await page.locator('button:visible', { hasText: 'أطلق المنقضي' }).first().click().catch(() => note(`[${label}] زر إطلاق الحجوزات المنقضية لا يعمل`));
      await page.waitForTimeout(800);

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

// تدفق التسجيل: الخطوة تظهر للفئة الاختيارية وحدها، والقاعدة تُفرض قبل المتابعة.
for (const [width, height, label] of [VIEWPORTS[0], VIEWPORTS[2]]) {
  console.log(`\n── تسجيل ${label}`);
  const { ctx, page } = await newPage(width, height, `register-${label}`);
  try {
    await page.goto(`${BASE}/#register?comp=comp-dubai-2027`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    for (const [labelText, value] of [['الاسم بالعربية', 'تجربة تجريبية'], ['الاسم بالإنجليزية', 'Demo Reciter'], ['البريد', 'demo@example.org'], ['الهاتف', '+96550000000'], ['رقم الهوية', '123456789']]) {
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
 * دورة حياة نطاق المتسابق، من بابها إلى سجلّها.
 *
 * كانت `saveParticipantScope` مبنيّةً كاملةً ولا تستدعيها شاشة، فلا نسخة ثانية تُولد أصلًا،
 * فسجلُّ النسخ يُعرض فارغًا أبدًا. هذا الفحص يطرق الباب فعلًا: يغيّر النطاق، ويكتب السبب،
 * ويرسل، ثم يقرأ السجل، ثم ينتقل إلى اللجنة فيقرأ الطلب ويرفضه بسببٍ يقرأه صاحبه.
 */
console.log('\n── دورة حياة نطاق المتسابق');
{
  const { ctx, page } = await newPage(1440, 1100, 'lifecycle');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('button:visible', { hasText: 'المتسابق' }).first().click();
    await page.waitForTimeout(2200);

    const door = page.locator('button:visible', { hasText: 'اطلب تعديل نطاقي' }).first();
    if (!await door.count()) note('لا باب لتعديل النطاق في صفحة المتسابق — دورة الحياة غير قابلة للوصول');
    else {
      ok('باب تعديل النطاق موجود للفئة التي يختار فيها المتسابق');
      await door.click();
      await page.waitForTimeout(1000);
      if (!await page.locator('#participant-juz-1').count()) note('منتقي النطاق لم يظهر عند طلب التعديل');

      await page.locator('button:visible', { hasText: 'أرسل إلى اللجنة' }).first().click();
      await page.waitForTimeout(700);
      if (!/اكتب سبب التغيير/.test(await page.locator('body').innerText())) note('أُرسل تغيير النطاق بلا سبب');
      else ok('التغيير بلا سبب مرفوض بنصٍّ يشرح المطلوب');

      /* نبدّل جزءًا بجزء فيبقى العدد مطابقًا للائحة، وإلا رُفض الاختيار نفسه. */
      await page.locator('#participant-juz-1').click(); await page.waitForTimeout(250);
      await page.locator('#participant-juz-9').click(); await page.waitForTimeout(400);
      await page.locator('input[placeholder="أتقنت الجزء الخامس أكثر من الأول"]').fill('أتقن التاسع أكثر من الأول');
      await page.locator('button:visible', { hasText: 'أرسل إلى اللجنة' }).first().click();
      await page.waitForTimeout(1400);

      const after = await page.locator('body').innerText();
      if (!/أُرسل نطاقك الجديد إلى اللجنة/.test(after)) note('لم يُؤكَّد إرسال النطاق الجديد');
      else ok('النطاق الجديد أُرسل إلى اللجنة والنسخة السابقة محفوظة');
      const versions = after.match(/سجل نطاقي \((\d+) نسخة\)/);
      if (!versions) note('سجل النسخ لم يظهر بعد التغيير');
      else if (versions[1] === '1') note('سجل النسخ ما زال يعرض نسخة واحدة بعد التغيير');
      else ok(`سجل النسخ يعرض ${versions[1]} نسخة`);
      await page.locator('summary:visible', { hasText: 'سجل نطاقي' }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      if (!/أتقن التاسع أكثر من الأول/.test(await page.locator('body').innerText())) note('سبب التغيير لا يظهر في سجل المتسابق');
      else ok('سبب التغيير مكتوب في السجل لا مدفون في التخزين');
      await assertNoHorizontalScroll(page, 'lifecycle', 'صفحة المتسابق');
      await page.screenshot({ path: path.join(OUT, 'participant-scope-history.png'), fullPage: true });
    }

    /* اللجنة: ترى الطلب، وترى السجل، وترفض بسببٍ يقرأه صاحبه. */
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.locator('button:visible', { hasText: 'مدير المسابقة' }).first().click();
    await page.waitForTimeout(1500);
    await page.locator('button:visible', { hasText: 'النطاق والأسئلة' }).first().click();
    await page.waitForTimeout(1200);
    await page.locator('[role="tab"]:visible', { hasText: 'اختيار المتسابق' }).first().click();
    await page.waitForTimeout(900);
    await page.locator('button:visible', { hasText: 'ربع القرآن يختاره المتسابق' }).first().click().catch(() => {});
    await page.waitForTimeout(1200);

    let panel = await page.locator('body').innerText();
    if (!/بانتظار المراجعة/.test(panel)) note('طلب تعديل النطاق لا يصل إلى شاشة اللجنة');
    else ok('طلب التعديل يصل إلى اللجنة بحالة «بانتظار المراجعة»');
    if (!/نسخة سابقة/.test(panel)) note('اللجنة لا ترى النسخ السابقة');
    else ok('اللجنة ترى النسخ السابقة بتواريخها وأسبابها');

    const reject = page.locator('button:visible', { hasText: /^رفض$/ }).first();
    if (!await reject.count()) note('لا سبيل للجنة أن ترفض نطاقًا');
    else {
      await reject.click();
      await page.waitForTimeout(600);
      if (!await page.locator('button:visible', { hasText: 'أرسل الرفض' }).first().isDisabled()) note('الرفض قابل للإرسال بلا سبب');
      else ok('الرفض بلا سبب موقوف');
      await page.locator('input[placeholder="النطاق المختار أقل من المطلوب في اللائحة"]').fill('يرجى إبقاء الجزء الأول ضمن اختيارك');
      await page.locator('button:visible', { hasText: 'أرسل الرفض' }).first().click();
      await page.waitForTimeout(1200);
      panel = await page.locator('body').innerText();
      if (!/مرفوض/.test(panel)) note('الرفض لم يُسجَّل');
      else ok('الرفض سُجِّل بسببه');
    }
    await assertNoHorizontalScroll(page, 'lifecycle', 'مراجعة اللجنة');
    await page.screenshot({ path: path.join(OUT, 'committee-scope-review.png'), fullPage: true });
  } catch (error) {
    note(`توقف فحص دورة الحياة: ${String(error).slice(0, 160)}`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\nاللقطات في ${OUT}`);
console.log(problems.length ? `\n${problems.length} ملاحظة تحتاج معالجة` : '\nكل الفحوص البصرية والتشغيلية نجحت');
process.exitCode = problems.length ? 1 : 0;
