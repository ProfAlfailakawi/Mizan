/*
 * أربعُ تلاواتٍ في متصفّحٍ حقيقيّ — وهو القياسُ الذي لم يكن.
 *
 * فالعيوبُ الثمانيةُ التي وُجدت في هذه الشاشة كانت كلُّها **زمنيّة**: تعليقٌ، وترتيبُ
 * وصول، وتركيبٌ يتكرّر، وطلبٌ يعود بعد أوانه. ولم يرَ منها بناءٌ ولا تصييرٌ إلى نصّ
 * ولا اختبارُ عقدةٍ شيئًا — رآها أوّلُ تشغيلٍ بميكروفونٍ حقيقيّ.
 *
 * يُشغَّل بـ: npm run qa:face-listens
 */
import { runScenario, type RunOutcome } from './drive';
import type { Scenario } from './server';

interface Expectation {
  scenario: Scenario;
  reciteMs: number;
  settleMs: number;
  why: string;
  check(o: RunOutcome): string[];
}

const failures = (o: RunOutcome, rules: [boolean, string][]) => rules.filter(([ok]) => !ok).map(([, why]) => why);

const PLAN: Expectation[] = [
  {
    scenario: 'happy', reciteMs: 7000, settleMs: 25_000,
    why: 'تلاوةٌ تامّةٌ على شبكةٍ سليمة',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.chunksServed >= 2, `مقاطعُ مرسَلة: ${o.chunksServed}`],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
      [o.indices.returns === '0 · 0', `رجوعٌ أو تخطٍّ في تلاوةٍ مستقيمة: ${o.indices.returns}`],
      [o.attemptsStored === 1, `محاولاتٌ محفوظة: ${o.attemptsStored} (المتوقَّع ١)`],
      [o.analysisNote === null, `بيانٌ بلا موجب: ${o.analysisNote}`],
    ]),
  },
  {
    scenario: 'reordered', reciteMs: 7000, settleMs: 25_000,
    why: 'أوّلُ المقاطع أبطأُ من كلّ ما بعده — وهو ما يصنع الرجوعَ الكاذب',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.indices.returns === '0 · 0', `فوضى الوصول صنعت رجوعًا: ${o.indices.returns}`],
      [!o.marks.includes('repeat'), 'ظهرت علامةُ «أعدتَ» ولم يرجع القارئ'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
    ]),
  },
  {
    scenario: 'hanging', reciteMs: 7000, settleMs: 30_000,
    why: 'طلبٌ لا يعود أبدًا — أيُطلَق الميكروفون؟',
    check: o => failures(o, [
      [o.reportShown, 'عَلِقت الشاشةُ ولم تبلغ تقريرًا'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا بعد طلبٍ معلّق (${o.micTracksLive})`],
      [o.attemptsStored === 0, `حُفظت مراجعةٌ ناقصة: ${o.attemptsStored}`],
      [!!o.analysisNote?.includes('لم تُحفظ'), `لم يُقل للطالب إنّها لم تُحفظ: ${o.analysisNote}`],
    ]),
  },
  {
    scenario: 'failing', reciteMs: 7000, settleMs: 25_000,
    why: 'مقطعٌ يسقط بردّ خطأ',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
      [o.attemptsStored === 0, `حُفظت مراجعةٌ ناقصة: ${o.attemptsStored}`],
      [!!o.analysisNote?.includes('لم يصل'), `لم يُقل إنّ مقطعًا لم يصل: ${o.analysisNote}`],
    ]),
  },
];

async function main() {
  let broken = 0;
  for (const plan of PLAN) {
    const outcome = await runScenario(plan.scenario, plan.reciteMs, plan.settleMs);
    const problems = plan.check(outcome);
    const head = `${plan.scenario.padEnd(10)} · ${plan.why}`;
    if (problems.length) {
      broken += 1;
      console.log(`✗ ${head}`);
      for (const problem of problems) console.log(`    ${problem}`);
      console.log(`    ${JSON.stringify(outcome)}`);
    } else {
      console.log(`✓ ${head}`);
      console.log(`    بلغ ${outcome.reachText} · مقاطع ${outcome.chunksServed} · محاولات ${outcome.attemptsStored} · ميكروفون حيّ ${outcome.micTracksLive}`);
    }
  }
  if (broken) {
    console.error(`\nسقط ${broken} من ${PLAN.length} تلاوات.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nأربعُ تلاواتٍ جرت في متصفّحٍ حقيقيّ بميكروفونٍ حقيقيّ — وكلُّها كما يجب.`);
}

void main();
