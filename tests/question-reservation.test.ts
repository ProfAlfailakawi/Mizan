import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESERVATION_TTL_SECONDS, RESERVATION_TRANSITIONS, blockedLocusKeys, effectiveState,
  expireReservations, reservationExpired, reservationSummary, reserveQuestions, transitionReservations,
} from '../src/lib/question-reservation';
import type { QuestionReservationRecord } from '../src/types';

let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;
const T0 = '2026-05-01T08:00:00.000Z';
const plus = (seconds: number) => new Date(new Date(T0).getTime() + seconds * 1000).toISOString();

const reserve = (records: QuestionReservationRecord[], participantId: string, keys: string[], options: { now?: string; ttlSeconds?: number; idempotencyKey?: string } = {}) =>
  reserveQuestions({
    records, organizationId: 'org-1', competitionId: 'comp-1',
    items: keys.map(k => ({ locusKey: k, questionId: `q-${k}` })),
    participantId, idempotencyKey: options.idempotencyKey || `key-${participantId}`,
    actorId: 'admin-1', now: options.now || T0, ttlSeconds: options.ttlSeconds, newId,
  });

/*
 * الحجز يجيب عن سؤالين: هل يُسحب هذا الموضع لغيره؟ وماذا لو لم يحضر صاحبه؟
 * والجواب في الحالتين مكتوب لا متروك لاجتهاد المشغّل.
 */

test('reserving marks the loci temporarily reserved with a declared expiry', () => {
  const outcome = reserve([], 'p1', ['2:255', '36:1']);
  assert.equal(outcome.created.length, 2);
  assert.equal(outcome.replayed, false);
  for (const record of outcome.created) {
    assert.equal(record.state, 'temporarily_reserved');
    assert.equal(record.expiresAt, plus(DEFAULT_RESERVATION_TTL_SECONDS));
    assert.equal(record.history.length, 1);
    assert.equal(record.history[0].state, 'temporarily_reserved');
  }
});

test('the same idempotency key twice reserves once, not twice', () => {
  const first = reserve([], 'p1', ['2:255']);
  const second = reserve(first.records, 'p1', ['2:255']);
  assert.equal(second.replayed, true);
  assert.equal(second.records.length, first.records.length);
  assert.equal(second.created[0].id, first.created[0].id);
});

test('a locus held by one participant is refused to another, with the holder named', () => {
  const first = reserve([], 'p1', ['2:255']);
  const second = reserve(first.records, 'p2', ['2:255'], { idempotencyKey: 'key-p2' });
  assert.equal(second.created.length, 0);
  assert.equal(second.conflicts.length, 1);
  assert.equal(second.conflicts[0].locusKey, '2:255');
  assert.equal(second.conflicts[0].heldBy, 'p1');
});

test('an expired temporary reservation reads as released and is swept back into the pool', () => {
  const first = reserve([], 'p1', ['2:255'], { ttlSeconds: 60 });
  const later = plus(61);
  assert.equal(reservationExpired(first.records[0], later), true);
  assert.equal(effectiveState(first.records[0], later), 'released');
  assert.equal(blockedLocusKeys(first.records, later).has('2:255'), false, 'a lapsed hold does not keep the locus hostage');

  const swept = expireReservations(first.records, later);
  assert.equal(swept.changed.length, 1);
  assert.equal(swept.changed[0].state, 'released');
  assert.equal(swept.changed[0].expiresAt, undefined);
  assert.match(swept.changed[0].history.at(-1)!.reason || '', /انقضت/);
});

test('the state machine refuses what it does not allow, and says which transition was refused', () => {
  const first = reserve([], 'p1', ['2:255']);
  const revealed = transitionReservations({ records: first.records, ids: [first.created[0].id], to: 'assigned', actorId: 'a' });
  const done = transitionReservations({ records: revealed.records, ids: [first.created[0].id], to: 'revealed', actorId: 'a' });
  const back = transitionReservations({ records: done.records, ids: [first.created[0].id], to: 'released', actorId: 'a' });
  assert.equal(back.changed.length, 0);
  assert.deepEqual(back.rejected, [{ id: first.created[0].id, from: 'revealed', to: 'released' }]);
  assert.deepEqual(RESERVATION_TRANSITIONS.revealed, ['quarantined'], 'what was heard can only be quarantined, never returned to the pool');
});

test('quarantine is terminal: nothing leaves it', () => {
  assert.deepEqual(RESERVATION_TRANSITIONS.quarantined, []);
  const first = reserve([], 'p1', ['2:255']);
  const held = transitionReservations({ records: first.records, ids: [first.created[0].id], to: 'quarantined', actorId: 'a', reason: 'عيب' });
  const attempt = transitionReservations({ records: held.records, ids: [first.created[0].id], to: 'assigned', actorId: 'a' });
  assert.equal(attempt.changed.length, 0);
  assert.equal(attempt.rejected[0].from, 'quarantined');
});

test('a quarantined locus is blocked for everyone, including the participant holding it', () => {
  const first = reserve([], 'p1', ['2:255']);
  const held = transitionReservations({ records: first.records, ids: [first.created[0].id], to: 'quarantined', actorId: 'a' });
  assert.equal(blockedLocusKeys(held.records, T0, 'p1').has('2:255'), true);
});

test('a participant is not blocked from the loci they themselves hold', () => {
  const first = reserve([], 'p1', ['2:255', '36:1']);
  assert.equal(blockedLocusKeys(first.records, T0, 'p1').size, 0);
  assert.equal(blockedLocusKeys(first.records, T0, 'p2').size, 2);
});

