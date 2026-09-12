import test from 'node:test';
import assert from 'node:assert/strict';
import { committeeLoadMinutes, decideArrival, findByIdOrCode, highestQueueNumber, leastLoadedCommittee } from '../src/lib/arrival-core';
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

test('by default no eligible panel means no assignment — a wrong panel is worse than none', () => {
  /*
   * كان الاحتياطي يُستعمل دائمًا وهو لا يفلتر الفئة، فيُسنَد المتسابق للجنةٍ لا تحكم فئته
   * ثم يرفضه بدءُ الجلسة (`chooseSessionCommittee`) والمتسابق جالس. الرفض عند البوابة
   * يقع حيث يمكن إصلاحه.
   */
  const p = participant();
  const d = decideArrival({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [], fallbackCommittees: [committee('cf')] });
  assert.equal(d.kind, 'admit-unrouted', 'an ineligible panel is not a fallback');
  if (d.kind !== 'admit-unrouted') return;
  assert.equal(d.reason, 'no-eligible-committee');
  assert.equal(d.queueNumber, 1, 'his arrival number is still his — priority does not lapse for a setup fault');
  assert.equal(d.originalQueueNumber, 1);
});

test('a competition may still opt back into the old any-available behaviour, explicitly', () => {
  const p = participant();
  const d = admit({
    participant: p, roster: [p], competitionId: COMP,
    eligibleCommittees: [], fallbackCommittees: [committee('cf')],
    unmatchedPolicy: 'ANY_AVAILABLE',
  });
  assert.equal(d.assignedCommitteeId, 'cf');
});

test('with no panel at all, nobody is invented under either policy', () => {
  const p = participant();
  for (const unmatchedPolicy of ['INCIDENT', 'ANY_AVAILABLE'] as const) {
    const d = decideArrival({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [], fallbackCommittees: [], unmatchedPolicy });
    assert.equal(d.kind, 'admit-unrouted', unmatchedPolicy);
    if (d.kind === 'admit-unrouted') assert.equal(d.queueNumber, 1, 'and he is still admitted with a number');
  }
});

/* ── الحِمل بالدقائق لا بالرؤوس ──────────────────────────────────────────── */

test('a slow panel is not mistaken for a light one when the queues are equal', () => {
  /* ست دقائق مقابل أربع عشرة: طابورٌ متساوٍ عددًا هو الضعف زمنًا. */
  const fast = committee('fast', { averageSessionMinutes: 6 } as Partial<Committee>);
  const slow = committee('slow', { averageSessionMinutes: 14 } as Partial<Committee>);
  const roster = [
    merge(participant(), { id: 'f1', code: 'F-1', status: 'in_queue', assignedCommitteeId: 'fast' } as Partial<Participant>),
    merge(participant(), { id: 'f2', code: 'F-2', status: 'in_queue', assignedCommitteeId: 'fast' } as Partial<Participant>),
    merge(participant(), { id: 's1', code: 'S-1', status: 'in_queue', assignedCommitteeId: 'slow' } as Partial<Participant>),
  ];
  assert.equal(committeeLoadMinutes(fast, roster, COMP), 12);
  assert.equal(committeeLoadMinutes(slow, roster, COMP), 14);
  /* بالرؤوس كانت البطيئة تفوز (واحدٌ مقابل اثنين)؛ وبالدقائق تفوز السريعة. */
  assert.equal(leastLoadedCommittee([slow, fast], roster, COMP), 'fast');
});

test('a panel with no configured session length still carries weight', () => {
  const zero = committee('zero', { averageSessionMinutes: 0 } as Partial<Committee>);
  const roster = [merge(participant(), { id: 'z1', code: 'Z-1', status: 'in_queue', assignedCommitteeId: 'zero' } as Partial<Participant>)];
  assert.ok(committeeLoadMinutes(zero, roster, COMP) > 0, 'otherwise every arrival piles onto it forever');
});

