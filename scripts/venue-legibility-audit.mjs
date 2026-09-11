#!/usr/bin/env node
/*
 * قياس شاشات القاعة على أبعادٍ حقيقية.
 *
 * كل رقمٍ بصريّ في هذه الشاشات كُتب حسابًا: `clamp(4rem, 17vw, 13rem)` للكود المنادى به،
 * وسقفٌ لنقاط شريط الطابور، وعتباتٌ لعمر الإسقاط. ولم يرَ أحدٌ أيًّا منها على تلفازٍ من
 * بُعد ثمانية أمتار — والفرق بين رقمٍ محسوب ورقمٍ مُعايَن هو الفرق بين شاشةٍ تعمل وشاشةٍ
 * تُقرأ.
 *
 * هذه الأداة تُعاين. تفتح متصفّحًا حقيقيًا على مقاسات تلفازٍ حقيقية، وتقيس الحجم المحسوب
 * لكل نوعٍ على الشاشة، وتحوّله إلى **المسافة التي يُقرأ منها بالأمتار** — ثم تقول: هل
 * تكفي هذه الشاشة قاعةً بطول عشرة أمتار أم لا.
 *
 * ── كيف تُحسب المسافة ──────────────────────────────────────────────────────
 *
 * ارتفاع الحرف الكبير (cap height) ≈ ٠٫٧ من حجم الخط في الخطوط اللاتينية المعتادة.
 * والقاعدة المتعارفة في اللافتات: تُقرأ الكتابة بارتياح من مسافة ≈ ١٥٠ ضعف ارتفاع الحرف،
 * وبأقصى جهدٍ من ≈ ٢٠٠ ضعف. نأخذ ١٥٠ لأن القاعة تُقرأ بلمحة لا بتأمّل.
 *
 * والبكسل يُحوَّل إلى مليمتر بعرض الشاشة الفيزيائي: تلفاز ٥٥ بوصة عرضه ١٢١٨ مم تقريبًا،
 * فإن عُرض عليه ١٩٢٠ بكسل كان البكسل ٠٫٦٣٤ مم.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

/** نسبة ارتفاع الحرف الكبير إلى حجم الخط — تقدير متحفّظ للخطوط المستعملة هنا. */
const CAP_RATIO = 0.7;
/** ضعف ارتفاع الحرف الذي يُقرأ منه بارتياح. */
const COMFORT_FACTOR = 150;

/** شاشات القاعة المعتادة: القُطر بالبوصة، ودقّة العرض. */
const SCREENS = [
  { label: 'تلفاز 43" · 1080p', diagonalIn: 43, width: 1920, height: 1080, wall: true },
  { label: 'تلفاز 55" · 1080p', diagonalIn: 55, width: 1920, height: 1080, wall: true },
  { label: 'تلفاز 65" · 4K', diagonalIn: 65, width: 3840, height: 2160, wall: true },
  /* لوحٌ يُمسك باليد يُمرَّر بلا حرج — الحكم على ما يُعلَّق على جدار. */
  { label: 'لوح 10" · محمول', diagonalIn: 10, width: 1280, height: 800, wall: false },
];

/** مليمترات لكل بكسل على شاشة بهذا القطر وهذه الدقة (16:9). */
function mmPerPixel(diagonalIn, widthPx) {
  const diagonalMm = diagonalIn * 25.4;
  const widthMm = diagonalMm * (16 / Math.hypot(16, 9));
  return widthMm / widthPx;
}

const readableMeters = (fontPx, mmPx) => (fontPx * mmPx * CAP_RATIO * COMFORT_FACTOR) / 1000;

/*
 * التباين. حجمٌ كبيرٌ بلونٍ يذوب في خلفيته ليس مقروءًا مهما كبر — وهذا ما وقع فعلًا:
 * صنفٌ اسمه `mizan-code` كان مأخوذًا لرقاقةٍ على سطحٍ فاتح تحمل أخضرَ داكنًا، فورثه
 * كود القاعة على سطحٍ داكن بنسبة ١٫٣:١. لم تكشفه قراءةُ الشيفرة؛ كشفه القياس.
 *
 * والحدّ هنا ٤٫٥:١ لصغير النص و٣:١ لكبيره (WCAG AA)، وشاشة القاعة تُقرأ من بعيد فتُقاس
 * بالأشدّ لا بالأهون.
 */
