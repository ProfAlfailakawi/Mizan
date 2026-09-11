import test from 'node:test';
import assert from 'node:assert/strict';
import { accruedWaitMinutes, equityWarranted, orderKeyForPosition, recommendFairPosition } from '../src/lib/queue-equity';
import type { Participant } from '../src/types';

/*
 * المشهد: متسابقٌ صار الثاني في لجنته بعد خمسين دقيقة انتظار، ثم نُقل استثناءً إلى لجنةٍ
 * أخرى فوجد أمامه عشرة. انتظر ثم بدأ من جديد.
 *
 * وحفظُ الأسبقية بالوصول لا ينصفه: لجنتُه كانت بطيئة، فمن وصل قبله بساعة في لجنةٍ سريعة
 * لم ينتظر إلا دقائق. الرقم نفسه، والانتظار مختلف — فالعملة هنا كم انتظر لا متى وصل.
 */

const NOW = new Date('2026-01-01T10:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString();

const waiter = (id: string, waitedMinutes: number, orderKey: number): Participant => ({
  id, competitionId: 'comp-1', code: id.toUpperCase(), fullName: id, fullNameArabic: id,
  categoryId: 'cat-1', status: 'in_queue', statusHistory: [],
  checkedInAt: minutesAgo(waitedMinutes), queueOrderKey: orderKey,
} as unknown as Participant);

/* ── كم انتظر ───────────────────────────────────────────────────────────── */

test('waiting is counted from entering the queue, not from registering', () => {
  assert.equal(accruedWaitMinutes(waiter('p1', 50, 1), NOW), 50);
});

test('a participant with no check-in stamp falls back to when he entered the queue', () => {
  const p = {
    id: 'p1', competitionId: 'comp-1', code: 'P1', status: 'in_queue',
    statusHistory: [
      { status: 'checked_in', timestamp: minutesAgo(40), actor: 'gate' },
      { status: 'in_queue', timestamp: minutesAgo(35), actor: 'gate' },
    ],
  } as unknown as Participant;
  assert.equal(accruedWaitMinutes(p, NOW), 35);
});

test('an unknown start is zero waiting — we never invent a wait we cannot show', () => {
  const p = { id: 'p1', competitionId: 'comp-1', code: 'P1', status: 'in_queue', statusHistory: [] } as unknown as Participant;
  assert.equal(accruedWaitMinutes(p, NOW), 0);
});

test('a device clock ahead of the stamp does not produce negative waiting', () => {
  const p = waiter('p1', -10, 1);
  assert.equal(accruedWaitMinutes(p, NOW), 0);
});

/* ── الموضع العادل ──────────────────────────────────────────────────────── */

test('the scene itself: second in his own panel, eleventh in the new one, fourth by right', () => {
  /* انتظر ٥٠ دقيقة. وفي اللجنة الهدف عشرة، ثلاثةٌ منهم انتظروا أكثر منه. */
  const mover = waiter('mover', 50, 999);
  const targetQueue = [
    waiter('a', 80, 1), waiter('b', 70, 2), waiter('c', 60, 3),
    waiter('d', 40, 4), waiter('e', 35, 5), waiter('f', 30, 6),
    waiter('g', 25, 7), waiter('h', 20, 8), waiter('i', 15, 9), waiter('j', 10, 10),
  ];

  const rec = recommendFairPosition({ mover, targetQueue, now: NOW });

  assert.equal(rec.waitedMinutes, 50);
  assert.equal(rec.positionIfAppended, 11, 'appended to the tail he would be eleventh');
  assert.equal(rec.fairPosition, 4, 'but three people waited longer, so he is fourth');
  assert.equal(rec.positionsRecovered, 7);
  assert.equal(rec.passes.length, 7, 'and he passes seven who waited less than he did');
  assert.ok(rec.passes.every(x => x.waitedMinutes < 50));
  assert.match(rec.reasonArabic, /50 دقيقة/);
});

test('an equal wait keeps the seat for whoever already holds it', () => {
  /* النقل يمنع الخسارة ولا يمنح أفضلية على نظير. */
  const mover = waiter('mover', 30, 999);
  const targetQueue = [waiter('a', 30, 1), waiter('b', 30, 2), waiter('c', 10, 3)];
  const rec = recommendFairPosition({ mover, targetQueue, now: NOW });
  assert.equal(rec.fairPosition, 3, 'behind both who waited the same, ahead of the one who waited less');
  assert.deepEqual(rec.passes.map(x => x.participantId), ['c']);
});

test('the longest wait in the hall goes to the front', () => {
  const mover = waiter('mover', 120, 999);
  const targetQueue = [waiter('a', 40, 1), waiter('b', 20, 2)];
  const rec = recommendFairPosition({ mover, targetQueue, now: NOW });
  assert.equal(rec.fairPosition, 1);
  assert.equal(rec.positionsRecovered, 2);
});

test('a fresh arrival earns nothing, and the system says so instead of compensating him', () => {
  const mover = waiter('mover', 2, 999);
  const targetQueue = [waiter('a', 40, 1), waiter('b', 20, 2)];
  const rec = recommendFairPosition({ mover, targetQueue, now: NOW });
  assert.equal(rec.fairPosition, 3, 'the tail is already his fair place');
  assert.equal(rec.positionsRecovered, 0);
  assert.equal(equityWarranted(rec), false, 'an unnecessary exception is not applied');
  assert.match(rec.reasonArabic, /بلا تنازل/);
});

test('moving into an empty queue is first place and needs no exception', () => {
  const rec = recommendFairPosition({ mover: waiter('mover', 50, 999), targetQueue: [], now: NOW });
  assert.equal(rec.fairPosition, 1);
  assert.equal(rec.positionIfAppended, 1);
  assert.equal(equityWarranted(rec), false);
});

test('a participant already in the target queue is not compared against himself', () => {
  const mover = waiter('mover', 50, 5);
  const rec = recommendFairPosition({ mover, targetQueue: [waiter('a', 80, 1), mover], now: NOW });
  assert.equal(rec.targetQueueLength, 1);
  assert.equal(rec.fairPosition, 2);
});

/* ── مفتاح الترتيب ──────────────────────────────────────────────────────── */

test('the order key lands him exactly where the recommendation says, and moves nobody else', () => {
  const queue = [waiter('a', 80, 10), waiter('b', 70, 20), waiter('c', 60, 30), waiter('d', 40, 40)];
  const key = orderKeyForPosition(queue, 4);
  assert.ok(key > 30 && key < 40, `expected a key between C and D, got ${key}`);

  /* أعِد فرز الطابور بعد الإدراج وتحقّق من الموضع فعلًا. */
  const merged = [...queue.map(p => ({ id: p.id, key: p.queueOrderKey! })), { id: 'mover', key }].sort((x, y) => x.key - y.key);
  assert.equal(merged.findIndex(x => x.id === 'mover'), 3, 'fourth, counting from zero');
  assert.deepEqual(merged.map(x => x.id), ['a', 'b', 'c', 'mover', 'd'], 'and everyone else keeps their place');
});

test('first place and the tail both have a key', () => {
  const queue = [waiter('a', 80, 10), waiter('b', 70, 20)];
  assert.ok(orderKeyForPosition(queue, 1) < 10, 'ahead of the first');
  assert.ok(orderKeyForPosition(queue, 3) > 20, 'behind the last');
  assert.equal(orderKeyForPosition([], 1), 1, 'an empty queue still yields a usable key');
});

test('adjacent keys with no gap still produce a distinct position', () => {
  /* مفتاحان متلاصقان: الترتيب النسبي يكفي، ولا يُعاد ترقيم الطابور كلّه. */
  const queue = [waiter('a', 80, 5), waiter('b', 70, 5)];
  const key = orderKeyForPosition(queue, 2);
  assert.ok(Number.isFinite(key));
  assert.ok(key >= 5, 'never sorts ahead of the person it should follow');
});

test('a position beyond the queue is clamped rather than producing a hole', () => {
  const queue = [waiter('a', 80, 10)];
  assert.equal(orderKeyForPosition(queue, 99), 11);
  assert.ok(orderKeyForPosition(queue, 0) < 10, 'a zero position is clamped to the front');
});
