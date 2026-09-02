import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_RULESET, SEED_COMMITTEES, SEED_JUDGES } from '../src/lib/seed-data';

test('demo fixture uses one judge without weakening production engine', () => {
  assert.equal(SEED_RULESET.judgesCountPerPanel, 1);
  const active = SEED_COMMITTEES.filter(c => c.status !== 'offline');
  assert.equal(active.length, 1);
  assert.deepEqual(active[0].judgeIds, ['usr-judge-1']);
  assert.equal(SEED_JUDGES.length, 1);
  assert.equal(SEED_JUDGES[0].userId, 'usr-judge-1');
});
