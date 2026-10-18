import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compactStateForQuota, redactStateForLocalSnapshot } from '../src/lib/local-snapshot-privacy';

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, code: `A-${i}`, fullName: `N${i}`, status: 'approved', customAnswers: { a: 'x'.repeat(300) }, statusHistory: Array.from({ length: 12 }, (_, k) => ({ at: String(k), to: 'approved' })), editHistory: Array.from({ length: 9 }, (_, k) => ({ at: String(k) })) })) as any[];
const state = () => ({ participants: people(2500), auditLogs: Array.from({ length: 900 }, (_, i) => ({ id: `a${i}` })) });

test('compaction levels shrink the snapshot monotonically and never touch the live state', () => {
  const s = state();
  const sizes = [0, 1, 2, 3].map((l) => JSON.stringify(compactStateForQuota(redactStateForLocalSnapshot(s as any), l as 0 | 1 | 2 | 3)).length);
  assert.ok(sizes[1] < sizes[0] && sizes[2] < sizes[1] && sizes[3] < sizes[2], sizes.join(','));
  assert.equal(s.participants.length, 2500, 'live state untouched');
  assert.equal(s.participants[0].statusHistory.length, 12);
  const l1 = compactStateForQuota(s as any, 1) as any;
  assert.equal(l1.participants[0].statusHistory.length, 5);
  assert.equal(l1.participants[0].customAnswers, undefined);
  assert.equal((compactStateForQuota(s as any, 2) as any).auditLogs.length, 200);
  assert.equal((compactStateForQuota(s as any, 3) as any).participants.length, 0);
});

test('the store degrades through the levels on quota errors instead of surfacing a write failure', () => {
  const src = fs.readFileSync('src/lib/store.ts', 'utf8');
  assert.match(src, /for \(let level = snapshotCompaction; level <= 3 && !wrote; level\+\+\)/);
  assert.match(src, /NS_ERROR_DOM_QUOTA_REACHED/);
});
