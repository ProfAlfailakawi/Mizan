/*
 * مختبر عدالة ميزان — Mizan Fairness Lab.
 *
 * سيناريوهات تشغيل كاملة على بيانات اصطناعية بالكامل، بالمحرك نفسه الذي يعمل يوم المسابقة.
 * لا يمسّ بيانات تشغيل ولا يكتب شيئًا: يُشغَّل بالأمر `npm run fairness:lab` فيطبع الأرقام.
 *
 * لا تُستعمل هنا بيانات أشخاص حقيقيين — المتسابقون أرقامٌ مولَّدة ولا أسماء لهم.
 */

import { fullQuranScope, scopeFromJuz, scopeFromJuzRange, scopeFromSurahs, scopeUnion, describeScope } from '../src/lib/quran-scope';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { runCompetitionTwin, syntheticParticipants, type TwinResult } from '../src/lib/competition-twin';
import { DEFAULT_REPEAT_POLICY, STRICT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { autoBalancedPlan, freeDistributionPlan } from '../src/lib/question-zones';

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const arg = (name: string, fallback: number) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) || fallback : fallback;
};

const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(38, '.')} ${value}`);

function report(title: string, result: TwinResult) {
  const m = result.metrics;
  console.log(`\n══ ${title}`);
  line('participants', m.participants);
  line('draws', m.draws);
  line('success rate', `${(m.successRate * 100).toFixed(2)}%`);
  line('failed draws', m.failedDraws);
  line('distinct questions used', m.uniqueQuestionsUsed);
  line('total repeats', m.totalRepeats);
  line('unavoidable repeats (mathematical)', m.unavoidableRepeats);
  line('avoidable repeats (algorithmic)', m.avoidableRepeats);
  line('max uses of any question', m.maxUsesOfAnyQuestion);
  line('min uses of any used question', m.minUsesOfAnyQuestion);
  line('mathematical floor for max uses', m.theoreticalMinimumMaxUses);
  line('excess over the floor', m.excessOverLowerBound);
  line('binding bottleneck', m.reuseLowerBound.bindingGroupLabel || '—');
  line('reuse dispersion', m.reuseDispersion);
  line('SCOPE VIOLATIONS', m.scopeViolations);
  line('READING VIOLATIONS', m.readingViolations);
  line('duplicate within model', m.duplicateWithinModelViolations);
  line('duplicate for same participant', m.duplicateForParticipantViolations);
  line('average model difficulty', m.averageModelDifficulty);
  line('max model difficulty delta', m.maxModelDifficultyDelta);
  line('selection p50 / p95 / p99 (ms)', `${m.selectionMillisP50} / ${m.selectionMillisP95} / ${m.selectionMillisP99}`);
  line('heap used (MB)', m.heapUsedMb ?? '—');
  line('wall clock (ms)', result.runtimeMs);
  const clean = m.scopeViolations === 0 && m.readingViolations === 0 && m.duplicateWithinModelViolations === 0 && m.duplicateForParticipantViolations === 0;
  console.log(`  → ${clean ? 'PASS — no question left its owner\'s range' : 'FAIL — integrity violations present'}`);
  return clean;
}

function singleJuzScenario(count: number) {
  const juz1 = scopeFromJuz([1]);
  const candidates = projectCandidatesFromScope(juz1, { passageAyahCount: 3, reading });
  const participants = syntheticParticipants({ count, categoryId: 'lab-local', questionCount: 3, scopes: [{ scope: juz1, share: 1 }], reading, halls: 6, prefix: 'lab1' });
  return runCompetitionTwin({
    competitionId: 'fairness-lab-single-juz', participants, candidates,
    defaultPlan: autoBalancedPlan(juz1, 3),
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', minimumParticipantGap: 40 },
    targetDifficulty: 3, seed: 'fairness-lab-single-juz',
  });
}

function mixedScenario(count: number, label: string) {
  const full = fullQuranScope();
  const candidates = projectCandidatesFromScope(full, { passageAyahCount: 3, reading });
  const scopes = [
    { scope: full, share: 25 },
    { scope: scopeFromJuzRange(23, 30), share: 15 },
    { scope: scopeFromJuzRange(1, 5), share: 15 },
    { scope: scopeFromJuzRange(10, 20), share: 15 },
    { scope: scopeUnion(scopeFromJuz([1, 3, 7, 12, 26]), scopeFromSurahs([19, 36])), share: 10 },
    { scope: scopeFromJuz([30]), share: 10 },
    { scope: scopeFromJuzRange(16, 30), share: 10 },
  ];
  const participants = syntheticParticipants({ count, categoryId: 'lab-mixed', questionCount: 5, scopes, reading, halls: 40, prefix: label });
  return runCompetitionTwin({
    competitionId: `fairness-lab-${label}`, participants, candidates,
    defaultPlan: autoBalancedPlan(full, 5),
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', minimumParticipantGap: 80 },
    targetDifficulty: 3, seed: `fairness-lab-${label}`,
  });
}

function starvationScenario() {
  const juz30 = scopeFromJuz([30]);
  const candidates = projectCandidatesFromScope(juz30, { passageAyahCount: 3, reading });
  const participants = syntheticParticipants({ count: 400, categoryId: 'lab-strict', questionCount: 3, scopes: [{ scope: juz30, share: 1 }], reading, prefix: 'labs' });
  return runCompetitionTwin({
    competitionId: 'fairness-lab-strict', participants, candidates, defaultPlan: freeDistributionPlan(),
    repeatPolicy: STRICT_REPEAT_POLICY, targetDifficulty: 3, seed: 'fairness-lab-strict',
  });
}

const scale = arg('scale', 0);
console.log('MIZAN Fairness Lab — synthetic data only, no production state is touched.');
const results: boolean[] = [];
results.push(report(`1,000 participants, one juz, forced repetition · ${describeScope(scopeFromJuz([1]), false)}`, singleJuzScenario(arg('single', 1000))));
results.push(report('5,000 participants, mixed and overlapping ranges', mixedScenario(arg('mixed', 5000), 'mixed5k')));
if (scale >= 10000 || arg('large', 0) > 0) results.push(report('10,000 participants, mixed ranges', mixedScenario(arg('large', 10000), 'mixed10k')));
const strict = starvationScenario();
console.log(`\n══ strict no-repeat against a pool that cannot serve it`);
line('failed draws (expected > 0)', strict.metrics.failedDraws);
line('max uses of any question (expected 1)', strict.metrics.maxUsesOfAnyQuestion);
console.log(`  → ${strict.metrics.failedDraws > 0 && strict.metrics.maxUsesOfAnyQuestion === 1 ? 'PASS — the shortage is reported, nothing is repeated to hide it' : 'FAIL'}`);
results.push(strict.metrics.failedDraws > 0 && strict.metrics.maxUsesOfAnyQuestion === 1);

console.log(`\n${results.every(Boolean) ? 'ALL SCENARIOS PASSED' : 'SOME SCENARIOS FAILED'}`);
process.exitCode = results.every(Boolean) ? 0 : 1;
