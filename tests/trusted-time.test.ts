import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeAuthority, evaluateLease, issueServerLease, type TimeAuthorityOptions } from '../src/lib/trusted-time';
import { DEFAULT_RESERVATION_TTL_SECONDS, blockedLocusKeys, expireReservations, reserveQuestions } from '../src/lib/question-reservation';

/*
 * الساعة خصمًا — الجولة الثانية.
 *
 * في tests/reservation-clock-skew.test.ts أُثبت الضرر مقيسًا: جهازٌ ساعته متأخرة يكتب
 * حجزًا وُلد منقضيًا، وجهازٌ ساعته متقدمة يحجب ثلاثة أضعاف المدة المعلنة. وذلك الملف باقٍ
 * على حاله: هو يقيس ما يقع حين لا مرجع للوقت.
 *
 * وهذا الملف يقيس ما يقع **بعد** أن صار للوقت مرجع. والفحوص هنا مبنية على أن الانحراف
 * واقعٌ لا يُمنع — والذي يُمنع هو أن يترتب عليه ضرر.
 */

/* ساعةٌ مصنوعة: الرتيبة والمطلقة منفصلتان، فيمكن تحريك إحداهما دون الأخرى — وهذا هو
   عين ما يقع في الواقع حين يُعدَّل وقت الجهاز أو يُعاد تشغيله. */
function fakeClocks(options: { skewMinutes: number; realEpochMs: number }) {
  let monotonic = 1_000;
  let realEpochMs = options.realEpochMs;
  let skewMs = options.skewMinutes * 60_000;
  return {
    authorityOptions: {
      monotonicNow: () => monotonic,
      deviceNow: () => realEpochMs + skewMs,
    },
    advance(ms: number) { monotonic += ms; realEpochMs += ms; },
    /** يُعدَّل وقت الجهاز وحده — الساعة الرتيبة لا تتأثر، وهذا هو الفرق كله. */
    setSkewMinutes(minutes: number) { skewMs = minutes * 60_000; },
    restartDevice() { monotonic = 0; },
    serverNow: () => realEpochMs,
    deviceNow: () => realEpochMs + skewMs,
    monotonicNow: () => monotonic,
  };
}

function synchronized(clocks: ReturnType<typeof fakeClocks>, options?: Partial<TimeAuthorityOptions>) {
  const authority = new TimeAuthority({ ...clocks.authorityOptions, ...(options || {}) });
  const sent = clocks.monotonicNow();
  clocks.advance(40);
  authority.recordSample({ sentMonotonicMs: sent, receivedMonotonicMs: clocks.monotonicNow(), serverEpochMs: clocks.serverNow() });
  return authority;
}

/*
 * تقدُّمٌ مع مزامنةٍ دورية — وهو ما يفعله جهاز القاعة الموصول فعلًا.
 *
 * والعقد الافتراضي `fail_closed` يشترط مزامنةً أحدث من عشر دقائق، وحجزُ ربع الساعة أطول
 * منها. فجهازٌ يصمت عشرين دقيقة لا يحكم على انقضاءٍ — وهذا هو المقصود لا خلل فيه: من
 * انقطع عن المرجع لا يقرّر بالمرجع. ولذلك تُقاس المدة هنا كما تُقاس في التشغيل.
 */
function advanceWithSync(clocks: ReturnType<typeof fakeClocks>, authority: TimeAuthority, totalMs: number, stepMs = 60_000) {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(stepMs, remaining);
    clocks.advance(step);
    remaining -= step;
    const sent = clocks.monotonicNow();
    clocks.advance(20);
    remaining = Math.max(0, remaining - 20);
    authority.recordSample({ sentMonotonicMs: sent, receivedMonotonicMs: clocks.monotonicNow(), serverEpochMs: clocks.serverNow() });
  }
}

const REAL_NOW = Date.parse('2026-05-01T10:00:00.000Z');
const SKEWS = [-30, -5, 0, 5, 30];

test('انحراف ساعة الجهاز لا يغيّر الوقت الموثوق: خمس حالات من −٣٠ إلى +٣٠ دقيقة', () => {
  for (const skewMinutes of SKEWS) {
    const clocks = fakeClocks({ skewMinutes, realEpochMs: REAL_NOW });
    const authority = synchronized(clocks);
    const instant = authority.now();
    assert.equal(instant.trusted, true, `انحراف ${skewMinutes}: الوقت غير موثوق بعد مزامنة ناجحة`);
    assert.ok(Math.abs(instant.epochMs - clocks.serverNow()) <= 25, `انحراف ${skewMinutes}: الوقت الموثوق بعيدٌ عن وقت الخادم بـ${instant.epochMs - clocks.serverNow()} ملّي ثانية`);
    // وانحراف الجهاز نفسه يُقاس ويُعلن بدل أن يُطوى.
    const offset = authority.clockOffsetMs();
    assert.ok(Math.abs((offset || 0) + skewMinutes * 60_000) <= 60, `انحراف ${skewMinutes}: لم يُقَس الانحراف قياسًا صحيحًا (${offset})`);
  }
});

