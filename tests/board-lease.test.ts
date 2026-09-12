import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_SPREAD_MS, LEASE_MS, RENEW_MS, claimOffsetMs, decidePublish, describePublisherRole,
  observeLease, type LeaseWatch,
} from '../src/lib/board-lease';
import { BOARD_LAGGING_MS } from '../src/lib/display-board';

/*
 * كل شاشات القاعة كانت معلّقة بتبويبٍ واحد: يُغلق فتتوقّف عشرُ شاشاتٍ معًا، والشاشات
 * تقول الصدق ولا أحد يعرف أن السبب عنده. هذه اختباراتُ التناوب الذي يمنع ذلك.
 */

const decide = (over: Partial<Parameters<typeof decidePublish>[0]> = {}) =>
  decidePublish({ selfId: 'A', eligible: true, watch: null, contentChanged: false, now: 0, ...over });

const watch = (publisherId: string, firstSeenAt: number, stamp = 's1'): LeaseWatch => ({ publisherId, stamp, firstSeenAt });

/* ── الملاحظة: القياس لا يعبر بين ساعتين ───────────────────────────────── */

test('an unchanged stamp keeps the original sighting, so silence accumulates', () => {
  const first = observeLease(null, { publisherId: 'A', stamp: 's1' }, 1000);
  const again = observeLease(first, { publisherId: 'A', stamp: 's1' }, 9000);
  assert.equal(again, first, 'the same object — nothing restarted the clock');
  assert.equal(again!.firstSeenAt, 1000);
});

test('any change to the stamp restarts this device’s own clock', () => {
  const first = observeLease(null, { publisherId: 'A', stamp: 's1' }, 1000);
  const next = observeLease(first, { publisherId: 'A', stamp: 's2' }, 9000);
  assert.equal(next!.firstSeenAt, 9000);
});

test('a different publisher restarts it too, even at the same stamp', () => {
  const first = observeLease(null, { publisherId: 'A', stamp: 's1' }, 1000);
  const next = observeLease(first, { publisherId: 'B', stamp: 's1' }, 5000);
  assert.equal(next!.publisherId, 'B');
  assert.equal(next!.firstSeenAt, 5000);
});

test('a publisher whose clock is an hour behind is still read as alive', () => {
  /* الخطر الحقيقي: ختمٌ كُتب بساعةٍ متأخّرة كان سيُقرأ عقدًا منتهيًا أبدًا فيُتخاطف بلا توقّف.
     الختم هنا نصٌّ يُقارَن، لا زمنٌ يُطرح — فساعة كاتبه لا تدخل الحساب أصلًا. */
  const stamp = new Date(Date.now() - 3600_000).toISOString();
  const seen = observeLease(null, { publisherId: 'B', stamp }, 100_000);
  const d = decidePublish({ selfId: 'A', eligible: true, watch: seen, contentChanged: false, now: 100_000 });
  assert.equal(d.publish, false);
  assert.equal(d.role, 'STANDBY');
});

test('an absent or malformed lease reads as no lease at all', () => {
  assert.equal(observeLease(null, null, 0), null);
  assert.equal(observeLease(null, { publisherId: '', stamp: 's' }, 0), null);
  assert.equal(observeLease(null, { publisherId: 'A', stamp: '' }, 0), null);
});

/* ── القرار ────────────────────────────────────────────────────────────── */

test('a device that may not publish never publishes, whatever it sees', () => {
  const d = decide({ eligible: false, watch: null, contentChanged: true, now: 10 ** 9 });
  assert.equal(d.publish, false);
  assert.equal(d.role, 'INELIGIBLE');
});

test('an unpublished board is claimed at once — a dark screen beats a tidy handover', () => {
  const d = decide({ watch: null });
  assert.equal(d.publish, true);
  assert.equal(d.reason, 'NO_PUBLISHER');
});

test('the publisher holds quiet while nothing changed and the lease is fresh', () => {
  const d = decide({ watch: watch('A', 0), now: RENEW_MS - 1 });
  assert.equal(d.publish, false);
  assert.equal(d.role, 'LEADER', 'quiet, but still the publisher');
  assert.equal(d.reason, 'HOLDING');
});

test('a change to what the hall sees is published immediately, not at the next heartbeat', () => {
  const d = decide({ watch: watch('A', 0), contentChanged: true, now: 1 });
  assert.equal(d.publish, true);
  assert.equal(d.reason, 'CONTENT_CHANGED');
});

