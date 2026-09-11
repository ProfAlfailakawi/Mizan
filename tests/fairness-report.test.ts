import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFairnessReport, fairnessReportPrivacyViolations, renderFairnessReportText, usageFromModels } from '../src/lib/fairness-report';
import { generateModelBatch } from '../src/lib/model-batch';
import { analyzeDemand, zoneAwareReuseLowerBound } from '../src/lib/scope-demand';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { fullQuranScope, scopeFromJuz } from '../src/lib/quran-scope';
import { DEFAULT_REPEAT_POLICY, STRICT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { freeDistributionPlan } from '../src/lib/question-zones';
import { aggregateFairness } from '../src/lib/model-fairness';

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const candidates = projectCandidatesFromScope(fullQuranScope(), { passageAyahCount: 3, reading });
let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;

const buildBatch = (count: number, juz: number[], repeatPolicy = DEFAULT_REPEAT_POLICY, pool = candidates) => generateModelBatch({
  batchId: 'b1', organizationId: 'org-1', competitionId: 'comp-1', categoryId: 'cat-1',
  categoryScopeVersion: 1, policyVersion: 'v1', poolVersion: 'p1',
  participants: Array.from({ length: count }, (_, i) => ({ participantId: `p${i}`, scope: scopeFromJuz(juz), scopeVersion: 1, questionCount: 3, reading })),
  candidates: pool, distribution: freeDistributionPlan(), repeatPolicy,
  targetDifficulty: 3, difficultyTolerance: 1, seed: 'report-seed', generationMode: 'pre_generated', newId,
});

const report = (models: Parameters<typeof aggregateFairness>[0] extends unknown ? ReturnType<typeof buildBatch>['models'] : never, extra: Record<string, unknown> = {}) =>
  buildFairnessReport({
    id: 'rep-1', organizationId: 'org-1', competitionId: 'comp-1', scope: 'competition',
    models, aggregate: aggregateFairness(models), repeatPolicy: DEFAULT_REPEAT_POLICY,
    policyVersion: 'v1', generatedBy: 'admin-1', now: '2026-05-01T09:00:00.000Z', ...extra,
  });

/*
 * اسمه «تقرير عدالة وتوزيع الأسئلة» لا «شهادة علمية»: الشهادة تصدر عن جهة علمية، وميزان
 * ليس جهةً علمية. والصدق فيه أهمّ من حسن مظهره.
 */

test('the report never calls itself a scientific certificate and says who did not endorse it', async () => {
  const batch = buildBatch(6, [1]);
  const out = await report(batch.models);
  assert.match(out.titleArabic, /تقرير عدالة وتوزيع الأسئلة/);
  assert.doesNotMatch(out.titleArabic, /شهادة/);
  assert.match(out.honestyNoteArabic, /ليس شهادة علمية/);
  assert.match(out.honestyNoteEnglish, /not a scientific certificate/i);
  assert.equal(out.privacy.participantIdentities, false);
  assert.equal(out.privacy.judgeScores, false);
});

test('the report states the mathematical reuse floor and the excess over it, not just a score', async () => {
  const batch = buildBatch(40, [30]);
  const out = await report(batch.models);
  const floor = out.sections.find(s => s.id === 'floor')!;
  assert.ok(floor, 'the floor section is not optional');
  const labels = floor.rows.map(r => r.labelArabic).join(' | ');
  assert.match(labels, /أقل تكرار ممكن رياضيًا/);
  assert.match(labels, /الزيادة على الحدّ الأدنى/);
  assert.ok(out.findings.some(f => f.id === 'at_bound' || f.id === 'excess_over_bound'));
});

test('a strict policy over an insufficient pool is reported as a critical finding, not smoothed away', async () => {
  const local = projectCandidatesFromScope(scopeFromJuz([30]), { passageAyahCount: 3, reading });
  const batch = buildBatch(300, [30], STRICT_REPEAT_POLICY, local);
  assert.ok(batch.failures.length > 0, 'the strict batch must have declared failures to report on');
  const out = await buildFairnessReport({
    id: 'rep-2', organizationId: 'org-1', competitionId: 'comp-1', scope: 'competition',
    models: batch.models, aggregate: aggregateFairness(batch.models), repeatPolicy: STRICT_REPEAT_POLICY,
    policyVersion: 'v1', generatedBy: 'admin-1',
    usage: new Map([...usageFromModels(batch.models)]),
    declaredFailures: batch.failures.map(f => ({ code: f.code, ar: f.ar, en: f.en })),
  });
  /* النماذج الناجحة وحدها تخرج تقريرًا نظيفًا يقول «لا تكرار» — وهو تضليل. الفشل يُعلَن. */
  assert.ok(out.findings.some(f => f.id === 'strict_impossible' && f.severity === 'critical'));
  const coverage = out.sections.find(s => s.id === 'coverage')!;
  const failedRow = coverage.rows.find(r => r.labelArabic === 'سحوب أُعلن فشلها')!;
  assert.equal(failedRow.value, String(batch.failures.length));
  assert.ok(out.sections.some(s => s.id === 'failures'), 'the reasons for the failures get their own section');
  for (const model of batch.models) assert.doesNotMatch(JSON.stringify(out.sections), new RegExp(model.participantId));
});

test('the report carries no participant identity, and a leak blocks it before it is saved', async () => {
  const batch = buildBatch(5, [1]);
  const out = await report(batch.models);
  assert.deepEqual(fairnessReportPrivacyViolations(out, ['KW-0001', 'أحمد الفيلكاوي']), []);
  const poisoned = { ...out, sections: [...out.sections, { id: 'x', titleArabic: 'س', titleEnglish: 'x', rows: [{ labelArabic: 'المتسابق', labelEnglish: 'Participant', value: 'KW-0001' }] }] };
  assert.deepEqual(fairnessReportPrivacyViolations(poisoned, ['KW-0001']), ['KW-0001']);
});

test('two identical reports hash identically, and a changed figure changes the hash', async () => {
  const batch = buildBatch(6, [1]);
  const first = await report(batch.models);
  const second = await report(batch.models);
  assert.equal(first.reportHash, second.reportHash);
  const third = await report(batch.models.slice(0, 3));
  assert.notEqual(first.reportHash, third.reportHash);
});

test('the pressure section names where the crowding fell when a demand analysis is supplied', async () => {
  const participants = [
    ...Array.from({ length: 200 }, (_, i) => ({ participantId: `a${i}`, categoryId: 'cat-1', scope: scopeFromJuz([30]), questionCount: 3 })),
    ...Array.from({ length: 10 }, (_, i) => ({ participantId: `b${i}`, categoryId: 'cat-1', scope: fullQuranScope(), questionCount: 3 })),
  ];
  const demand = analyzeDemand({ participants, candidates });
  const bound = zoneAwareReuseLowerBound({
    clusters: demand.clusters, candidates,
    planFor: () => freeDistributionPlan(),
    questionCountFor: () => 3,
  });
  const batch = buildBatch(8, [30]);
  const out = await report(batch.models, { demand, lowerBound: bound });
  const pressure = out.sections.find(s => s.id === 'pressure')!;
  assert.ok(pressure, 'a demand analysis must produce a pressure section');
  assert.ok(pressure.rows.some(r => r.labelArabic.includes('عنق زجاجة')));
  const floor = out.sections.find(s => s.id === 'floor')!;
  assert.ok(floor.rows[0].note?.includes('المجموعة الحاكمة'), 'the binding group is named, not hidden behind a number');
});

test('the printable text carries the hash and no participant identity', async () => {
  const batch = buildBatch(4, [1]);
  const out = await report(batch.models);
  const text = renderFairnessReportText(out);
  assert.match(text, new RegExp(out.reportHash));
  assert.match(text, /تقرير عدالة وتوزيع الأسئلة/);
  for (const model of batch.models) assert.doesNotMatch(text, new RegExp(model.participantId));
});

test('an empty model set produces a report that says so rather than a clean-looking sheet of zeros', async () => {
  const out = await report([]);
  assert.ok(out.findings.some(f => f.id === 'no_models' && f.severity === 'critical'));
});
