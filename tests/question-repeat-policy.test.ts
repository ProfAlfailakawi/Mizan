import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REPEAT_POLICY, STRICT_REPEAT_POLICY, describeRepeatPolicy, repeatConstraints, theoreticalRepeatFloor } from '../src/lib/repeat-policy';
import { QuestionAllocationEngine, locusKeyOf, uniqueLocusCount, candidatesInScope } from '../src/lib/question-engine';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { resolveZoneSlots, freeDistributionPlan, autoBalancedPlan } from '../src/lib/question-zones';
import { scopeFromJuz, scopeFromJuzRange, fullQuranScope, scopeAyahCount } from '../src/lib/quran-scope';

/*
 * Mizan does not promise zero repetition when mathematically impossible.
 * الاختبار هنا يثبت ثلاثة أشياء: أن القيود القاطعة لا تُخرَق أبدًا، وأن التكرار الحتمي
 * لا يُوقِف النظام، وأن الحمل يوزَّع قريبًا من الحدّ الرياضي لا عشوائيًا.
 */

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const juz1 = scopeFromJuz([1]);
const pool = projectCandidatesFromScope(juz1, { passageAyahCount: 3, reading });

function draw(engine: QuestionAllocationEngine, participantId: string, scope = juz1, questionCount = 3, position?: number) {
  const { slots } = resolveZoneSlots({ plan: freeDistributionPlan(), effectiveScope: scope, questionCount });
  return engine.selectForParticipant({ participantId, effectiveScope: scope, slots, reading, sequencePosition: position }, candidatesInScope(pool, scope));
}

test('constraint ranks are declared: MUST invalidates, PREFER is recorded when relaxed', () => {
  const constraints = repeatConstraints(DEFAULT_REPEAT_POLICY);
  const must = constraints.filter(c => c.rank === 'MUST').map(c => c.id);
  assert.ok(must.includes('participant_scope'), 'staying inside the participant scope is a MUST');
  assert.ok(must.includes('reading_context'));
  assert.ok(must.includes('no_repeat_for_participant'));
  assert.ok(constraints.some(c => c.rank === 'PREFER' && c.id === 'usage_balance'));
  assert.ok(describeRepeatPolicy(DEFAULT_REPEAT_POLICY, true).includes('لا يعيد السؤال إلا'));
});

test('the theoretical floor separates unavoidable repetition from algorithmic waste', () => {
  const floor = theoreticalRepeatFloor({ draws: 3000, uniqueLoci: 180 });
  assert.equal(floor.feasibleWithoutRepeat, false);
  assert.equal(floor.minimumMaxUses, 17, '3000 draws over 180 loci force at least 17 uses of some locus');
  assert.equal(floor.unavoidableRepeats, 2820);
  assert.ok(Math.abs(floor.averageReuse - 16.667) < 0.01);
  assert.equal(theoreticalRepeatFloor({ draws: 100, uniqueLoci: 500 }).feasibleWithoutRepeat, true);
});

test('a participant never receives the same locus twice, within a model or across rounds', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'seed-a' });
  const first = draw(engine, 'p-1', juz1, 5, 0);
  const keys = first.questions.map(q => locusKeyOf(q.candidate));
  assert.equal(new Set(keys).size, keys.length, 'no locus repeats inside one model');
  const second = draw(engine, 'p-1', juz1, 5, 1);
  for (const q of second.questions) assert.ok(!keys.includes(locusKeyOf(q.candidate)), 'the second round never returns a locus the participant already had');
});

test('strict no-repeat stops when the pool runs out instead of repeating silently', () => {
  const engine = new QuestionAllocationEngine({ policy: STRICT_REPEAT_POLICY, seed: 'seed-strict' });
  const supply = uniqueLocusCount(pool);
  let served = 0, starved = 0;
  for (let i = 0; i < Math.ceil(supply / 3) + 5; i++) {
    const result = draw(engine, `p-${i}`, juz1, 3, i);
    served += result.questions.length;
    starved += result.failures.length;
  }
  assert.ok(served <= supply, 'strict mode never issues more questions than there are loci');
  assert.ok(starved > 0, 'and it reports the shortage rather than repeating');
  assert.equal(engine.statistics().maxUsesOfAnyLocus, 1);
});

