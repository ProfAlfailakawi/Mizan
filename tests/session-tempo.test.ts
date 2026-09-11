import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_TEMPO_SAMPLES, committeeTempo, describeEtaAccuracy, etaAccuracy,
  recentSamples, tempoMinutesByCommittee,
  type QueueWaitSample, type SessionTempoSample,
} from '../src/lib/session-tempo';

/*
 * `averageSessionMinutes` كان يُكتب مرّة عند إنشاء اللجنة ولا يتغيّر، ويُقرأ في كل موضعٍ
 * يمسّ زمن المتسابق. فلجنةٌ قُدّرت بثماني دقائق وهي تأخذ خمس عشرة كانت تُنتج أرقامًا
 * خاطئة على ثلاث شاشات وفي حساب الحِمل وفي خطة الموجة معًا.
 */

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();
const sample = (committeeId: string, minutes: number, minutesAgo = 10): SessionTempoSample =>
  ({ committeeId, participantId: `p-${minutes}-${minutesAgo}`, minutes, at: at(minutesAgo) });

const panel = (id: string, configured: number) => ({ id, averageSessionMinutes: configured });

/* ── التعلّم ────────────────────────────────────────────────────────────── */

test('a panel with too few sessions keeps its configured estimate, and says so', () => {
  /* تقديرٌ ضعيف أشرف من تعلّمٍ من جلستين. */
  const reading = committeeTempo(panel('c1', 8), [sample('c1', 15), sample('c1', 14)]);
  assert.equal(reading.minutes, 8);
  assert.equal(reading.source, 'configured');
  assert.equal(reading.sampleCount, 2);
  assert.equal(reading.driftMinutes, 0, 'no drift is claimed from an untrusted sample');
});

test('once there are enough sessions the panel is described by what it actually does', () => {
  const samples = [15, 16, 14, 15, 16].map((m, i) => sample('c1', m, i + 1));
  const reading = committeeTempo(panel('c1', 8), samples);
  assert.equal(reading.source, 'measured');
  assert.equal(reading.minutes, 15);
  assert.equal(reading.sampleCount, 5);
  assert.equal(reading.driftMinutes, 7, 'the configured eight minutes was seven minutes optimistic');
});

test('one broken session does not move the reading — the hall is full of those', () => {
  /* عطلُ صوتٍ نصفَ ساعة يُفسد المتوسّط ولا يحرّك الوسيط. */
  const samples = [10, 10, 10, 10, 90].map((m, i) => sample('c1', m, i + 1));
  const reading = committeeTempo(panel('c1', 10), samples);
  assert.equal(reading.minutes, 10, 'median holds where a mean would have jumped to 26');
});

test('the reading follows the day, not the morning', () => {
  /* نافذةٌ من ثمانٍ: جلساتُ الصباح لا تصف العصر. */
  const old = Array.from({ length: 8 }, (_, i) => sample('c1', 6, 500 + i));
  const fresh = Array.from({ length: 8 }, (_, i) => sample('c1', 18, i + 1));
  const reading = committeeTempo(panel('c1', 6), [...old, ...fresh]);
  assert.equal(reading.minutes, 18, 'the recent window governs');
  assert.equal(recentSamples([...old, ...fresh], 'c1').length, 8);
});

test('samples from another panel never leak into this one', () => {
  const samples = [...Array.from({ length: 6 }, (_, i) => sample('other', 30, i + 1)), ...Array.from({ length: 6 }, (_, i) => sample('c1', 9, i + 1))];
  assert.equal(committeeTempo(panel('c1', 12), samples).minutes, 9);
});

test('a zero or negative duration is discarded, never averaged in', () => {
  const samples = [{ ...sample('c1', 12, 1) }, { ...sample('c1', 0, 2) }, { ...sample('c1', -5, 3) }];
  assert.equal(recentSamples(samples, 'c1').length, 1);
});

