/*
 * تلاواتٌ في متصفّحٍ حقيقيّ — وهو القياسُ الذي لم يكن.
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
    scenario: 'teacher', reciteMs: 9000, settleMs: 25_000,
    why: '«المعلّم» بعد التلاوة: أيصله التسجيلُ ومقاطعُ آياته، وتعود ملاحظاتُه إلى كلماتها في الصفحة؟',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
      [o.teacherCalls.length >= 1, 'لم يُطلب المعلّمُ أصلًا'],
      [o.teacherCalls.every(c => c.audioBytes > 1000), `وصل المعلّمَ تسجيلٌ فارغ: ${o.teacherCalls.map(c => c.audioBytes)}`],
      [o.teacherCalls.every(c => c.segments.length >= 1 && c.segments.length <= 6), `دفعاتٌ بغير حجمها: ${o.teacherCalls.map(c => c.segments.length)}`],
      [o.teacherCalls.flatMap(c => c.segments).every(s => Number.isInteger(s.startMs) && s.endMs > s.startMs), 'مقاطعُ بأزمنةٍ غير صحيحة'],
      [o.teacher.phase === 'done', `لم يفرغ التقرير: ${o.teacher.phase}`],
      [o.teacher.rows.length === 2 && o.teacher.rows[0].startsWith('tashkeel:') && o.teacher.rows[1].startsWith('tajweed:'), `سطورُ التقرير: ${JSON.stringify(o.teacher.rows)}`],
      [o.teacher.notedWords.length >= 2, `لم تُخطّ الكلماتُ في الصفحة: ${JSON.stringify(o.teacher.notedWords)}`],
      [o.snippetSources === 1, `«تلاوتك» لم تُشغَّل من التسجيل: ${o.snippetSources}`],
      [o.teacher.mode === 'trial', `وسمُ «تجريبي» غائب: ${o.teacher.mode}`],
      [o.teacher.referenceButtons === o.teacher.rows.length, `«القارئ» ليس عند كلّ ملاحظة: ${o.teacher.referenceButtons}`],
      [o.retakeOffered >= 1, 'لم تُعرض «أعِد هذه الآية» لآيةٍ لم تتّضح'],
      [o.teacherCalls.some(c => c.segments.some(s => s.id.includes('~r'))), 'الإعادةُ لم تصل المعلّم'],
      [o.teacher.unclearLeft === o.retakeOffered - 1, `الآيةُ المعادة بقيت في «لم يتّضح»: ${o.teacher.unclearLeft}/${o.retakeOffered}`],
      [o.teacher.rows.length === 2, `الإعادةُ مسحت ملاحظاتٍ أو زادتها: ${o.teacher.rows.length}`],
    ]),
  },
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
  {
    scenario: 'judging', reciteMs: 9000, settleMs: 25_000,
    why: 'بوّابةٌ مفتوحة وكلمةٌ أُسقطت عمدًا — أتُعلَّم في موضعها؟',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
      /*
       * والكلمةُ الرابعة (الفهرس ٣) هي التي أسقطها المِشْحَن. فإن لم تُعلَّم فالربطُ
       * لا يعمل، وإن عُلّمت غيرُها فالترتيبُ أو التوقيتُ مكسور.
       */
      [o.mistakes.some(m => m.word === 3 && m.kind === 'skipped'), `لم تُعلَّم الكلمةُ الساقطة: ${JSON.stringify(o.mistakes)}`],
      [!o.mistakes.some(m => m.word < 3), `عُلّمت كلماتٌ قبلها بلا موجب: ${JSON.stringify(o.mistakes)}`],
      [o.gateNote === null, `بيانُ بوّابةٍ مغلقةٍ وهي مفتوحة: ${o.gateNote}`],
      /*
       * والصوتُ يُقاس من مسار الصوت نفسِه لا من نصّ: نغمةُ التنبيه مذبذبان. فإن
       * كان صفرًا فالطريقُ من «خطأٌ استقرّ» إلى «صوتٌ خرج» مقطوع.
       */
      [o.alertOscillators >= 2, `لم تخرج نغمةُ تنبيهٍ واحدة: ${o.alertOscillators} مذبذبًا`],
      /*
       * **ونغمةٌ واحدةٌ لا أكثر**: الخطأُ المُصطنَع واحد، والنغمةُ مذبذبان. وكان
       * الناتجُ ستّةً — ثلاثَ نغماتٍ لخطأٍ واحد — وكشف ذلك أنّ المحاذاةَ كانت
       * تُطابق أوّلَ المسموع بكلماتٍ متأخّرة، فتُعدّ الكلماتُ المقروءةُ ساقطة.
       */
      [o.alertOscillators <= 2, `نُبِّه أكثرَ من مرّة على خطأٍ واحد: ${o.alertOscillators} مذبذبًا`],
    ]),
  },
  {
    scenario: 'judging-closed', reciteMs: 7000, settleMs: 25_000,
    why: 'بوّابةٌ مغلقة — أتصمت الشاشةُ عن الحكم وتقول لماذا؟',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
      [o.mistakes.length === 0, `حُكم بلا إذن: ${JSON.stringify(o.mistakes)}`],
      [o.alertOscillators === 0, `سُمع تنبيهٌ بلا إذن: ${o.alertOscillators} مذبذبًا`],
      [!!o.gateNote && o.gateNote.includes('لم يجتز'), `لم يُقل للطالب لماذا لا يُحكم: ${o.gateNote}`],
    ]),
  },
  {
    scenario: 'judging-dropped', reciteMs: 11000, settleMs: 25_000,
    why: 'مقطعُ سماعٍ يسقط بعطبٍ عابر — أيُحكم على تلاوةٍ فيها ثقب؟',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
      /*
       * فثقبٌ في ما سُمع تقرؤه المقابلةُ إسقاطًا، فتُعلَّم كلماتٌ قرأها الطالبُ
       * صحيحةً ويُنبَّه عليها بصوت. والصوابُ ألّا يُحكم أصلًا، وأن يُقال لماذا.
       */
      [o.mistakes.length === 0, `حُكم على تلاوةٍ فيها ثقب: ${JSON.stringify(o.mistakes)}`],
      [o.alertOscillators === 0, `نُبِّه على ثقبٍ في السماع: ${o.alertOscillators} مذبذبًا`],
      [!!o.gateNote && o.gateNote.includes('انقطع سماع'), `لم يُقل للطالب إنّ السماعَ انقطع: ${o.gateNote}`],
      /* ووصفُ التلاوة يبقى يعمل: سقوطُ السماع لا يُسقط التتبّع. */
      [o.chunksServed >= 3, `انقطع التتبّعُ أيضًا: ${o.chunksServed} مقاطع`],
    ]),
  },
  {
    scenario: 'judging-changed', reciteMs: 11000, settleMs: 25_000,
    why: 'محرّكُ السماع يتبدّل في أثناء التلاوة — أتُجمع مراجعةٌ من محرّكين؟',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
      /*
       * فالإذنُ التُقط لنموذجٍ بعينه عند البدء. وجوابٌ من نموذجٍ آخر لا يُحكم به،
       * فتُطرح المحاولةُ ويُقال للطالب إنّ القياسَ تغيّر — لا إنّ السماعَ انقطع.
       */
      [o.mistakes.length === 0, `حُكم بمحرّكين معًا: ${JSON.stringify(o.mistakes)}`],
      [o.alertOscillators === 0, `نُبِّه بعد تبدّل المحرّك: ${o.alertOscillators} مذبذبًا`],
      [!!o.gateNote && o.gateNote.includes('تغيّر محرّكُ السماع'), `لم يُقل للطالب إنّ المحرّكَ تغيّر: ${o.gateNote}`],
      [o.chunksServed >= 3, `انقطع التتبّعُ أيضًا: ${o.chunksServed} مقاطع`],
      [o.attemptsStored === 1, `المراجعةُ لم تُحفظ: ${o.attemptsStored}`],
    ]),
  },
  {
    scenario: 'judging-changed-late', reciteMs: 11000, settleMs: 25_000,
    why: 'الخادمُ يكشف أنّ القياسَ تبدّل والطلبُ في الطريق — أيُحكم بجوابٍ قديم؟',
    check: o => failures(o, [
      [o.reportShown, 'لم يُعرض تقرير'],
      [o.micTracksLive === 0, `الميكروفونُ بقي مفتوحًا (${o.micTracksLive})`],
      [o.mistakes.length === 0, `حُكم بعد تبدّلٍ كشفه الخادم: ${JSON.stringify(o.mistakes)}`],
      [o.alertOscillators === 0, `نُبِّه بعد تبدّلٍ كشفه الخادم: ${o.alertOscillators} مذبذبًا`],
      [!!o.gateNote && o.gateNote.includes('تغيّر محرّكُ السماع'), `لم يُقل للطالب إنّ المحرّكَ تغيّر: ${o.gateNote}`],
      [o.chunksServed >= 3, `انقطع التتبّعُ أيضًا: ${o.chunksServed} مقاطع`],
      [o.attemptsStored === 1, `المراجعةُ لم تُحفظ: ${o.attemptsStored}`],
    ]),
  },
];

async function main() {
  let broken = 0;
  /* HARNESS_ONLY=teacher,judging يقصر التشغيلَ على سيناريوهاتٍ بعينها. */
  const only = (process.env.HARNESS_ONLY || '').split(',').filter(Boolean);
  const plans = only.length ? PLAN.filter(p => only.includes(p.scenario)) : PLAN;
  for (const plan of plans) {
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
      console.log(`    بلغ ${outcome.reachText} · مقاطع ${outcome.chunksServed} · محاولات ${outcome.attemptsStored} · ميكروفون حيّ ${outcome.micTracksLive} · نغمات ${outcome.alertOscillators}`);
    }
  }
  if (broken) {
    console.error(`\nسقط ${broken} من ${plans.length} تلاوات.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${plans.length} تلاواتٍ جرت في متصفّحٍ حقيقيّ بميكروفونٍ حقيقيّ — وكلُّها كما يجب.`);
}

void main();
