/*
 * بوابة ميزانية العدالة — Mizan Fairness Release Gate.
 *
 * يُشغَّل بالأمر `npm run fairness:gate`. يقيس السيناريو المرجعي، ثم:
 *   · إن لم يوجد خطُّ أساس: يكتبه ويخرج بصفر، ويقول صراحةً إنه لم يحكم على شيء.
 *   · إن وُجد: يقارن ويحكم. وخرقٌ قاطع واحد يمنع الإصدار مهما تحسّن غيره.
 *
 * وقاعدةٌ لا تُكسر هنا: **لا عتبات اعتباطية.** كل حدٍّ يُشتقّ من خطّ أساسٍ مُقاس. ومن لم
 * يقس خطّ أساسه فليس له أن يضع حدًّا، ولذلك تكون أول تشغيلةٍ قياسًا لا حكمًا.
 *
 * والتاريخ يُحفظ عند كل قياس، فيمكن بعد سنةٍ أن يُسأل: كيف تطوّرت عدالة ميزان؟
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { scopeFromJuz } from '../src/lib/quran-scope';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { syntheticParticipants, type TwinInput } from '../src/lib/competition-twin';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { freeDistributionPlan } from '../src/lib/question-zones';
import { QUESTION_ENGINE_VERSION } from '../src/lib/question-engine';
import { runOracleBenchmark } from '../src/lib/oracle-benchmark';
import { monteCarloStability } from '../src/lib/fairness-experiments';
import {
  appendFrontierHistory, judgeReleaseBudget,
  type BudgetMetric, type FairnessBaseline, type FrontierHistory,
} from '../src/lib/fairness-release-budget';

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) || fallback : fallback;
};
const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(42, '.')} ${value}`);

const BASELINE_PATH = join('tests', 'fixtures', 'fairness-baseline.json');
const HISTORY_PATH = join('tests', 'fixtures', 'fairness-frontier-history.json');
const SCENARIO = 'juz30-400x3-balanced';

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const juz30 = scopeFromJuz([30]);
const base: TwinInput = {
  competitionId: 'fairness-gate',
  participants: syntheticParticipants({
    count: arg('participants', 400), categoryId: 'c', questionCount: 3,
    scopes: [{ scope: juz30, share: 1 }], reading, halls: 6, prefix: 'g',
  }),
  candidates: projectCandidatesFromScope(juz30, { passageAyahCount: 3, reading }),
  defaultPlan: freeDistributionPlan(),
  repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: 6 },
  targetDifficulty: 3,
  seed: 'fairness-gate',
};

console.log('MIZAN Fairness Release Gate — قياسٌ على سيناريو مرجعي واحد، ببيانات اصطناعية.\n');

const benchmark = runOracleBenchmark({ ...base, withRegret: false, budget: { timeBudgetMs: arg('budget', 120_000) } });
const stability = monteCarloStability({ base, seeds: arg('seeds', 30) });

const metrics: Partial<Record<BudgetMetric, number>> = {
  scopeViolations: benchmark.twin.metrics.scopeViolations,
  readingViolations: benchmark.twin.metrics.readingViolations,
  duplicateWithinModelViolations: benchmark.twin.metrics.duplicateWithinModelViolations,
  duplicateForParticipantViolations: benchmark.twin.metrics.duplicateForParticipantViolations,
  failedDraws: benchmark.twin.metrics.failedDraws,
  excessOverLowerBound: benchmark.twin.metrics.excessOverLowerBound,
  maxUsesOfAnyQuestion: benchmark.twin.metrics.maxUsesOfAnyQuestion,
  totalRepeats: benchmark.twin.metrics.totalRepeats,
  maxModelDifficultyDelta: benchmark.twin.metrics.maxModelDifficultyDelta,
  selectionMillisP95: benchmark.twin.metrics.selectionMillisP95,
  ...(benchmark.twin.metrics.heapUsedMb !== undefined ? { heapUsedMb: benchmark.twin.metrics.heapUsedMb } : {}),
};

const worstOf = (metric: string) => stability.distributions.find(d => d.metric === metric)?.worst;
const multiSeedWorst: Partial<Record<BudgetMetric, number>> = {
  maxUsesOfAnyQuestion: worstOf('maxUsesOfAnyQuestion'),
  excessOverLowerBound: worstOf('excessOverLowerBound'),
  failedDraws: worstOf('failedDraws'),
  totalRepeats: worstOf('totalRepeats'),
  maxModelDifficultyDelta: worstOf('maxModelDifficultyDelta'),
};

const optimalityGap: Record<string, number | null> = {};
for (const dimension of benchmark.gap.dimensions) optimalityGap[dimension.dimension] = dimension.status === 'proven_optimal' ? dimension.gap : null;

const candidate: FairnessBaseline = {
  version: process.env.MIZAN_RELEASE_VERSION || 'working-tree',
  engineVersion: QUESTION_ENGINE_VERSION,
  recordedAt: new Date().toISOString(),
  scenario: SCENARIO,
  metrics,
  multiSeedWorst,
  optimalityGap,
};

console.log('══ القياس');
line('السيناريو', SCENARIO);
line('نسخة المحرّك', candidate.engineVersion);
for (const [key, value] of Object.entries(metrics)) line(key, value);
console.log('  — أسوأ ما رُصد على عدة بذور:');
for (const [key, value] of Object.entries(multiSeedWorst)) line(`  ${key}`, value);
console.log('  — الفجوة عن الأمثل المُثبَت:');
for (const [key, value] of Object.entries(optimalityGap)) line(`  ${key}`, value === null ? 'غير مُثبَت' : value);

/* التاريخ يُحفظ عند كل قياس، حكمنا أو لم نحكم. */
const history: FrontierHistory | null = existsSync(HISTORY_PATH) ? JSON.parse(readFileSync(HISTORY_PATH, 'utf8')) : null;
const nextHistory = appendFrontierHistory(history, {
  recordedAt: candidate.recordedAt, engineVersion: candidate.engineVersion,
  scenario: SCENARIO, metrics, optimalityGap,
  note: process.env.MIZAN_RELEASE_NOTE,
});
mkdirSync(dirname(HISTORY_PATH), { recursive: true });
writeFileSync(HISTORY_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`, 'utf8');

if (!existsSync(BASELINE_PATH) || process.argv.includes('--write-baseline')) {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  console.log(`\nكُتب خطّ الأساس في ${BASELINE_PATH}.`);
  console.log('ولم يُحكم على شيء في هذه التشغيلة: لا حكم قبل خطّ أساسٍ مُقاس، ولا عتبةَ تُخترع.');
  process.exitCode = 0;
} else {
  const baseline: FairnessBaseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const verdict = judgeReleaseBudget({ baseline, candidate, tolerance: { relative: 0.1, absolute: { maxUsesOfAnyQuestion: 0, excessOverLowerBound: 0 } } });
  console.log(`\n══ الحكم مقابل خطّ الأساس (${baseline.version} · ${baseline.recordedAt})`);
  for (const finding of verdict.findings) {
    const mark = finding.severity === 'blocking' ? '✗' : finding.severity === 'improvement' ? '↑' : finding.severity === 'warning' ? '·' : ' ';
    console.log(`  ${mark} ${finding.ar}`);
  }
  console.log(`\n${verdict.ar}`);
  process.exitCode = verdict.releasable ? 0 : 1;
}