test('tie-breaking is deterministic, so an assignment can be re-derived and audited', () => {
  const a = committee('a', { averageSessionMinutes: 8 } as Partial<Committee>);
  const b = committee('b', { averageSessionMinutes: 8 } as Partial<Committee>);
  const c = committee('c', { averageSessionMinutes: 8 } as Partial<Committee>);
  /* نفس المجموعة بترتيبٍ مختلف تعطي القرار نفسه — وإلا لم يكن للقرار جواب. */
  assert.equal(leastLoadedCommittee([a, b, c], [], COMP), 'a');
  assert.equal(leastLoadedCommittee([c, b, a], [], COMP), 'a');
  assert.equal(leastLoadedCommittee([b, c, a], [], COMP), 'a');
});

test('a code is matched whatever case it is typed or scanned in', () => {
  const p = participant();
  assert.equal(findByIdOrCode([p], 'a-101')?.id, 'p-1');
  assert.equal(findByIdOrCode([p], 'A-101')?.id, 'p-1');
  assert.equal(findByIdOrCode([p], ' p-1 ')?.id, 'p-1');
  assert.equal(findByIdOrCode([p], ''), undefined, 'an empty scan matches nobody');
  assert.equal(findByIdOrCode([p], 'A-999'), undefined);
});

/* ── أنماط التوزيع: متى تُسنَد اللجنة ──────────────────────────────────── */

/*
 * `distributionMode` كان حقلًا معرَّفًا في الأنواع، مضبوطًا في الإعداد الافتراضي، يؤكّده
 * اختبار — **ولا سطرَ واحدٌ يفرّع عليه**. حقلٌ يَعِد بنمطٍ ولا يُغيّر شيئًا أسوأ من غيابه:
 * يُقرأ في الوثيقة فيُظنّ أن الخيار موجود.
 */

test('the default mode routes at the gate, exactly as the gate behaved before the field existed', () => {
  const out = decideArrival({
    participant: participant(), roster: [participant()], competitionId: COMP,
    eligibleCommittees: [committee('c1')],
  });
  assert.equal(out.kind, 'admit');
  assert.equal((out as { assignedCommitteeId?: string }).assignedCommitteeId, 'c1');
});

test('in WAVES the gate gives the number and withholds the panel — on purpose, not by failure', () => {
  const out = decideArrival({
    participant: participant(), roster: [participant()], competitionId: COMP,
    eligibleCommittees: [committee('c1'), committee('c2')], mode: 'WAVES',
  });
  assert.equal(out.kind, 'admit-unrouted');
  assert.equal((out as { reason: string }).reason, 'awaiting-wave', 'the reason must separate design from defect');
  assert.equal((out as { originalQueueNumber: number }).originalQueueNumber, 1, 'priority is earned at the door in every mode');
});

test('in PRE_ASSIGNED an arrival with no prior panel is a setup gap, and says which one', () => {
  const out = decideArrival({
    participant: participant(), roster: [participant()], competitionId: COMP,
    eligibleCommittees: [committee('c1')], mode: 'PRE_ASSIGNED',
  });
  assert.equal(out.kind, 'admit-unrouted');
  assert.equal((out as { reason: string }).reason, 'missing-pre-assignment');
});

test('a panel already assigned is honoured in every mode — the gate never overrides a signed decision', () => {
  for (const mode of ['ON_ARRIVAL', 'WAVES', 'PRE_ASSIGNED', 'BY_CATEGORY'] as const) {
    const p = { ...participant(), assignedCommitteeId: 'c9' };
    const out = decideArrival({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [committee('c1')], mode });
    assert.equal(out.kind, 'admit', mode);
    assert.equal((out as { assignedCommitteeId?: string }).assignedCommitteeId, 'c9', mode);
  }
});

/*
 * التوزيع بالفئة.
 *
 * وعدُ النمط هو ما يُكتب على باب اللجنة: «هذه لجنة عشرة أجزاء». فاللجنة المكرَّسة لفئةٍ
 * لا تُزاحَم بمن تسعه لجنةٌ مشتركة، ولا يُسنَد أحدٌ خارج فئته مهما ضاقت الخيارات — وإلا
 * كان النمط لافتةً تُكذّبها القاعة.
 */
