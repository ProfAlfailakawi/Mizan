import test from 'node:test';
import assert from 'node:assert/strict';
import { overrunningSessions, sessionStartedAt, DEFAULT_SESSION_OVERRUN_MINUTES } from '../src/lib/session-overrun';

const NOW = Date.parse('2026-11-14T10:00:00Z');
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

const p = (id: string, status: string, history: { status: string; timestamp: string }[], committee = 'c1') =>
  ({ id, code: id.toUpperCase(), status, statusHistory: history.map(h => ({ ...h, actor: 'test' })), assignedCommitteeId: committee } as any);
const committees = [{ id: 'c1', code: 'C1' }, { id: 'c2', code: 'C2' }] as any[];

test('default threshold is fifteen minutes', () => {
  assert.equal(DEFAULT_SESSION_OVERRUN_MINUTES, 15);
});

test('a session past the threshold is reported, a fresh one is not', () => {
  const rows = overrunningSessions({
    participants: [
      p('a1', 'in_session', [{ status: 'in_session', timestamp: at(20) }]),
      p('a2', 'in_session', [{ status: 'in_session', timestamp: at(5) }]),
    ],
    committees, now: NOW,
  });
  assert.deepEqual(rows.map(r => [r.participantCode, r.minutes, r.committeeCode]), [['A1', 20, 'C1']]);
});

test('exactly at the threshold counts, one minute under does not', () => {
  const mk = (m: number) => overrunningSessions({ participants: [p('a', 'in_session', [{ status: 'in_session', timestamp: at(m) }])], committees, now: NOW });
  assert.equal(mk(15).length, 1);
  assert.equal(mk(14).length, 0);
});

test('only people currently in session are judged', () => {
  const rows = overrunningSessions({
    participants: [p('a', 'tested', [{ status: 'in_session', timestamp: at(60) }]), p('b', 'in_queue', [])],
    committees, now: NOW,
  });
  assert.equal(rows.length, 0);
});

test('the latest in_session entry is the start, not the first (a resumed session restarts the clock)', () => {
  const part = p('a', 'in_session', [
    { status: 'in_session', timestamp: at(50) },
    { status: 'in_queue', timestamp: at(30) },
    { status: 'in_session', timestamp: at(3) },
  ]);
  assert.equal(sessionStartedAt(part), at(3));
  assert.equal(overrunningSessions({ participants: [part], committees, now: NOW }).length, 0);
});

test('no recorded start and a start in the future are never reported', () => {
  const rows = overrunningSessions({
    participants: [
      p('a', 'in_session', []),
      p('b', 'in_session', [{ status: 'in_session', timestamp: at(-10) }]),
      p('c', 'in_session', [{ status: 'in_session', timestamp: 'not-a-date' }]),
    ],
    committees, now: NOW,
  });
  assert.equal(rows.length, 0);
});

test('longest first, ties by code; custom threshold respected', () => {
  const rows = overrunningSessions({
    participants: [
      p('b', 'in_session', [{ status: 'in_session', timestamp: at(30) }], 'c2'),
      p('a', 'in_session', [{ status: 'in_session', timestamp: at(30) }]),
      p('c', 'in_session', [{ status: 'in_session', timestamp: at(45) }]),
      p('d', 'in_session', [{ status: 'in_session', timestamp: at(8) }]),
    ],
    committees, now: NOW, thresholdMinutes: 10,
  });
  assert.deepEqual(rows.map(r => r.participantCode), ['C', 'A', 'B']);
});
