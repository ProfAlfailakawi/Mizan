/*
 * مختبر الخصومة والاستقرار — Mizan Adversarial & Stability Lab.
 *
 * يُشغَّل بالأمر `npm run fairness:adversarial`. بياناتٌ اصطناعية بالكامل.
 *
 * ستّة أسئلة لا يجيب عنها تشغيلٌ واحد ببذرةٍ واحدة:
 *   ١) هل النتيجة مستقرّة على مئات البذور، أم متوسّطٌ جميل فوق ذيلٍ ثقيل؟
 *   ٢) كم من العدالة يملكه ترتيبُ وصول المتسابقين وحده؟
 *   ٣) وما أسوأ ترتيبٍ يمكن أن يقع؟ (بحثٌ لا عشوائيةٌ)
 *   ٤) هل كل طبقة ذكاءٍ في المحرّك تُحسّن النتيجة فعلًا، أم بعضها زينة؟
 *   ٥) هل يقلب تحريك وزنٍ بخمسة في المئة آلافَ القرارات؟
 *   ٦) ما التهيئة التي تجعل المشكلة أسوأ ما يمكن؟ وهل تُحفظ لئلا تعود؟
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scopeFromJuz, scopeFromJuzRange, scopeUnion } from '../src/lib/quran-scope';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { syntheticParticipants, runCompetitionTwin, type TwinInput } from '../src/lib/competition-twin';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { autoBalancedPlan, freeDistributionPlan } from '../src/lib/question-zones';
import {
  DEFAULT_ADVERSARIAL_FITNESS, adversarialTournamentSearch, allocationAblation, monteCarloStability,
  participantOrderSensitivity, seededRandom, weightSensitivity, worstCaseArrivalSearch,
} from '../src/lib/fairness-experiments';
import { buildCounterexampleFixture, judgeFixture } from '../src/lib/counterexample-fixtures';

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const arg = (name: string, fallback: number) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) || fallback : fallback;
};
const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(42, '.')} ${value}`);

const juz30 = scopeFromJuz([30]);
const pool = projectCandidatesFromScope(juz30, { passageAyahCount: 3, reading });

const base: TwinInput = {
  competitionId: 'adversarial-base',
  participants: syntheticParticipants({
    count: arg('participants', 300), categoryId: 'c', questionCount: 3,
    scopes: [{ scope: juz30, share: 1 }], reading, halls: 6, prefix: 'x',
  }),
  candidates: pool,
  defaultPlan: freeDistributionPlan(),
  repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: 6 },
  targetDifficulty: 3,
  seed: 'adversarial-base',
};

console.log('MIZAN Adversarial & Stability Lab — بيانات اصطناعية بالكامل.\n');

/* ١) استقرار مونتي كارلو */
console.log('══ استقرار مونتي كارلو');
const seeds = arg('seeds', 120);
const stability = monteCarloStability({ base, seeds });
line('عدد البذور', stability.seeds);
for (const distribution of stability.distributions) {
  const top = distribution.histogram.slice(0, 4).map(bucket => `${bucket.value}: ${bucket.share}%`).join(' · ');
  console.log(`  ${distribution.metric.padEnd(28, '.')} الوسيط ${String(distribution.median).padStart(8)} · ص٩٥ ${String(distribution.p95).padStart(8)} · أسوأ ${String(distribution.worst).padStart(8)} · تباين ${distribution.variance}`);
  if (top) console.log(`      توزيع القيم: ${top}`);
}
line('بذرة أسوأ «أكثر استعمال»', stability.worstSeedByMetric.maxUsesOfAnyQuestion);

/* ٢) حساسية الترتيب */
console.log('\n══ حساسية ترتيب الوصول');
const order = participantOrderSensitivity({ base });
for (const row of order.rows) {
  console.log(`  ${row.order.padEnd(20, '.')} أكثر استعمال ${String(row.metrics.maxUsesOfAnyQuestion).padStart(4)} · فوق الحدّ ${String(row.metrics.excessOverLowerBound).padStart(4)} · فارق صعوبة ${row.metrics.maxModelDifficultyDelta}`);
}
for (const [metric, spread] of Object.entries(order.spread)) {
  if (spread.delta > 0) line(`ما يملكه الترتيب في ${metric}`, `${spread.min} … ${spread.max} (فرق ${spread.delta}، أسوأه ${spread.worstOrder})`);
}

/* ٣) أسوأ ترتيب وصول */
console.log('\n══ البحث عن أسوأ ترتيب وصول');
const worstArrival = worstCaseArrivalSearch({ base, iterations: arg('arrival', 40), metric: 'excessOverLowerBound' });
line('الأساس (ترتيب التسجيل)', worstArrival.baseline);
line('أسوأ ما وُجد', worstArrival.worst);
line('ندم الترتيب', worstArrival.delta);
line('عدد المحاولات', worstArrival.iterations);

