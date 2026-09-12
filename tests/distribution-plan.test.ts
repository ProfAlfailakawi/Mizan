import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRIBUTION_PLAN_VERSION, drawValue, planDistribution, verifyDistributionPlan } from '../src/lib/distribution-plan';
import type { Committee, Participant } from '../src/types';

/*
 * توزيع الموجات.
 *
 * الجشع يوزّع كل واصلٍ وحده، فلا يرى أن وفدًا كاملًا وقع تحت لجنةٍ واحدة إلا بعد فوات
 * أوان التصحيح — إذ يصير كل تعديلٍ نقلًا يمسّ الأسبقية. والدفعة ترى التركيبة كلّها.
 *
 * هذه الاختبارات تُشغّل الخطّة على مشاهد القاعة: وفدٌ يصل بباصٍ واحد، ولجانٌ متفاوتة
 * السرعة، ومتسابقٌ لا تؤهّله أيُّ لجنة، وخطةٌ شاخت بين اقتراحها وتوقيعها.
 */

const COMP = 'comp-1';

const participant = (id: string, over: Partial<Participant> = {}): Participant => ({
  id, competitionId: COMP, code: id.toUpperCase(), fullName: id, fullNameArabic: id,
  categoryId: 'cat-1', status: 'in_queue', statusHistory: [], riwaya: 'حفص',
  ...over,
} as unknown as Participant);

const committee = (id: string, over: Partial<Committee> = {}): Committee => ({
  id, competitionId: COMP, code: id.toUpperCase(), name: id, nameArabic: id,
  status: 'ready', assignedCategories: ['cat-1'], averageSessionMinutes: 10,
  judgeIds: [], completedCount: 0,
  ...over,
} as unknown as Committee);

/** الأهلية الصلبة تُقرَّر خارج الوحدة؛ الافتراض هنا: كل لجنةٍ تغطي فئته. */
const allEligible = (committees: Committee[]) => (p: Participant) =>
  committees.filter(c => c.assignedCategories.includes(p.categoryId));

const plan = (over: Partial<Parameters<typeof planDistribution>[0]> = {}) => {
  const committees = over.committees || [committee('c1'), committee('c2')];
  return planDistribution({
    competitionId: COMP,
    participants: [],
    committees,
    eligibleFor: over.eligibleFor || allEligible(committees),
    seed: 'seed-1',
    now: new Date('2026-01-01T08:00:00.000Z'),
    ...over,
  });
};

const loadOf = (p: Awaited<ReturnType<typeof planDistribution>>, code: string) =>
  p.after.find(x => x.code === code)?.loadMinutes ?? -1;
const panelOf = (p: Awaited<ReturnType<typeof planDistribution>>, participantId: string) =>
  p.assignments.find(a => a.participantId === participantId)?.committeeCode;

/* ── الطبقة الأولى: الأهلية لا تُخفَّف ──────────────────────────────────── */

test('a participant no panel qualifies for is left unassigned, never placed on a wrong panel', async () => {
  const committees = [committee('c1', { assignedCategories: ['cat-1'] })];
  const p = participant('p1', { categoryId: 'cat-9' });
  const out = await plan({ participants: [p], committees, eligibleFor: allEligible(committees) });

  assert.equal(out.assignments.length, 0);
  assert.equal(out.unassigned.length, 1);
  assert.equal(out.unassigned[0].participantId, 'p1');
  assert.match(out.unassigned[0].reasonArabic, /لا توجد لجنة مؤهَّلة/);
});

test('an offline panel takes nobody', async () => {
  const committees = [committee('c1', { status: 'offline' }), committee('c2')];
  const out = await plan({ participants: [participant('p1')], committees, eligibleFor: allEligible(committees) });
  assert.equal(panelOf(out, 'p1'), 'C2');
});

/* ── الطبقة الثانية: التوازن بالدقائق ───────────────────────────────────── */

