import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSessionCommittee, freezeRulesOnce, estimateQueueWait } from '../src/lib/session-start-core';
import type { Committee, CompetitionPolicy, Participant, RuleSet } from '../src/types';

/*
 * لحظةُ بدء أوّل جلسة تحمل قرارًا يمسّ عدالة المسابقة لا مظهرها: **تجميد اللائحة**. بعدها
 * لا يستطيع أحد — ولا مدير المسابقة — أن يغيّر قواعد التقييم والتحكيم جارٍ. ولو انكسر هذا
 * لأمكن تعديل قواعد التصحيح أثناء الجلسات، ولا اختبار يقرأ الكود كان يكشفه.
 */

const participant = (over: Partial<Participant> = {}): Participant => ({
  id: 'p-1', competitionId: 'c', code: 'A-1', status: 'in_queue', statusHistory: [],
  ...over,
} as unknown as Participant);

const committee = (id: string, over: Partial<Committee> = {}): Committee => ({
  id, competitionId: 'c', code: id.toUpperCase(), status: 'ready', averageSessionMinutes: 10, judgeIds: [],
  ...over,
} as unknown as Committee);

const policy = (over: Partial<CompetitionPolicy> = {}): CompetitionPolicy => ({ questions: {}, ...over } as unknown as CompetitionPolicy);
const ruleSet = (over: Partial<RuleSet> = {}): RuleSet => ({ id: 'rs-1', ...over } as unknown as RuleSet);

// ---- choosing the panel ----------------------------------------------------------

test('the assigned panel is used when it carries no hard conflict', () => {
  const c = committee('c1');
  const d = chooseSessionCommittee({ participant: participant(), assignedCommittee: c, assignedHasHardConflict: false, compatibleCommittees: [committee('other')] });
  assert.deepEqual(d, { kind: 'start', committee: c });
});

test('a hard conflict on the assigned panel sends the participant to a compatible one', () => {
  const safe = committee('safe');
  const d = chooseSessionCommittee({ participant: participant(), assignedCommittee: committee('conflicted'), assignedHasHardConflict: true, compatibleCommittees: [safe] });
  assert.equal(d.kind, 'start');
  assert.equal((d as {committee: Committee}).committee.id, 'safe', 'a judge with a conflict must never hear this participant');
});

test('with no safe panel the session does not start — a wrong panel is worse than waiting', () => {
  const d = chooseSessionCommittee({ participant: participant(), assignedCommittee: committee('conflicted'), assignedHasHardConflict: true, compatibleCommittees: [] });
  assert.deepEqual(d, { kind: 'no-safe-committee' });
});

test('an unknown participant starts nothing', () => {
  assert.deepEqual(chooseSessionCommittee({ participant: undefined, assignedCommittee: committee('c1'), assignedHasHardConflict: false, compatibleCommittees: [] }), { kind: 'no-participant' });
});

// ---- freezing the rules ----------------------------------------------------------

test('the first session stamps the policy and the rule set with one moment', () => {
  const frozen = freezeRulesOnce({ policy: policy(), ruleSet: ruleSet(), ruleSets: [], now: '2027-03-01T08:00:00Z' });
  assert.ok(frozen);
  assert.equal(frozen!.policy.frozenAt, '2027-03-01T08:00:00Z');
  assert.equal(frozen!.ruleSet.frozenAt, '2027-03-01T08:00:00Z', 'policy and rule set freeze together, never one without the other');
  assert.equal(frozen!.policy.updatedAt, '2027-03-01T08:00:00Z');
});

test('a rule set already frozen is never re-stamped — that is the whole guarantee', () => {
  /* لو أعاد التجميد ختمَه لأمكن تحريك اللائحة بتكرار بدء الجلسات. */
  const already = policy({ frozenAt: '2027-03-01T08:00:00Z' } as Partial<CompetitionPolicy>);
  assert.equal(freezeRulesOnce({ policy: already, ruleSet: ruleSet(), ruleSets: [], now: '2027-03-01T11:30:00Z' }), null);
});

test('freezing replaces the rule set in the list instead of leaving two of it', () => {
  const other = ruleSet({ id: 'rs-2' } as Partial<RuleSet>);
  const frozen = freezeRulesOnce({ policy: policy(), ruleSet: ruleSet({ id: 'rs-1' } as Partial<RuleSet>), ruleSets: [ruleSet({ id: 'rs-1' } as Partial<RuleSet>), other], now: 'T' });
  assert.ok(frozen);
  assert.equal(frozen!.ruleSets.filter(r => r.id === 'rs-1').length, 1, 'the unfrozen twin must not survive beside the frozen one');
  assert.equal(frozen!.ruleSets[0].frozenAt, 'T', 'and the frozen one leads');
  assert.ok(frozen!.ruleSets.some(r => r.id === 'rs-2'), 'other rule sets are kept');
});

test('freezing with no list still produces a usable one', () => {
  const frozen = freezeRulesOnce({ policy: policy(), ruleSet: ruleSet(), now: 'T' });
  assert.deepEqual(frozen!.ruleSets.map(r => r.id), ['rs-1']);
});