/* ٤) استئصال الطبقات */
console.log('\n══ استئصال طبقات الذكاء (هل كلٌّ منها يشتري شيئًا؟)');
const ablation = allocationAblation({ base });
for (const row of ablation.rows) {
  if (row.layer === 'none') { line(row.ar, `أكثر استعمال ${row.metrics.maxUsesOfAnyQuestion} · فوق الحدّ ${row.metrics.excessOverLowerBound} · فارق صعوبة ${row.metrics.maxModelDifficultyDelta}`); continue; }
  const changes = Object.entries(row.deltaFromFull).filter(([, value]) => Math.abs(value) > 1e-9).map(([metric, value]) => `${metric} ${value > 0 ? '+' : ''}${value}`);
  line(row.ar, changes.length ? changes.join(' · ') : 'لا أثر مقيس');
}
line('طبقات بلا أثر مقيس', ablation.inertLayers.length ? ablation.inertLayers.join('، ') : 'لا شيء');

/* ٥) حساسية الأوزان */
console.log('\n══ حساسية الأوزان');
const sensitivity = weightSensitivity({ base, deltas: [-20, -10, -5, 5, 10, 20] });
const byWeight = new Map<string, number>();
for (const hit of sensitivity.highSensitivity) byWeight.set(hit.weight, (byWeight.get(hit.weight) || 0) + 1);
if (!byWeight.size) console.log('  لا وزنَ يقلب النتيجة قلبًا كبيرًا في المدى المفحوص — النتيجة صلبة في هذا السيناريو.');
for (const [weight, count] of [...byWeight.entries()].sort((a, b) => b[1] - a[1])) {
  const worst = sensitivity.highSensitivity.filter(hit => hit.weight === weight).reduce((a, b) => (Math.abs(b.change) > Math.abs(a.change) ? b : a));
  line(`حساسية عالية · ${weight}`, `${count} إصابة · أشدّها ${worst.metric} بتغيّر ${worst.change} عند ${worst.atPercent}٪`);
}

/* ٦) البحث الخصومي وحصاد الشواهد المضادّة */
console.log('\n══ البحث الخصومي');
interface Config { participants: number; questionCount: number; scopeMix: number; halls: number; maxUses: number; seedIndex: number }
const scopes = [
  scopeFromJuz([30]),
  scopeFromJuzRange(29, 30),
  scopeUnion(scopeFromJuz([30]), scopeFromJuz([29])),
  scopeFromJuzRange(28, 30),
];
const inputOf = (config: Config): TwinInput => {
  const scope = scopes[config.scopeMix % scopes.length];
  return {
    competitionId: `adv-${config.seedIndex}`,
    participants: syntheticParticipants({
      count: config.participants, categoryId: 'c', questionCount: config.questionCount,
      scopes: [{ scope, share: 1 }], reading, halls: config.halls, prefix: `adv${config.seedIndex}`,
    }),
    candidates: projectCandidatesFromScope(scope, { passageAyahCount: 3, reading }),
    defaultPlan: config.questionCount > 2 ? autoBalancedPlan(scope, config.questionCount) : freeDistributionPlan(),
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: config.maxUses },
    targetDifficulty: 3,
    seed: `adv-${config.seedIndex}`,
  };
};
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Math.round(value)));
const search = adversarialTournamentSearch<Config>({
  seed: 'mizan-adversarial',
  populationSeeds: arg('population', 6),
  iterations: arg('iterations', 30),
  harvestThreshold: arg('harvest', 40),
  generate: (random, index) => {
    const config: Config = {
      participants: clamp(100 + random() * 400, 40, 600),
      questionCount: clamp(1 + random() * 5, 1, 6),
      scopeMix: Math.floor(random() * scopes.length),
      halls: clamp(1 + random() * 10, 1, 12),
      maxUses: clamp(1 + random() * 6, 1, 8),
      seedIndex: index,
    };
    return { config, input: inputOf(config) };
  },
  mutate: (config, random) => {
    const mutated: Config = {
      ...config,
      participants: clamp(config.participants * (0.7 + random() * 0.8), 40, 700),
      questionCount: clamp(config.questionCount + (random() < 0.5 ? -1 : 1), 1, 6),
      halls: clamp(config.halls + (random() < 0.5 ? -2 : 2), 1, 14),
      maxUses: clamp(config.maxUses + (random() < 0.5 ? -1 : 1), 1, 8),
      seedIndex: config.seedIndex + 1000,
    };
    return { config: mutated, input: inputOf(mutated) };
  },
});
line('تهيئات فُحصت', search.configurationsSearched);
line('لياقة الأساس', search.baselineFitness.toFixed(2));
line('أسوأ لياقة وُجدت', search.bestFitness.toFixed(2));
if (search.worstConfig) {
  line('أسوأ تهيئة', JSON.stringify(search.worstConfig));
  const m = search.worstMetrics!;
  line('عندها', `سحوب فاشلة ${m.failedDraws} · فوق الحدّ ${m.excessOverLowerBound} · تكرار ${m.totalRepeats} · فارق صعوبة ${m.maxModelDifficultyDelta}`);
  line('خروقات قاطعة عندها', `نطاق ${m.scopeViolations} · رواية ${m.readingViolations} · تكرار في النموذج ${m.duplicateWithinModelViolations}`);
}