test('the wave balances minutes, not heads', async () => {
  /* ست دقائق مقابل أربع عشرة: التساوي العددي ظلمٌ زمني. */
  const committees = [committee('fast', { averageSessionMinutes: 6 }), committee('slow', { averageSessionMinutes: 14 })];
  const participants = Array.from({ length: 10 }, (_, i) => participant(`p${i + 1}`));
  const out = await plan({ participants, committees, eligibleFor: allEligible(committees) });

  const fast = out.after.find(x => x.code === 'FAST')!;
  const slow = out.after.find(x => x.code === 'SLOW')!;
  assert.ok(fast.waiting > slow.waiting, 'the faster panel takes more people');
  assert.ok(Math.abs(fast.loadMinutes - slow.loadMinutes) <= 14, 'because the minutes end up close, which is what waiting feels like');
  assert.equal(fast.waiting + slow.waiting, 10, 'and everyone is placed');
});

test('a wave is added to the standing queue, not to an empty hall', async () => {
  const committees = [committee('c1'), committee('c2')];
  /* لجنةٌ عليها خمسةٌ بالفعل: موجةٌ تتجاهلها تعيد بناء الازدحام نفسه. */
  const standingQueue = Array.from({ length: 5 }, (_, i) => participant(`s${i}`, { assignedCommitteeId: 'c1' }));
  const out = await plan({ participants: [participant('p1')], committees, standingQueue, eligibleFor: allEligible(committees) });
  assert.equal(panelOf(out, 'p1'), 'C2');
  assert.equal(out.before.find(x => x.code === 'C1')?.waiting, 5, 'the standing queue is counted before the wave');
});

test('the worst expected wait is what the plan lowers', async () => {
  const committees = [committee('c1'), committee('c2'), committee('c3')];
  const participants = Array.from({ length: 12 }, (_, i) => participant(`p${i + 1}`));
  const out = await plan({ participants, committees, eligibleFor: allEligible(committees) });
  const loads = out.after.map(x => x.loadMinutes);
  assert.equal(Math.max(...loads) - Math.min(...loads), 0, 'twelve across three even panels is a flat spread');
  assert.equal(out.maxLoadMinutesAfter, 40);
});

/* ── الطبقة الثالثة: قيود العدالة ───────────────────────────────────────── */

test('one delegation does not fill a single panel while another panel is free', async () => {
  /*
   * وفدٌ يصل بباصٍ واحد. بلا قيد، الجشع يوزّعهم بالتساوي عدديًا ولا يرى التركيبة —
   * فيقع نصفُ وفدٍ تحت لجنة، ويصير تفاوت اللجان أثرًا على وفدٍ بعينه.
   */
  const committees = [committee('c1'), committee('c2'), committee('c3')];
  const participants = [
    ...Array.from({ length: 6 }, (_, i) => participant(`d${i + 1}`, { delegationId: 'kuwait' })),
    ...Array.from({ length: 6 }, (_, i) => participant(`o${i + 1}`, { delegationId: 'oman' })),
  ];
  const out = await plan({ participants, committees, constraints: { delegationShareCap: 0.5 }, eligibleFor: allEligible(committees) });

  for (const c of ['C1', 'C2', 'C3']) {
    const rows = out.assignments.filter(a => a.committeeCode === c);
    const kuwait = rows.filter(a => a.participantId.startsWith('d')).length;
    assert.ok(kuwait / rows.length <= 0.5 + 1e-9, `${c} holds ${kuwait}/${rows.length} from one delegation`);
  }
});

test('an impossible cap is relaxed explicitly and recorded, never relaxed in silence', async () => {
  /* لجنةٌ واحدة مؤهَّلة ووفدٌ واحد: القيد مستحيل. يُخفَّف ويُسجَّل. */
  const committees = [committee('c1')];
  const participants = Array.from({ length: 4 }, (_, i) => participant(`d${i + 1}`, { delegationId: 'kuwait' }));
  const out = await plan({ participants, committees, constraints: { delegationShareCap: 0.4 }, eligibleFor: allEligible(committees) });

  assert.equal(out.assignments.length, 4, 'nobody is dropped for a preference constraint');
  const relaxed = out.assignments.filter(a => a.relaxed.includes('DELEGATION_SHARE_CAP'));
  assert.ok(relaxed.length > 0, 'the relaxation is stated');
  assert.match(relaxed[0].reasonArabic, /تخفيف/, 'and the reason says so in words');
});

