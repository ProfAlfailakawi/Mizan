import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDemand, buildDemandGroups, buildGroupScarcityOracle, buildScarcityOracle, forecastFirstRepeat, recommendPolicy, zoneAwareReuseLowerBound } from '../src/lib/scope-demand';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { fullQuranScope, scopeFromJuz, scopeFromJuzRange, scopeSignature } from '../src/lib/quran-scope';
import { DEFAULT_REPEAT_POLICY, STRICT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { QuestionAllocationEngine, candidatesInScope, locusKeyOf, uniqueLocusCount } from '../src/lib/question-engine';
import { autoBalancedPlan, freeDistributionPlan, resolveZoneSlots } from '../src/lib/question-zones';

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const candidates = projectCandidatesFromScope(fullQuranScope(), { passageAyahCount: 3, reading });

/*
 * الندرة ليست رقمًا تزيينيًا: هي التي تمنع أن يُستهلك المورد الوحيد لثلاثين متسابقًا قادمًا
 * على متسابقٍ حاضرٍ يملك آلاف البدائل.
 */

test('demand analysis clusters identical scopes and measures each cluster on its own supply', () => {
  const participants = [
    ...Array.from({ length: 600 }, (_, i) => ({ participantId: `a${i}`, categoryId: 'c1', scope: scopeFromJuz([1]), questionCount: 3 })),
    ...Array.from({ length: 100 }, (_, i) => ({ participantId: `b${i}`, categoryId: 'c1', scope: fullQuranScope(), questionCount: 3 })),
  ];
  const analysis = analyzeDemand({ participants, candidates });
  assert.equal(analysis.clusters.length, 2, 'six hundred identical scopes are one cluster, not six hundred');
  const narrow = analysis.clusters.find(c => c.participantCount === 600)!;
  const wide = analysis.clusters.find(c => c.participantCount === 100)!;
  assert.equal(narrow.demand, 1800);
  assert.ok(narrow.supply < 200, 'juz one has a small supply');
  assert.ok(narrow.pressure > wide.pressure, 'the crowded narrow scope carries the higher pressure');
  assert.equal(narrow.sufficientForStrictNoRepeat, false);
  assert.equal(wide.sufficientForStrictNoRepeat, true);
  assert.equal(analysis.participantCount, 700);
});

test('the juz heat map reports participants, supply and exhaustion risk per juz', () => {
  const participants = Array.from({ length: 1000 }, (_, i) => ({ participantId: `p${i}`, categoryId: 'c1', scope: scopeFromJuz([1]), questionCount: 3 }));
  const analysis = analyzeDemand({ participants, candidates });
  assert.equal(analysis.juzHeat.length, 30);
  const first = analysis.juzHeat[0], tenth = analysis.juzHeat[9];
  assert.equal(first.participantCount, 1000);
  assert.equal(tenth.participantCount, 0, 'a juz nobody chose shows no demand');
  assert.equal(tenth.exhaustionRisk, 'none');
  assert.equal(first.exhaustionRisk, 'critical');
  assert.ok(first.supply > 0 && first.demand > first.supply);
});

test('the forecast says how many draws fit before repetition becomes unavoidable', () => {
  const participants = Array.from({ length: 1000 }, (_, i) => ({ participantId: `p${i}`, categoryId: 'c1', scope: scopeFromJuz([1]), questionCount: 3 }));
  const analysis = analyzeDemand({ participants, candidates });
  const forecast = forecastFirstRepeat(analysis);
  assert.ok(forecast.cluster, 'the binding cluster is named');
  assert.equal(forecast.drawsBeforeFirstRepeat, forecast.cluster!.supply);
  assert.ok(forecast.drawsBeforeFirstRepeat < analysis.totalDraws);
});

test('policy recommendations are numeric and name the shortfall, and strict mode is called impossible', () => {
  const participants = Array.from({ length: 1000 }, (_, i) => ({ participantId: `p${i}`, categoryId: 'c1', scope: scopeFromJuz([1]), questionCount: 3 }));
  const analysis = analyzeDemand({ participants, candidates });
  const strict = recommendPolicy(analysis, STRICT_REPEAT_POLICY);
  const critical = strict.find(x => x.id === 'strict_impossible');
  assert.ok(critical, 'strict no-repeat against a small pool is reported as critical');
  assert.equal(critical!.severity, 'critical');
  assert.ok(critical!.ar.includes('غير ممكن'));
  assert.ok(strict.some(x => x.action?.kind === 'add_loci' && x.action.value > 0), 'it says how many loci would remove the shortfall');
  assert.ok(recommendPolicy(analysis, DEFAULT_REPEAT_POLICY).some(x => x.action?.kind === 'reserve'));
});

test('scarcity pressure is higher for loci only a crowded narrow scope can use', () => {
  const participants = [
    ...Array.from({ length: 500 }, (_, i) => ({ participantId: `w${i}`, categoryId: 'c1', scope: fullQuranScope(), questionCount: 3 })),
    ...Array.from({ length: 30 }, (_, i) => ({ participantId: `n${i}`, categoryId: 'c2', scope: scopeFromJuz([30]), questionCount: 3 })),
  ];
  const analysis = analyzeDemand({ participants, candidates });
  const oracle = buildScarcityOracle(analysis, candidates);
  const rare = candidatesInScope(candidates, scopeFromJuz([30]))[0];
  const abundant = candidatesInScope(candidates, scopeFromJuz([15]))[0];
  assert.ok(oracle.pressureOfLocus(locusKeyOf(rare)) > oracle.pressureOfLocus(locusKeyOf(abundant)), 'the contested narrow-scope locus is marked scarcer');
});

test('future contestants keep their scarce loci: a wide-scope participant is steered away', () => {
  /* خمسمئة متسابق نطاقهم المصحف كله، وثلاثون نطاقهم الجزء الثلاثون وحده.
     السؤال: هل يستهلك أصحابُ المصحف كله مواضعَ الجزء الثلاثين وهم يملكون ستة آلاف بديل؟ */
  const wide = Array.from({ length: 500 }, (_, i) => ({ participantId: `w${i}`, categoryId: 'c1', scope: fullQuranScope(), questionCount: 3 }));
  const narrow = Array.from({ length: 30 }, (_, i) => ({ participantId: `n${i}`, categoryId: 'c2', scope: scopeFromJuz([30]), questionCount: 3 }));
  const analysis = analyzeDemand({ participants: [...wide, ...narrow], candidates });
  const rareKeys = new Set(candidatesInScope(candidates, scopeFromJuz([30])).map(locusKeyOf));

  const run = (protect: boolean) => {
    const oracle = protect ? buildScarcityOracle(analysis, candidates) : undefined;
    const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'scarcity-seed', scarcity: oracle });
    let consumed = 0;
    wide.forEach((p, index) => {
      const { slots } = resolveZoneSlots({ plan: freeDistributionPlan(), effectiveScope: p.scope, questionCount: 3 });
      const baseline = oracle ? Math.min(...candidates.map(c => oracle.pressureOfLocus(locusKeyOf(c)))) : 0;
      const result = engine.selectForParticipant({ participantId: p.participantId, effectiveScope: p.scope, slots, reading, sequencePosition: index, scarcityBaseline: baseline }, candidates);
      consumed += result.questions.filter(q => rareKeys.has(locusKeyOf(q.candidate))).length;
    });
    return consumed;
  };

  const withProtection = run(true);
  const withoutProtection = run(false);
  assert.ok(withProtection < withoutProtection, `protection reduces scarce-locus consumption (${withProtection} vs ${withoutProtection})`);
});

