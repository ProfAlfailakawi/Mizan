import test from 'node:test';
import assert from 'node:assert/strict';
import { decideArrival, findByIdOrCode, highestQueueNumber, leastLoadedCommittee } from '../src/lib/arrival-core';
import type { Committee, Participant } from '../src/types';

/*
 * بوابة الحضور هي أوّل ما يعمل صباح المسابقة، وأكثر ما يقع فيها هو المسح المكرّر: متسابقٌ
 * يمسح بطاقته مرّتين، أو يصوّر رمزه فيُمسح عند بوابةٍ أخرى. لو أخذ رقمًا ثانيًا لانقلب
 * ترتيب القاعة كلّها، ولو أُعيدت رحلته إلى البداية لخسر أسبقيته.
 *
 * هذه الاختبارات تُشغّل القرار على تلك المشاهد نفسها.
 */

const COMP = 'comp-1';

const participant = (over: Partial<Participant> = {}): Participant => ({
  id: 'p-1', competitionId: COMP, code: 'A-101', fullName: 'One', fullNameArabic: 'واحد',
  categoryId: 'cat-1', status: 'approved', statusHistory: [],
  ...over,
} as unknown as Participant);

const committee = (id: string, over: Partial<Committee> = {}): Committee => ({
  id, competitionId: COMP, code: id.toUpperCase(), status: 'ready',
  assignedCategories: ['cat-1'], averageSessionMinutes: 8, judgeIds: [],
  ...over,
} as unknown as Committee);

const merge = <T,>(base: T, over: Partial<T>): T => ({ ...base, ...over });

const admit = (args: Parameters<typeof decideArrival>[0]) => {
  const d = decideArrival(args);
  assert.equal(d.kind, 'admit', `expected admit, got ${d.kind}`);
  return d as Extract<ReturnType<typeof decideArrival>, { kind: 'admit' }>;
};

test('the first arrival of the day takes queue number one', () => {
  const p = participant();
  const d = admit({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [committee('c1')], fallbackCommittees: [] });
  assert.equal(d.queueNumber, 1);
  assert.equal(d.originalQueueNumber, 1);
  assert.equal(d.queueOrderKey, 1);
  assert.equal(d.assignedCommitteeId, 'c1');
});

test('a second scan of the same pass does not take a second number', () => {
  /* هذا أكثر ما يقع: المتسابق يمسح مرّتين لأنه لم يسمع الصافرة. */
  const arrived = merge(participant(), { status: 'in_queue', queueNumber: 7, originalQueueNumber: 7, checkedInAt: '2027-01-01T08:00:00Z' } as Partial<Participant>);
  const d = decideArrival({ participant: arrived, roster: [arrived], competitionId: COMP, eligibleCommittees: [committee('c1')], fallbackCommittees: [] });
  assert.deepEqual(d, { kind: 'duplicate', reason: 'already-arrived' });
});

test('a photo of the pass scanned at another gate cannot rewind the journey', () => {
  for (const status of ['in_session', 'tested', 'certified'] as const) {
    const p = merge(participant(), { status, queueNumber: 3, originalQueueNumber: 3 } as Partial<Participant>);
    const d = decideArrival({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [committee('c1')], fallbackCommittees: [] });
    assert.equal(d.kind, 'duplicate', `a participant already ${status} must not be re-admitted`);
  }
});

test('someone who arrived and was later moved back keeps the number they were given', () => {
  const p = merge(participant(), { status: 'approved', checkedInAt: '2027-01-01T08:00:00Z', originalQueueNumber: 12 } as Partial<Participant>);
  const d = decideArrival({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [committee('c1')], fallbackCommittees: [] });
  assert.deepEqual(d, { kind: 'duplicate', reason: 'already-numbered' });
});

test('the next number comes from the highest issued, not from how many rows exist', () => {
  /* حذفُ متسابقٍ لا يجوز أن يُعيد رقمًا مُنح لغيره. */
  const roster = [
    merge(participant(), { id: 'p-a', code: 'A-1', status: 'in_queue', originalQueueNumber: 1 } as Partial<Participant>),
    merge(participant(), { id: 'p-c', code: 'A-3', status: 'in_queue', originalQueueNumber: 9 } as Partial<Participant>),
  ];
  assert.equal(highestQueueNumber(roster, COMP), 9);
  const fresh = merge(participant(), { id: 'p-new', code: 'A-4' } as Partial<Participant>);
  const d = admit({ participant: fresh, roster: [...roster, fresh], competitionId: COMP, eligibleCommittees: [committee('c1')], fallbackCommittees: [] });
  assert.equal(d.queueNumber, 10, 'two rows on the roster, but the next number is ten');
});