test('the summary counts every state and reports what is actually held', () => {
  const first = reserve([], 'p1', ['2:255', '36:1', '18:10']);
  const assigned = transitionReservations({ records: first.records, ids: [first.created[0].id], to: 'assigned', actorId: 'a' });
  const revealed = transitionReservations({ records: assigned.records, ids: [first.created[0].id], to: 'revealed', actorId: 'a' });
  const summary = reservationSummary(revealed.records, T0);
  assert.equal(summary.total, 3);
  assert.equal(summary.counts.revealed, 1);
  assert.equal(summary.counts.temporarily_reserved, 2);
  /* «القائم» ما يحجب الآن. والمكشوف انتهى أمره: يُحصى في حالته ولا يُعدّ قائمًا. */
  assert.equal(summary.held, 2);
});

/*
 * الحاجز جلسةٌ مفتوحة، لا جلسةٌ مضت.
 *
 * كان المكشوف يحجب إلى الأبد، فيمنع الدفترُ كلَّ إعادة استعمال — ويناقض سياسة التكرار
 * مناقضةً صريحة حين يكون الحدّ الأدنى الرياضي اثنين، أي حين تكون الإعادة **واجبة**.
 */
test('a finished session stops blocking, so the ledger never overrules the repeat policy', () => {
  const first = reserve([], 'p1', ['2:255']);
  const assigned = transitionReservations({ records: first.records, ids: [first.created[0].id], to: 'assigned', actorId: 'a' });
  assert.equal(blockedLocusKeys(assigned.records, T0, 'p2').has('2:255'), true, 'an open session blocks');

  const revealed = transitionReservations({ records: assigned.records, ids: [first.created[0].id], to: 'revealed', actorId: 'a' });
  assert.equal(blockedLocusKeys(revealed.records, T0, 'p2').has('2:255'), false,
    'a finished session must not block — reuse after reveal belongs to the repeat policy and the exposure model');
  assert.equal(revealed.records[0].state, 'revealed', 'and the record still says plainly what happened to it');
});

test('a quarantined locus still blocks forever — a defective passage is defective in every session', () => {
  const first = reserve([], 'p1', ['2:255']);
  const held = transitionReservations({ records: first.records, ids: [first.created[0].id], to: 'quarantined', actorId: 'a', reason: 'عيب' });
  assert.equal(blockedLocusKeys(held.records, T0, 'p2').has('2:255'), true);
  assert.equal(blockedLocusKeys(held.records, T0, 'p1').has('2:255'), true, 'even for the participant who held it');
});

test('a released locus can be reserved again by someone else', () => {
  const first = reserve([], 'p1', ['2:255'], { ttlSeconds: 30 });
  const swept = expireReservations(first.records, plus(31));
  const second = reserve(swept.records, 'p2', ['2:255'], { now: plus(31), idempotencyKey: 'key-p2' });
  assert.equal(second.conflicts.length, 0);
  assert.equal(second.created.length, 1);
  assert.equal(second.created[0].participantId, 'p2');
});

/*
 * التزاحم يُسمّى فيه من يحجز الآن.
 *
 * كانت خريطة الحائزين تُبنى بالمرور على الدفتر بترتيبه، والدفتر أحدثُه أوّله، فتنتهي
 * الخريطة إلى **أقدم** من مرّ بالموضع. فيُردّ الثالث باسم الأول وقد أفلت الموضع من يده
 * وانقضت مدته، ويُذكر معه أن حالته «مُطلق» — أي أن الردّ يناقض سببه في سطرٍ واحد.
 * والبلاغ الذي يُسمّي غير صاحبه يوجّه المشغّل إلى من لا شأن له، ويخفي من له الشأن.
 */
test('a conflict names whoever holds the locus now, not whoever held it first', () => {
  const first = reserve([], 'p1', ['2:255'], { ttlSeconds: 60 });
  const later = plus(61);
  /* مضت مدة الأول فعاد الموضع إلى المخزون، ثم أخذه الثاني. */
  const swept = expireReservations(first.records, later);
  const second = reserve(swept.records, 'p2', ['2:255'], { now: later, idempotencyKey: 'key-p2' });
  assert.equal(second.created.length, 1);

  const third = reserve(second.records, 'p3', ['2:255'], { now: later, idempotencyKey: 'key-p3' });
  assert.equal(third.created.length, 0);
  assert.equal(third.conflicts.length, 1);
  assert.equal(third.conflicts[0].heldBy, 'p2');
  assert.equal(third.conflicts[0].state, 'temporarily_reserved');
});

/* والحجر أولى بالذكر من الحجز: من يقرأ البلاغ يحتاج أن يعرف أن الموضع معيب لا مشغول. */
test('a quarantined locus is refused as quarantined even while someone also holds it', () => {
  const held = reserve([], 'p1', ['2:255']);
  const quarantined = transitionReservations({
    records: held.records, ids: [held.created[0].id], to: 'quarantined', actorId: 'admin-1', now: T0,
  });
  const other = reserve(quarantined.records, 'p2', ['2:255'], { idempotencyKey: 'key-p2' });
  assert.equal(other.created.length, 0);
  assert.equal(other.conflicts[0].state, 'quarantined');
});

/* وموضعٌ تكرّر في الطلب الواحد يُحجز مرة، ويُردّ ثانيه باسم صاحبه لا بلا اسم. */
test('the same locus twice in one request reserves once and names itself in the refusal', () => {
  const outcome = reserve([], 'p1', ['2:255', '2:255']);
  assert.equal(outcome.created.length, 1);
  assert.equal(outcome.conflicts.length, 1);
  assert.equal(outcome.conflicts[0].heldBy, 'p1');
  assert.equal(outcome.conflicts[0].state, 'temporarily_reserved');
});
