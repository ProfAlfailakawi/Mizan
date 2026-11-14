import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalReport, finalReportCsv, finalReportFileName } from '../src/lib/final-report';

const comp = { id: 'c1', categories: [{ id: 'k1', name: 'Juz 30', nameArabic: 'جزء عمّ' }] } as any;
const person = (id: string, status: string, competitionId = 'c1') => ({ id, competitionId, status }) as any;
const result = (id: string, rank: number, score: number, status = 'published') => ({
  id: `r-${id}`, competitionId: 'c1', participantId: id, participantCode: `A-${id}`, participantName: `P${id}`, participantNameArabic: `م${id}`,
  categoryId: 'k1', categoryName: 'Juz 30', categoryNameArabic: 'جزء عمّ', finalScore: score, rank, status, country: 'KW',
}) as any;

const base = () => ({
  competition: comp,
  participants: [
    person('1', 'certified'), person('2', 'tested'), person('3', 'in_queue'), person('4', 'approved'), person('5', 'submitted'),
    person('x', 'certified', 'OTHER'),
  ],
  results: [result('1', 1, 96.5), result('2', 2, 90), result('9', 3, 70, 'calculating')],
  appeals: [
    { competitionId: 'c1', status: 'accepted', reasonText: 'سرّي' }, { competitionId: 'c1', status: 'rejected' },
    { competitionId: 'c1', status: 'under_review' }, { competitionId: 'OTHER', status: 'accepted' },
  ] as any[],
  incidents: [
    { competitionId: 'c1', severity: 'critical', title: 'انقطاع', description: 'تفصيل حسّاس', resolvedAt: '2026-01-01T00:00:00Z' },
    { competitionId: 'c1', severity: 'low', title: 'x', description: 'y' },
  ] as any[],
  committees: [
    { competitionId: 'c1', code: 'C2', name: 'B', nameArabic: 'ب', completedCount: 0, averageSessionMinutes: 0 },
    { competitionId: 'c1', code: 'C1', name: 'A', nameArabic: 'أ', completedCount: 4, averageSessionMinutes: 7.456 },
  ] as any[],
  certificates: [{ competitionId: 'c1' }, { competitionId: 'c1' }, { competitionId: 'OTHER' }] as any[],
});

test('the funnel counts only this competition and separates no-shows', () => {
  const r = buildFinalReport(base());
  assert.deepEqual(r.funnel, { registered: 5, approved: 4, arrived: 3, tested: 3, certified: 1, noShow: 1 });
  // tested = participants 1,2 (status) + 9 (has a result row) — a result row is evidence of being tested
});

test('official numbers use only approved/sealed/published results; the rest is disclosed, not hidden', () => {
  const r = buildFinalReport(base());
  assert.equal(r.results.reportable, 2);
  assert.equal(r.results.pendingExcluded, 1);
  assert.equal(r.results.average, 93.25);
  assert.equal(r.results.highest, 96.5);
  assert.equal(r.results.lowest, 90);
  assert.equal(r.podium.length, 2, 'a calculating result never reaches the podium');
  assert.deepEqual(r.podium.map(p => p.rank), [1, 2]);
});

test('no results: averages are null, never a fabricated zero', () => {
  const r = buildFinalReport({ ...base(), results: [] });
  assert.equal(r.results.average, null);
  assert.equal(r.results.highest, null);
  assert.equal(r.categories.length, 0);
});

test('appeals and incidents are counted without carrying their text', () => {
  const r = buildFinalReport(base());
  assert.deepEqual(r.appeals, { total: 3, accepted: 1, rejected: 1, open: 1 });
  assert.deepEqual(r.incidents, { total: 2, resolved: 1, unresolved: 1, critical: 1 });
  const dump = JSON.stringify(r) + finalReportCsv(r);
  for (const secret of ['سرّي', 'تفصيل حسّاس', 'انقطاع']) assert.ok(!dump.includes(secret), `leaked: ${secret}`);
});

test('committees: sorted by code; one that finished nothing has no average', () => {
  const r = buildFinalReport(base());
  assert.deepEqual(r.committees.map(c => [c.code, c.completed, c.averageMinutes]), [['C1', 4, 7.46], ['C2', 0, null]]);
});

test('certificates are counted per competition', () => {
  assert.equal(buildFinalReport(base()).certificatesIssued, 2);
});

test('CSV: BOM, quoted cells, a quote inside a value cannot break a row', () => {
  const data = base();
  data.committees = [{ competitionId: 'c1', code: 'C1', name: 'He said "hi", ok', nameArabic: 'قال "نعم"، حسنًا', completedCount: 1, averageSessionMinutes: 5 }];
  const csv = finalReportCsv(buildFinalReport(data));
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('""نعم""'));
  for (const line of csv.slice(1).split('\r\n')) assert.ok(line.startsWith('"'), 'every row is fully quoted');
  assert.match(finalReportFileName(comp), /\.csv$/);
});