test('the zone-aware lower bound is tighter and more honest than draws divided by loci', () => {
  const participants = [
    ...Array.from({ length: 1000 }, (_, i) => ({ participantId: `a${i}`, categoryId: 'c1', scope: scopeFromJuzRange(1, 5), questionCount: 5 })),
    ...Array.from({ length: 1000 }, (_, i) => ({ participantId: `b${i}`, categoryId: 'c1', scope: fullQuranScope(), questionCount: 5 })),
  ];
  const analysis = analyzeDemand({ participants, candidates });
  const bound = zoneAwareReuseLowerBound({
    clusters: analysis.clusters, candidates,
    planFor: () => autoBalancedPlan(fullQuranScope(), 5),
    questionCountFor: () => 5,
  });
  const naive = Math.ceil(analysis.totalDraws / uniqueLocusCount(candidates));
  assert.ok(bound.minimumMaxUses > naive, `the zone-aware bound (${bound.minimumMaxUses}) exceeds the naive one (${naive}) because a narrow scope cannot borrow a distant locus`);
  assert.ok(bound.bindingGroupLabel.length > 0, 'the binding demand group is named so the bottleneck is actionable');
  assert.ok(bound.bindingSupply > 0 && bound.bindingDemand > 0);
});

test('demand groups split a cluster by zone, so a crowded band is visible', () => {
  const analysis = analyzeDemand({
    participants: Array.from({ length: 100 }, (_, i) => ({ participantId: `p${i}`, categoryId: 'c1', scope: scopeFromJuzRange(1, 10), questionCount: 5 })),
    candidates,
  });
  const groups = buildDemandGroups({ clusters: analysis.clusters, candidates, planFor: () => autoBalancedPlan(scopeFromJuzRange(1, 10), 5), questionCountFor: () => 5 });
  assert.equal(groups.length, 5, 'one cluster over five zones is five demand groups');
  for (const group of groups) { assert.equal(group.demand, 100); assert.ok(group.supply > 0); }
  const oracle = buildGroupScarcityOracle(groups, candidates);
  assert.ok(oracle.pressureOfLocus(locusKeyOf(candidatesInScope(candidates, scopeFromJuzRange(1, 10))[0])) > 0);
});

test('scope signatures make the cluster the unit of computation', () => {
  assert.equal(scopeSignature(scopeFromJuzRange(1, 5)), scopeSignature(scopeFromJuz([1, 2, 3, 4, 5])));
});