test('BY_CATEGORY prefers the panel dedicated to the category over a shared one', () => {
  const p = participant();
  const shared = committee('c1', { assignedCategories: ['cat-1', 'cat-2'] });
  const dedicated = committee('c2', { assignedCategories: ['cat-1'] });
  const out = admit({
    participant: p, roster: [p], competitionId: COMP,
    eligibleCommittees: [shared, dedicated], mode: 'BY_CATEGORY',
  });
  assert.equal(out.assignedCommitteeId, 'c2');
});

test('BY_CATEGORY falls back to a shared panel that still covers the category', () => {
  const p = participant();
  const out = admit({
    participant: p, roster: [p], competitionId: COMP,
    eligibleCommittees: [committee('c1', { assignedCategories: ['cat-1', 'cat-2'] })], mode: 'BY_CATEGORY',
  });
  assert.equal(out.assignedCommitteeId, 'c1');
});

test('BY_CATEGORY splits the load between two dedicated panels by measured minutes', () => {
  const waiting = { ...participant({ id: 'p-0', code: 'A-100' }), status: 'in_queue' as const, assignedCommitteeId: 'c1', originalQueueNumber: 1, queueOrderKey: 1 };
  const p = participant();
  const out = admit({
    participant: p, roster: [waiting, p], competitionId: COMP,
    eligibleCommittees: [committee('c1'), committee('c2')], mode: 'BY_CATEGORY',
  });
  assert.equal(out.assignedCommitteeId, 'c2');
});

test('BY_CATEGORY never routes outside the category, even when ANY_AVAILABLE is allowed', () => {
  /* وإلّا نقض الخيارُ العامّ النمطَ الذي اختير ليمنعه بالذات. */
  const p = participant();
  const out = decideArrival({
    participant: p, roster: [p], competitionId: COMP,
    eligibleCommittees: [], fallbackCommittees: [committee('c9', { assignedCategories: ['cat-2'] })],
    unmatchedPolicy: 'ANY_AVAILABLE', mode: 'BY_CATEGORY',
  });
  assert.equal(out.kind, 'admit-unrouted');
  assert.equal((out as { reason: string }).reason, 'no-category-panel', 'the supervisor must be told which gap this is');
  assert.equal((out as { originalQueueNumber: number }).originalQueueNumber, 1, 'priority is earned at the door in every mode');
});

test('WAVES never routes, not even when exactly one panel qualifies', () => {
  /* وإلّا صار النمط اقتراحًا يُنقض عند أول حالةٍ سهلة، فلا يُوثق به في التخطيط. */
  const out = decideArrival({
    participant: participant(), roster: [participant()], competitionId: COMP,
    eligibleCommittees: [committee('c1')], fallbackCommittees: [committee('c1')],
    unmatchedPolicy: 'ANY_AVAILABLE', mode: 'WAVES',
  });
  assert.equal(out.kind, 'admit-unrouted');
});

test('every mode still refuses a duplicate scan', () => {
  for (const mode of ['ON_ARRIVAL', 'WAVES', 'PRE_ASSIGNED', 'BY_CATEGORY'] as const) {
    const p = { ...participant(), status: 'in_queue' as const };
    const out = decideArrival({ participant: p, roster: [p], competitionId: COMP, eligibleCommittees: [committee('c1')], mode });
    assert.equal(out.kind, 'duplicate', mode);
  }
});

test('numbering runs on from the roster in WAVES too, so a wave does not restart the queue', () => {
  const early = { ...participant({ id: 'p-0', code: 'A-100' }), status: 'in_queue' as const, originalQueueNumber: 7, queueOrderKey: 7 };
  const out = decideArrival({
    participant: participant(), roster: [early, participant()], competitionId: COMP,
    eligibleCommittees: [committee('c1')], mode: 'WAVES',
  });
  assert.equal((out as { originalQueueNumber: number }).originalQueueNumber, 8);
});