test('إجازةٌ لا تولد منقضية مهما كان انحراف الجهاز الذي أصدر الطلب', () => {
  for (const skewMinutes of SKEWS) {
    const clocks = fakeClocks({ skewMinutes, realEpochMs: REAL_NOW });
    const authority = synchronized(clocks);
    const lease = issueServerLease({ leaseId: `L-${skewMinutes}`, subject: '2:255', serverNowMs: clocks.serverNow(), ttlSeconds: 900 });
    const verdict = evaluateLease(lease, authority);
    assert.equal(verdict.state, 'active', `انحراف ${skewMinutes}: الإجازة وُلدت غير نشطة (${verdict.state})`);
    assert.ok((verdict.remainingMs || 0) > 890_000, `انحراف ${skewMinutes}: المدة المتبقية ${verdict.remainingMs} أقلّ من المعلنة`);
  }
});

test('المدة المعلنة هي المدة الواقعة: لا تطول بانحراف الجهاز ولا تقصر', () => {
  for (const skewMinutes of SKEWS) {
    const clocks = fakeClocks({ skewMinutes, realEpochMs: REAL_NOW });
    const authority = synchronized(clocks);
    const lease = issueServerLease({ leaseId: 'L', subject: '2:255', serverNowMs: clocks.serverNow(), ttlSeconds: 900 });
    advanceWithSync(clocks, authority, 880_000);
    assert.equal(evaluateLease(lease, authority).state, 'active', `انحراف ${skewMinutes}: انقضت قبل أوانها`);
    advanceWithSync(clocks, authority, 40_000);
    assert.equal(evaluateLease(lease, authority).state, 'expired', `انحراف ${skewMinutes}: لم تنقضِ بعد أوانها`);
  }
});

test('تعديل ساعة الجهاز أثناء الحجز لا يُقدّم الانقضاء ولا يؤخّره', () => {
  const clocks = fakeClocks({ skewMinutes: 0, realEpochMs: REAL_NOW });
  const authority = synchronized(clocks);
  const lease = issueServerLease({ leaseId: 'L', subject: '2:255', serverNowMs: clocks.serverNow(), ttlSeconds: 900 });
  advanceWithSync(clocks, authority, 300_000);
  clocks.setSkewMinutes(-45); // شخصٌ عدّل وقت الجهاز في منتصف الجلسة.
  assert.equal(evaluateLease(lease, authority).state, 'active', 'تعديل الساعة حرّر الموضع والمتسابق قائم');
  clocks.setSkewMinutes(+45);
  assert.equal(evaluateLease(lease, authority).state, 'active', 'تعديل الساعة قدّم الانقضاء');
  advanceWithSync(clocks, authority, 620_000);
  assert.equal(evaluateLease(lease, authority).state, 'expired', 'لم تنقضِ بعد انتهاء المدة الحقيقية');
});

test('إعادة تشغيل الجهاز تُسقط المرساة، ولا يُبنى على وقتٍ بلا مرجع', () => {
  const clocks = fakeClocks({ skewMinutes: 12, realEpochMs: REAL_NOW });
  const authority = synchronized(clocks);
  assert.equal(authority.now().trusted, true);
  clocks.restartDevice();
  const after = authority.now();
  assert.equal(after.trusted, false, 'الساعة الرتيبة صُفِّرت والمرساة ما زالت تُصدَّق');
  assert.equal(after.source, 'device');
  const decision = authority.requireTrustedNow('انقضاء الحجز');
  assert.equal(decision.ok, false, 'حالةٌ حرجة مرّت على ساعة جهازٍ بلا مرجع');
  assert.equal(decision.code, 'TIME_NOT_SYNCHRONIZED');
});

test('العقد حين ينقطع الخادم معلَنٌ لا مجتهَد فيه: ثلاثة سلوكيات مختلفة', () => {
  const build = (offlinePolicy: 'fail_closed' | 'monotonic_window' | 'device_clock_declared') => {
    const clocks = fakeClocks({ skewMinutes: 20, realEpochMs: REAL_NOW });
    const authority = synchronized(clocks, { offlinePolicy, maxSyncAgeMs: 60_000 });
    clocks.advance(3_600_000); // ساعةٌ كاملة بلا مزامنة.
    return { authority, clocks };
  };

  const closed = build('fail_closed');
  assert.equal(closed.authority.requireTrustedNow('نافذة نصاب').ok, false, 'fail_closed سمح بحالةٍ حرجة على مزامنةٍ بائتة');
  assert.equal(closed.authority.requireTrustedNow('نافذة نصاب').code, 'TIME_SYNC_STALE');

  const windowed = build('monotonic_window');
  const windowedDecision = windowed.authority.requireTrustedNow('نافذة نصاب');
  assert.equal(windowedDecision.ok, true, 'monotonic_window رفض مرساةً صحيحة');
  // والوقت يبقى قريبًا من وقت الخادم رغم انحراف الجهاز عشرين دقيقة.
  assert.ok(Math.abs(windowedDecision.instant.epochMs - windowed.clocks.serverNow()) <= 100);
  assert.ok(windowedDecision.instant.uncertaintyMs > 0, 'سعة الشك لا تكون صفرًا بعد ساعةٍ بلا مزامنة');

  const declared = build('device_clock_declared');
  const declaredDecision = declared.authority.requireTrustedNow('نافذة نصاب');
  assert.equal(declaredDecision.ok, true);
  assert.equal(declaredDecision.instant.trusted, false, 'device_clock_declared يجب أن يصرّح بعدم الثقة لا أن يدّعيها');
});

