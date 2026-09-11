import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_RETROSPECTIVE_VERSION, buildDayRetrospective } from '../src/lib/day-retrospective';
import type { Committee, IncidentRecord, Participant, QueueTransferRecord } from '../src/types';
import type { QueueWaitSample, SessionTempoSample } from '../src/lib/session-tempo';

/*
 * المنصّة كلّها لليوم نفسه، ولا شيء فيها ينظر إلى الوراء. فتُغلق المسابقة ويُعاد إعدادها
 * في السنة القادمة بالأرقام نفسها التي ثبت خطؤها — لأن أحدًا لم يقارن ما قُدّر بما وقع.
 */

const COMP = 'comp-1';
const NOW = new Date('2026-01-01T18:00:00.000Z');

const participant = (id: string, over: Partial<Participant> = {}): Participant =>
  ({ id, competitionId: COMP, code: id.toUpperCase(), status: 'tested', statusHistory: [], categoryId: 'cat-1', ...over } as unknown as Participant);

const committee = (id: string, over: Partial<Committee> = {}): Committee =>
  ({ id, competitionId: COMP, code: id.toUpperCase(), name: id, nameArabic: `اللجنة ${id}`,
     status: 'ready', assignedCategories: ['cat-1'], averageSessionMinutes: 8, judgeIds: [], completedCount: 0, ...over } as unknown as Committee);

const tempo = (committeeId: string, minutes: number, i: number): SessionTempoSample =>
  ({ committeeId, participantId: `p${i}`, minutes, at: new Date(NOW.getTime() - i * 60000).toISOString() });

const wait = (predicted: number, actual: number, i: number): QueueWaitSample =>
  ({ participantId: `p${i}`, committeeId: 'c1', predictedMinutes: predicted, actualMinutes: actual, at: new Date(NOW.getTime() - i * 60000).toISOString() });

const build = (over: Partial<Parameters<typeof buildDayRetrospective>[0]> = {}) => buildDayRetrospective({
  competitionId: COMP, participants: [], committees: [], transfers: [], incidents: [],
  tempoSamples: [], waitSamples: [], now: NOW, ...over,
});

/* ── إيقاع اللجان مقابل ما قُدّر ────────────────────────────────────────── */

test('a panel that ran longer than configured says so, with the number', () => {
  const samples = Array.from({ length: 6 }, (_, i) => tempo('c1', 15, i + 1));
  const r = build({ committees: [committee('c1', { averageSessionMinutes: 8, completedCount: 6 })], tempoSamples: samples });

  assert.equal(r.panels[0].configuredMinutes, 8);
  assert.equal(r.panels[0].measuredMinutes, 15);
  assert.equal(r.panels[0].driftMinutes, 7);
  assert.ok(r.lessons.some(l => /أقصر من الواقع/.test(l.titleArabic)), 'the lesson names the direction of the error');
});

test('a panel with too few sessions is reported as unmeasured, not guessed', () => {
  const r = build({ committees: [committee('c1')], tempoSamples: [tempo('c1', 20, 1)] });
  assert.equal(r.panels[0].measuredMinutes, null);
  assert.equal(r.panels[0].driftMinutes, null);
  assert.equal(r.panels[0].sampleCount, 1);
});

test('a drift too small to act on is not turned into a lesson', () => {
  /* فارقُ دقيقةٍ ضجيجٌ لا درس. */
  const samples = Array.from({ length: 6 }, (_, i) => tempo('c1', 9, i + 1));
  const r = build({ committees: [committee('c1', { averageSessionMinutes: 8 })], tempoSamples: samples });
  assert.ok(!r.lessons.some(l => /زمن الجلسة/.test(l.titleArabic)));
});

test('a panel that finished faster than configured is a lesson too, in the other direction', () => {
  const samples = Array.from({ length: 6 }, (_, i) => tempo('c1', 5, i + 1));
  const r = build({ committees: [committee('c1', { averageSessionMinutes: 12 })], tempoSamples: samples });
  assert.equal(r.panels[0].driftMinutes, -7);
  assert.ok(r.lessons.some(l => /أطول من الواقع/.test(l.titleArabic)));
});

/* ── ما اضطُرّت إليه القاعة ─────────────────────────────────────────────── */