test('queue depth is honoured while a lighter panel exists', async () => {
  const committees = [committee('c1'), committee('c2')];
  const participants = Array.from({ length: 6 }, (_, i) => participant(`p${i + 1}`));
  const out = await plan({ participants, committees, constraints: { maxQueueDepth: 3 }, eligibleFor: allEligible(committees) });
  for (const snap of out.after) assert.ok(snap.waiting <= 3, `${snap.code} kept within depth`);
});

test('hard eligibility still wins over every preference constraint', async () => {
  const committees = [committee('c1', { assignedCategories: ['cat-1'] }), committee('c2', { assignedCategories: ['cat-2'] })];
  const participants = Array.from({ length: 5 }, (_, i) => participant(`d${i + 1}`, { delegationId: 'one' }));
  const out = await plan({ participants, committees, constraints: { delegationShareCap: 0.2, maxQueueDepth: 1 }, eligibleFor: allEligible(committees) });
  assert.equal(out.assignments.length, 5);
  assert.ok(out.assignments.every(a => a.committeeCode === 'C1'), 'never placed on the panel that does not judge the category');
});

/* ── الطبقة الرابعة: القرعة والحتمية ────────────────────────────────────── */

test('the same seed and inputs reproduce the plan exactly, hash included', async () => {
  const committees = [committee('c1'), committee('c2'), committee('c3')];
  const participants = Array.from({ length: 7 }, (_, i) => participant(`p${i + 1}`));
  const a = await plan({ participants, committees, eligibleFor: allEligible(committees) });
  const b = await plan({ participants, committees, eligibleFor: allEligible(committees) });
  assert.equal(a.planHash, b.planHash, 'an assignment nobody can re-derive cannot be audited');
  assert.deepEqual(a.assignments.map(x => x.committeeCode), b.assignments.map(x => x.committeeCode));
});

test('a different seed can reach a different but equally valid plan', async () => {
  const committees = [committee('c1'), committee('c2')];
  const participants = Array.from({ length: 4 }, (_, i) => participant(`p${i + 1}`));
  const a = await plan({ participants, committees, seed: 'seed-a', eligibleFor: allEligible(committees) });
  const b = await plan({ participants, committees, seed: 'seed-b', eligibleFor: allEligible(committees) });
  assert.notEqual(a.planHash, b.planHash, 'the seed is part of what is committed');
  /* واختلاف البذرة لا يكسر التوازن: كلتا الخطتين عادلة. */
  for (const out of [a, b]) assert.equal(loadOf(out, 'C1'), loadOf(out, 'C2'));
});

test('the draw is decided before anyone can see it, and spreads across panels', () => {
  const v1 = drawValue('seed-1', 'p1', 'c1');
  assert.equal(v1, drawValue('seed-1', 'p1', 'c1'), 'deterministic');
  assert.notEqual(v1, drawValue('seed-2', 'p1', 'c1'), 'seed matters');
  assert.notEqual(v1, drawValue('seed-1', 'p2', 'c1'), 'participant matters');
  assert.notEqual(v1, drawValue('seed-1', 'p1', 'c2'), 'panel matters');
  for (const v of [v1, drawValue('seed-1', 'p9', 'c4')]) assert.ok(v >= 0 && v < 1);
});

test('a genuine tie is recorded as drawn, so the answer to "why this panel" is not a shrug', async () => {
  const committees = [committee('c1'), committee('c2')];
  const out = await plan({ participants: [participant('p1')], committees, eligibleFor: allEligible(committees) });
  assert.equal(out.assignments[0].drawn, true, 'two identical empty panels is a real tie');
  assert.equal(out.drawsUsed, 1);
  assert.match(out.assignments[0].reasonArabic, /قرعة/);
});

test('a clear winner is not dressed up as a draw', async () => {
  const committees = [committee('c1', { averageSessionMinutes: 6 }), committee('c2', { averageSessionMinutes: 14 })];
  const out = await plan({ participants: [participant('p1')], committees, eligibleFor: allEligible(committees) });
  assert.equal(out.assignments[0].drawn, false);
  assert.equal(out.assignments[0].committeeCode, 'C1');
});

/* ── الالتزام وإعادة التحقق ─────────────────────────────────────────────── */

test('the plan carries a commitment over its inputs, seed and outcome', async () => {
  const committees = [committee('c1'), committee('c2')];
  const out = await plan({ participants: [participant('p1'), participant('p2')], committees, eligibleFor: allEligible(committees) });
  assert.equal(out.version, DISTRIBUTION_PLAN_VERSION);
  assert.match(out.planHash, /^[0-9a-f]{64}$/, 'a SHA-256 commitment');
  assert.equal(out.seed, 'seed-1', 'the seed is kept so the plan can be re-derived');
});