/*
 * حصاد الشاهد المضادّ.
 *
 * لا تُحفظ كلُّ تهيئةٍ سيئة — أكثرها ضغطٌ مشروع يُنتج تكرارًا حتميًا، وذلك ليس عطبًا.
 * إنما يُحفظ ما يكشف **خرقًا قاطعًا** أو تجاوزًا كبيرًا للحدّ الرياضي، لأن هذا وحده ما
 * يجب ألّا يعود بعد ستة أشهر.
 */
console.log('\n══ حصاد الشواهد المضادّة');
const worthKeeping = search.harvested.filter(row =>
  row.metrics.scopeViolations > 0 || row.metrics.readingViolations > 0
  || row.metrics.duplicateWithinModelViolations > 0 || row.metrics.duplicateForParticipantViolations > 0
  || row.metrics.excessOverLowerBound > arg('excess', 2));
line('تهيئات تجاوزت عتبة الإبلاغ', search.harvested.length);
line('منها ما يستحق الحفظ', worthKeeping.length);

if (worthKeeping.length && process.argv.includes('--write-fixtures')) {
  const dir = join('tests', 'fixtures', 'fairness-counterexamples');
  mkdirSync(dir, { recursive: true });
  let written = 0;
  for (const row of worthKeeping.slice(0, arg('maxFixtures', 3))) {
    const input = inputOf(row.config);
    const fixture = await buildCounterexampleFixture({
      id: `adversarial-${row.config.seedIndex}`,
      discoveredBy: 'adversarial_search',
      twinInput: input,
      failure: {
        code: row.metrics.scopeViolations > 0 ? 'SCOPE_VIOLATION' : 'EXCESS_OVER_LOWER_BOUND',
        ar: `تهيئةٌ خصومية أخرجت فوق الحدّ الرياضي ${row.metrics.excessOverLowerBound} وخروقات نطاق ${row.metrics.scopeViolations}.`,
        en: `An adversarial configuration produced excess ${row.metrics.excessOverLowerBound} over the bound and ${row.metrics.scopeViolations} scope violations.`,
        observed: row.metrics.excessOverLowerBound,
        expected: 0,
      },
      expectedInvariant: { id: 'excess_over_bound', ar: 'لا تجاوز على الحدّ الرياضي فوق المسموح', metric: 'excessOverLowerBound', comparator: 'lte', threshold: arg('excess', 2) },
    });
    writeFileSync(join(dir, `${fixture.id}.json`), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    written++;
    const replay = runCompetitionTwin(input);
    console.log(`  ${judgeFixture(fixture, replay.metrics).ar}`);
  }
  line('شواهد كُتبت', written);
} else if (worthKeeping.length) {
  console.log('  (أضف --write-fixtures لحفظها في tests/fixtures/fairness-counterexamples)');
}

/* الخروج: خرقٌ قاطع واحد يكفي لإسقاط التشغيلة. */
const hardViolation = [...search.harvested, { metrics: runCompetitionTwin(base).metrics, config: null, fitness: 0 }]
  .some(row => row.metrics.scopeViolations > 0 || row.metrics.readingViolations > 0
    || row.metrics.duplicateWithinModelViolations > 0 || row.metrics.duplicateForParticipantViolations > 0);
console.log(`\n${hardViolation ? 'سقط: خرقٌ قاطع ظهر في البحث الخصومي.' : 'لم يظهر خرقٌ قاطع في أي تهيئة فُحصت.'}`);
process.exitCode = hardViolation ? 1 : 0;

/* مولّدٌ حتمي مستعمل أعلاه — يُصدَّر ذكره هنا لئلا يُظنّ العشوائيُّ في هذا الملف حقيقيًا. */
void seededRandom;
void DEFAULT_ADVERSARIAL_FITNESS;
