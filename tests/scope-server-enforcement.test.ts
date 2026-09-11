import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ServerQuestionPoolRepository, SecureQuestionRuntimeRepository, blueprintInsideScope, type ServerQuestionBlueprint } from '../server/secure-question-runtime';
import { QuestionEscrowRepository } from '../server/question-escrow';
import { buildQuestionPoolFromCertifiedSource } from '../server/question-pool-builder';
import { scopeFromJuz, scopeFromJuzRange, scopeFromAyahRange, scopeAyahCount, fullQuranScope } from '../src/lib/quran-scope';

/*
 * Critical rules are server-enforced. UI validation exists to help the user, never to protect
 * the competition. الاختبار هنا يحاول عمدًا تمرير سؤالٍ من نطاق متسابقٍ آخر، ويتوقع الرفض.
 */

const key = Buffer.alloc(32, 9).toString('base64url');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-scope-'));

const blueprint = (surah: number, startAyah: number, endAyah: number, juz: number): ServerQuestionBlueprint =>
  ({ id: `bp-${surah}-${startAyah}`, poolId: 'pool', qiraah: 'Asim', rawi: 'Hafs', surahNumber: surah, startAyah, endAyah, juzNumber: juz, difficultyRating: 3, enabled: true });

test('containment is checked over the whole passage, not only its first ayah', () => {
  const scope = scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 10 });
  assert.equal(blueprintInsideScope(blueprint(2, 5, 7, 1), scope), true);
  assert.equal(blueprintInsideScope(blueprint(2, 9, 12, 1), scope), false, 'a passage spilling past the scope end is outside it');
  assert.equal(blueprintInsideScope(blueprint(3, 1, 3, 3), scope), false);
  assert.equal(blueprintInsideScope({ surahNumber: 2, startAyah: 9999, endAyah: 10000 }, scope), false, 'an impossible locus is rejected, not thrown');
});

test('the certified-source pool builder honours a scope and refuses to run without one', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ sura_no: 2, aya_no: i + 1, aya_text: `DEV-${i + 1}`, jozz: 1, page: 2, line_start: (i % 15) + 1, line_end: (i % 15) + 1 }));
  const quran = { manifest: () => ({ scientificApproval: { state: 'CERTIFIED' }, packageHash: 'hash', qiraah: 'Asim', rawi: 'Hafs' }), verses: () => rows } as never;
  const scope = scopeFromAyahRange({ surah: 2, ayah: 5 }, { surah: 2, ayah: 20 });
  const report = buildQuestionPoolFromCertifiedSource({ quran, packageId: 'p', poolId: 'pool', scope, passageAyahCount: 3 });
  assert.ok(report.items.length > 0);
  assert.equal(report.scopeAyahCount, scopeAyahCount(scope));
  for (const item of report.items) {
    assert.ok(item.startAyah >= 5 && item.endAyah <= 20, `generated locus ${item.startAyah}-${item.endAyah} stays inside the scope`);
  }
  assert.throws(() => buildQuestionPoolFromCertifiedSource({ quran, packageId: 'p', poolId: 'pool', passageAyahCount: 3 }), /QUESTION_POOL_SCOPE_REQUIRED/);
  // الجسر الموروث ما زال يعمل، لكنه يُحوَّل إلى نطاق ثم يُنسى.
  const legacy = buildQuestionPoolFromCertifiedSource({ quran, packageId: 'p', poolId: 'pool', allowedJuz: [1], passageAyahCount: 3 });
  assert.ok(legacy.items.length >= report.items.length);
  assert.ok(legacy.scopeSignature.startsWith('QS1:'));
});

function runtimeFixture(scope: ReturnType<typeof scopeFromJuz> | undefined, pool: ServerQuestionBlueprint[]) {
  const dir = tmp();
  const pools = new ServerQuestionPoolRepository(path.join(dir, 'pools'));
  pools.save('comp', 'pool', pool);
  const escrow = new QuestionEscrowRepository(path.join(dir, 'escrow'), key);
  const quran = {
    manifest: () => ({ scientificApproval: { state: 'CERTIFIED' }, packageHash: 'hash', qiraah: 'Asim', rawi: 'Hafs', tariq: undefined }),
    questionStartMetadata: (_p: string, loci: { id: string }[]) => loci.map(l => ({ id: l.id, startClass: 'MID_PAGE', startAssurance: 'QURAN_AYAH_BOUNDARY', lineStart: 5, pageNumber: 3 })),
    resolvePassage: () => ({ verses: [{ aya_text: 'نص', sura_name_ar: 'سورة', page: 3, line_start: 5, line_end: 6 }], text: 'نص' }),
    resolvePassageLoci: () => [{ page: 3, lineStart: 5, lineEnd: 6, lineCount: 15 }],
  } as never;
  const runtime = new SecureQuestionRuntimeRepository(path.join(dir, 'runtime'), quran, pools, escrow);
  const provision = (sessionId: string, participantId: string, participantScope?: typeof scope) => runtime.provision({
    organizationId: 'org', competitionId: 'comp', sessionId, participantId, committeeId: 'c1',
    requiredJudgeIds: ['j1'], approvalMode: 'all_assigned', expiresAt: new Date(Date.now() + 600_000).toISOString(),
    sourcePackageId: 'p', poolId: 'pool', questionCount: 2, qiraah: 'Asim', rawi: 'Hafs',
    ...(participantScope ? { participantScope, participantScopeVersion: 3 } : {}),
  });
  return { dir, runtime, pools, escrow, provision };
}

