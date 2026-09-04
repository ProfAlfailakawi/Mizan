import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCommitteeIntegrity, COMMITTEE_INTEGRITY_VERSION, type ScoreEvent } from '../src/lib/committee-integrity';

function rows(committeeId: string, n: number, make: (i: number) => Partial<ScoreEvent>): ScoreEvent[] {
  return Array.from({ length: n }, (_, i) => ({ committeeId, penalty: 1, ...make(i) }));
}

test('report is non-official and forbids individual ranking', () => {
  const r = analyzeCommitteeIntegrity(rows('C1', 6, () => ({ submitOffsetMs: 1000 })));
  assert.equal(r.version, COMMITTEE_INTEGRITY_VERSION);
  assert.equal(r.nonOfficial, true);
  assert.equal(r.individualRankingProhibited, true);
});

test('tight submission clustering is flagged for a synchrony review', () => {
  const r = analyzeCommitteeIntegrity(rows('C1', 8, () => ({ submitOffsetMs: 120 })));
  assert.equal(r.committees[0].synchrony, 'REVIEW_SYNC');
  assert.equal(r.committees[0].status, 'REVIEW');
});

test('well-spaced submissions read as independent', () => {
  const r = analyzeCommitteeIntegrity(rows('C1', 8, i => ({ submitOffsetMs: 800 + i * 100 })));
  assert.equal(r.committees[0].synchrony, 'INDEPENDENT');
});

test('a regional deduction gap within a committee is flagged', () => {
  const events: ScoreEvent[] = [
    ...rows('C1', 4, () => ({ region: 'A', penalty: 0.2, submitOffsetMs: 900 })),
    ...rows('C1', 4, () => ({ region: 'B', penalty: 1.4, submitOffsetMs: 950 })),
  ];
  const r = analyzeCommitteeIntegrity(events);
  assert.equal(r.committees[0].regionalEvenness, 'REVIEW_REGIONAL');
  assert.ok((r.committees[0].regionalPenaltyGap ?? 0) > 0.5);
});

test('small samples are marked insufficient rather than accused', () => {
  const r = analyzeCommitteeIntegrity(rows('C1', 3, () => ({ submitOffsetMs: 100, region: 'A' })));
  assert.equal(r.committees[0].synchrony, 'INSUFFICIENT');
  assert.equal(r.committees[0].regionalEvenness, 'INSUFFICIENT');
  assert.equal(r.committees[0].status, 'CLEAR');
});