test('لا حجزٌ قديم يحجب بلا نهاية: المدة الرتيبة سدٌّ أخير حين ينقطع المرجع', () => {
  const clocks = fakeClocks({ skewMinutes: 0, realEpochMs: REAL_NOW });
  const authority = synchronized(clocks, { maxSyncAgeMs: 60_000 });
  const lease = issueServerLease({ leaseId: 'L', subject: '2:255', serverNowMs: clocks.serverNow(), ttlSeconds: 900 });
  const firstSeen = authority.monotonic();

  clocks.advance(120_000); // انقطع الخادم، والمزامنة بائتة.
  const early = evaluateLease(lease, authority, { firstSeenMonotonicMs: firstSeen });
  assert.equal(early.state, 'untrusted_clock', 'حُكم بالانقضاء قبل انتهاء المدة وبلا مرجع');

  clocks.advance(800_000); // مضت المدة كاملةً على الساعة الرتيبة.
  const late = evaluateLease(lease, authority, { firstSeenMonotonicMs: firstSeen });
  assert.equal(late.state, 'expired', 'بقي الحجز حاجبًا إلى الأبد لأن الشبكة انقطعت');
  assert.ok(late.reason?.includes('المدة الرتيبة'), 'سبب الانقضاء يجب أن يقول إنه بالمدة لا باللحظة');
});

test('لا يُعلن انقضاءٌ داخل سعة الشك — والشك يُعلن بدل أن يُحسم بالحدس', () => {
  const clocks = fakeClocks({ skewMinutes: 0, realEpochMs: REAL_NOW });
  const authority = new TimeAuthority(clocks.authorityOptions);
  const sent = clocks.monotonicNow();
  clocks.advance(4_000); // رحلةٌ بطيئة جدًا: سعة الشك ألفا ملّي ثانية.
  authority.recordSample({ sentMonotonicMs: sent, receivedMonotonicMs: clocks.monotonicNow(), serverEpochMs: clocks.serverNow() });
  const lease = issueServerLease({ leaseId: 'L', subject: '2:255', serverNowMs: clocks.serverNow(), ttlSeconds: 10 });
  clocks.advance(10_000);
  const verdict = evaluateLease(lease, authority);
  assert.equal(verdict.state, 'indeterminate', 'حُسم حدٌّ يقع داخل سعة الشك');
  assert.ok(verdict.reason?.includes('سعة الشك'));
});

test('سلطة الوقت تُغذّي دورة حياة الحجز القائمة بلا تغيير فيها', () => {
  /*
   * الفحص هنا على التركيب لا على الاستبدال: `reserveQuestions` و`expireReservations`
   * تبقيان كما هما وتأخذان `now` نصًّا، وإنما يأتيهما النصّ من سلطة الوقت بدل
   * `new Date().toISOString()`. وبذلك يزول الضرر المقيس في ملف الانحراف القديم.
   */
  let counter = 0;
  const newId = (prefix: string) => `${prefix}-${++counter}`;
  const clocks = fakeClocks({ skewMinutes: -30, realEpochMs: REAL_NOW });
  const lateDevice = synchronized(clocks);

  const reservation = reserveQuestions({
    records: [], organizationId: 'org-1', competitionId: 'comp-1',
    items: [{ locusKey: '2:255', questionId: 'q-1' }],
    participantId: 'p-late', idempotencyKey: 'k-1', actorId: 'device',
    now: lateDevice.nowIso(), ttlSeconds: DEFAULT_RESERVATION_TTL_SECONDS, newId,
  });
  assert.equal(reservation.created.length, 1);

  // جهازٌ ثانٍ ساعته صحيحة، ومرجعه الخادم نفسه.
  const sameServer = fakeClocks({ skewMinutes: 0, realEpochMs: REAL_NOW });
  const healthyDevice = synchronized(sameServer);
  const swept = expireReservations(reservation.records, healthyDevice.nowIso());
  assert.equal(swept.changed.length, 0, 'الحجز وُلد منقضيًا رغم أن الوقت صار له مرجع');
  assert.equal(blockedLocusKeys(swept.records, healthyDevice.nowIso()).has('2:255'), true, 'الموضع صار حرًّا والمتسابق قائم');
});