// ---- the number the participant reads ---------------------------------------------

const NOW = Date.parse('2027-03-01T08:00:00Z');

test('first in line waits the floor, not zero', () => {
  const p = participant();
  const e = estimateQueueWait({ participant: p, committee: committee('c1'), committeeQueueInOrder: [p], fallbackSessionMinutes: 8, now: NOW });
  assert.equal(e!.ahead, 0);
  assert.equal(e!.estimatedWaitMinutes, 1, 'never tell someone their turn takes zero minutes');
  assert.equal(e!.confidence, 'medium');
});

test('the wait grows with the number of people ahead', () => {
  const me = participant({ id: 'p-me' } as Partial<Participant>);
  const queue = [participant({ id: 'a' } as Partial<Participant>), participant({ id: 'b' } as Partial<Participant>), me];
  const e = estimateQueueWait({ participant: me, committee: committee('c1'), committeeQueueInOrder: queue, fallbackSessionMinutes: 8, now: NOW });
  assert.equal(e!.ahead, 2);
  assert.equal(e!.estimatedWaitMinutes, 20, 'two ahead at ten minutes each');
  assert.equal(e!.basis.queueSize, 3);
});

test('a session already running adds its remainder, and a paused panel a whole one', () => {
  const me = participant({ id: 'p-me' } as Partial<Participant>);
  const running = estimateQueueWait({ participant: me, committee: committee('c1', { status: 'testing' } as Partial<Committee>), committeeQueueInOrder: [me], fallbackSessionMinutes: 8, now: NOW });
  assert.equal(running!.estimatedWaitMinutes, 6, 'about half of the ten-minute session is left');
  assert.equal(running!.basis.activeSession, true);

  const paused = estimateQueueWait({ participant: me, committee: committee('c1', { status: 'paused' } as Partial<Committee>), committeeQueueInOrder: [me], fallbackSessionMinutes: 8, now: NOW });
  assert.equal(paused!.estimatedWaitMinutes, 10, 'a paused panel costs a full session');
  assert.equal(paused!.basis.paused, true);
});

test('a missing or zero panel average falls back, and never to zero', () => {
  const me = participant({ id: 'p-me' } as Partial<Participant>);
  const queue = [participant({ id: 'a' } as Partial<Participant>), me];
  const viaFallback = estimateQueueWait({ participant: me, committee: committee('c1', { averageSessionMinutes: 0 } as Partial<Committee>), committeeQueueInOrder: queue, fallbackSessionMinutes: 7, now: NOW });
  assert.equal(viaFallback!.estimatedWaitMinutes, 7, 'the competition default is used');

  const viaFloor = estimateQueueWait({ participant: me, committee: committee('c1', { averageSessionMinutes: 0 } as Partial<Committee>), committeeQueueInOrder: queue, fallbackSessionMinutes: 0, now: NOW });
  assert.equal(viaFloor!.basis.currentCompetitionAverageMinutes, 8, 'and with nothing at all, a sane default');
});

test('confidence drops once the estimate stacks more than three people deep', () => {
  const me = participant({ id: 'p-me' } as Partial<Participant>);
  const deep = [...['a', 'b', 'c'].map(id => participant({ id } as Partial<Participant>)), me];
  assert.equal(estimateQueueWait({ participant: me, committee: committee('c1'), committeeQueueInOrder: deep, fallbackSessionMinutes: 8, now: NOW })!.confidence, 'low');
});

test('the expected moment follows from the wait, not from a separate clock', () => {
  const me = participant({ id: 'p-me' } as Partial<Participant>);
  const queue = [participant({ id: 'a' } as Partial<Participant>), me];
  const e = estimateQueueWait({ participant: me, committee: committee('c1'), committeeQueueInOrder: queue, fallbackSessionMinutes: 8, now: NOW })!;
  assert.equal(Date.parse(e.expectedTurnAt) - NOW, e.estimatedWaitMinutes * 60000);
});

test('no estimate is offered to someone who is not waiting, or has no panel', () => {
  const notWaiting = participant({ status: 'tested' } as Partial<Participant>);
  assert.equal(estimateQueueWait({ participant: notWaiting, committee: committee('c1'), committeeQueueInOrder: [], fallbackSessionMinutes: 8, now: NOW }), null);
  assert.equal(estimateQueueWait({ participant: participant(), committee: undefined, committeeQueueInOrder: [], fallbackSessionMinutes: 8, now: NOW }), null);
  assert.equal(estimateQueueWait({ participant: undefined, committee: committee('c1'), committeeQueueInOrder: [], fallbackSessionMinutes: 8, now: NOW }), null);
});

test('a participant missing from their own queue is placed at its head, not at minus one', () => {
  const me = participant({ id: 'p-me' } as Partial<Participant>);
  const e = estimateQueueWait({ participant: me, committee: committee('c1'), committeeQueueInOrder: [participant({ id: 'someone-else' } as Partial<Participant>)], fallbackSessionMinutes: 8, now: NOW })!;
  assert.equal(e.ahead, 0, 'a negative index would produce a negative wait');
  assert.ok(e.estimatedWaitMinutes >= 1);
});