test('every strain the hall absorbed is counted, because each is a setup gap', () => {
  const r = build({
    participants: [
      participant('p1', { status: 'in_queue' }),
      participant('p2', { status: 'in_queue', assignedCommitteeId: undefined }),
      participant('p3', { crossCategoryException: { at: NOW.toISOString(), fromCommitteeId: 'c1', toCommitteeId: 'c2', approvedBy: 'x', reason: 'y' } }),
    ],
    transfers: [{
      id: 't1', competitionId: COMP, sourceCommitteeId: 'c1', targetCommitteeId: 'c2', participantIds: ['p1'],
      mode: 'EQUITY_BY_WAITING_TIME', reason: 'r', requestedAt: NOW.toISOString(), requestedBy: 'u', status: 'APPLIED', changes: [],
      equity: [{ participantId: 'p1', waitedMinutes: 50, positionIfAppended: 11, fairPosition: 4 }],
    } as unknown as QueueTransferRecord],
    incidents: [{ id: 'i1', competitionId: COMP, type: 'conflict_routing', severity: 'critical', title: 't', description: 'd', reportedBy: 'x', reportedAt: NOW.toISOString(), status: 'active' } as unknown as IncidentRecord],
  });

  assert.equal(r.strain.queueTransfers, 1);
  assert.equal(r.strain.crossCategoryExceptions, 1);
  assert.equal(r.strain.equityCompensations, 1, 'only a transfer that actually recovered places counts');
  assert.equal(r.strain.unroutedArrivals, 2);
  assert.equal(r.strain.routingIncidents, 1);
  assert.ok(r.lessons.some(l => /ثغرة إعداد/.test(l.detailArabic)), 'and it is named as a setup gap, not an operations fault');
});

test('a transfer that recovered nobody is not counted as a compensation', () => {
  const r = build({
    transfers: [{
      id: 't1', competitionId: COMP, sourceCommitteeId: 'c1', targetCommitteeId: 'c2', participantIds: ['p1'],
      mode: 'EQUITY_BY_WAITING_TIME', reason: 'r', requestedAt: NOW.toISOString(), requestedBy: 'u', status: 'APPLIED', changes: [],
      equity: [{ participantId: 'p1', waitedMinutes: 2, positionIfAppended: 5, fairPosition: 5 }],
    } as unknown as QueueTransferRecord],
  });
  assert.equal(r.strain.queueTransfers, 1);
  assert.equal(r.strain.equityCompensations, 0);
});

/* ── صدق التقدير ────────────────────────────────────────────────────────── */

test('an estimate that consistently promised short is named in the lessons', () => {
  const r = build({ waitSamples: Array.from({ length: 8 }, (_, i) => wait(20, 35, i)) });
  assert.equal(r.eta.biasMinutes, 15);
  assert.ok(r.lessons.some(l => /تَعِد بأقصر/.test(l.titleArabic)));
});

test('an honest estimate produces no lesson about itself', () => {
  const r = build({ waitSamples: Array.from({ length: 8 }, (_, i) => wait(20, 20, i)) });
  assert.ok(!r.lessons.some(l => /تَعِد/.test(l.titleArabic)));
});

test('a day too small to judge does not lecture anyone', () => {
  const r = build({ waitSamples: [wait(10, 60, 1)] });
  assert.equal(r.eta.trustworthy, false);
  assert.ok(!r.lessons.some(l => /تَعِد/.test(l.titleArabic)), 'one bad wait is not a verdict on the estimate');
});

/* ── الحدود ─────────────────────────────────────────────────────────────── */

test('a clean day says plainly that nothing asks to change', () => {
  const samples = Array.from({ length: 6 }, (_, i) => tempo('c1', 8, i + 1));
  const r = build({
    committees: [committee('c1', { averageSessionMinutes: 8 })],
    tempoSamples: samples,
    waitSamples: Array.from({ length: 8 }, (_, i) => wait(15, 15, i)),
  });
  assert.equal(r.lessons.length, 1);
  assert.match(r.lessons[0].titleArabic, /لا درس يستحقّ التغيير/);
});

test('an empty competition produces a report, not a crash', () => {
  const r = build({});
  assert.equal(r.version, DAY_RETROSPECTIVE_VERSION);
  assert.deepEqual(r.panels, []);
  assert.equal(r.participantsTested, 0);
  assert.equal(r.eta.sampleCount, 0);
  assert.ok(r.lessons.length >= 1);
});

test('another competition never bleeds into this report', () => {
  const r = build({
    participants: [participant('p1'), participant('x1', { competitionId: 'other' })],
    committees: [committee('c1'), committee('x1', { competitionId: 'other' })],
    incidents: [{ id: 'i1', competitionId: 'other', type: 'conflict_routing', severity: 'critical', title: 't', description: 'd', reportedBy: 'x', reportedAt: NOW.toISOString(), status: 'active' } as unknown as IncidentRecord],
  });
  assert.equal(r.panels.length, 1);
  assert.equal(r.participantsTested, 1);
  assert.equal(r.strain.routingIncidents, 0);
});

test('the report states on its face that it ranks nobody', () => {
  /* رقمٌ يقارن اللجان أقرب ما يكون إلى خرق حظر ترتيبها بالسرعة — فالحظر يُكتب فيه. */
  assert.equal(build({}).nonRanking, true);
});