test('when repetition is unavoidable the load lands within one use of the mathematical floor', () => {
  const engine = new QuestionAllocationEngine({ policy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', minimumParticipantGap: 30 }, seed: 'seed-balance' });
  const participants = 300, questionCount = 3;
  for (let i = 0; i < participants; i++) draw(engine, `p-${i}`, juz1, questionCount, i);
  const stats = engine.statistics();
  const floor = theoreticalRepeatFloor({ draws: participants * questionCount, uniqueLoci: stats.uniqueLociUsed });
  assert.equal(stats.totalDraws, participants * questionCount);
  assert.ok(stats.maxUsesOfAnyLocus <= floor.minimumMaxUses + 1, `max uses ${stats.maxUsesOfAnyLocus} is within one of the floor ${floor.minimumMaxUses}`);
  assert.ok(stats.maxUsesOfAnyLocus - stats.minUsesOfAnyLocus <= 2, 'no question carries another question\'s load');
  assert.ok(stats.reuseDispersion < 0.1, `reuse is evenly spread (dispersion ${stats.reuseDispersion})`);
});

test('a hard usage ceiling is never exceeded', () => {
  const engine = new QuestionAllocationEngine({ policy: { ...DEFAULT_REPEAT_POLICY, maxUsesPerQuestion: 2 }, seed: 'seed-cap' });
  for (let i = 0; i < 120; i++) draw(engine, `p-${i}`, juz1, 3, i);
  assert.ok(engine.statistics().maxUsesOfAnyLocus <= 2, 'the configured ceiling holds');
});

test('neighbourhood radius keeps two questions in one model from starting beside each other', () => {
  const radius = 8;
  const engine = new QuestionAllocationEngine({ policy: { ...DEFAULT_REPEAT_POLICY, neighborhoodAyahRadius: radius }, seed: 'seed-neighbour' });
  const scope = scopeFromJuzRange(1, 3);
  const { slots } = resolveZoneSlots({ plan: freeDistributionPlan(), effectiveScope: scope, questionCount: 5 });
  const result = engine.selectForParticipant({ participantId: 'p-near', effectiveScope: scope, slots, reading, sequencePosition: 0 }, projectCandidatesFromScope(scope, { passageAyahCount: 3, reading }));
  assert.equal(result.questions.length, 5);
  assert.ok(!result.relaxations.includes('neighborhood'), 'a wide scope never needs to relax the radius');
  for (let i = 0; i < result.questions.length; i++) for (let j = i + 1; j < result.questions.length; j++) {
    const a = result.questions[i].candidate, b = result.questions[j].candidate;
    if (a.surahNumber !== b.surahNumber) continue;
    assert.ok(Math.abs(a.startAyah - b.startAyah) > radius, 'two starts in the same surah are separated by more than the radius');
  }
});

test('when the scope is too narrow to honour the radius, the relaxation is recorded rather than hidden', () => {
  const tiny = scopeFromJuz([30]);
  const engine = new QuestionAllocationEngine({ policy: { ...DEFAULT_REPEAT_POLICY, neighborhoodAyahRadius: 400 }, seed: 'seed-tight' });
  const { slots } = resolveZoneSlots({ plan: freeDistributionPlan(), effectiveScope: tiny, questionCount: 4 });
  const result = engine.selectForParticipant({ participantId: 'p-tight', effectiveScope: tiny, slots, reading, sequencePosition: 0 }, projectCandidatesFromScope(tiny, { passageAyahCount: 3, reading }));
  assert.equal(result.questions.length, 4, 'the draw still completes');
  assert.ok(result.relaxations.includes('neighborhood'), 'and says which preference it had to give up');
});

test('primed history from an earlier day is honoured', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'seed-history' });
  const used = pool.slice(0, 20).map(c => ({ locusKey: locusKeyOf(c), participantId: 'p-returning', uses: 1, sequence: 0 }));
  engine.primeUsage(used);
  const result = draw(engine, 'p-returning', juz1, 3, 1);
  const keys = new Set(used.map(u => u.locusKey));
  for (const q of result.questions) assert.ok(!keys.has(locusKeyOf(q.candidate)), 'yesterday\'s loci are not returned to the same participant');
});

test('the engine is deterministic: the same seed and state reproduce the same draw', () => {
  const run = () => {
    const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'fixed-seed' });
    return Array.from({ length: 10 }, (_, i) => draw(engine, `p-${i}`, juz1, 3, i).questions.map(q => q.candidate.id).join('|'));
  };
  assert.deepEqual(run(), run(), 'an auditor replaying the seed gets the identical result');
});

test('a different seed produces a different allocation order', () => {
  const ids = (seed: string) => {
    const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed });
    return draw(engine, 'p-0', juz1, 5, 0).questions.map(q => q.candidate.id).join('|');
  };
  assert.notEqual(ids('seed-one'), ids('seed-two'));
});

test('reuse never follows a visible cycle', () => {
  const engine = new QuestionAllocationEngine({ policy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse' }, seed: 'seed-cycle' });
  const firstQuestion: string[] = [];
  for (let i = 0; i < 120; i++) firstQuestion.push(draw(engine, `p-${i}`, juz1, 1, i).questions[0].candidate.id);
  // دورة ظاهرة تعني أن النافذة الثانية تكرر الأولى بالترتيب نفسه.
  const supply = uniqueLocusCount(pool);
  let identicalRuns = 0;
  for (let i = 0; i + supply < firstQuestion.length; i++) if (firstQuestion[i] === firstQuestion[i + supply]) identicalRuns++;
  assert.ok(identicalRuns < 5, 'the reuse order is not a repeating cycle an observer could predict');
});

test('zones bind the draw: a question never comes from outside its zone', () => {
  const engine = new QuestionAllocationEngine({ policy: DEFAULT_REPEAT_POLICY, seed: 'seed-zone' });
  const scope = scopeFromJuzRange(1, 6);
  const plan = autoBalancedPlan(scope, 3);
  const { slots } = resolveZoneSlots({ plan, effectiveScope: scope, questionCount: 3 });
  const result = engine.selectForParticipant({ participantId: 'p-zone', effectiveScope: scope, slots, reading, sequencePosition: 0 }, projectCandidatesFromScope(scope, { passageAyahCount: 3, reading }));
  assert.equal(result.questions.length, 3);
  for (const picked of result.questions) {
    const slot = slots.find(s => s.index === picked.slotIndex)!;
    const inZone = candidatesInScope([picked.candidate], slot.scope);
    assert.equal(inZone.length, 1, `question ${picked.candidate.id} sits inside its zone`);
    assert.ok(scopeAyahCount(slot.scope) > 0);
  }
});