test('numbers from another competition never leak into this one', () => {
  const other = merge(participant(), { id: 'p-x', code: 'B-1', competitionId: 'comp-2', originalQueueNumber: 500 } as Partial<Participant>);
  const fresh = participant();
  const d = admit({ participant: fresh, roster: [other, fresh], competitionId: COMP, eligibleCommittees: [committee('c1')], fallbackCommittees: [] });
  assert.equal(d.queueNumber, 1);
});

test('a pass from another competition is refused, not admitted into this one', () => {
  const p = merge(participant(), { competitionId: 'comp-2' } as Partial<Participant>);
  assert.deepEqual(decideArrival({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [], fallbackCommittees: [] }), { kind: 'other-competition' });
});

test('an unknown code is not found, and is never silently admitted', () => {
  assert.deepEqual(decideArrival({ participant: undefined, roster: [], competitionId: COMP, eligibleCommittees: [], fallbackCommittees: [] }), { kind: 'not-found' });
});

test('the least loaded panel receives the arrival', () => {
  const roster = [
    merge(participant(), { id: 'q1', code: 'A-8', status: 'in_queue', assignedCommitteeId: 'c1' } as Partial<Participant>),
    merge(participant(), { id: 'q2', code: 'A-9', status: 'in_queue', assignedCommitteeId: 'c1' } as Partial<Participant>),
  ];
  const fresh = participant();
  const d = admit({ participant: fresh, roster: [...roster, fresh], competitionId: COMP, eligibleCommittees: [committee('c1'), committee('c2')], fallbackCommittees: [] });
  assert.equal(d.assignedCommitteeId, 'c2', 'c1 already holds two waiting, c2 holds none');
});

test('an equal load is broken by the faster panel, not by chance', () => {
  const slow = committee('slow', { averageSessionMinutes: 14 } as Partial<Committee>);
  const fast = committee('fast', { averageSessionMinutes: 6 } as Partial<Committee>);
  assert.equal(leastLoadedCommittee([slow, fast], [], COMP), 'fast');
  /* والترتيب المعطى لا يغيّر النتيجة. */
  assert.equal(leastLoadedCommittee([fast, slow], [], COMP), 'fast');
});

test('only participants waiting count as load — a finished one does not block a panel', () => {
  const done = merge(participant(), { id: 'd1', code: 'A-7', status: 'tested', assignedCommitteeId: 'c1' } as Partial<Participant>);
  const fresh = participant();
  const d = admit({ participant: fresh, roster: [done, fresh], competitionId: COMP, eligibleCommittees: [committee('c1'), committee('c2', { averageSessionMinutes: 9 } as Partial<Committee>)], fallbackCommittees: [] });
  assert.equal(d.assignedCommitteeId, 'c1', 'c1 is free again once its participant is done');
});

test('a panel already assigned to this participant is not swapped at the gate', () => {
  const p = merge(participant(), { assignedCommitteeId: 'c-preset' } as Partial<Participant>);
  const d = admit({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [committee('c1')], fallbackCommittees: [] });
  assert.equal(d.assignedCommitteeId, 'c-preset');
});

test('with no eligible panel the fallback is used, and with neither nobody is invented', () => {
  const p = participant();
  const withFallback = admit({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [], fallbackCommittees: [committee('cf')] });
  assert.equal(withFallback.assignedCommitteeId, 'cf');

  const withNone = admit({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [], fallbackCommittees: [] });
  assert.equal(withNone.assignedCommitteeId, undefined, 'no panel is better than a wrong panel');
  assert.equal(withNone.queueNumber, 1, 'and the participant is still admitted with a number');
});

test('a code is matched whatever case it is typed or scanned in', () => {
  const p = participant();
  assert.equal(findByIdOrCode([p], 'a-101')?.id, 'p-1');
  assert.equal(findByIdOrCode([p], 'A-101')?.id, 'p-1');
  assert.equal(findByIdOrCode([p], ' p-1 ')?.id, 'p-1');
  assert.equal(findByIdOrCode([p], ''), undefined, 'an empty scan matches nobody');
  assert.equal(findByIdOrCode([p], 'A-999'), undefined);
});
