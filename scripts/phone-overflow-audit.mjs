/*
 * فحص التمدّد الأفقي على عرض الهاتف.
 *
 * عنصرٌ واحد أعرض من الشاشة يجرّ الوثيقة كلَّها جانبًا: الترويسة تُزاح، والتبويبات تُقصّ،
 * والعنوان يخرج عن الإطار — فيبدو العطب في كل مكانٍ إلا مكانه. وهذا ما وقع في صفحة
 * النتائج: أربعة أزرارٍ في صفٍّ لا يلتفّ.
 *
 * ولا يُكشف هذا بقراءة الشيفرة: لا أحد يجمع عروض الأزرار في رأسه. يُكشف بالقياس — يُفتح
 * المنتَج على عرض هاتفٍ حقيقي، ويُسأل المتصفّح: أعرضُ ما تمرّره أكبر من عرض الشاشة؟ وإن
 * كان، فأيّ عنصرٍ هو الذي تجاوز؟ فيُسمّى بالاسم بدل أن يُبحث عنه.
 *
 * والفحص القائم (`competition-day-qa`) يمشي يوم المسابقة على 1440px ويقيس التمدّد في شاشةٍ
 * واحدة. وهذا يمشي شاشات الإدارة الثماني على 390px — وهو العرض الذي رُئي فيه العطب.
 *
 * التشغيل:
 *   npm run build && npx vite preview --port 4173 --host 127.0.0.1 &
 *   node scripts/phone-overflow-audit.mjs [--base=http://127.0.0.1:4173]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:4173');
const OUT = arg('out', path.join('dist', 'phone-overflow-audit'));
/* ٣٩٠×٨٤٤ — iPhone 14/15. وهامش بكسلين لتقريب التخطيط الفرعي، لا لتمرير عطبٍ حقيقي. */
const WIDTH = Number(arg('width', '390'));
const SLACK = 2;
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const note = (m) => { problems.push(m); console.log(`  ✗ ${m}`) };
const ok = (m) => console.log(`  ✓ ${m}`);

const DEMO_ENTRY = 'استعراض النظام ببيانات تجريبية';
/* شاشات الإدارة كما تظهر في شريط التبويبات على الهاتف. */
const ADMIN_ROLE = 'مدير المسابقة';
const VIEWS = ['اليوم', 'هوية المسابقة', 'النطاق والأسئلة', 'المشاركون', 'التشغيل', 'التحكيم', 'النتائج', 'المؤسسة'];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, locale: 'ar', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  try { localStorage.setItem('mizan_onboarding_quiet_v2', '1'); sessionStorage.setItem('mizan_splash_seen', '1') } catch { /* وضع خاص */ }
});
const page = await ctx.newPage();

/*
 * أوسعُ عنصرٍ تجاوز الإطار، مسمًّى بوسمه وصنفه ونصّه.
 *
 * يُتجاهل ما يُمرَّر عمدًا (`overflow-x:auto`) وما بداخله: شريطٌ صُمّم ليُمرَّر ليس عطبًا.
 * والمقيس هو `getBoundingClientRect` لا `scrollWidth`، فهو ما يراه المستخدم فعلًا.
 *
 * ويُستبعد المثبَّت (`position:fixed`) وما بداخله: عنصرٌ ممدودٌ على عرض الشاشة يتمدّد مع
 * الوثيقة حين تتمدّد، فيُقاس أعرضَ من الجميع وهو ضحيّةُ العطب لا سببه — وقد سمّى الفحصُ
 * أولَ مرّةٍ شريطَ بيئة العرض بينما السبب أربعةُ أزرارٍ في صفحة النتائج.
 */
const findOverflow = () => page.evaluate((slack) => {
  const doc = document.documentElement;
  const limit = doc.clientWidth;
  if (doc.scrollWidth <= limit + slack) return null;

  const excused = (el) => {
    for (let n = el; n && n !== doc; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true;
      if (cs.position === 'fixed') return true;
    }
    return false;
  };

  const over = [];
  for (const el of doc.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const past = Math.max(r.right - limit, -r.left);
    if (past <= slack || excused(el)) continue;
    over.push({ el, past });
  }

  /*
   * السبب هو الأعمق لا الأعرض.
   *
   * `<body>` و`<main>` يتمدّدان لأن ما بداخلهما تمدّد، فتسميتُهما تسميةُ الضحيّة. فيُطرح
   * كلُّ عنصرٍ يحوي متجاوزًا آخر، ويبقى الورقيّ — وهو الصفُّ الذي فاض فعلًا.
   */
  const leaves = (over.filter(a => !over.some(b => b !== a && a.el.contains(b.el))) || over)
    .sort((a, b) => b.past - a.past)
    .slice(0, 3)
    .map(({ el, past }) => ({
      over: Math.round(past),
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 80),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
    }));

  return { scrollWidth: doc.scrollWidth, clientWidth: limit, leaves };
}, SLACK);

