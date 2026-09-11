/*
 * فحص يوم المسابقة في متصفح حقيقي — من أول موضع إلى السجل.
 *
 * فحص الشاشات وحدها لا يكفي: الطريق الذي يمرّ منه المتسابق يمرّ بسبع بوابات (حضور، موافقة
 * لجنة، كشف، تلاوة، إنهاء، اعتماد وقفل، ثم استدعاء التالي) وكلٌّ منها يمكن أن ينكسر وحده
 * بلا أن ينكسر ما قبله. وهذا السكربت يمشي الطريق كلّه ويقرأ ما ظهر بعد كل بوابة.
 *
 * ويتحقق بعد ذلك من ثلاثة أشياء لا تظهر في اختبار وحدة:
 *   • أن استدعاء المتسابق التالي يشغّل مسار السحب الحقيقي فيخرج موضعًا داخل نطاقه.
 *   • أن السجل يحمل ما جرى — لا شاشة نظيفة بلا أثر.
 *   • أن السؤال لا يظهر نصّه قبل الحضور والموافقة.
 *
 * التشغيل:
 *   npm run build && npx vite preview --port 4173 --host 127.0.0.1 &
 *   node scripts/competition-day-qa.mjs [--base=http://127.0.0.1:4173]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:4173');
const OUT = arg('out', path.join('dist', 'competition-day-qa'));
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const note = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const offlineNoise = /ERR_(CONNECTION|TUNNEL|NAME_NOT_RESOLVED|INTERNET)|Could not reach|Failed to load resource: net::|404/;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ar' });
await ctx.addInitScript(() => {
  try { localStorage.setItem('mizan_onboarding_quiet_v2', '1'); sessionStorage.setItem('mizan_splash_seen', '1'); } catch { /* private mode */ }
});
const page = await ctx.newPage();
page.on('pageerror', e => note(`خطأ تشغيل: ${String(e).slice(0, 160)}`));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (offlineNoise.test(text)) return;
  note(`خطأ سجل: ${text.slice(0, 160)}`);
});

const body = () => page.locator('body').innerText();
const clickIf = async (label) => {
  const target = page.locator('button:visible', { hasText: label }).first();
  if (!await target.count()) return false;
  await target.click().catch(() => {});
  await page.waitForTimeout(900);
  return true;
};
const enterRole = async (label) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const entry = page.locator('button:visible', { hasText: label }).first();
  if (!await entry.count()) { note(`تعذّر الدخول بدور «${label}»`); return false; }
  await entry.click();
  await page.waitForTimeout(2500);
  return true;
};

/* البوابات بترتيبها. المحرّك يضغط أولَ ما يجده منها، فيتقدّم الطريق خطوةً واحدة في كل دورة. */
const GATES = ['المتسابق أمامي — تأكيد الحضور', 'أوافق على فتح السؤال', 'إنهاء الموضع', 'إنهاء آخر موضع', 'السؤال التالي', 'اعتماد وقفل'];

async function walkSession(maxTicks = 24) {
  const seen = new Set();
  let sealedTextLeaked = false;
  for (let tick = 0; tick < maxTicks; tick++) {
    const text = await body();
    /* قبل الحضور والموافقة لا يظهر اسم سورة ولا آيات — هذا حاجز تشغيلي لا تجميل. */
    if (/السؤال مختوم/.test(text) && /الموضع\s*\d+\/\d+/.test(text) && /·\s*\d+–\d+/.test(text)) sealedTextLeaked = true;
    let clicked = null;
    for (const gate of GATES) {
      if (await clickIf(gate)) { clicked = gate; break; }
    }
    if (!clicked) break;
    seen.add(clicked);
    if (clicked === 'اعتماد وقفل') { await page.waitForTimeout(2200); break; }
  }
  return { seen, sealedTextLeaked };
}

