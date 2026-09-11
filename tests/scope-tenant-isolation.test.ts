import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canWriteSyncedCollection, writableCollectionsFor } from '../src/lib/cloud-sync';
import { resolveEffectiveScope } from '../src/lib/scope-engine';
import { buildParticipantScopeRecord, DEFAULT_SELECTION_RULE } from '../src/lib/participant-scope';
import { invalidateStaleModels } from '../src/lib/model-fairness';
import { generateModelBatch } from '../src/lib/model-batch';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { fullQuranScope, scopeFromJuz } from '../src/lib/quran-scope';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { freeDistributionPlan } from '../src/lib/question-zones';
import type { Category } from '../src/types';

/*
 * العزل بين الجهات ليس ترتيبًا في الواجهة: هو أن بيانات جهةٍ لا تصل محرّك جهةٍ أخرى ولو
 * تشابهت المعرّفات. والمعرّفات تتشابه فعلًا حين تُستورد بيانات أو تُستنسخ مسابقة.
 */

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const candidates = projectCandidatesFromScope(fullQuranScope(), { passageAyahCount: 3, reading });

const selectableCategory = (competitionId: string): Category => ({
  id: 'cat-1', competitionId, code: 'A', name: 'A', nameArabic: 'أ', description: '',
  riwaya: 'حفص عن عاصم', memorizationScope: '', juzCount: 0, targetParticipants: 10,
  targetDurationMinutes: 8, questionsCount: 3,
  scope: fullQuranScope(), scopeMode: 'participant_selected', scopeVersion: 1,
  selectionRule: { ...DEFAULT_SELECTION_RULE, version: 1, enabled: true, decidedBy: 'participant', selectionUnit: 'juz', exactUnits: 1, parentScope: fullQuranScope(), approval: 'auto' },
});

const scopeRecord = (organizationId: string, competitionId: string, participantId: string, juz: number[]) => {
  const record = buildParticipantScopeRecord({
    id: `psc-${organizationId}-${participantId}`, organizationId, competitionId, categoryId: 'cat-1',
    participantId, rule: selectableCategory(competitionId).selectionRule!, selection: scopeFromJuz(juz), version: 1,
  });
  return { ...record, status: 'approved' as const, approvedAt: new Date().toISOString(), approvedBy: 'admin' };
};

test('a scope record from another organization is never used, even for the same participant id', () => {
  const foreign = scopeRecord('org-b', 'comp-b', 'p1', [30]);
  const resolution = resolveEffectiveScope({
    participant: { id: 'p1' }, category: selectableCategory('comp-a'), scopes: [foreign],
    tenant: { organizationId: 'org-a', competitionId: 'comp-a' },
  });
  assert.equal(resolution.blocked, true, 'a foreign record must block, not silently serve');
  assert.equal(resolution.source, 'none');
  assert.equal(resolution.signature, '');
});

test('a scope record from another competition inside the same organization is also refused', () => {
  const sibling = scopeRecord('org-a', 'comp-b', 'p1', [30]);
  const resolution = resolveEffectiveScope({
    participant: { id: 'p1' }, category: selectableCategory('comp-a'), scopes: [sibling],
    tenant: { organizationId: 'org-a', competitionId: 'comp-a' },
  });
  assert.equal(resolution.blocked, true);
});

test('the participant own-tenant record still resolves, and only that one', () => {
  const mine = scopeRecord('org-a', 'comp-a', 'p1', [1]);
  const foreign = scopeRecord('org-b', 'comp-b', 'p1', [30]);
  const resolution = resolveEffectiveScope({
    participant: { id: 'p1' }, category: selectableCategory('comp-a'), scopes: [foreign, mine],
    tenant: { organizationId: 'org-a', competitionId: 'comp-a' },
  });
  assert.equal(resolution.blocked, false);
  assert.equal(resolution.signature, mine.scopeSignature);
  assert.notEqual(resolution.signature, foreign.scopeSignature);
});

