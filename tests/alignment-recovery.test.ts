import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, feedPcm } from './_alignment-harness';
import { synthContestant, scriptWithBacktrack } from '../server/alignment/benchmark/synth';

// Recovery behaviour (§7, §8, §9): a backtrack (re-reading earlier words) must NOT crash the tracker
// and should surface trajectory evidence rather than being treated as a system error.

test('backtrack: re-reading earlier words yields BACKTRACK/REPEAT evidence and keeps tracking', () => {
  const { engine, passage } = buildEngine({ startAyah: 256, endAyah: 256, wordMs: 260 });
  const n = passage.words.length;
  const backAt = Math.min(n - 3, 8);
  const backTo = Math.max(1, backAt - 4);
  const contestant = synthContestant(passage, scriptWithBacktrack(passage, backAt, backTo, 260), { noise: 0.03 });
  const events = feedPcm(engine, contestant.pcm, contestant.sampleRate);

  const trajectory = events.filter(e => e.eventType === 'BACKTRACK' || e.eventType === 'REPEAT' || e.eventType === 'POSSIBLE_SELF_CORRECTION');
  assert.ok(trajectory.length >= 1, 'a backtrack in the audio should produce trajectory evidence');
  for (const e of trajectory) {
    assert.equal(e.scoreDelta, 0);            // evidence only — never a verdict
    assert.equal(e.authority, 'HUMAN_ONLY');
    assert.ok(typeof e.detail === 'string');
  }
  // The engine keeps producing positions afterward (it did not get stuck).
  assert.ok(events.filter(e => e.eventType === 'POSITION_UPDATE').length > 3);
  // And it resumes forward past the backtrack point by the end.
  assert.ok(engine.trustedGlobalWord >= backAt, `ended at ${engine.trustedGlobalWord}, backtrack point ${backAt}`);
});
