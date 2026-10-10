import test from 'node:test';
import assert from 'node:assert/strict';
import {
  journeyAlreadyPlayed,
  journeyDisplayState,
  journeyEffectiveThreshold,
  journeyStepMs,
  journeyTarget,
  markJourneyPlayed,
  resetJourneyPlayed,
} from '../src/components/dna/useJourneyReveal';

test('journeyStepMs paces short rails at 0.55-0.75s and caps long ones near 4s', () => {
  assert.equal(journeyStepMs(5), 750);
  assert.equal(journeyStepMs(8), 500);
  assert.equal(journeyStepMs(9), 444);
  assert.equal(journeyStepMs(40), 350);
  assert.equal(journeyStepMs(0), 750);
});

test('journeyTarget is the index of the last done/current step + 1 and ignores returned/blocked/pending', () => {
  assert.equal(journeyTarget(['done', 'done', 'current', 'pending', 'pending']), 3);
  assert.equal(journeyTarget(['pending', 'pending']), 0);
  assert.equal(journeyTarget(['done', 'returned', 'pending']), 1);
  assert.equal(journeyTarget(['done', 'blocked']), 1);
  assert.equal(journeyTarget(['done', 'done', 'done']), 3);
});

test('the intro never lights a station past the real target and never changes the settled state', () => {
  const real = ['done', 'done', 'current', 'pending', 'pending'] as const;
  const target = journeyTarget(real);
  // lit = 0: everything reads pending, nothing is faked beyond that
  assert.deepEqual(real.map((s, i) => journeyDisplayState(s, i, target, 0)), ['pending', 'pending', 'pending', 'pending', 'pending']);
  // lit = 2: first two are shown, the current one is still pending
  assert.deepEqual(real.map((s, i) => journeyDisplayState(s, i, target, 2)), ['done', 'done', 'pending', 'pending', 'pending']);
  // lit = target: the real states
  assert.deepEqual(real.map((s, i) => journeyDisplayState(s, i, target, target)), [...real]);
  // settled (null): real states, including steps beyond the target
  assert.deepEqual(real.map((s, i) => journeyDisplayState(s, i, target, null)), [...real]);
  // a returned/blocked station beyond the target is never hidden or turned into progress
  assert.equal(journeyDisplayState('returned', 2, 1, 0), 'returned');
  assert.equal(journeyDisplayState('blocked', 2, 1, 1), 'blocked');
});

test('playKey is remembered so the same entity does not replay', () => {
  resetJourneyPlayed();
  assert.equal(journeyAlreadyPlayed('p1'), false);
  assert.equal(journeyAlreadyPlayed(undefined), false);
  markJourneyPlayed('p1');
  assert.equal(journeyAlreadyPlayed('p1'), true);
  assert.equal(journeyAlreadyPlayed('p2'), false);
  resetJourneyPlayed();
  assert.equal(journeyAlreadyPlayed('p1'), false);
});

test('effective threshold is always attainable for tall rails and never below the floor', () => {
  assert.equal(journeyEffectiveThreshold(0.5, 100, 800), 0.5);
  assert.ok(journeyEffectiveThreshold(0.5, 2000, 800) <= (0.9 * 800) / 2000 + 1e-9);
  assert.equal(journeyEffectiveThreshold(0.5, 100000, 800), 0.05);
  assert.equal(journeyEffectiveThreshold(0.5, 0, 800), 0.5);
});

test('css: the journey halo is gated on data-just, never on the current state alone', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../src/components/dna/dna.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('journey (opt-in'));
  const current = /\.dna-steps\[data-journey\] \.dna-stepi\[data-state='current'\] \.dna-node \{[^}]*\}/.exec(block)?.[0] ?? '';
  assert.match(current, /animation: none/);
  assert.doesNotMatch(current, /dna-journey-halo/);
  assert.match(block, /\[data-journey\] \.dna-stepi\[data-just\] \.dna-node \{\s*animation: dna-journey-halo/);
  const land = fs.readFileSync(new URL('../src/components/public/CompetitionLanding.tsx', import.meta.url), 'utf8');
  assert.match(land, /stepsReveal\.just === i \? ' mz-halo-once'/);
});

test('a11y and key-switch contracts stay in the source (aria uses the real state; playKey resets the hook)', async () => {
  const fs = await import('node:fs');
  const kit = fs.readFileSync(new URL('../src/components/dna/DnaKit.tsx', import.meta.url), 'utf8');
  assert.match(kit, /aria-current=\{real === 'current'/);
  assert.match(kit, /\{text\[real\]\}/);
  const hook = fs.readFileSync(new URL('../src/components/dna/useJourneyReveal.ts', import.meta.url), 'utf8');
  assert.match(hook, /keyRef\.current !== playKey/);
  assert.match(hook, /\[target, enabled, playKey\]/);
});