test('a generated batch stamps every model with its own organization and competition', () => {
  const outcome = generateModelBatch({
    batchId: 'b1', organizationId: 'org-a', competitionId: 'comp-a', categoryId: 'cat-1',
    categoryScopeVersion: 1, policyVersion: 'v1', poolVersion: 'p1',
    participants: Array.from({ length: 4 }, (_, i) => ({ participantId: `p${i}`, scope: scopeFromJuz([1]), scopeVersion: 1, questionCount: 3, reading })),
    candidates, distribution: freeDistributionPlan(), repeatPolicy: DEFAULT_REPEAT_POLICY,
    targetDifficulty: 3, difficultyTolerance: 1, seed: 'tenant', generationMode: 'pre_generated',
    reserveCount: 1, newId: (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`,
  });
  for (const model of [...outcome.models, ...outcome.reserves]) {
    assert.equal(model.organizationId, 'org-a');
    assert.equal(model.competitionId, 'comp-a');
  }
  assert.equal(outcome.batch.organizationId, 'org-a');
  assert.equal(outcome.batch.competitionId, 'comp-a');
});

test('stale-model invalidation reads only the scope versions it is given, so a foreign bump cannot invalidate our models', () => {
  const model = {
    id: 'm1', organizationId: 'org-a', competitionId: 'comp-a', categoryId: 'cat-1', participantId: 'p1',
    participantScopeVersion: 1, scopeSignature: 'QS1:abc:100', categoryScopeVersion: 1, policyVersion: 'v1',
    poolVersion: 'p1', reading: {}, questions: [], zones: [], aggregateDifficulty: 3, difficultyVariance: 0,
    minDifficulty: 3, maxDifficulty: 3, coverageAyahCount: 100, repeatsUsed: 0, relaxations: [],
    fairness: { score: 80, difficultyParity: 80, scopeCoverage: 80, repeatPressure: 80, diversity: 80, similarity: 80, exposure: 80, zoneCompliance: 80, notesArabic: [], notesEnglish: [] },
    generationMode: 'pre_generated' as const, engineVersion: 'e1', status: 'sealed' as const, createdAt: new Date().toISOString(),
  };
  const untouched = invalidateStaleModels({
    models: [model],
    currentScopeVersionOf: () => 1,
    currentCategoryScopeVersionOf: () => 1,
  });
  assert.equal(untouched.invalidated.length, 0);
  const bumped = invalidateStaleModels({
    models: [model],
    currentScopeVersionOf: () => 2,
    currentCategoryScopeVersionOf: () => 1,
  });
  assert.equal(bumped.invalidated.length, 1);
});

test('participant_scopes stays writable by the exact roles the rules allow, and by no one else', () => {
  assert.equal(canWriteSyncedCollection('participant', 'participant_scopes'), true);
  assert.equal(canWriteSyncedCollection('judge', 'participant_scopes'), false);
  assert.equal(canWriteSyncedCollection('auditor', 'participant_scopes'), false);
  assert.equal(canWriteSyncedCollection('broadcast_operator', 'participant_scopes'), false);
  assert.deepEqual(writableCollectionsFor('participant'), ['appeals', 'participant_scopes']);
});

test('the firestore rules keep participant_scopes inside the org/competition path and forbid deletion', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const block = rules.slice(rules.indexOf('match /participant_scopes/'));
  const end = block.indexOf('match /', 10);
  const scoped = end > 0 ? block.slice(0, end) : block;
  assert.match(scoped, /readableScope\(orgId,competitionId\)/, 'reads are scoped to the tenant path');
  assert.match(scoped, /writeScope\(orgId,competitionId\)/, 'writes are scoped to the tenant path');
  assert.match(scoped, /allow delete: if false;/, 'a scope record is superseded, never deleted');
  assert.match(scoped, /resource\.data\.uploaderUid == request\.auth\.uid/, 'a participant only reaches their own record');
});

/* الجاهزية لا تُخفي حجرًا أفرغ البنك ولا غيابَ احتياط: الأول مانع، والثاني توصية. */
test('readiness reports a pool-emptying quarantine as critical and a missing reserve as a recommendation', async () => {
  const { buildScopeReadiness } = await import('../src/lib/scope-readiness');
  const { DEFAULT_REPEAT_POLICY: policy } = await import('../src/lib/repeat-policy');
  const category = { ...selectableCategory('comp-a'), scopeMode: 'fixed' as const, selectionRule: undefined };
  const base = {
    categories: [category], scopeOf: () => fullQuranScope(),
    participants: [{ id: 'p1', code: 'A-1', categoryId: 'cat-1', status: 'in_queue' }],
    participantScopes: [], candidatesFor: () => candidates,
    questionsPerParticipant: () => 3, repeatPolicyFor: () => policy,
  };

  const blocked = buildScopeReadiness({
    ...base,
    activeQuarantines: [{ locusCount: 12, canContinue: false, summaryAr: 'لم يبقَ موضع صالح.', summaryEn: 'No eligible locus remains.' }],
    reserveModelCount: 0,
  });
  const quarantine = blocked.checks.find(c => c.id === 'quarantine')!;
  assert.equal(quarantine.severity, 'critical');
  assert.equal(blocked.ready, false);
  const reserve = blocked.checks.find(c => c.id === 'reserve_models')!;
  assert.equal(reserve.severity, 'recommendation', 'a missing reserve is a warning about the day, not a blocker');

  const healthy = buildScopeReadiness({
    ...base,
    activeQuarantines: [{ locusCount: 2, canContinue: true, summaryAr: 'بقي مخزون كافٍ.', summaryEn: 'Enough remains.' }],
    reserveModelCount: 4,
  });
  assert.equal(healthy.checks.find(c => c.id === 'quarantine')!.severity, 'warning');
  assert.equal(healthy.checks.find(c => c.id === 'reserve_models')!.severity, 'passed');
  assert.equal(healthy.critical, 0);
});

test('readiness stays silent about quarantine and reserves when the caller knows nothing about them', async () => {
  const { buildScopeReadiness } = await import('../src/lib/scope-readiness');
  const { DEFAULT_REPEAT_POLICY: policy } = await import('../src/lib/repeat-policy');
  const category = { ...selectableCategory('comp-a'), scopeMode: 'fixed' as const, selectionRule: undefined };
  const result = buildScopeReadiness({
    categories: [category], scopeOf: () => fullQuranScope(),
    participants: [{ id: 'p1', code: 'A-1', categoryId: 'cat-1', status: 'in_queue' }],
    participantScopes: [], candidatesFor: () => candidates,
    questionsPerParticipant: () => 3, repeatPolicyFor: () => policy,
  });
  assert.equal(result.checks.some(c => c.id === 'quarantine'), false, 'no quarantines means no row, not a green row that was never checked');
  assert.equal(result.checks.some(c => c.id === 'reserve_models'), false);
});