test('a quiet hall still gets a heartbeat, so no screen claims a stall that is not there', () => {
  const d = decide({ watch: watch('A', 0), now: RENEW_MS });
  assert.equal(d.publish, true);
  assert.equal(d.reason, 'RENEWING');
});

test('a standby stays silent while the publisher is alive — it does not write, it watches', () => {
  const d = decide({ selfId: 'A', watch: watch('B', 0), contentChanged: true, now: LEASE_MS - 1 });
  assert.equal(d.publish, false);
  assert.equal(d.role, 'STANDBY');
  assert.equal(d.publisherId, 'B');
});

test('a standby takes over once the publisher has gone silent', () => {
  const d = decide({ selfId: 'A', watch: watch('B', 0), now: LEASE_MS + CLAIM_SPREAD_MS });
  assert.equal(d.publish, true);
  assert.equal(d.reason, 'PUBLISHER_SILENT');
});

/* ── التزاحم ───────────────────────────────────────────────────────────── */

test('two standbys seeing the same silence do not claim in the same instant', () => {
  const ids = ['device-alpha', 'device-beta', 'device-gamma', 'device-delta'];
  const offsets = ids.map(claimOffsetMs);
  assert.equal(new Set(offsets).size, ids.length, 'each device waits its own amount');
  offsets.forEach(o => { assert.ok(o >= 0 && o < CLAIM_SPREAD_MS) });
});

test('the same device always waits the same amount, so the wait is not a lottery each tick', () => {
  assert.equal(claimOffsetMs('device-alpha'), claimOffsetMs('device-alpha'));
});

test('the slower claimant stands down the moment it sees the faster one publish', () => {
  /* التبعثر لا يمنع التزاحم بيقين، لكن الخاسر يتراجع في الدورة التالية بلا حالةٍ إضافية. */
  const slow = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => [id, claimOffsetMs(id)] as const).sort((x, y) => y[1] - x[1])[0][0];
  const seenTakeover = observeLease(watch('B', 0), { publisherId: 'FASTER', stamp: 's2' }, LEASE_MS + 500);
  const d = decidePublish({ selfId: slow, eligible: true, watch: seenTakeover, contentChanged: false, now: LEASE_MS + 600 });
  assert.equal(d.publish, false);
  assert.equal(d.role, 'STANDBY');
});

/* ── ميزانية الزمن ─────────────────────────────────────────────────────── */

test('a takeover completes before any screen would report a stall', () => {
  /*
   * أسوأ حالة: ينشر الناشر ثم يموت فورًا. عمر الإسقاط لحظتَها صفر، ويبدأ يكبر. ويحتاج
   * البديل: انتهاءَ العقد، وتأخيرَ مطالبته، ودورةَ فحصٍ كاملة. ومجموع ذلك يجب أن يقع
   * تحت الحدّ الذي تُعلن عنده الشاشة تأخّرها — وإلّا لَومَضت كل شاشةٍ في القاعة عند كل
   * تناوبٍ عادي، فتصير رسالة التأخّر ضجيجًا لا يُصدَّق.
   */
  const worstTakeoverMs = LEASE_MS + CLAIM_SPREAD_MS + 4_000;
  assert.ok(worstTakeoverMs < BOARD_LAGGING_MS, `${worstTakeoverMs}ms must stay under ${BOARD_LAGGING_MS}ms`);
});

test('the publisher renews well before its own lease could expire under another device', () => {
  /* لولا ذلك لسرق الاحتياطُ العقدَ من ناشرٍ يعمل تمامًا، فتناوبت الأجهزة بلا سبب. */
  assert.ok(RENEW_MS * 2 <= LEASE_MS, 'a missed heartbeat must still leave the lease alive');
});

/* ── المحاسبة في غرفة العمليات ─────────────────────────────────────────── */

test('the operator is told plainly that the screens hang on this device', () => {
  const leader = decide({ watch: watch('A', 0) });
  assert.match(describePublisherRole(leader, true), /من هذا الجهاز/);
  const standby = decide({ selfId: 'A', watch: watch('B', 0) });
  assert.match(describePublisherRole(standby, true), /جهازٌ آخر/);
  assert.match(describePublisherRole(decide({ eligible: false }), true), /لا ينشر/);
});
