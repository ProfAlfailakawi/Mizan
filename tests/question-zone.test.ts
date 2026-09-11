import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoBalancedPlan, autoBalancedZones, emptyZone, freeDistributionPlan, resolveZoneSlots,
  validateDistributionPlan, zoneQuestionTotal, type QuestionDistributionPlan, type QuestionZone,
} from '../src/lib/question-zones';
import { fullQuranScope, scopeAyahCount, scopeFromJuz, scopeFromJuzRange, scopeIntersect, isScopeSubsetOf, scopeMetrics } from '../src/lib/quran-scope';

/*
 * «١–٣٠ وخمسة أسئلة ⇒ ١–٦، ٧–١٢…» مثالٌ من اللائحة لا قاعدة في الكود. الاختبار يثبت أن
 * العدد قابل للتغيير، وأن المناطق قد تكون غير متساوية، وأنها تُقصّ دائمًا على نطاق المتسابق.
 */

const zone = (order: number, scope: ReturnType<typeof scopeFromJuz>, count: number): QuestionZone =>
  ({ ...emptyZone(order), id: `z${order}`, scope, requiredQuestionCount: count, order });

test('auto zoning follows the requested count, whatever it is', () => {
  for (const count of [1, 3, 5, 7, 12]) {
    const zones = autoBalancedZones(fullQuranScope(), count);
    assert.equal(zones.length, count, `${count} questions give ${count} zones`);
    const covered = zones.reduce((sum, z) => sum + scopeAyahCount(z.scope), 0);
    assert.equal(covered, scopeAyahCount(fullQuranScope()), 'zones cover the scope exactly once');
  }
});

test('auto zoning for 1–30 with five questions proposes five contiguous bands', () => {
  const zones = autoBalancedZones(fullQuranScope(), 5);
  const sizes = zones.map(z => scopeAyahCount(z.scope));
  const spread = (Math.max(...sizes) - Math.min(...sizes)) / (sizes.reduce((a, b) => a + b, 0) / 5);
  assert.ok(spread < 0.05, 'the five bands are balanced by real content');
  for (const z of zones) assert.equal(scopeMetrics(z.scope).segmentCount, 1, 'each band is continuous');
});

test('uneven custom zones are accepted as configuration, not rejected as error', () => {
  const plan: QuestionDistributionPlan = {
    version: 1, mode: 'custom_zones',
    zones: [
      zone(1, scopeFromJuzRange(1, 10), 1),
      zone(2, scopeFromJuzRange(11, 15), 1),
      zone(3, scopeFromJuzRange(16, 20), 1),
      zone(4, scopeFromJuzRange(21, 25), 1),
      zone(5, scopeFromJuzRange(26, 30), 1),
    ],
  };
  const issues = validateDistributionPlan(plan, fullQuranScope(), 5);
  assert.equal(issues.filter(x => x.severity === 'error').length, 0, 'unequal zones are a legitimate configuration');
  assert.equal(zoneQuestionTotal(plan), 5);
});

test('a zone outside the category scope is a hard error', () => {
  const plan: QuestionDistributionPlan = { version: 1, mode: 'custom_zones', zones: [zone(1, scopeFromJuz([29]), 1)] };
  const issues = validateDistributionPlan(plan, scopeFromJuzRange(1, 10), 1);
  assert.ok(issues.some(x => x.code === 'ZONE_OUTSIDE_SCOPE' && x.severity === 'error'));
});

test('zone totals must match the participant question count', () => {
  const plan: QuestionDistributionPlan = { version: 1, mode: 'custom_zones', zones: [zone(1, scopeFromJuzRange(1, 15), 2), zone(2, scopeFromJuzRange(16, 30), 2)] };
  assert.ok(validateDistributionPlan(plan, fullQuranScope(), 5).some(x => x.code === 'ZONE_TOTAL_MISMATCH'));
  assert.equal(validateDistributionPlan(plan, fullQuranScope(), 4).filter(x => x.severity === 'error').length, 0);
});

test('every resolved slot lies inside the participant scope, never the category scope', () => {
  const plan = autoBalancedPlan(fullQuranScope(), 5);
  const participantScope = scopeFromJuzRange(1, 5);
  const { slots } = resolveZoneSlots({ plan, effectiveScope: participantScope, questionCount: 5 });
  assert.equal(slots.length, 5);
  for (const slot of slots) assert.ok(isScopeSubsetOf(slot.scope, participantScope), 'a slot never escapes the participant scope');
});

