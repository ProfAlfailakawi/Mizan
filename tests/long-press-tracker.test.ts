import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLongPressTracker, LONG_PRESS_MS, LONG_PRESS_SLOP_PX } from '../src/lib/use-word-long-press';

test('fires once, at the original point, after the threshold', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const fired: [number, number][] = [];
  const t = createLongPressTracker((x, y) => fired.push([x, y]));
  t.down(100, 200);
  mock.timers.tick(LONG_PRESS_MS - 1);
  assert.equal(fired.length, 0);
  assert.equal(t.pending, true);
  mock.timers.tick(1);
  assert.deepEqual(fired, [[100, 200]]);
  assert.equal(t.pending, false);
  mock.timers.tick(5000);
  assert.equal(fired.length, 1, 'never fires twice for one press');
  mock.timers.reset();
});

test('lifting the finger early cancels: a tap is not a mark', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let n = 0;
  const t = createLongPressTracker(() => n++);
  t.down(1, 1);
  mock.timers.tick(200);
  t.cancel();
  mock.timers.tick(1000);
  assert.equal(n, 0);
  mock.timers.reset();
});

test('drifting past the slop (a scroll) cancels; a small tremor does not', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let n = 0;
  const t = createLongPressTracker(() => n++);
  t.down(50, 50);
  t.move(50 + LONG_PRESS_SLOP_PX - 1, 50);
  assert.equal(t.pending, true, 'tremor within the slop keeps the press alive');
  t.move(50 + LONG_PRESS_SLOP_PX + 5, 50);
  assert.equal(t.pending, false, 'a real drag cancels it');
  mock.timers.tick(2000);
  assert.equal(n, 0);
  mock.timers.reset();
});

test('a second press restarts the clock instead of stacking timers', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const fired: number[] = [];
  const t = createLongPressTracker(x => fired.push(x));
  t.down(1, 0);
  mock.timers.tick(300);
  t.down(2, 0);
  mock.timers.tick(300);
  assert.equal(fired.length, 0, 'the first press was replaced');
  mock.timers.tick(200);
  assert.deepEqual(fired, [2]);
  mock.timers.reset();
});