test('the whole hall is read in one pass, and an unmeasured panel keeps its configuration', () => {
  const committees = [panel('c1', 8), panel('c2', 12)];
  const samples = Array.from({ length: 6 }, (_, i) => sample('c1', 15, i + 1));
  const byId = tempoMinutesByCommittee(committees, samples);
  assert.equal(byId.c1, 15, 'measured');
  assert.equal(byId.c2, 12, 'configured, untouched');
});

test('a panel configured with nothing still yields a usable minute', () => {
  const reading = committeeTempo(panel('c1', 0), []);
  assert.ok(reading.minutes >= 1, 'never zero — every downstream calculation divides or multiplies by this');
});

/* ── محاسبة التقدير ─────────────────────────────────────────────────────── */

const waited = (predicted: number, actual: number, i = 0): QueueWaitSample =>
  ({ participantId: `p${i}`, committeeId: 'c1', predictedMinutes: predicted, actualMinutes: actual, at: at(i + 1) });

test('a promise that was kept reads as kept', () => {
  const rows = Array.from({ length: 6 }, (_, i) => waited(20, 20, i));
  const a = etaAccuracy(rows);
  assert.equal(a.meanAbsoluteErrorMinutes, 0);
  assert.equal(a.biasMinutes, 0);
  assert.equal(a.withinFiveMinutesRate, 1);
  assert.equal(a.trustworthy, true);
});

test('a system that promises short is caught promising short', () => {
  /* وُعد بعشرين فمضت ثلاثون: ميلٌ موجبٌ عشر دقائق. */
  const rows = Array.from({ length: 6 }, (_, i) => waited(20, 30, i));
  const a = etaAccuracy(rows);
  assert.equal(a.biasMinutes, 10);
  assert.equal(a.meanAbsoluteErrorMinutes, 10);
  assert.equal(a.withinFiveMinutesRate, 0);
  assert.match(describeEtaAccuracy(a), /أطول من الوعد/);
});

test('a system that promises long is caught too — the accounting runs both ways', () => {
  const rows = Array.from({ length: 6 }, (_, i) => waited(40, 25, i));
  const a = etaAccuracy(rows);
  assert.equal(a.biasMinutes, -15);
  assert.match(describeEtaAccuracy(a), /أقصر من الوعد/);
});

test('one wild wait does not condemn an otherwise honest estimate', () => {
  const rows = [...Array.from({ length: 9 }, (_, i) => waited(20, 21, i)), waited(20, 200, 9)];
  const a = etaAccuracy(rows);
  assert.equal(a.medianAbsoluteErrorMinutes, 1, 'the median stays honest');
  assert.ok(a.meanAbsoluteErrorMinutes > 15, 'while the mean is dragged — which is why both are reported');
});

test('accuracy is not claimed from a handful of waits', () => {
  const a = etaAccuracy([waited(10, 40, 1)]);
  assert.equal(a.trustworthy, false);
  assert.match(describeEtaAccuracy(a), /عيّنة صغيرة/);
  assert.equal(etaAccuracy([]).sampleCount, 0, 'an empty day is not an error');
});

test('the reading states plainly that it ranks nobody', () => {
  /* النظام يحظر ترتيب اللجان بالسرعة؛ رقمٌ كهذا أقرب ما يكون إلى خرقه. */
  assert.match(etaAccuracy([]).statement, /ولا يُرتَّب به أحد/);
});

test('the sample thresholds are one number, shared by tempo and accuracy', () => {
  assert.equal(MIN_TEMPO_SAMPLES, 5);
  assert.equal(etaAccuracy(Array.from({ length: MIN_TEMPO_SAMPLES }, (_, i) => waited(10, 10, i))).trustworthy, true);
  assert.equal(etaAccuracy(Array.from({ length: MIN_TEMPO_SAMPLES - 1 }, (_, i) => waited(10, 10, i))).trustworthy, false);
});
