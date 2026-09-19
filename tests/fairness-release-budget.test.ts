import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BUDGET_METRICS, FAIRNESS_BUDGET_VERSION, frontierTrend, judgeReleaseBudget,
  type BudgetMetric, type FairnessBaseline, type FrontierHistory,
} from '../src/lib/fairness-release-budget';

/*
 * محاكمة بوّابة الإصدار نفسها.
 *
 * البوّابةُ التي تمنع الإصدار بالقرعة أسوأ من غيابها: تسقط مرةً وتجيز مرةً على الشيفرة
 * نفسها، فيتعلّم الفريقُ أن يعيد التشغيل حتى يخضرّ، ثم لا يصدّق الأحمرَ يوم يصدق.
 *
 * وقد قيس هذا فعلًا على `main` عند التلبيدة 9bc8a69: ثمانُ تشغيلاتٍ متتالية على شيفرةٍ
 * واحدة وبذرةٍ واحدة، فسقطت أربعٌ وجازت أربع — ولا فرق بينها إلا ساعةُ الآلة. وفي
 * التشغيلة الواحدة يتراوح `selectionMillisP95` على ثلاثين بذرة بين ٢ و٤، بينما العتبةُ
 * التي حُكم بها ثلاثةُ أعشار المِلّيثانية. فالعتبةُ أضيقُ من ضجيج أداتها بسبعة أضعاف.
 *
 * فهذه الاختبارات تحرس أمرين معًا، ولا يُقبل أحدهما دون الآخر:
 *   ١) أن يبقى التدهورُ الحقيقيّ مانعًا للإصدار — فليس المقصود تليينَ البوّابة.
 *   ٢) ألّا يُقرأ «لم أقس» نجاحًا، لا في الرمز ولا في نصّ الحكم.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MACHINE = 'linux/x64 · معالج المقايسة · node22';

const baselineOf = (metrics: Partial<Record<BudgetMetric, number>>, extra: Partial<FairnessBaseline> = {}): FairnessBaseline => ({
  version: 'baseline', engineVersion: 'MIZAN-QUESTION-ENGINE-1',
  recordedAt: '2026-09-12T01:27:39.231Z', scenario: 'juz30-400x3-balanced',
  machine: MACHINE, metrics, ...extra,
});

const SOUND = {
  scopeViolations: 0, readingViolations: 0,
  duplicateWithinModelViolations: 0, duplicateForParticipantViolations: 0,
  totalRepeats: 710, selectionMillisP95: 3,
} as const;

test('خرقُ وعدٍ قاطع يمنع الإصدار، ولو كان ضجيجُ الآلة واسعًا', () => {
  const verdict = judgeReleaseBudget({
    baseline: baselineOf({ ...SOUND }),
    candidate: baselineOf({ ...SOUND, readingViolations: 1 }),
    noiseBand: { selectionMillisP95: 99 },
  });
  assert.equal(verdict.releasable, false);
  assert.ok(verdict.blocking.some(f => f.metric === 'readingViolations'));
});

test('المقياسُ الخوارزمي يُحكم بخطّ الأساس وحده، ولا ينفعه نطاقُ ضجيج', () => {
  const verdict = judgeReleaseBudget({
    baseline: baselineOf({ ...SOUND }),
    candidate: baselineOf({ ...SOUND, totalRepeats: 800 }),
    noiseBand: { selectionMillisP95: 500 },
  });
  assert.equal(verdict.releasable, false, 'تكرارٌ زائد ٩٠ موضعًا تدهورٌ حقيقي لا ضجيجَ آلة');
  assert.ok(verdict.blocking.some(f => f.metric === 'totalRepeats'));
});

test('التدهورُ الزمني الحقيقي يبقى مانعًا للإصدار فوق الضجيج المقاس', () => {
  const verdict = judgeReleaseBudget({
    baseline: baselineOf({ ...SOUND }),
    candidate: baselineOf({ ...SOUND, selectionMillisP95: 12 }),
    noiseBand: { selectionMillisP95: 2 },
  });
  assert.equal(verdict.releasable, false, 'أربعةُ أضعافٍ فوق نطاق ضجيجٍ قدره ٢ أثرُ شيفرةٍ لا أثرُ آلة');
  const blocker = verdict.blocking.find(f => f.metric === 'selectionMillisP95');
  assert.ok(blocker, 'لا بدّ أن يُسمّى المانع باسمه');
  assert.match(blocker!.ar, /ضجيجُ الآلة المقاس 2/, 'ويُذكر الضجيجُ في نصّ المنع ليُراجَع الحكم');
});

test('تذبذبُ تكّةٍ واحدة داخل الضجيج المقاس لا يمنع الإصدار، ولا يُكتم', () => {
  const verdict = judgeReleaseBudget({
    baseline: baselineOf({ ...SOUND }),
    candidate: baselineOf({ ...SOUND, selectionMillisP95: 4 }),
    noiseBand: { selectionMillisP95: 2 },
  });
  assert.equal(verdict.releasable, true);
  const finding = verdict.findings.find(f => f.metric === 'selectionMillisP95');
  assert.equal(finding?.severity, 'warning', 'تدهورٌ مرصودٌ داخل الضجيج تنبيهٌ لا سكوت، وليس «كما كان»');
  assert.equal(finding?.delta, 1, 'والفرقُ يُسجَّل كما هو، لا يُصفَّر');
});

test('مقياسُ الآلة بلا ضجيجٍ مقاس لا يُحكم عليه، ولا يُقرأ نجاحًا', () => {
  const verdict = judgeReleaseBudget({
    baseline: baselineOf({ ...SOUND }),
    candidate: baselineOf({ ...SOUND, selectionMillisP95: 4 }),
  });
  assert.match(verdict.findings.find(f => f.metric === 'selectionMillisP95')!.ar, /ضجيجٍ مقاس/);
  const finding = verdict.findings.find(f => f.metric === 'selectionMillisP95');
  assert.equal(finding?.severity, 'unjudged');
  assert.match(finding!.ar, /UNVERIFIED/, 'المجهولُ يُكتب مجهولًا');
  assert.equal(verdict.unjudged.length, 1);
  assert.match(verdict.ar, /UNVERIFIED/, 'ونصُّ الحكم نفسه يحمل النقص، فلا يُقرأ اجتيازٌ ناقصٌ تامًّا');
});

test('«مقياسُ آلة» بابٌ ضيّق لا يتسلّل منه مقياسُ عدالة', () => {
  const machine = (Object.keys(BUDGET_METRICS) as BudgetMetric[]).filter(key => BUDGET_METRICS[key].machine);
  assert.deepEqual(machine.sort(), ['selectionMillisP95'],
    'الزمنُ وحده تابعٌ للآلة ويُحكم به. وأيُّ مقياسِ عدالةٍ يُوسم بها يهرب من الحكم');
  for (const key of Object.keys(BUDGET_METRICS) as BudgetMetric[]) {
    if (!BUDGET_METRICS[key].machine) continue;
    assert.equal(BUDGET_METRICS[key].hard, false, 'ولا يكون القاطعُ تابعًا للآلة أبدًا');
  }
});

test('الوعدُ القاطع لا يسقط بنطاق ضجيجٍ مهما اتّسع', () => {
  for (const key of (Object.keys(BUDGET_METRICS) as BudgetMetric[]).filter(k => BUDGET_METRICS[k].hard)) {
    const verdict = judgeReleaseBudget({
      baseline: baselineOf({ [key]: 0 }),
      candidate: baselineOf({ [key]: 1 }),
      noiseBand: { [key]: 1000 } as Partial<Record<BudgetMetric, number>>,
    });
    assert.equal(verdict.releasable, false, `${key}: خرقٌ واحد يمنع الإصدار`);
  }
});

test('أسوأُ ما رُصد على البذور يبقى مانعًا — المتوسط لا يشفع للذيل', () => {
  const verdict = judgeReleaseBudget({
    baseline: baselineOf({ ...SOUND }, { multiSeedWorst: { maxUsesOfAnyQuestion: 3 } }),
    candidate: baselineOf({ ...SOUND }, { multiSeedWorst: { maxUsesOfAnyQuestion: 4 } }),
    noiseBand: { selectionMillisP95: 2 },
  });
  assert.equal(verdict.releasable, false);
  assert.ok(verdict.blocking.some(f => f.metric === 'multi_seed_worst'));
});

test('البوّابةُ تُمرّر نطاقَ ضجيجٍ مقاسًا فعلًا، لا رقمًا مكتوبًا بيد', () => {
  const gate = readFileSync(join(ROOT, 'scripts', 'fairness-gate.ts'), 'utf8');
  assert.match(gate, /judgeReleaseBudget\(\{[\s\S]*?noiseBand/,
    'وإلا صار كلُّ مقياسِ آلةٍ UNVERIFIED صامتًا فضاع الحرس');
  assert.match(gate, /Math\.max\(\.\.\.timingTrials\) - Math\.min\(\.\.\.timingTrials\)/,
    'والنطاقُ من مدى الإعادات المقاسة، لا رقمًا يُختار');
});

test('الضجيجُ يُقاس بإحماءٍ ثم بإعادةِ العمل نفسِه — لا بتبديل البذرة', () => {
  const gate = readFileSync(join(ROOT, 'scripts', 'fairness-gate.ts'), 'utf8');

  assert.match(gate, /for \(let i = 0; i < TIMING_WARMUPS; i \+= 1\) runCompetitionTwin\(base\)/,
    'الشيفرةُ الباردة أبطأ من الدافئة ضعفين، فقياسٌ بلا إحماءٍ يقيس تهيئةَ المحرّك لا الخوارزم');
  assert.match(gate, /timingTrials\.push\(runCompetitionTwin\(base\)\.metrics\.selectionMillisP95\)/,
    'والإعاداتُ على `base` نفسِه ببذرته نفسِها: ضجيجُ الآلة لا يُقاس بعملٍ مختلف');

  const bandBlock = gate.slice(gate.indexOf('const TIMING_WARMUPS'), gate.indexOf('const noiseBand'));
  assert.doesNotMatch(bandBlock, /stability|monteCarlo/,
    'ولو أُخذ النطاقُ من `monteCarloStability` لدخل فيه اختلافُ البذرة — وهو عملٌ مختلف لا ضجيجُ آلة، فيُغتفر به تدهورٌ حقيقي');
});

test('الذاكرةُ تُرصد ولا يُحكم بها — ومدًى أوسعُ من القيمة لا يشهد بشيء', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(BUDGET_METRICS, 'heapUsedMb'), false,
    'عيّنةُ كومةٍ واحدة عند نهاية التشغيلة تصف كانسَ الذاكرة لا الخوارزم: قيست فخرجت ' +
    'تصاعديًّا من 17.8 إلى 44.1 على العمل نفسِه، فلا عتبةَ تُشتقّ من ذلك');

  const gate = readFileSync(join(ROOT, 'scripts', 'fairness-gate.ts'), 'utf8');
  assert.match(gate, /observations: \{ heapUsedMb: observedHeapMb \}/,
    'ولا تُحذف: تُسجَّل ملاحظةً في تاريخ الجبهة، فالاتّجاهُ عبر السنة يُسأل عنه');
});

test('ما لم يُحكم عليه يُرفع إلى ملخّص التشغيلة، ولا يُترك في ذيل سجلّ', () => {
  const gate = readFileSync(join(ROOT, 'scripts', 'fairness-gate.ts'), 'utf8');
  assert.match(gate, /::warning title=FAIRNESS_METRIC_UNJUDGED::/,
    'اجتيازٌ ناقصٌ مكتوبٌ في السطر الألف يُقرأ اجتيازًا تامًّا من لوحة الفحوص');
  assert.match(gate, /for \(const finding of verdict\.unjudged\)/);
});

test('زمنُ آلةٍ لا يحكم على زمن أخرى، ولو كان الضجيجُ مقاسًا', () => {
  const verdict = judgeReleaseBudget({
    baseline: baselineOf({ ...SOUND }),
    candidate: baselineOf({ ...SOUND, selectionMillisP95: 9 }, { machine: 'darwin/arm64 · آلةٌ أخرى · node22' }),
    noiseBand: { selectionMillisP95: 0.8 },
  });
  const finding = verdict.findings.find(f => f.metric === 'selectionMillisP95');
  assert.equal(finding?.severity, 'unjudged', 'الفرقُ قد يكون فرقَ عتادٍ لا فرقَ شيفرة، فلا يُحكم');
  assert.match(finding!.ar, /UNVERIFIED/);
  assert.match(finding!.ar, /--write-baseline/, 'ويُذكر طريقُ استعادة الحكم، فلا يبقى النقصُ بلا علاج');
  assert.equal(verdict.releasable, true, 'ولا يُمنع الإصدار بمقارنةٍ غير صحيحة');
});

test('اختلافُ الآلة لا يُعفي مقياسَ عدالةٍ واحدًا من الحكم', () => {
  const verdict = judgeReleaseBudget({
    baseline: baselineOf({ ...SOUND }),
    candidate: baselineOf({ ...SOUND, totalRepeats: 900, readingViolations: 1 }, { machine: 'آلةٌ أخرى تمامًا' }),
  });
  assert.equal(verdict.releasable, false);
  assert.ok(verdict.blocking.some(f => f.metric === 'readingViolations'));
  assert.ok(verdict.blocking.some(f => f.metric === 'totalRepeats'),
    'العدالةُ دالّةٌ في الخوارزم والبذرة، لا في العتاد؛ فلا يُشفع لها باختلاف الآلة');
});

test('الأداةُ تقيس بدقّةٍ دون المِلّيثانية، وإلا عاد الحكمُ قرعة', () => {
  const twin = readFileSync(join(ROOT, 'src', 'lib', 'competition-twin.ts'), 'utf8');
  const body = twin.slice(twin.indexOf('const durations'));
  assert.doesNotMatch(body, /durations\.push\(Date\.now\(\)/,
    'الساعةُ الصحيحة تُقرّب كلّ عيّنةٍ إلى ثلث قيمتها، فيتذبذب المئينُ بين ٣ و٤ بلا سببٍ في الشيفرة');
  assert.match(body, /durations\.push\(performance\.now\(\) - began\)/);
});

test('سلسلةُ الذاكرة لا تنقطع يوم انتقل الرقمُ من الحكم إلى الملاحظة', () => {
  /*
   * `heapUsedMb` كان يُكتب في `metrics` حين كان محكومًا، وصار يُكتب في `observations`
   * حين تبيّن أنه لا يصلح للحكم. ولو قرأ قارئُ التاريخ موضعًا واحدًا لانقطعت السلسلة
   * عند يوم التغيير — فيُسأل «كيف تطوّرت عبر السنة؟» فيُجاب بنصف تاريخ.
   */
  const history: FrontierHistory = {
    historyVersion: FAIRNESS_BUDGET_VERSION,
    entries: [
      { recordedAt: '2026-09-12T01:27:39.231Z', engineVersion: 'MIZAN-QUESTION-ENGINE-1',
        scenario: 'juz30-400x3-balanced', metrics: { heapUsedMb: 17.6 } as never },
      { recordedAt: '2026-09-19T19:09:44.854Z', engineVersion: 'MIZAN-QUESTION-ENGINE-1',
        scenario: 'juz30-400x3-balanced', metrics: {}, observations: { heapUsedMb: 11.6 } },
    ],
  };

  const trend = frontierTrend(history, 'juz30-400x3-balanced', 'heapUsedMb');
  assert.equal(trend.length, 2, 'النقطتان معًا: القديمةُ من `metrics` والجديدةُ من `observations`');
  assert.deepEqual(trend.map(point => point.value), [17.6, 11.6]);
});

test('السيناريو الآخر لا يتسلّل إلى السلسلة، ولا الفراغُ يُقرأ صفرًا', () => {
  const history: FrontierHistory = {
    historyVersion: FAIRNESS_BUDGET_VERSION,
    entries: [
      { recordedAt: '2026-09-19T19:00:00.000Z', engineVersion: 'e', scenario: 'سيناريو آخر',
        metrics: {}, observations: { heapUsedMb: 99 } },
      { recordedAt: '2026-09-19T19:10:00.000Z', engineVersion: 'e', scenario: 'juz30-400x3-balanced',
        metrics: {} },
    ],
  };
  assert.deepEqual(frontierTrend(history, 'juz30-400x3-balanced', 'heapUsedMb'), [],
    'قياسٌ غائبٌ يُحذف من السلسلة ولا يُلفَّق له رقم');
});
