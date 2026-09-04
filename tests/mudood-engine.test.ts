import test from 'node:test';
import assert from 'node:assert/strict';
import { harakaUnitMs, classifyMadd, MUDOOD_ENGINE_VERSION } from '../src/lib/mudood-engine';

test('haraka unit is the median ms-per-haraka of the reciter own samples', () => {
  // three natural 2-haraka madds around 400ms -> ~200ms per haraka
  const unit = harakaUnitMs([
    { durationMs: 400, harakat: 2 },
    { durationMs: 420, harakat: 2 },
    { durationMs: 380, harakat: 2 },
  ]);
  assert.equal(unit, 200);
});

test('haraka unit ignores empty/invalid samples and returns null when none valid', () => {
  assert.equal(harakaUnitMs([{ durationMs: 0, harakat: 2 }, { durationMs: 400, harakat: 0 }]), null);
});

test('a 6-haraka madd at the reciter tempo reads as on-measure', () => {
  const unit = 200; // ms per haraka
  const v = classifyMadd(1200, unit, 6);
  assert.equal(v.observedHarakat, 6);
  assert.equal(v.direction, 'on-measure');
  assert.equal(v.within, true);
});

test('a fast reciter and a slow reciter both pass the same 4-haraka madd', () => {
  const fast = classifyMadd(600, 150, 4); // 150ms/haraka
  const slow = classifyMadd(1000, 250, 4); // 250ms/haraka
  assert.equal(fast.within, true);
  assert.equal(slow.within, true);
  assert.equal(fast.observedHarakat, 4);
  assert.equal(slow.observedHarakat, 4);
});

test('a clipped elongation is flagged short, a stretched one long', () => {
  const unit = 200;
  assert.equal(classifyMadd(600, unit, 6).direction, 'short'); // 3 harakat vs 6
  assert.equal(classifyMadd(1600, unit, 6).direction, 'long'); // 8 harakat vs 6
});

test('mudood verdict can never affect a score', () => {
  const v = classifyMadd(800, 200, 4);
  assert.equal(v.canAffectScore, false);
  assert.equal(v.scoreAuthority, 'HUMAN_ONLY');
  assert.equal(v.version, MUDOOD_ENGINE_VERSION);
});

test('an invalid tempo unit throws rather than inventing a measurement', () => {
  assert.throws(() => classifyMadd(800, 0, 4), /MUDOOD_UNIT_INVALID/);
});