console.log(`── التمدّد الأفقي على ${WIDTH}px`);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });

/* مدخل العرض أيقونةٌ صامتة بلا نصّ — فيُطلب بوسم الوصول لا بنصٍّ لا وجود له. */
const entry = page.locator(`button:visible[aria-label="${DEMO_ENTRY}"]`).first();
/*
 * ويُنتظر ظهورُه بدل أن يُسأل `count()` بعد مهلةٍ ثابتة: صفحةٌ أبطأ قليلًا كانت تُقرأ
 * «المدخل غير موجود» وهو موجودٌ لم يُرسم بعد. وسكونُ الشبكة لم يكن شرطًا صحيحًا أصلًا.
 */
await entry.waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
if (!await entry.count()) { note('مدخل البيئة التجريبية غير موجود — لم يُفحص شيء'); await browser.close(); process.exit(1) }
await entry.click();
await page.waitForTimeout(3500);

/* شاشات الإدارة لا تُرى إلا بدور إداري؛ ومنتقي الدور في شريط بيئة العرض. */
const pickers = page.locator('select:visible');
let entered = false;
for (let i = 0; i < await pickers.count(); i++) {
  const picker = pickers.nth(i);
  if (!(await picker.locator('option').allInnerTexts()).includes(ADMIN_ROLE)) continue;
  entered = await picker.selectOption({ label: ADMIN_ROLE }).then(() => true).catch(() => false);
  if (entered) { await page.waitForTimeout(3000); break }
}
if (!entered) { note(`تعذّر الدخول بدور «${ADMIN_ROLE}» — لم تُفحص شاشات الإدارة`); await browser.close(); process.exit(1) }

/* شاشةٌ لم تُزَر ليست شاشةً سليمة: الصمت هنا فشلٌ لا نجاح. */
let visited = 0;

for (const view of VIEWS) {
  const tab = page.locator('button:visible', { hasText: new RegExp(`^\\s*${view}\\s*$`) }).first();
  if (!await tab.count()) { note(`«${view}» لم تظهر في شريط التبويبات، فلم تُقَس`); continue }
  await tab.click().catch(() => {});
  await page.waitForTimeout(1600);
  visited++;

  const result = await findOverflow();
  if (!result) { ok(`«${view}» داخل الإطار`); continue }

  /*
   * تُسمّى ثلاثة مشتبهين لا واحد.
   *
   * في اتجاهٍ من اليمين إلى اليسار تفيض الوثيقة يسارًا، فيقع خارجَ الإطار طرفاها معًا:
   * الصفُّ الفائض في أحدهما، وعنوانٌ بريء دُفع في الآخر. فاختيارُ «الأوسع» وحده يسمّي
   * البريء أحيانًا. والثلاثة تكفي عينَ من يقرأ ليعرف أيَّها صفُّه.
   */
  const span = result.scrollWidth - result.clientWidth;
  note(result.leaves.length
    ? `«${view}» تتمدّد ${span}px — المشتبهون: ${result.leaves.map(w => `${w.over}px <${w.tag} class="${w.cls}"> «${w.text}»`).join(' | ')}`
    : `«${view}» تتمدّد ${span}px`);
  await page.screenshot({ path: path.join(OUT, `${view}.png`), fullPage: true });
}

await browser.close();
if (!visited) note('لم تُقَس شاشةٌ واحدة');
console.log(problems.length
  ? `\n${problems.length} شاشة تتمدّد أفقيًا · اللقطات في ${OUT}`
  : `\n${visited} شاشة قِيست، ولا واحدة تتمدّد عن عرض ${WIDTH}px`);
process.exitCode = problems.length ? 1 : 0;
