import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROADCAST_MULTIPLIER, buildExposureOracle, buildExposureProfiles, combineOracles,
  exposureVerdict, topExposedLoci,
} from '../src/lib/exposure-risk';

/*
 * ميزان لا يمنع الأذن من السماع. لكنه يقيس كم انكشف الموضع، ولمن، ومتى — ثم يمنع إعادته
 * على من سمعه. وهذا كل ما يصح ادعاؤه: لا ندّعي أننا نعرف من حفظ ممن سمع.
 */

test('a publicly broadcast locus outranks a hall-only one heard by the same audience', () => {
  const profiles = buildExposureProfiles([
    { locusKey: '2:255', hallId: 'h1', audienceSize: 30, broadcast: 'hall_only', sequence: 10 },
    { locusKey: '36:1', hallId: 'h2', audienceSize: 30, broadcast: 'public_stream', sequence: 10 },
  ], { currentSequence: 10 });
  assert.ok(profiles.get('36:1')!.risk > profiles.get('2:255')!.risk);
  assert.equal(profiles.get('36:1')!.broadcastReach, 'public_stream');
  assert.ok(BROADCAST_MULTIPLIER.public_stream > BROADCAST_MULTIPLIER.hall_only);
});

test('exposure decays with distance: an old reveal weighs less than a fresh one', () => {
  const profiles = buildExposureProfiles([
    { locusKey: 'old', hallId: 'h1', audienceSize: 20, sequence: 0 },
    { locusKey: 'fresh', hallId: 'h1', audienceSize: 20, sequence: 190 },
  ], { currentSequence: 200, decayWindow: 200 });
  assert.ok(profiles.get('fresh')!.risk > profiles.get('old')!.risk);
  assert.equal(profiles.get('fresh')!.reveals, 1);
  assert.equal(profiles.get('old')!.estimatedListeners, 20);
});

test('the same hall on the same day is a hard refusal, with the reason said plainly', () => {
  const profiles = buildExposureProfiles([{ locusKey: '2:255', hallId: 'h1', day: '2026-05-01', audienceSize: 25, sequence: 5 }], { currentSequence: 6 });
  const refused = exposureVerdict({ profiles, locusKey: '2:255', hallId: 'h1', day: '2026-05-01' });
  assert.equal(refused.allowed, false);
  assert.match(refused.reasonArabic, /من سمعه لا يُسأل عنه/);
  const elsewhere = exposureVerdict({ profiles, locusKey: '2:255', hallId: 'h2', day: '2026-05-01' });
  assert.equal(elsewhere.allowed, true, 'another hall never heard it');
});

test('a locus never revealed is allowed and says so, without inventing a risk figure', () => {
  const profiles = buildExposureProfiles([{ locusKey: '2:255', hallId: 'h1', sequence: 1 }]);
  const verdict = exposureVerdict({ profiles, locusKey: '18:10', hallId: 'h1' });
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.risk, 0);
  assert.equal(verdict.level, 'none');
});

test('an extreme public broadcast is refused even in a hall that never heard it', () => {
  const profiles = buildExposureProfiles([
    { locusKey: 'streamed', hallId: 'h1', audienceSize: 40, broadcast: 'public_stream', sequence: 10 },
    { locusKey: 'quiet', hallId: 'h1', audienceSize: 4, broadcast: 'hall_only', sequence: 10 },
  ], { currentSequence: 10 });
  const verdict = exposureVerdict({ profiles, locusKey: 'streamed', hallId: 'h9', day: '2026-05-02' });
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reasonEnglish, /publicly broadcast/);
});

test('the exposure oracle plugs into the engine through the same scarcity gate, never a second path', () => {
  const profiles = buildExposureProfiles([{ locusKey: 'hot', hallId: 'h1', audienceSize: 50, broadcast: 'venue_wide', sequence: 5 }], { currentSequence: 5 });
  const oracle = buildExposureOracle(profiles);
  assert.equal(oracle.pressureOfLocus('hot'), profiles.get('hot')!.risk);
  assert.equal(oracle.pressureOfLocus('cold'), 0);
  const structural = { pressureOfLocus: () => 1 };
  const blended = combineOracles(structural, oracle, 0.5);
  assert.equal(blended.pressureOfLocus('cold'), 0.5);
  assert.equal(blended.pressureOfLocus('hot'), 0.5 + profiles.get('hot')!.risk * 0.5);
});

test('the most exposed loci surface to the organiser before they surface in a hall', () => {
  const events = Array.from({ length: 20 }, (_, i) => ({ locusKey: `k${i}`, hallId: 'h1', audienceSize: i * 5, sequence: 20 }));
  const profiles = buildExposureProfiles(events, { currentSequence: 20 });
  const top = topExposedLoci(profiles, 3);
  assert.equal(top.length, 3);
  assert.equal(top[0].locusKey, 'k19');
  assert.ok(top[0].risk >= top[1].risk && top[1].risk >= top[2].risk);
  assert.equal(top[0].level, 'critical');
});

test('repeated reveals accumulate listeners and halls without losing either', () => {
  const profiles = buildExposureProfiles([
    { locusKey: 'x', hallId: 'h1', day: 'd1', stage: 'final', audienceSize: 10, sequence: 1 },
    { locusKey: 'x', hallId: 'h2', day: 'd2', stage: 'final', audienceSize: 10, sequence: 2 },
  ], { currentSequence: 2 });
  const profile = profiles.get('x')!;
  assert.equal(profile.reveals, 2);
  assert.equal(profile.estimatedListeners, 20);
  assert.deepEqual(profile.halls, ['h1', 'h2']);
  assert.deepEqual(profile.days, ['d1', 'd2']);
  assert.deepEqual(profile.stages, ['final']);
});
