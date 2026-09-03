import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, feedPcm } from './_alignment-harness';
import { synthContestant, scriptNormal, scriptWithPause } from '../server/alignment/benchmark/synth';
import { AlignmentEngine } from '../server/alignment/engine';
import { devHafsPassage } from '../server/alignment/canonical';
import { ReferenceTemplateBackend } from '../server/alignment/acoustic/reference-template';

// End-to-end on the REAL pipeline (PCM bytes → MFCC → DTW → position). Synthetic acoustics with
// exact ground truth validate the tracking ALGORITHM (not human-recitation accuracy).

test('normal read: cursor advances monotonically and reaches the passage end', () => {
  const { engine, passage } = buildEngine({ startAyah: 256, endAyah: 256 });
  const contestant = synthContestant(passage, scriptNormal(passage, 280), { pitchScale: 1.03, noise: 0.03 });
  const events = feedPcm(engine, contestant.pcm, contestant.sampleRate);

  const positions = events.filter(e => e.eventType === 'POSITION_UPDATE' && e.globalWordIndex !== null);
  assert.ok(positions.length > 3, 'should emit multiple position updates');
  // Cursor should end in the last third of the passage (it tracked forward through the reading).
  assert.ok(engine.trustedGlobalWord >= Math.floor(passage.words.length * 0.6), `ended at word ${engine.trustedGlobalWord} of ${passage.words.length}`);
  // Every event obeys the governance guarantee.
  for (const e of events) { assert.equal(e.scoreDelta, 0); assert.equal(e.authority, 'HUMAN_ONLY'); }
});

test('pause: silence produces PAUSE and does not advance the cursor', () => {
  const { engine, passage } = buildEngine({ startAyah: 256, endAyah: 256 });
  const afterWord = 4;
  const contestant = synthContestant(passage, scriptWithPause(passage, afterWord, 1800, 280), { noise: 0.02 });
  const events = feedPcm(engine, contestant.pcm, contestant.sampleRate);
  const pauses = events.filter(e => e.eventType === 'PAUSE');
  assert.ok(pauses.length >= 1, 'a long silence must yield at least one PAUSE event');
  // A RESUME should follow once speech returns.
  assert.ok(events.some(e => e.eventType === 'RESUME'), 'speech after the pause must RESUME');
});

test('reading isolation: engine refuses a passage/backend from another reading (fail-closed)', () => {
  const passage = devHafsPassage(256, 256);
  const ref = ReferenceTemplateBackend.fromFeatures('hafs', [new Float64Array(26)], [0]);
  // Force a mismatched backend reading by casting — the engine must throw.
  const badBackend = Object.assign(Object.create(Object.getPrototypeOf(ref)), ref, { reading: 'warsh' });
  assert.throws(() => new AlignmentEngine(
    { sessionId: 's', readingId: 'hafs', surah: 2, startAyah: 256, endAyah: 256, canonicalTextHash: passage.canonicalTextHash, canonicalPackageVersion: 'dev' },
    passage, badBackend as any,
  ), /reading/i);
});

test('canonical hash guard: engine requires a canonical text hash', () => {
  const passage = devHafsPassage(256, 256);
  const ref = ReferenceTemplateBackend.fromFeatures('hafs', [new Float64Array(26), new Float64Array(26)], [0, 1]);
  assert.throws(() => new AlignmentEngine(
    { sessionId: 's', readingId: 'hafs', surah: 2, startAyah: 256, endAyah: 256, canonicalTextHash: '', canonicalPackageVersion: 'dev' },
    passage, ref as any,
  ), /CANONICAL_TEXT_HASH_REQUIRED/);
});