test('a category zone that misses a participant scope relaxes, skips or fails as configured', () => {
  const participantScope = scopeFromJuzRange(1, 5);
  const far = zone(1, scopeFromJuz([29]), 1);

  const relaxed = resolveZoneSlots({ plan: { version: 1, mode: 'custom_zones', zones: [{ ...far, fallback: 'relax_to_scope' }] }, effectiveScope: participantScope, questionCount: 1 });
  assert.ok(isScopeSubsetOf(relaxed.slots[0].scope, participantScope));
  assert.equal(relaxed.slots[0].relaxed, true);
  assert.ok(relaxed.issues.some(x => x.code === 'ZONE_RELAXED'));

  const skipped = resolveZoneSlots({ plan: { version: 1, mode: 'custom_zones', zones: [{ ...far, fallback: 'skip' }] }, effectiveScope: participantScope, questionCount: 1 });
  assert.ok(skipped.issues.some(x => x.code === 'ZONE_SKIPPED'));
  assert.ok(isScopeSubsetOf(skipped.slots[0].scope, participantScope), 'the skipped zone is replaced by an open slot inside the scope');

  const failed = resolveZoneSlots({ plan: { version: 1, mode: 'custom_zones', zones: [{ ...far, fallback: 'fail', mandatory: true }] }, effectiveScope: participantScope, questionCount: 1 });
  assert.ok(failed.issues.some(x => x.code === 'ZONE_UNREACHABLE' && x.severity === 'error'));
});

test('hybrid mode fills the remaining slots from the open scope', () => {
  const plan: QuestionDistributionPlan = { version: 1, mode: 'hybrid', zones: [zone(1, scopeFromJuz([1]), 2)], freeQuestionCount: 3 };
  const { slots } = resolveZoneSlots({ plan, effectiveScope: scopeFromJuzRange(1, 10), questionCount: 5 });
  assert.equal(slots.filter(s => s.zoneId === 'z1').length, 2);
  assert.equal(slots.filter(s => s.zoneId === null).length, 3, 'the rest are open-range slots');
});

test('free mode gives every slot the whole participant scope', () => {
  const { slots } = resolveZoneSlots({ plan: freeDistributionPlan(), effectiveScope: scopeFromJuzRange(3, 9), questionCount: 4 });
  assert.equal(slots.length, 4);
  for (const slot of slots) assert.equal(scopeAyahCount(slot.scope), scopeAyahCount(scopeFromJuzRange(3, 9)));
});

test('a participant with no scope produces an explicit error, not an empty draw', () => {
  const { slots, issues } = resolveZoneSlots({ plan: freeDistributionPlan(), effectiveScope: { version: 1, segments: [], assurance: 'CANONICAL_TABLE' }, questionCount: 3 });
  assert.equal(slots.length, 0);
  assert.ok(issues.some(x => x.code === 'SCOPE_EMPTY_FOR_PARTICIPANT' && x.severity === 'error'));
});

test('overlapping zones are advisory, not fatal', () => {
  const plan: QuestionDistributionPlan = { version: 1, mode: 'custom_zones', zones: [zone(1, scopeFromJuzRange(1, 10), 1), zone(2, scopeFromJuzRange(8, 15), 1)] };
  const issues = validateDistributionPlan(plan, fullQuranScope(), 2);
  assert.ok(issues.some(x => x.code === 'ZONE_OVERLAP' && x.severity === 'warning'));
  assert.equal(issues.filter(x => x.severity === 'error').length, 0);
  assert.ok(scopeAyahCount(scopeIntersect(plan.zones[0].scope, plan.zones[1].scope)) > 0);
});

test('auto zoning can weigh eligible supply instead of ayah count', () => {
  // منطقة فقيرة بالمواضع الصالحة تأخذ مساحةً أوسع من المصحف لتتساوى الطاقة لا المسافة.
  const dense = scopeAyahCount(fullQuranScope()) / 2;
  const zones = autoBalancedZones(fullQuranScope(), 2, { weightOfOrdinal: ordinal => (ordinal <= dense ? 3 : 1) });
  assert.ok(scopeAyahCount(zones[0].scope) < scopeAyahCount(zones[1].scope));
});
