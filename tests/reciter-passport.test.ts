import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReciterPassport, detectEligibilityFlags, RECITER_PASSPORT_VERSION } from '../src/lib/reciter-passport';
import type { ParticipantPassportEntry } from '../src/types';

function e(o: Partial<ParticipantPassportEntry>): ParticipantPassportEntry {
  return { id: o.id || 'e', participantId: 'p1', competitionId: 'c1', competitionName: 'Dubai', categoryName: 'Hifz', year: '2024', verified: true, ...o };
}

test('aggregates only the given reciter, counts competitions and verified entries', () => {
  const all = [
    e({ id: '1', competitionId: 'dubai', year: '2023', result: 'المركز الأول' }),
    e({ id: '2', competitionId: 'makkah', year: '2024', verified: false }),
    e({ id: '3', participantId: 'other', competitionId: 'x' }),
  ];
  const p = aggregateReciterPassport('p1', all);
  assert.equal(p.version, RECITER_PASSPORT_VERSION);
  assert.equal(p.competitionCount, 2);
  assert.equal(p.verifiedCount, 1);
  assert.equal(p.bestResult, 'المركز الأول');
});

test('fingerprint is order-independent over verified entries', () => {
  const a = [e({ id: '1', competitionId: 'a', year: '2022' }), e({ id: '2', competitionId: 'b', year: '2023' })];
  const b = [e({ id: '2', competitionId: 'b', year: '2023' }), e({ id: '1', competitionId: 'a', year: '2022' })];
  assert.equal(aggregateReciterPassport('p1', a).fingerprint, aggregateReciterPassport('p1', b).fingerprint);
});

test('duplicate entry in the same competition+year is flagged', () => {
  const p = aggregateReciterPassport('p1', [e({ id: '1' }), e({ id: '2' })]);
  const flags = detectEligibilityFlags(p);
  assert.ok(flags.some(f => f.kind === 'DUPLICATE_ENTRY'));
});

test('a prior top-placer re-entering a review-gated category is flagged for human review', () => {
  const p = aggregateReciterPassport('p1', [
    e({ id: '1', competitionId: 'a', year: '2022', categoryName: 'Advanced', result: 'first' }),
    e({ id: '2', competitionId: 'b', year: '2024', categoryName: 'Beginners' }),
  ]);
  const flags = detectEligibilityFlags(p, { highPlacementReviewCategories: ['Beginners'] });
  assert.ok(flags.some(f => f.kind === 'REPEAT_HIGH_PLACEMENT'));
});

test('a clean single record produces no flags', () => {
  const p = aggregateReciterPassport('p1', [e({ id: '1' })]);
  assert.equal(detectEligibilityFlags(p).length, 0);
});