test('a plan that went stale between proposal and signature is refused', async () => {
  const committees = [committee('c1'), committee('c2')];
  const participants = [participant('p1')];
  const proposed = await plan({ participants, committees, eligibleFor: allEligible(committees) });

  const same = await verifyDistributionPlan(proposed, () => plan({ participants, committees, eligibleFor: allEligible(committees) }));
  assert.deepEqual(same, { ok: true, reason: '' });

  /* وصل من ليس في الخطة بين الاقتراح والتوقيع. */
  const changed = await verifyDistributionPlan(proposed, () => plan({
    participants: [...participants, participant('p2')], committees, eligibleFor: allEligible(committees),
  }));
  assert.equal(changed.ok, false);
  assert.equal(changed.reason, 'PLAN_STALE');
});

test('a rebuild that throws is a refusal, never a silent approval', async () => {
  const committees = [committee('c1')];
  const proposed = await plan({ participants: [participant('p1')], committees, eligibleFor: allEligible(committees) });
  const out = await verifyDistributionPlan(proposed, () => { throw new Error('offline') });
  assert.deepEqual(out, { ok: false, reason: 'PLAN_REBUILD_FAILED' });
});

/* ── الحالات الفارغة والحجم ─────────────────────────────────────────────── */

test('an empty wave is a valid plan, not a crash', async () => {
  const out = await plan({});
  assert.deepEqual(out.assignments, []);
  assert.deepEqual(out.unassigned, []);
  assert.equal(out.swapsApplied, 0);
  assert.ok(out.planHash);
});

test('a wave with no panels leaves everyone unassigned and says why', async () => {
  const out = await plan({ participants: [participant('p1')], committees: [], eligibleFor: () => [] });
  assert.equal(out.unassigned.length, 1);
  assert.equal(out.maxLoadMinutesAfter, 0);
});

test('ten panels and two hundred arrivals stay balanced and fully placed', async () => {
  const committees = Array.from({ length: 10 }, (_, i) => committee(`c${i + 1}`, { averageSessionMinutes: 6 + (i % 4) * 3 }));
  const participants = Array.from({ length: 200 }, (_, i) => participant(`p${i + 1}`, { delegationId: `d${i % 7}` }));
  const out = await plan({ participants, committees, constraints: { delegationShareCap: 0.4 }, eligibleFor: allEligible(committees) });

  assert.equal(out.assignments.length, 200, 'everyone is placed');
  assert.equal(out.unassigned.length, 0);
  const loads = out.after.map(x => x.loadMinutes);
  const spread = Math.max(...loads) - Math.min(...loads);
  /* الفارق يبقى في حدود جلسةٍ واحدة من أبطأ لجنة — وهو أدقّ ما يمكن بأعدادٍ صحيحة. */
  assert.ok(spread <= 15, `expected a tight spread across ten panels, got ${spread} minutes`);
});

/* ── الاستثناء عبر الفئات: باب من لا لجنة لفئته ────────────────────────── */

/*
 * «عدالة الطابور» تنقل بين لجنتين، وتلزمها لجنةُ مصدر. ومن لا تؤهّله أيُّ لجنة بلا لجنة
 * أصلًا — فلم يكن له بابٌ إليها. فُتح له هنا بابٌ واحد: استثناءٌ يُطلب صراحةً، وتُوسَم به
 * صفُّه فتعلم اللجنة أنها تحكم من ليس من فئتها، ويبقى يُسأل في نطاق فئته هو.
 */

const exceptionAll = (committees: Committee[]) => () => committees;

test('without an explicit exception nobody is placed on a panel outside their category', async () => {
  const committees = [committee('c1', { assignedCategories: ['cat-1'] })];
  const p = participant('p1', { categoryId: 'cat-9' });
  const out = await plan({ participants: [p], committees, eligibleFor: allEligible(committees), exceptionFor: exceptionAll(committees) });

  assert.equal(out.assignments.length, 0);
  assert.equal(out.unassigned.length, 1);
  assert.match(out.unassigned[0].reasonArabic, /يمكن السماح بالاستثناء/, 'and the plan says which door exists');
});