const srgb = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const parseRgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
function contrastRatio(fg, bg) {
  const a = luminance(parseRgb(fg)), b = luminance(parseRgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/*
 * صفحة القياس. تستعمل الأصناف نفسها التي تستعملها الشاشتان، وتُحمَّل عليها ورقة الأنماط
 * المبنية — فما يُقاس هنا هو ما يظهر هناك حرفًا بحرف، لا نسخةٌ مشابهة.
 */
function harness(css, panels) {
  const cell = (i) => `
    <section class="mizan-board-cell${i === 0 ? ' is-testing' : ''}">
      <div class="flex items-center justify-between gap-2 min-w-0">
        <span class="shrink-0 w-11 h-11 rounded-xl bg-[#dbe7df] text-[#16372d] grid place-items-center font-black tabular-nums text-sm">C${i + 1}</span>
        <span class="min-w-0 text-end"><span class="mizan-board-tag text-[10px]">القرآن كامل</span></span>
      </div>
      <div class="rounded-2xl px-3 py-3 text-center bg-white/[.06]">
        <div class="text-[10px] font-black tracking-[.14em] mizan-venue-faint">الآن</div>
        <div class="mizan-board-code mizan-venue-code mt-1.5" dir="ltr" data-probe="board-code">A-${104 + i}</div>
      </div>
      <div class="flex items-center justify-between gap-2 text-[11px] border-t border-white/8 pt-2.5">
        <span class="mizan-venue-faint font-bold shrink-0" data-probe="micro">التالي</span>
        <span class="mizan-venue-code truncate" dir="ltr">A-${120 + i}</span>
      </div>
      <div class="mizan-queue-ribbon text-[#b9cec4] min-h-4">${'<span class="mizan-queue-dot"></span>'.repeat(7)}</div>
      <div class="flex items-center justify-between gap-2 text-[10px] mizan-venue-muted font-bold"><span>7 منتظرًا</span><span>42 دقيقة تقريبًا</span></div>
    </section>`;

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>${css}</style>
<style>html,body{margin:0}</style></head>
<body class="font-arabic">
  <!-- شاشة القاعة -->
  <div id="hall" class="mizan-venue-2 text-white" style="position:fixed;inset:0;overflow:auto">
    <div class="min-h-full p-5 sm:p-8 lg:p-10 flex flex-col">
      <header class="flex items-start justify-between gap-5">
        <div class="min-w-0">
          <div class="text-[11px] font-black tracking-[.2em] mizan-venue-muted">الدور الآن</div>
          <h1 class="text-2xl sm:text-3xl font-black mt-1" data-probe="hall-title">قاعة الانتظار</h1>
        </div>
        <div class="text-xl font-black tabular-nums">14:32</div>
      </header>
      <main class="my-auto py-7"><div class="mizan-board-grid" id="grid">${Array.from({ length: panels }, (_, i) => cell(i)).join('')}</div></main>
      <footer class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div class="rounded-2xl border border-white/8 px-4 py-3"><div class="text-xl font-black tabular-nums">41</div><div class="text-[10px] mizan-venue-faint">في الانتظار</div></div>
      </footer>
    </div>
  </div>

  <!-- شاشة اللجنة -->
  <div id="panel" class="mizan-venue-2 text-white" style="position:fixed;inset:0;overflow:auto">
    <div class="min-h-full p-5 sm:p-8 lg:p-10 flex flex-col">
      <header class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3 sm:gap-4 min-w-0">
          <span class="shrink-0 grid place-items-center rounded-2xl bg-[#dbe7df] text-[#16372d] font-black tabular-nums w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] text-xl sm:text-3xl">C7</span>
          <div class="min-w-0">
            <h1 class="text-xl sm:text-3xl font-black truncate" data-probe="panel-title">اللجنة السابعة</h1>
            <div class="flex flex-wrap items-center gap-1.5 mt-2"><span class="mizan-board-tag text-[11px]" data-probe="category-tag">القرآن كامل · القرآن كامل</span></div>
          </div>
        </div>
      </header>
      <main class="my-auto py-6 sm:py-10">
        <section class="relative overflow-hidden rounded-[34px] border border-white/10 text-center px-5 py-10 sm:py-16">
          <div class="text-[11px] font-black tracking-[.2em] mizan-venue-muted">الآن</div>
          <div class="mizan-call-code mizan-venue-code mt-4 sm:mt-6" dir="ltr" data-probe="call-code">A-52</div>
          <div class="mt-6 sm:mt-9 inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[.05] px-4 py-2">
            <span class="w-2.5 h-2.5 rounded-full bg-[#e8cb93]"></span><span class="text-xs sm:text-sm font-black" data-probe="status">تحت التلاوة</span>
          </div>
        </section>
      </main>
      <footer class="space-y-3">
        <section class="rounded-[26px] border border-white/10 bg-white/[.03] px-5 py-4">
          <div class="text-[11px] font-black tracking-[.17em] mizan-venue-muted">التالي</div>
          <ol class="flex flex-wrap items-center gap-2.5 sm:gap-4 mt-3">
            ${[55, 8, 61].map(n => `<li class="flex items-center gap-2.5 rounded-2xl bg-white/[.06] px-3.5 py-2.5"><span class="text-[11px] font-black mizan-venue-faint tabular-nums">1</span><span class="mizan-board-next mizan-venue-code" dir="ltr" data-probe="next-code">A-${n}</span></li>`).join('')}
          </ol>
        </section>
      </footer>
    </div>
  </div>
</body></html>`;
}

const PROBES = [
  { key: 'call-code', label: 'كود اللجنة المنادى به', critical: true },
  { key: 'board-code', label: 'كود القاعة في الخليّة', critical: true },
  { key: 'next-code', label: 'كود «التالي»', critical: true },
  { key: 'panel-title', label: 'اسم اللجنة', critical: false },
  { key: 'category-tag', label: 'وسم الفئة', critical: false },
  { key: 'status', label: 'حالة اللجنة', critical: false },
  { key: 'hall-title', label: 'عنوان القاعة', critical: false },
  { key: 'micro', label: 'أصغر نصّ على الشاشة', critical: false },
];

async function main() {
  const panels = Number(process.argv.find(a => a.startsWith('--panels='))?.split('=')[1] || 10);
  const shotDir = process.argv.find(a => a.startsWith('--shots='))?.split('=')[1] || '';

  const cssFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.css'));
  if (!cssFile) { console.error('ابنِ المشروع أولًا: npm run build'); process.exit(1); }
  const css = fs.readFileSync(path.join('dist/assets', cssFile), 'utf8');
  const html = harness(css, panels);

  /*
   * المتصفّح المثبَّت في البيئة قد يخالف بناء playwright المثبَّت في المشروع. المسار
   * الصريح يُشغّل الموجود بدل تنزيل بناءٍ ثانٍ — والقياس لا يتغيّر بتغيّر رقم البناء.
   */
  const explicit = [
    process.env.MIZAN_CHROMIUM,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ].find(p => p && fs.existsSync(p));
  const browser = await chromium.launch(explicit ? { executablePath: explicit } : {});
  const rows = [];
  let overflow = [];
  const lowContrast = [];

  for (const screen of SCREENS) {
    const page = await browser.newPage({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    const mmPx = mmPerPixel(screen.diagonalIn, screen.width);

    const measured = await page.evaluate((keys) => keys.map(k => {
      const el = document.querySelector(`[data-probe="${k}"]`);
      if (!el) return { key: k, fontPx: 0 };
      const cs = getComputedStyle(el);
      /*
       * الخلفية الفعلية تُركَّب، لا تُلتقط من أوّل سلف.
       *
       * أسطح القاعة مبنيّة على طبقاتٍ شبه شفّافة: `rgba(255,255,255,.055)` للخليّة،
       * و`rgba(232,203,147,.12)` لوسم الفئة. فأخذُ أوّل لونٍ «غير شفّاف» يعطي أبيضَ
       * أو ذهبًا كاملًا، ويخرج تباينٌ كاذب — أظهر ١٫٠:١ لوسمٍ تباينه الحقيقي ٧٫٥:١.
       * فالصحيح تجميع الطبقات فوق أوّل لونٍ صلب.
       */
      const rgba = (c) => { const n = (c.match(/[\d.]+/g) || []).map(Number); return { r: n[0] || 0, g: n[1] || 0, b: n[2] || 0, a: n.length > 3 ? n[3] : 1 }; };
      const layers = [];
      for (let node = el; node; node = node.parentElement) {
        const c = getComputedStyle(node).backgroundColor;
        if (!c || /transparent/.test(c)) continue;
        const p = rgba(c);
        if (p.a <= 0) continue;
        layers.push(p);
        if (p.a >= 1) break;
      }
      /* من الأسفل إلى الأعلى: كل طبقةٍ تُركَّب على ما تحتها. */
      let base = { r: 0, g: 0, b: 0 };
      for (let i = layers.length - 1; i >= 0; i--) {
        const p = layers[i];
        base = { r: p.r * p.a + base.r * (1 - p.a), g: p.g * p.a + base.g * (1 - p.a), b: p.b * p.a + base.b * (1 - p.a) };
      }
      const bg = `rgb(${Math.round(base.r)}, ${Math.round(base.g)}, ${Math.round(base.b)})`;
      return { key: k, fontPx: parseFloat(cs.fontSize), color: cs.color, bg };
    }), PROBES.map(p => p.key));

    /* هل تتّسع شبكة اللجان بلا تمرير؟ هذا ما لا يُعرف بالحساب وحده. */
    const fit = await page.evaluate(() => {
      const hall = document.getElementById('hall');
      const grid = document.getElementById('grid');
      return {
        gridHeight: grid.getBoundingClientRect().height,
        viewport: window.innerHeight,
        scrolls: hall.scrollHeight > hall.clientHeight + 1,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      };
    });
    if (fit.scrolls && screen.wall) overflow.push(`${screen.label} · ${panels} لجان`);

    rows.push({ screen, mmPx, measured, fit });

    if (shotDir) {
      fs.mkdirSync(shotDir, { recursive: true });
      const slug = `${screen.diagonalIn}in-${screen.width}x${screen.height}`;
      /* الشاشتان ثابتتان فتتراكبان؛ تُخفى الأخرى قبل اللقطة وإلا صُوّرت العليا مرّتين. */
      const only = (id) => page.evaluate((keep) => {
        for (const el of ['hall', 'panel']) document.getElementById(el).style.display = el === keep ? '' : 'none';
      }, id);
      await only('hall');
      await page.screenshot({ path: path.join(shotDir, `hall-${slug}.png`) });
      await only('panel');
      await page.screenshot({ path: path.join(shotDir, `panel-${slug}.png`) });
    }
    await page.close();
  }
  await browser.close();

  /* ── التقرير ───────────────────────────────────────────────────────────── */
  console.log(`\nقياس شاشات القاعة — ${panels} لجان · الأرقام مقيسة من متصفّح حقيقي\n`);
  console.log(`المسافة = ارتفاع الحرف × ${COMFORT_FACTOR} (قراءة مريحة بلمحة)، وارتفاع الحرف ≈ ${CAP_RATIO} × حجم الخط\n`);

  for (const { screen, mmPx, measured, fit } of rows) {
    console.log(`${screen.label}  (${screen.width}×${screen.height} · ${mmPx.toFixed(3)} مم/بكسل)`);
    console.log(`  الشبكة: ${fit.columns} أعمدة · ارتفاعها ${Math.round(fit.gridHeight)} من ${fit.viewport} بكسل · ${fit.scrolls ? (screen.wall ? '⚠️  تحتاج تمريرًا' : 'تُمرَّر — مقبول على لوحٍ يُمسك') : '✅ تتّسع بلا تمرير'}`);
    for (const probe of PROBES) {
      const m = measured.find(x => x.key === probe.key);
      if (!m?.fontPx) continue;
      const meters = readableMeters(m.fontPx, mmPx);
      const ratio = contrastRatio(m.color, m.bg);
      const needed = m.fontPx >= 24 ? 3 : 4.5;
      if (ratio < needed) lowContrast.push(`${probe.label} على ${screen.label}: ${ratio.toFixed(2)}:1 (المطلوب ${needed}:1)`);
      const mark = probe.critical ? (meters >= 10 ? '✅' : meters >= 6 ? '△' : '⚠️ ') : (meters >= 3 ? '  ' : '△');
      console.log(`  ${mark} ${probe.label.padEnd(22, '·')} ${String(Math.round(m.fontPx)).padStart(4)}px  →  يُقرأ من ${meters.toFixed(1)} م · تباين ${ratio.toFixed(1)}:1${ratio < needed ? ' ⚠️ ' : ''}`);
    }
    console.log('');
  }

  console.log('الحكم:');
  const callRow = rows.find(r => r.screen.diagonalIn === 55);
  const callPx = callRow?.measured.find(m => m.key === 'call-code')?.fontPx || 0;
  const callM = readableMeters(callPx, callRow?.mmPx || 0);
  console.log(`  • الكود المنادى به على تلفاز 55" يُقرأ من ${callM.toFixed(1)} م — ${callM >= 10 ? 'يكفي قاعةً بطول عشرة أمتار.' : 'لا يكفي قاعةً بطول عشرة أمتار.'}`);
  console.log(overflow.length ? `  • ⚠️  الشبكة تحتاج تمريرًا على: ${overflow.join('، ')}` : '  • الشبكة تتّسع بلا تمرير على كل شاشات الجدار المقيسة.');
  console.log(lowContrast.length ? `  • ⚠️  تباينٌ دون الحدّ:\n      ${[...new Set(lowContrast)].join('\n      ')}` : '  • كل نصٍّ مقيس يحقّق حدّ التباين (AA).');
  if (shotDir) console.log(`  • اللقطات في: ${shotDir}`);
  console.log('');

  /* شاشةٌ تحتاج تمريرًا عطبٌ لا ملاحظة: لا أحد يمرّر تلفازًا معلّقًا في ممرّ. */
  if (overflow.length || lowContrast.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