test('a provisioned runtime only ever selects loci inside the participant scope', () => {
  const pool = [
    ...Array.from({ length: 12 }, (_, i) => blueprint(2, i + 1, i + 3, 1)),
    ...Array.from({ length: 12 }, (_, i) => blueprint(78, i + 1, i + 3, 30)),
  ];
  const fixture = runtimeFixture(undefined, pool);
  try {
    const narrow = scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 14 });
    const state = fixture.provision('s-a', 'p-a', narrow);
    assert.equal(state.questionCount, 2);
    const verification = fixture.runtime.verifyAllocationScope('s-a');
    assert.equal(verification.enforced, true);
    assert.deepEqual(verification.violations, [], 'no allocated locus falls outside the approved scope');
    const internal = fixture.escrow.internalRecord('s-a');
    assert.equal(internal.questions.length, 2);
  } finally { fs.rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('two participants in one category receive questions only from their own ranges', () => {
  const pool = [
    ...Array.from({ length: 12 }, (_, i) => blueprint(2, i + 1, i + 3, 1)),
    ...Array.from({ length: 12 }, (_, i) => blueprint(78, i + 1, i + 3, 30)),
  ];
  const fixture = runtimeFixture(undefined, pool);
  try {
    fixture.provision('s-first', 'p-first', scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 14 }));
    fixture.provision('s-last', 'p-last', scopeFromAyahRange({ surah: 78, ayah: 1 }, { surah: 78, ayah: 14 }));
    const ids = (session: string) => fixture.runtime.revealFairDrawSeed(session).selectionIds;
    for (const id of ids('s-first')) assert.ok(id.startsWith('bp-2-'), `${id} belongs to the first participant's range`);
    for (const id of ids('s-last')) assert.ok(id.startsWith('bp-78-'), `${id} belongs to the second participant's range`);
    assert.equal(fixture.runtime.verifyAllocationScope('s-first').violations.length, 0);
    assert.equal(fixture.runtime.verifyAllocationScope('s-last').violations.length, 0);
  } finally { fs.rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('a scope with no eligible locus is refused at provision time rather than silently widened', () => {
  const pool = Array.from({ length: 6 }, (_, i) => blueprint(2, i + 1, i + 3, 1));
  const fixture = runtimeFixture(undefined, pool);
  try {
    assert.throws(() => fixture.provision('s-empty', 'p-empty', scopeFromJuz([29])), /QUESTION_RUNTIME_INSUFFICIENT_ELIGIBLE_POOL/);
    assert.throws(() => fixture.provision('s-none', 'p-none', { version: 1, segments: [], assurance: 'CANONICAL_TABLE' } as never), /QUESTION_RUNTIME_PARTICIPANT_SCOPE_EMPTY/);
  } finally { fs.rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('reveal re-checks the scope even after the pool has been tampered with', () => {
  const pool = Array.from({ length: 12 }, (_, i) => blueprint(2, i + 1, i + 3, 1));
  const fixture = runtimeFixture(undefined, pool);
  try {
    const scope = scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 14 });
    fixture.provision('s-tamper', 'p-tamper', scope);
    const selected = fixture.runtime.revealFairDrawSeed('s-tamper').selectionIds;
    const judge = { uid: 'j1', role: 'judge', organizationId: 'org', competitionId: 'comp' };
    fixture.runtime.confirmPresence('s-tamper', judge);
    fixture.runtime.approveQuestion('s-tamper', 0, judge);
    assert.ok(fixture.runtime.revealQuestion('s-tamper', 0, judge).payload, 'a legitimate question reveals normally');

    // محاولة تسريب: تُعدَّل خريطة البنك بعد التخصيص فيصير الموضع المخصَّص خارج النطاق.
    const tampered = pool.map(item => (item.id === selected[1] ? { ...item, surahNumber: 78, startAyah: 1, endAyah: 3, juzNumber: 30 } : item));
    fixture.pools.save('comp', 'pool', tampered);
    fixture.runtime.approveQuestion('s-tamper', 1, judge);
    assert.throws(() => fixture.runtime.revealQuestion('s-tamper', 1, judge), /QUESTION_RUNTIME_SCOPE_VIOLATION/, 'the second gate catches what the first could not know');
    assert.equal(fixture.runtime.verifyAllocationScope('s-tamper').violations.length, 1, 'and the audit endpoint reports it without revealing the question');
  } finally { fs.rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('reveal refuses a reading-context mismatch introduced after allocation', () => {
  const pool = Array.from({ length: 12 }, (_, i) => blueprint(2, i + 1, i + 3, 1));
  const fixture = runtimeFixture(undefined, pool);
  try {
    fixture.provision('s-read', 'p-read', scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 14 }));
    const selected = fixture.runtime.revealFairDrawSeed('s-read').selectionIds;
    const judge = { uid: 'j1', role: 'judge', organizationId: 'org', competitionId: 'comp' };
    fixture.runtime.confirmPresence('s-read', judge);
    fixture.runtime.approveQuestion('s-read', 0, judge);
    fixture.pools.save('comp', 'pool', pool.map(item => (item.id === selected[0] ? { ...item, rawi: 'Warsh' } : item)));
    assert.throws(() => fixture.runtime.revealQuestion('s-read', 0, judge), /QUESTION_RUNTIME_READING_VIOLATION/);
  } finally { fs.rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('a session provisioned without a scope keeps working on the legacy juz bridge', () => {
  const pool = [...Array.from({ length: 8 }, (_, i) => blueprint(2, i + 1, i + 3, 1)), ...Array.from({ length: 8 }, (_, i) => blueprint(78, i + 1, i + 3, 30))];
  const fixture = runtimeFixture(undefined, pool);
  try {
    const state = fixture.provision('s-legacy', 'p-legacy');
    assert.equal(state.questionCount, 2);
    const verification = fixture.runtime.verifyAllocationScope('s-legacy');
    assert.equal(verification.enforced, false, 'a legacy session reports honestly that no scope was enforced');
  } finally { fs.rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('two concurrent sessions never receive the same locus twice from one ledger', async () => {
  const pool = Array.from({ length: 60 }, (_, i) => blueprint(2, i + 1, i + 3, 1));
  const fixture = runtimeFixture(undefined, pool);
  try {
    const scope = scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 63 });
    const sessions = Array.from({ length: 10 }, (_, i) => `s-con-${i}`);
    // التخصيص يمرّ على قفل دفتر التنوّع؛ المحاولة المتزامنة إمّا تنجح أو تُرفض صراحةً، ولا تتضاعف.
    const outcomes = await Promise.allSettled(sessions.map(async (id, i) => fixture.provision(id, `p-con-${i}`, scope)));
    const succeeded = sessions.filter((id, i) => outcomes[i].status === 'fulfilled');
    assert.ok(succeeded.length > 0, 'at least one concurrent provision completes');
    const seen = new Map<string, string>();
    for (const id of succeeded) {
      for (const blueprintId of fixture.runtime.revealFairDrawSeed(id).selectionIds) {
        const previous = seen.get(blueprintId);
        assert.equal(previous, undefined, `locus ${blueprintId} was assigned to both ${previous} and ${id}`);
        seen.set(blueprintId, id);
      }
      assert.equal(fixture.runtime.verifyAllocationScope(id).violations.length, 0);
    }
  } finally { fs.rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('a session id cannot be provisioned twice, so a retried request never doubles a model', () => {
  const pool = Array.from({ length: 12 }, (_, i) => blueprint(2, i + 1, i + 3, 1));
  const fixture = runtimeFixture(undefined, pool);
  try {
    const scope = scopeFromJuzRange(1, 1);
    fixture.provision('s-idem', 'p-idem', scope);
    assert.throws(() => fixture.provision('s-idem', 'p-idem', scope), /QUESTION_RUNTIME_SESSION_EXISTS/, 'a duplicate request is refused instead of creating a second model');
    assert.equal(fixture.runtime.revealFairDrawSeed('s-idem').selectionIds.length, 2);
  } finally { fs.rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('the whole Quran scope allows every locus, so nothing regresses for full-scope categories', () => {
  const pool = [...Array.from({ length: 6 }, (_, i) => blueprint(2, i + 1, i + 3, 1)), ...Array.from({ length: 6 }, (_, i) => blueprint(78, i + 1, i + 3, 30))];
  for (const item of pool) assert.equal(blueprintInsideScope(item, fullQuranScope()), true);
});