console.log('\n── يوم المسابقة: من الموضع الأول إلى قفل التقييم');
if (await enterRole('المحكم')) {
  const first = await body();
  if (!/الموضع\s*1\/\d+/.test(first)) note('سطح التحكيم لم يفتح على الموضع الأول');
  else ok('سطح التحكيم يفتح على جلسة حقيقية');

  const walk = await walkSession();
  if (walk.sealedTextLeaked) note('نصّ الموضع ظهر قبل الحضور وموافقة اللجنة');
  else ok('السؤال المختوم لم يكشف سورته ولا آياته قبل الحضور والموافقة');
  for (const gate of ['المتسابق أمامي — تأكيد الحضور', 'أوافق على فتح السؤال', 'إنهاء آخر موضع', 'اعتماد وقفل']) {
    if (!walk.seen.has(gate)) note(`البوابة «${gate}» لم تُبلَغ في هذا المسار`);
  }
  const locked = await body();
  if (!/تم اعتماد تقييمك/.test(locked)) note('التقييم لم يُقفل بعد اجتياز البوابات');
  else ok('التقييم اعتُمد وقُفل، وتقييم بقية المحكمين بقي مخفيًا');
  await page.screenshot({ path: path.join(OUT, 'judge-locked.png'), fullPage: true });

  /*
   * استدعاء المتسابق التالي يشغّل مسار السحب الحقيقي: نطاق، ثم بنك مقصوص، ثم قرعة، ثم حجز.
   *
   * وفي بناءِ إطلاقٍ بلا خادم آمن يعمل، الصواب أن **يُرفض** بدء الجلسة الرسمية — وهذا نجاحٌ
   * لا فشل: الحاجز صمد. فيُميَّز الرفضان: رفضُ الحاجز يُعدّ نجاحًا، وأي رفض آخر ملاحظة.
   */
  if (await clickIf('المتسابق التالي')) {
    await page.waitForTimeout(3000);
    const next = await body();
    const blocker = await page.evaluate(() => {
      try {
        const state = JSON.parse(localStorage.getItem('mizan_os_store_v1') || '{}');
        return (state.incidents || []).slice(0, 3).map(i => `${i.title}: ${i.description || ''}`).join(' | ');
      } catch { return ''; }
    });
    if (/الموضع\s*1\/\d+/.test(next) && !/تعذّر بدء الجلسة/.test(next)) ok('استدعاء المتسابق التالي شغّل مسار السحب وفتح جلسة جديدة');
    else if (/Secure question runtime blocker|secure runtime unavailable/i.test(blocker)) ok('وضع الإطلاق رفض بدء جلسة رسمية بلا خادم أسئلة آمن — الحاجز صمد كما يجب في هذه البيئة');
    else if (/تعذّر بدء الجلسة/.test(next)) note(`استدعاء المتسابق التالي فشل لسبب غير متوقَّع: ${blocker.slice(0, 200) || next.slice(next.indexOf('تعذّر'), next.indexOf('تعذّر') + 160)}`);
    else if (/لا يوجد متسابق/.test(next)) ok('لا متسابق آخر في الطابور — وقيل ذلك صراحةً');
    else note('استدعاء المتسابق التالي لم يُظهر جلسة ولا سببًا');

    /*
     * وما لا يظهر على الشاشة يُقرأ من اللقطة: هل حُجزت مواضع هذه الجلسة فعلًا؟ حجزٌ لا يُكتب
     * يعني أن موضع هذا المتسابق يمكن أن يُسحب لغيره وهو واقفٌ أمام اللجنة.
     */
    const ledger = await page.evaluate(() => {
      try {
        const state = JSON.parse(localStorage.getItem('mizan_os_store_v1') || '{}');
        const session = state.activeSession || {};
        const reservations = (state.questionReservations || []).filter(r => r.sessionId === session.sessionId);
        const model = (state.questionModels || []).find(m => m.participantId === session.participant?.id);
        return {
          started: !!session.questionSelection,
          questions: (session.questionSelection?.questions || []).length,
          reservations: reservations.length,
          states: [...new Set(reservations.map(r => r.state))],
          scopeSignature: session.questionSelection?.scopeSignature || '',
          modelScope: model?.scopeSignature || '',
          modelMode: model?.generationMode || '',
        };
      } catch { return null; }
    });
    if (ledger?.started) {
      if (!ledger.reservations) note('الجلسة بدأت بلا حجز واحد — موضع المتسابق غير محمي من سحبٍ لغيره');
      else if (ledger.reservations !== ledger.questions) note(`عدد الحجوزات (${ledger.reservations}) لا يطابق عدد الأسئلة (${ledger.questions})`);
      else ok(`حُجزت مواضع الجلسة (${ledger.reservations}) بحالة «${ledger.states.join('، ')}»`);
      if (!ledger.scopeSignature) note('حزمة الأسئلة بلا بصمة نطاق — لا يمكن للمدقّق أن يعرف من أين سُحبت');
      else if (ledger.modelScope && ledger.modelScope !== ledger.scopeSignature) note('بصمة نطاق النموذج تخالف بصمة الحزمة');
      else ok(`الحزمة تحمل بصمة نطاقها (${ledger.scopeSignature.slice(0, 20)}…) ووضع توليدها «${ledger.modelMode}»`);
    }
    await page.screenshot({ path: path.join(OUT, 'judge-next.png'), fullPage: true });
  } else note('لا زرّ لاستدعاء المتسابق التالي بعد القفل');
}

console.log('\n── السجل: هل بقي أثر لما جرى؟');
if (await enterRole('المدقق')) {
  await page.waitForTimeout(2500);
  const text = await body();
  const markers = ['FAIRDRAW', 'QUESTION', 'JUDGE', 'كشف', 'قفل', 'تقييم', 'حزمة أسئلة'];
  const hit = markers.filter(m => text.includes(m));
  if (!hit.length) note('شاشة التدقيق لا تعرض أي أثر لما جرى في الجلسة');
  else ok(`السجل يحمل أثر ما جرى (${hit.slice(0, 4).join('، ')})`);
  const size = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  if (size.s > size.c + 2) note(`شاشة التدقيق تتمدّد أفقيًا (${size.s} > ${size.c})`);
  await page.screenshot({ path: path.join(OUT, 'auditor.png'), fullPage: true });
}

await browser.close();
console.log(`\nاللقطات في ${OUT}`);
console.log(problems.length ? `\n${problems.length} ملاحظة تحتاج معالجة` : '\nمسار يوم المسابقة سليم من أوله إلى السجل');
process.exitCode = problems.length ? 1 : 0;
