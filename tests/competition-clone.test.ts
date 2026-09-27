/*
 * §114/§152 — نسخ مسابقةٍ سابقة ينسخ الإعداد ولا ينسخ السجلّات.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_COMPETITION } from '../src/data/seed-data';
import { cloneCompetitionConfiguration, buildSeriesIndex, suggestNextEditionLabel } from '../src/lib/competition-clone';
import type { Competition } from '../src/types';

let n = 0;
const ids = { newId: 'comp-2027', newIdFor: (p: string) => `${p}-${++n}` };
const source = (): Competition => ({
  ...JSON.parse(JSON.stringify(SEED_COMPETITION)), id: 'comp-2026', status: 'completed', edition: '2026', editionLabel: '2026',
  totalRegistered: 75, totalApproved: 75, totalAttended: 70, currentDay: 3, closedAt: '2026-05-01T00:00:00Z', closedBy: 'admin',
  startDate: '2026-04-01', registrationStartDate: '2026-02-01',
});

test('§114 clone copies categories and judging, resets operational state, starts as draft', () => {
  const src = source();
  src.ruleSet = { ...src.ruleSet, frozenAt: '2026-03-01T00:00:00Z' };
  const out = cloneCompetitionConfiguration(src, { ...ids, editionLabel: '2027' });
  assert.equal(out.id, 'comp-2027');
  assert.notEqual(out.id, src.id);
  assert.equal(out.status, 'draft');
  assert.equal(out.categories.length, src.categories.length);
  assert.ok(out.categories.length > 0, 'fixture has categories');
  assert.ok(out.categories.every(c => c.competitionId === out.id && !src.categories.some(s => s.id === c.id)), 'categories get new ids bound to the new competition');
  assert.deepEqual(out.ruleSet.criteria, src.ruleSet.criteria, 'judging criteria and weights copied');
  assert.notEqual(out.ruleSet.id, src.ruleSet.id);
  assert.equal(out.ruleSet.frozenAt, undefined, 'new policy snapshot is not frozen');
  for (const k of ['totalRegistered', 'totalApproved', 'totalAttended', 'currentDay'] as const) assert.equal(out[k], 0);
  assert.equal(out.closedAt, undefined);
  assert.equal(out.startDate, '');
  assert.equal(out.previousEditionId, 'comp-2026');
  assert.equal(out.seriesId, 'series-comp-2026');
  assert.equal(out.editionLabel, '2027');
  // لقطة مستقلة: تعديل النسخة الجديدة لا يمسّ الأصل.
  out.categories[0].nameArabic = 'تعديل 2027';
  out.ruleSet.criteria.push({ ...out.ruleSet.criteria[0], id: 'extra' });
  assert.notEqual(src.categories[0].nameArabic, 'تعديل 2027');
  assert.ok(!src.ruleSet.criteria.some(c => c.id === 'extra'));
});

test('clone never carries registrations, scores, results or certificates (they are not part of the configuration)', () => {
  const out = cloneCompetitionConfiguration(source(), ids) as unknown as Record<string, unknown>;
  for (const key of ['participants', 'scores', 'results', 'certificates', 'appeals', 'auditLogs', 'resultSeals', 'payments']) assert.equal(out[key], undefined, key);
  const text = JSON.stringify(out);
  assert.ok(!text.includes('"comp-2026","status"'), 'no record is keyed to the old competition');
});

test('the wizard can leave parts behind', () => {
  const out = cloneCompetitionConfiguration(source(), { ...ids, parts: ['judging'] });
  assert.equal(out.categories.length, 0);
  assert.equal(out.logoUrl, undefined);
  assert.deepEqual(out.clonedFrom?.parts, ['judging']);
});

test('series index groups editions and suggests the next label', () => {
  const a = source();
  const b = cloneCompetitionConfiguration(a, { ...ids, editionLabel: '2027' });
  a.seriesId = b.seriesId;
  const series = buildSeriesIndex([a, b]);
  assert.equal(series.length, 1);
  assert.deepEqual(series[0].editions.map(e => e.id), ['comp-2027', 'comp-2026']);
  assert.equal(suggestNextEditionLabel(b), '2028');
});
