/*
 * §66 تضارب المصالح، §67 الجدولة الذكية، §68 هرم التأهيل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { declareConflict, resolveConflict, judgeMayScore, eligibleCommittees, caseIsBinding, caseVerification, type ConflictCase } from '../src/lib/conflict-of-interest';
import { buildSchedule, withManualPin, withoutPin, toMin, type SchedulerInput } from '../src/lib/smart-scheduler';
import { createRelationship, computeQualifiers, mergeQualifications, transitionQualification, invitationParticipant, hierarchyOf } from '../src/lib/qualification';
import type { Participant, ResultRecord } from '../src/types';

const NOW = '2026-10-01T08:00:00.000Z';
const base = { competitionId: 'c1', organizationId: 'o1', committeeId: 'K1', committeeJudgeIds: ['j1', 'j2'], now: NOW };

test('§66 a judge declares, the head judge decides, the original assignment is preserved', () => {
  const c = declareConflict([], { ...base, id: 'coi-1', judgeId: 'j1', declaredByUid: 'uid-j1', participantId: 'p1', kind: 'declared_conflict', relation: 'student', reason: 'He is my student at the institute' });
  assert.equal(c.status, 'open');
  assert.equal(c.hardConflict, true);
  assert.deepEqual(c.originalAssignment, { committeeId: 'K1', judgeIds: ['j1', 'j2'] });
  assert.equal(judgeMayScore([c], 'j1', { id: 'p1' }).allowed, false, 'blocked while open');
  assert.equal(judgeMayScore([c], 'j2', { id: 'p1' }).allowed, true);
  assert.throws(() => declareConflict([], { ...base, id: 'x', judgeId: 'j1', declaredByUid: 'u', participantId: 'p1', kind: 'recusal', relation: 'other', reason: 'no' }), /REASON_REQUIRED/);
  assert.equal(declareConflict([c], { ...base, id: 'dup', judgeId: 'j1', declaredByUid: 'uid-j1', participantId: 'p1', kind: 'declared_conflict', relation: 'student', reason: 'again duplicate' }).id, 'coi-1', 'no duplicate open case');

  assert.throws(() => resolveConflict(c, { decision: 'rejected', note: 'not relevant', actorId: 'x', actorRole: 'judge', now: NOW }), /REVIEWER_REQUIRED/);
  assert.throws(() => resolveConflict(c, { decision: 'rejected', note: 'self resolved', actorId: 'uid-j1', actorRole: 'head_judge', now: NOW }), /SELF_RESOLUTION/);
  assert.throws(() => resolveConflict(c, { decision: 'upheld_no_action', note: 'keep anyway', actorId: 'hj', actorRole: 'head_judge', now: NOW }), /HARD_CANNOT_BE_UPHELD/);
  assert.throws(() => resolveConflict(c, { decision: 'reassigned_participant', note: 'move him', actorId: 'hj', actorRole: 'head_judge', now: NOW }), /TARGET_COMMITTEE_REQUIRED/);
  const r = resolveConflict(c, { decision: 'reassigned_participant', note: 'moved to panel K2', actorId: 'hj', actorRole: 'head_judge', now: NOW, reassignedToCommitteeId: 'K2' });
  assert.equal(r.status, 'resolved');
  assert.deepEqual(r.originalAssignment, c.originalAssignment, 'history not rewritten');
  assert.equal(judgeMayScore([r], 'j1', { id: 'p1' }).allowed, false, 'still may not score after reassignment');
  assert.throws(() => resolveConflict(r, { decision: 'rejected', note: 'second time', actorId: 'hj', actorRole: 'head_judge', now: NOW }), /ALREADY_RESOLVED/);
  const inst = declareConflict([], { ...base, id: 'coi-2', judgeId: 'j2', declaredByUid: 'uid-j2', institution: 'Dar Al-Quran', kind: 'abstention', relation: 'institution', reason: 'I teach at this institution' });
  assert.equal(inst.hardConflict, false);
  const rejected = resolveConflict(inst, { decision: 'rejected', note: 'no teaching role this year', actorId: 'hj', actorRole: 'head_judge', now: NOW });
  assert.equal(judgeMayScore([rejected], 'j2', { id: 'p9', institution: 'dar al-quran' }).allowed, true);
  const committees = [{ id: 'K1', judgeIds: ['j1', 'j2'] }, { id: 'K2', judgeIds: ['j3'] }];
  assert.deepEqual(eligibleCommittees(committees, [r], { id: 'p1' }).map(k => k.id), ['K2']);
});

const schedule = (over: Partial<SchedulerInput> = {}): SchedulerInput => ({
  days: [{ date: '2026-10-10', start: '08:00', end: '12:00' }, { date: '2026-10-11', start: '08:00', end: '12:00' }],
  sessionMinutes: { A: 30, B: 20 }, defaultSessionMinutes: 20, transitionMinutes: 5,
  breaks: [{ start: '10:00', end: '10:15' }], prayerBreaks: [{ start: '11:30', end: '12:00', label: 'Dhuhr' }],
  halls: [{ id: 'H1', name: 'Hall 1' }, { id: 'H2', name: 'Hall 2' }],
  committees: [{ id: 'K1', hallId: 'H1', assignedCategories: ['A'], judgeIds: ['j1', 'j2'] }, { id: 'K2', hallId: 'H2', assignedCategories: ['A', 'B'], judgeIds: ['j3'] }],
  participants: Array.from({ length: 10 }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, categoryId: i < 7 ? 'A' : 'B' })),
  judgeAvailability: [], conflicts: [], pins: [], ...over,
});

test('§67 the scheduler respects breaks, prayer, transitions and categories, deterministically', () => {
  const input = schedule();
  const a = buildSchedule(input), b = buildSchedule(input);
  assert.deepEqual(a, b, 'same input → same plan');
  assert.equal(a.slots.length, 10);
  assert.equal(a.unscheduled.length, 0);
  for (const s of a.slots) {
    const [x, y] = [toMin(s.start), toMin(s.end)];
    assert.ok(!(x < toMin('10:15') && toMin('10:00') < y), `${s.participantId} overlaps the break`);
    assert.ok(!(x < toMin('12:00') && toMin('11:30') < y), `${s.participantId} overlaps prayer`);
    const k = input.committees.find(c => c.id === s.committeeId)!;
    assert.ok(k.assignedCategories.includes(input.participants.find(p => p.id === s.participantId)!.categoryId));
  }
  for (const k of ['K1', 'K2']) for (const d of ['2026-10-10', '2026-10-11']) {
    const mine = a.slots.filter(s => s.committeeId === k && s.date === d).sort((x, y) => x.start.localeCompare(y.start));
    for (let i = 1; i < mine.length; i++) assert.ok(toMin(mine[i].start) >= toMin(mine[i - 1].end) + 5, 'transition kept');
  }
});

test('§67 judge availability, conflicts and capacity are enforced, with reasons for what cannot be placed', () => {
  const conflict: ConflictCase = declareConflict([], { ...base, id: 'c', judgeId: 'j3', declaredByUid: 'u', participantId: 'p08', kind: 'recusal', relation: 'other', reason: 'personal reason stated' });
  const plan = buildSchedule(schedule({ conflicts: [conflict], judgeAvailability: [{ judgeId: 'j1', date: '2026-10-11', start: '08:00', end: '09:00' }] }));
  assert.equal(plan.unscheduled.find(u => u.participantId === 'p08')?.reason, 'ALL_COMMITTEES_CONFLICTED', 'only K2 serves category B and its judge recused');
  assert.ok(plan.slots.filter(s => s.committeeId === 'K1').every(s => s.date === '2026-10-11' && toMin(s.end) <= toMin('09:00')), 'K1 only when j1 is available');
  const tiny = buildSchedule(schedule({ days: [{ date: '2026-10-10', start: '08:00', end: '08:40' }] }));
  assert.ok(tiny.unscheduled.some(u => u.reason === 'NO_CAPACITY'));
  assert.ok(buildSchedule(schedule({ participants: [{ id: 'z', categoryId: 'Z' }] })).unscheduled[0].reason === 'NO_COMMITTEE_FOR_CATEGORY');
});

test('§67 manual override pins a slot, recomputes the rest, and can be undone', () => {
  const input = withManualPin(schedule(), { participantId: 'p05', committeeId: 'K2', date: '2026-10-11', start: '09:00' });
  const plan = buildSchedule(input);
  const pinned = plan.slots.find(s => s.participantId === 'p05')!;
  assert.deepEqual([pinned.committeeId, pinned.date, pinned.start, pinned.pinned], ['K2', '2026-10-11', '09:00', true]);
  assert.ok(!plan.slots.some(s => s.participantId !== 'p05' && s.committeeId === 'K2' && s.date === '2026-10-11' && toMin(s.start) < toMin('09:35') && toMin('09:00') < toMin(s.end) + 5), 'nothing else collides with the pin');
  const bad = buildSchedule(withManualPin(schedule(), { participantId: 'p01', committeeId: 'K1', date: '2026-10-10', start: '10:05' }));
  assert.equal(bad.unscheduled.find(u => u.participantId === 'p01')?.reason, 'PIN_INVALID', 'a pin into a break is refused, not silently moved');
  assert.equal(buildSchedule(withoutPin(input, 'p05')).slots.find(s => s.participantId === 'p05')!.pinned, false);
});

const result = (id: string, cat: string, rank: number, score: number, status: ResultRecord['status'] = 'sealed'): ResultRecord => ({ id: `r-${id}`, competitionId: 'local', participantId: id, participantCode: id, participantName: id, participantNameArabic: id, country: 'KW', categoryId: cat, categoryName: cat, finalScore: score, rank, status, sealMetadata: { sealedBy: 'x', sealedAt: NOW, cryptographicChecksum: `sha-${id}` } } as ResultRecord);

test('§68 qualifiers come only from sealed results, carry provenance, and invitations are not auto-registrations', () => {
  const rel = createRelationship([], { id: 'rel', organizationId: 'o1', parentCompetitionId: 'national', childCompetitionId: 'local', rule: { topN: 2, perCategory: true, categoryMap: { A: 'NA' } }, createdAt: NOW, createdBy: 'admin' });
  assert.throws(() => createRelationship([rel], { ...rel, id: 'loop', parentCompetitionId: 'local', childCompetitionId: 'national' }), /CYCLE/);
  assert.throws(() => createRelationship([], { ...rel, id: 'x', rule: { perCategory: true } }), /RULE_REQUIRED/);
  let n = 0;
  const results = [result('a1', 'A', 1, 98), result('a2', 'A', 2, 95), result('a3', 'A', 3, 90), result('b1', 'B', 1, 80), result('b2', 'B', 2, 70, 'calculated')];
  const qs = computeQualifiers(rel, results, NOW, 'admin', () => `q${++n}`);
  assert.deepEqual(qs.map(q => q.sourceParticipantId), ['a1', 'a2', 'b1'], 'top 2 per category, unsealed excluded');
  assert.equal(qs[0].evidence.sealChecksum, 'sha-a1');
  assert.equal(qs[0].targetCategoryId, 'NA');
  assert.equal(mergeQualifications(qs, computeQualifiers(rel, results, NOW, 'admin', () => `q${++n}`)).length, 3, 'recompute does not duplicate');
  const source = { id: 'a1', code: 'A-1', competitionId: 'local', organizationId: 'o1', fullName: 'Ali', fullNameArabic: 'علي', email: 'a@x', phone: '1', country: 'KW', nationality: 'KW', nationalIdOrPassport: 'P', dateOfBirth: '2010-01-01', gender: 'male', categoryId: 'A', riwaya: 'Hafs', status: 'certified', statusHistory: [], specialNeeds: false, documents: [] } as unknown as Participant;
  const invited = invitationParticipant(qs[0], source, { competitionId: 'national', organizationId: 'o1' }, { id: 'pn1', code: 'Q-1' }, NOW);
  assert.equal(invited.status, 'draft', 'invited, not registered');
  assert.equal(invited.fullNameArabic, 'علي');
  assert.equal(invited.categoryId, 'NA');
  assert.deepEqual(invited.qualifiedFrom, { competitionId: 'local', participantId: 'a1', qualificationId: 'q1', rank: 1, score: 98, resultId: 'r-a1', sealChecksum: 'sha-a1' });
  const inv = transitionQualification(qs[0], 'invited', 'admin', NOW);
  assert.throws(() => transitionQualification(inv, 'revoked', 'admin', NOW, ''), /REASON_REQUIRED/);
  assert.throws(() => transitionQualification(inv, 'qualified' as never, 'admin', NOW), /TRANSITION_INVALID/);
  assert.equal(transitionQualification(inv, 'accepted', 'admin', NOW).history.length, 3);
  const regional = createRelationship([rel], { id: 'rel2', organizationId: 'o1', parentCompetitionId: 'local', childCompetitionId: 'district', rule: { topN: 5, perCategory: false }, createdAt: NOW, createdBy: 'admin' });
  const tree = hierarchyOf([rel, regional], 'local');
  assert.deepEqual([tree.up.map(r => r.parentCompetitionId), tree.down.map(r => r.childCompetitionId)], [['national'], ['district']]);
});

test('the new collections are declared for sync and guarded by Firestore rules', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  for (const c of ['conflict_cases', 'schedule_plans', 'qualifications']) assert.match(rules, new RegExp(`match /${c}/\\{`));
  const coi = rules.slice(rules.indexOf('match /conflict_cases/'), rules.indexOf('match /schedule_plans/'));
  assert.ok(coi.includes("roleIs(['judge']) && request.resource.data.uploaderUid == request.auth.uid && request.resource.data.declaredByUid == request.resource.data.uploaderUid"), 'a judge can only declare in their own name');
  assert.ok(coi.includes("request.resource.data.status == 'open'"), 'and only an open case');
});

test('review fix: a judge cannot forge a binding conflict case against another judge', async () => {
  const { caseIsBinding } = await import('../src/lib/conflict-of-interest');
  const forged = declareConflict([], { ...base, id: 'f', judgeId: 'victim', declaredByUid: 'uid-attacker', declaredByRole: 'judge', participantId: 'p1', kind: 'recusal', relation: 'other', reason: 'forged declaration' });
  const own = declareConflict([], { ...base, id: 'o', judgeId: 'victim', declaredByUid: 'uid-victim', declaredByRole: 'judge', participantId: 'p2', kind: 'recusal', relation: 'other', reason: 'my own declaration' });
  const uids = { victim: 'uid-victim' };
  assert.equal(caseIsBinding(forged, uids), false);
  assert.equal(judgeMayScore([forged], 'victim', { id: 'p1' }, uids).allowed, true, 'forged case does not block');
  assert.equal(judgeMayScore([own], 'victim', { id: 'p2' }, uids).allowed, false, 'own declaration binds');
  const byHeadJudge = declareConflict([], { ...base, id: 'h', judgeId: 'victim', declaredByUid: 'uid-hj', declaredByRole: 'head_judge', participantId: 'p3', kind: 'declared_conflict', relation: 'relative', reason: 'reported by head judge' });
  assert.equal(judgeMayScore([byHeadJudge], 'victim', { id: 'p3' }, uids).allowed, false, 'reviewer-declared cases bind');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const coi = rules.slice(rules.indexOf('match /conflict_cases/'), rules.indexOf('match /schedule_plans/'));
  assert.ok(coi.includes('request.resource.data.declaredByUid == request.resource.data.uploaderUid'));
  assert.ok(coi.includes("request.resource.data.declaredByRole == 'judge'"));
});

test('review fix: store applies participant reassignment and persists schedule demotion; events endpoint checks competition scope and subject', () => {
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  assert.match(store, /input\.decision==='reassigned_participant'&&current\.participantId&&input\.reassignedToCommitteeId\)\{[\s\S]*?assignedCommitteeId:target[\s\S]*?persistScopedDocument\('participants'/);
  assert.match(store, /if\(p\.id===planId\|\|demoted\.has\(p\.id\)\)void persistScopedDocument\('schedule_plans'/);
  const server = fs.readFileSync('server.ts', 'utf8');
  const events = server.slice(server.indexOf("app.post('/api/saas/events'"), server.indexOf("app.post('/api/saas/events'") + 3000);
  assert.match(events, /identity\.competitionId!==competitionId\)return res\.status\(403\)\.json\(\{code:'COMPETITION_SCOPE_MISMATCH'\}\)/);
  assert.match(events, /DOMAIN_EVENT_SUBJECT_NOT_FOUND/);
});

test('review fix: a judge without a linked identity keeps binding conflicts (fail safe), and the UI can tell the three cases apart', async () => {
  const { caseIsBinding, caseVerification } = await import('../src/lib/conflict-of-interest');
  const c = declareConflict([], { ...base, id: 'n', judgeId: 'unlinked', declaredByUid: 'uid-x', declaredByRole: 'judge', participantId: 'p1', kind: 'recusal', relation: 'other', reason: 'self recusal without grant' });
  assert.equal(caseIsBinding(c, { unlinked: undefined }), true);
  assert.equal(judgeMayScore([c], 'unlinked', { id: 'p1' }, { unlinked: undefined }).allowed, false);
  assert.equal(caseVerification(c, { unlinked: undefined }), 'unverifiable');
  assert.equal(caseVerification(c, { unlinked: 'uid-x' }), 'verified');
  assert.equal(caseVerification(c, { unlinked: 'uid-other' }), 'forged');
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  for (const code of ['CONFLICT_TARGET_COMMITTEE_NOT_FOUND', 'CONFLICT_TARGET_COMMITTEE_WRONG_CATEGORY', 'CONFLICT_TARGET_COMMITTEE_CONFLICTED']) assert.ok(store.includes(code), code);
});

test('a judge-declared case naming an identifier that is no known judge binds nobody', () => {
  const c = { id: 'x', competitionId: 'c', judgeId: 'user-of-someone', participantId: 'p1', declaredByRole: 'judge', declaredByUid: 'uid-attacker', status: 'open' } as any;
  const known = { 'judge-1': 'uid-1', 'user-1': 'uid-1' };
  assert.equal(caseIsBinding(c, known), false);
  assert.equal(caseVerification(c, known), 'forged');
  assert.equal(caseIsBinding({ ...c, judgeId: 'user-1' }, known), false, 'the stored userId form is canonicalised and checked against its uid');
  assert.equal(caseIsBinding({ ...c, judgeId: 'user-1', declaredByUid: 'uid-1' }, known), true);
  assert.equal(caseIsBinding({ ...c, judgeId: 'judge-2' }, { ...known, 'judge-2': undefined }), true, 'a known judge without a linked identity stays fail-safe binding');
});