test('with the exception allowed, the same participant is placed — and the relaxation is on the record', async () => {
  const committees = [committee('c1', { assignedCategories: ['cat-1'] })];
  const p = participant('p1', { categoryId: 'cat-9' });
  const out = await plan({
    participants: [p], committees, eligibleFor: allEligible(committees),
    exceptionFor: exceptionAll(committees), constraints: { allowCategoryException: true },
  });

  assert.equal(out.assignments.length, 1);
  assert.ok(out.assignments[0].relaxed.includes('CATEGORY_ELIGIBILITY'), 'never a silent placement');
  assert.match(out.assignments[0].reasonArabic, /استثناءً موقَّعًا/, 'the row says so in words, not only in a flag');
  assert.doesNotMatch(out.assignments[0].reasonArabic, /أقلّ اللجان المؤهَّلة/, 'and never calls a panel qualified that is not');
  assert.match(out.assignments[0].reasonArabic, /نطاق فئته هو/, 'and states the thing a judge must not get wrong');
});

test('the exception is a last resort: whoever has a qualifying panel is never routed by it', async () => {
  const committees = [committee('c1', { assignedCategories: ['cat-1'] }), committee('c2', { assignedCategories: ['cat-2'] })];
  const fits = participant('p1', { categoryId: 'cat-1' });
  const orphan = participant('p2', { categoryId: 'cat-9' });
  const out = await plan({
    participants: [fits, orphan], committees, eligibleFor: allEligible(committees),
    exceptionFor: exceptionAll(committees), constraints: { allowCategoryException: true },
  });

  assert.equal(panelOf(out, 'p1'), 'C1', 'his own category, on a panel that covers it');
  assert.deepEqual(out.assignments.find(a => a.participantId === 'p1')!.relaxed, []);
  assert.ok(out.assignments.find(a => a.participantId === 'p2')!.relaxed.includes('CATEGORY_ELIGIBILITY'));
});

test('permission alone places nobody — with no panel offered as an exception he still waits', async () => {
  const committees = [committee('c1', { assignedCategories: ['cat-1'] })];
  const p = participant('p1', { categoryId: 'cat-9' });
  const out = await plan({
    participants: [p], committees, eligibleFor: allEligible(committees),
    exceptionFor: () => [], constraints: { allowCategoryException: true },
  });

  assert.equal(out.assignments.length, 0);
  assert.match(out.unassigned[0].reasonArabic, /ولا لجنة تصلح استثناءً/);
});

test('an exceptional placement still balances minutes rather than taking the first panel', async () => {
  const committees = [
    committee('c1', { assignedCategories: ['cat-1'], averageSessionMinutes: 10 }),
    committee('c2', { assignedCategories: ['cat-1'], averageSessionMinutes: 10 }),
  ];
  const loaded = Array.from({ length: 6 }, (_, i) => participant(`q${i}`, { assignedCommitteeId: 'c1', status: 'in_queue' }));
  const orphan = participant('p1', { categoryId: 'cat-9' });
  const out = await plan({
    participants: [orphan], committees, eligibleFor: allEligible(committees),
    exceptionFor: exceptionAll(committees), constraints: { allowCategoryException: true },
    standingQueue: loaded,
  });

  assert.equal(panelOf(out, 'p1'), 'C2', 'the empty panel, not the one already carrying an hour');
});

test('the improvement pass moves an exceptional placement only among exception panels', async () => {
  /*
   * وإلّا لبدّل التحسينُ استثناءً وُقِّع عليه بإسنادٍ لم يوقّعه أحد — وهو أخطر من حِملٍ
   * غير متوازن، لأن التوقيع هو كل ما يفصل الاستثناء عن الخطأ.
   */
  const committees = [
    committee('c1', { assignedCategories: ['cat-1'], averageSessionMinutes: 10 }),
    committee('c2', { assignedCategories: ['cat-1'], averageSessionMinutes: 10 }),
    committee('c3', { assignedCategories: ['cat-1'], averageSessionMinutes: 10 }),
  ];
  const orphans = Array.from({ length: 6 }, (_, i) => participant(`p${i}`, { categoryId: 'cat-9' }));
  const only = committees.filter(c => c.id !== 'c3');
  const out = await plan({
    participants: orphans, committees, eligibleFor: allEligible(committees),
    exceptionFor: () => only, constraints: { allowCategoryException: true },
  });

  assert.equal(out.assignments.length, 6);
  assert.ok(out.assignments.every(a => a.committeeCode !== 'C3'), 'C3 was never offered, so no pass may reach it');
  assert.ok(out.assignments.every(a => a.relaxed.includes('CATEGORY_ELIGIBILITY')));
});

