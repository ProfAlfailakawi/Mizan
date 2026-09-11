import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildParticipantScopeRecord, DEFAULT_SELECTION_RULE, nextScopeVersion } from '../src/lib/participant-scope';
import { scopeFromJuz } from '../src/lib/quran-scope';

/*
 * «لا تغيير صامت بعد الاعتماد» لا تتحقق بأن يكون التغيير مكتوبًا في التخزين، بل بأن يراه
 * صاحبه واللجنة. فالنسخة السابقة تُحفظ — وتُعرض.
 */

const rule = { ...DEFAULT_SELECTION_RULE, version: 1, enabled: true, decidedBy: 'participant' as const, selectionUnit: 'juz' as const, exactUnits: 1, approval: 'committee' as const };

const record = (version: number, juz: number[], changeReason?: string) => buildParticipantScopeRecord({
  id: `psc-${version}`, organizationId: 'org-1', competitionId: 'comp-1', categoryId: 'cat-1',
  participantId: 'p1', rule, selection: scopeFromJuz(juz), version, changeReason,
});

test('each save is a new version; the previous one is superseded and keeps its own reason', () => {
  const first = { ...record(1, [1], 'اختياري الأول'), status: 'approved' as const };
  const second = record(nextScopeVersion(first), [5], 'وجدت أني أتقن الخامس أكثر');
  assert.equal(second.version, 2);
  const superseded = { ...first, status: 'superseded' as const, supersededAt: '2026-05-01T10:00:00.000Z', supersededByVersion: second.version };
  assert.equal(superseded.changeReason, 'اختياري الأول');
  assert.equal(superseded.supersededByVersion, 2);
  assert.notEqual(superseded.scopeSignature, second.scopeSignature, 'two different ranges never share a signature');
});

test('the store exposes the whole history, tenant-bounded, newest version first', () => {
  const source = fs.readFileSync('src/lib/store.ts', 'utf8');
  const start = source.indexOf('const participantScopeHistory');
  assert.ok(start > 0, 'the history is not reachable from the store at all');
  const body = source.slice(start, start + 700);
  assert.match(body, /competitionId === globalState\.competition\.id/, 'history must not cross competitions');
  assert.match(body, /organizationId === globalState\.competition\.organizationId/, 'history must not cross organizations');
  assert.match(body, /b\.version - a\.version/, 'newest version first');
  assert.doesNotMatch(body, /status !== 'superseded'/, 'the whole point is that superseded versions are included');
  assert.match(source, /participantScopeHistory,/, 'the history must be exported from the store API');
});

test('the committee screen renders earlier versions with their dates and reasons, not just a count', () => {
  const source = fs.readFileSync('src/components/admin/QuestionEngineWorkspace.tsx', 'utf8');
  assert.match(source, /participantScopeHistory\(/, 'the review screen must read the history');
  assert.match(source, /status === 'superseded'/, 'it must single out the earlier versions');
  assert.match(source, /supersededAt/, 'when a version was replaced is part of the record a reviewer needs');
  assert.match(source, /changeReason/, 'why it was replaced is the reason the history exists');
  assert.match(source, /نسخة سابقة|نسخة/, 'the history is labelled in Arabic for the committee');
});

test('the participant sees their own history, so their range never changes from behind them', () => {
  const source = fs.readFileSync('src/components/participant/ParticipantDashboard.tsx', 'utf8');
  assert.match(source, /participantScopeHistory\(/, 'the participant screen must read the history');
  assert.match(source, /scopeHistory\.length>1/, 'a single version needs no history panel');
  assert.match(source, /changeReason/, 'the participant sees why a version was replaced');
  assert.match(source, /سجل نطاقي/, 'named plainly in Arabic');
});

test('nothing in the history path deletes a record — versions are superseded, never removed', () => {
  const source = fs.readFileSync('src/lib/store.ts', 'utf8');
  const save = source.slice(source.indexOf('const saveParticipantScope'), source.indexOf('const decideParticipantScope'));
  assert.match(save, /status: 'superseded' as const/, 'the previous version is marked, not dropped');
  assert.doesNotMatch(save, /participantScopes\s*=\s*globalState\.participantScopes\.filter\(/, 'no filter may drop an older version');
});

/*
 * دورةُ حياةٍ لا بابَ يدخل منها أحد ليست دورة حياة: كان `saveParticipantScope` مبنيًّا
 * كاملًا ولا تستدعيه شاشةٌ واحدة، فلا نسخة ثانية تُولد أصلًا، فلا سجلّ يُعرض.
 */

test('a participant can actually reach the scope-change path from a screen, not only from the store', () => {
  const dashboard = fs.readFileSync('src/components/participant/ParticipantDashboard.tsx', 'utf8');
  assert.match(dashboard, /store\.saveParticipantScope\(/, 'the lifecycle needs a door a participant can walk through');
  assert.match(dashboard, /QuranScopePicker/, 'the participant picks a real range, not a free-text field');
  assert.match(dashboard, /validateParticipantSelection/, 'the category rule is enforced before the request is sent');
  assert.match(dashboard, /scopeChangeReason/, 'a change carries its reason');
  assert.match(dashboard, /submit: ?true|submit:true/, 'the change is submitted for review, never self-approved');
});

test('the change door closes on a locked scope, not on an approved one', () => {
  const dashboard = fs.readFileSync('src/components/participant/ParticipantDashboard.tsx', 'utf8');
  assert.match(dashboard, /scopeRecord\?\.status!=='locked'/, 'approved ranges stay revisable; locked ones are final');
  assert.doesNotMatch(dashboard, /scopeRecord\?\.status!=='approved'/, 'an approved range must not be frozen by the screen');
});

test('the committee can reject with a reason the participant will read, not only approve', () => {
  const workspace = fs.readFileSync('src/components/admin/QuestionEngineWorkspace.tsx', 'utf8');
  assert.match(workspace, /decideParticipantScope\(participant\.id, 'rejected', rejectReason\.trim\(\)\)/, 'rejection must carry its reason');
  assert.match(workspace, /disabled=\{!rejectReason\.trim\(\)\}/, 'a reasonless rejection must not be sendable');
  const dashboard = fs.readFileSync('src/components/participant/ParticipantDashboard.tsx', 'utf8');
  assert.match(dashboard, /scopeRecord\?\.rejectionReason/, 'the participant is shown why they were rejected');
});

test('the store refuses a rejection with no reason, so the screen guard is not the only guard', () => {
  const source = fs.readFileSync('src/lib/store.ts', 'utf8');
  const decide = source.slice(source.indexOf('const decideParticipantScope'), source.indexOf('const participantEffectiveScope'));
  assert.match(decide, /REJECTION_REASON_REQUIRED/, 'the rule lives in the store, not only in the UI');
});
