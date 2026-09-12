import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOCK_MEASUREMENT_STALE_AFTER_SECONDS, UNSYNCED_COMPETITION_CLOCK,
  adoptReferenceTime, competitionClockStatus, competitionNow, selfAsReference,
} from '../src/lib/competition-clock';
import { DEFAULT_RESERVATION_TTL_SECONDS, expireReservations, reserveQuestions } from '../src/lib/question-reservation';
import type { QuestionReservationRecord } from '../src/types';

/*
 * ساعةُ المسابقة، لا ساعةُ الجهاز.
 *
 * العلّة لم تكن أن ساعةً **خاطئة**، بل أن الساعات **مختلفة**. فالمدد نسبية: لو أخطأت
 * الساعاتُ كلُّها ساعةً كاملة واتفقت، بقي ربعُ الساعة ربعَ ساعةٍ حقيقية. وهذا ما تثبته
 * هذه الفحوص.
 *
 * والساعة تتبع المسابقة لا الشخص: لكل جهةٍ أجهزتها ومرجعُها. ولا تحتاج جهتان أن تتفقا
 * على ساعة، لأن دفتريهما معزولان (انظر reservation-tenant-isolation.test.ts).
 */

let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;
const REAL = '2026-05-01T10:00:00.000Z';
const shift = (base: string, minutes: number) => new Date(new Date(base).getTime() + minutes * 60000).toISOString();

test('الفرق يُحفظ لا الوقت، فيبقى صحيحًا بعد انقطاع الشبكة', () => {
  /* جهازُ قاعةٍ ساعته متأخرة ٣٠ دقيقة يلتقي المرجع مرة واحدة. */
  const clock = adoptReferenceTime({ referenceDeviceId: 'dev-edge', referenceNow: REAL, deviceNow: shift(REAL, -30) });
  assert.equal(clock.offsetMs, 30 * 60000);

  /* ثم تنقطع الشبكة ساعتين — والفرق ما زال يصحّح. */
  assert.equal(competitionNow(clock, shift(REAL, -30 + 120)), shift(REAL, 120));
});

test('ساعتان مختلفتان على مرجعٍ واحد تتفقان على انقضاء الحجز', () => {
  const reference = REAL;
  const slow = adoptReferenceTime({ referenceDeviceId: 'dev-edge', referenceNow: reference, deviceNow: shift(REAL, -30) });
  const fast = adoptReferenceTime({ referenceDeviceId: 'dev-edge', referenceNow: reference, deviceNow: shift(REAL, +45) });

  /* القاعة البطيئة تحجز بساعة المسابقة. */
  const reserved = reserveQuestions({
    records: [], organizationId: 'org-1', competitionId: 'comp-1',
    items: [{ locusKey: '2:255', questionId: 'q-1' }], participantId: 'p-1',
    idempotencyKey: 'k1', actorId: 'hall-slow', ttlSeconds: DEFAULT_RESERVATION_TTL_SECONDS,
    now: competitionNow(slow, shift(REAL, -30)), newId,
  });

  /* والقاعة السريعة تكنس بساعة المسابقة كذلك — فلا تُسقط حجزًا حيًّا. */
  const declaredMinutes = DEFAULT_RESERVATION_TTL_SECONDS / 60;
  const beforeExpiry = competitionNow(fast, shift(REAL, 45 + declaredMinutes - 1));
  assert.equal(expireReservations(reserved.records, beforeExpiry).changed.length, 0, 'حجزٌ حيّ كُنس قبل أوانه');

  /* ولا تُبقيه بعد أوانه. */
  const afterExpiry = competitionNow(fast, shift(REAL, 45 + declaredMinutes));
  assert.equal(expireReservations(reserved.records, afterExpiry).changed.length, 1);
});

test('ولو أخطأت الساعاتُ كلُّها واتفقت، بقيت المدة المعلنة هي الواقعة', () => {
  /* المرجع نفسه مقدَّم ساعةً كاملة — وكلُّ الأجهزة تتبعه. */
  const wrongReference = shift(REAL, 60);
  const device = adoptReferenceTime({ referenceDeviceId: 'dev-edge', referenceNow: wrongReference, deviceNow: REAL });
  const declaredMinutes = DEFAULT_RESERVATION_TTL_SECONDS / 60;

  const reserved = reserveQuestions({
    records: [], organizationId: 'org-1', competitionId: 'comp-1',
    items: [{ locusKey: '36:1', questionId: 'q-2' }], participantId: 'p-2',
    idempotencyKey: 'k2', actorId: 'hall', ttlSeconds: DEFAULT_RESERVATION_TTL_SECONDS,
    now: competitionNow(device, REAL), newId,
  });

  /* بعد ١٤ دقيقة **حقيقية** ما زال قائمًا، وبعد ١٥ انقضى. الخطأ المشترك لا يضرّ. */
  assert.equal(expireReservations(reserved.records, competitionNow(device, shift(REAL, declaredMinutes - 1))).changed.length, 0);
  assert.equal(expireReservations(reserved.records, competitionNow(device, shift(REAL, declaredMinutes))).changed.length, 1);
});

test('جهازٌ لم يلتقِ المرجع يعمل بساعته — ويُعلن ذلك ولا يسكت', () => {
  assert.equal(competitionNow(UNSYNCED_COMPETITION_CLOCK, REAL), REAL);
  const status = competitionClockStatus(UNSYNCED_COMPETITION_CLOCK, REAL);
  assert.equal(status.source, 'local_unsynced');
  assert.equal(status.noteworthy, true);
  assert.match(status.ar, /لم يأخذ ساعته/);
});

test('وقياسٌ قديم يبقى مستعملًا ويُعلَن قِدَمه — خيرٌ من لا شيء', () => {
  const clock = adoptReferenceTime({ referenceDeviceId: 'dev-edge', referenceNow: REAL, deviceNow: shift(REAL, -30) });
  const muchLater = shift(REAL, -30 + (CLOCK_MEASUREMENT_STALE_AFTER_SECONDS / 60) + 10);
  const status = competitionClockStatus(clock, muchLater);
  assert.equal(status.source, 'local_stale');
  assert.equal(status.noteworthy, true);
  /* ومع ذلك الفرق مطبَّق. */
  assert.equal(competitionNow(clock, muchLater), shift(REAL, (CLOCK_MEASUREMENT_STALE_AFTER_SECONDS / 60) + 10));
});

test('والجهاز المرجعي نفسه فرقُه صفر بالتعريف', () => {
  const clock = selfAsReference('dev-edge', REAL);
  assert.equal(clock.offsetMs, 0);
  assert.equal(competitionNow(clock, REAL), REAL);
  assert.equal(competitionClockStatus(clock, REAL).noteworthy, false);
});