test('an exception plan re-verifies like any other — its permission is part of what is signed', async () => {
  const committees = [committee('c1', { assignedCategories: ['cat-1'] })];
  const p = participant('p1', { categoryId: 'cat-9' });
  const args = {
    participants: [p], committees, eligibleFor: allEligible(committees),
    exceptionFor: exceptionAll(committees), constraints: { allowCategoryException: true },
  };
  const first = await plan(args);
  assert.equal((await verifyDistributionPlan(first, () => plan(args))).ok, true, 'the same reality plans the same way');

  /* والإذن نفسه داخل البصمة: خطةٌ بُنيت باستثناءٍ لا تُقبل حيث سُحب الإذن بين
     الاقتراح والتوقيع — وإلّا مرّ استثناءٌ لم يعد مأذونًا به تحت توقيعٍ قديم. */
  const revoked = await verifyDistributionPlan(first, () => plan({ ...args, constraints: { allowCategoryException: false } }));
  assert.equal(revoked.ok, false);
});

/* ── لماذا الموجة أصلًا: الأهلية غير المتساوية ─────────────────────────── */

test('a wave beats gate-by-gate routing when one panel is the only one for a scarce category', async () => {
  /*
   * هذا هو الموضع الذي يفترق فيه النمطان فعلًا — وقياسُه سبقَ هذا الاختبار.
   *
   * لجنةٌ واحدة تحكم فئةً نادرة وتحكم الشائعة أيضًا. والبوابة تُسند واحدًا واحدًا: فترى تلك
   * اللجنة فارغةً أوّل الصباح فتصبّ فيها الشائعين، ثم يصل النادرون ولا لجنة لهم غيرها —
   * فتتضخّم وحدها. والموجة ترى أن ستّة **مضطرّون** إليها، فتُبعد عنها من يملك بديلًا.
   *
   * ولا يُصلَح هذا بالنقل بعد وقوعه: كل نقلٍ يمسّ أسبقيةً اكتُسبت عند الباب.
   */
  const shared = committee('c1', { assignedCategories: ['rare', 'common'], averageSessionMinutes: 10 });
  const committees = [shared, committee('c2', { assignedCategories: ['common'], averageSessionMinutes: 10 }), committee('c3', { assignedCategories: ['common'], averageSessionMinutes: 10 })];
  const eligibleFor = (p: Participant) => committees.filter(c => c.assignedCategories.includes(p.categoryId));

  const common = Array.from({ length: 18 }, (_, i) => participant(`m${i}`, { categoryId: 'common' }));
  const rare = Array.from({ length: 6 }, (_, i) => participant(`r${i}`, { categoryId: 'rare' }));

  const out = await plan({ participants: [...common, ...rare], committees, eligibleFor });

  assert.equal(out.unassigned.length, 0);
  assert.equal(out.assignments.filter(a => a.committeeCode === 'C1').length, 9,
    'the shared panel carries its six forced arrivals plus only three who had a choice');
  assert.equal(out.maxLoadMinutesAfter, 90,
    'gate-by-gate routing measured 120 minutes on this same intake — the wave sees the whole picture first');
});

test('the wave still gives the scarce category the only panel that can take it', async () => {
  const committees = [committee('c1', { assignedCategories: ['rare', 'common'] }), committee('c2', { assignedCategories: ['common'] })];
  const eligibleFor = (p: Participant) => committees.filter(c => c.assignedCategories.includes(p.categoryId));
  const out = await plan({
    participants: [...Array.from({ length: 6 }, (_, i) => participant(`m${i}`, { categoryId: 'common' })), participant('r1', { categoryId: 'rare' })],
    committees, eligibleFor,
  });
  assert.equal(panelOf(out, 'r1'), 'C1', 'balancing minutes never overrides who may judge whom');
});
