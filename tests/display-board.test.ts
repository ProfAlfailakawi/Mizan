import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_LAGGING_MS, BOARD_STALE_MS, boardAge, buildDisplayBoard, categoryLine, categoryTagsFor,
  describeAge, describePanelStatus, describeWait, parseDisplayBoard, parsePanelKeys, scopeLabelFor,
  selectCommitteeSlice, selectCommitteeSlices,
} from '../src/lib/display-board';
import type { Category, Committee, Participant } from '../src/types';

/*
 * شاشة القاعة تُقرأ من بُعد أمتار، ولا أحد يراجعها. فما يُخطئ فيها لا يُكتشف إلا حين
 * يقف متسابقٌ أمام لجنةٍ ليست لجنته، أو ينتظر دورًا نودي به ولم يره.
 *
 * هذه الاختبارات تُشغّل الإسقاط على مشاهد القاعة نفسها: عشر لجان، وطابورٌ لكلٍّ منها،
 * ومتسابقٌ بلا إسناد، ولجنةٌ تشير إلى من غادر السجلّ.
 */

const COMP = 'comp-1';
const OTHER = 'comp-2';

const participant = (over: Partial<Participant> = {}): Participant => ({
  id: 'p-1', competitionId: COMP, code: 'A-101', fullName: 'One', fullNameArabic: 'واحد',
  categoryId: 'cat-1', status: 'in_queue', statusHistory: [],
  ...over,
} as unknown as Participant);

const committee = (id: string, over: Partial<Committee> = {}): Committee => ({
  id, competitionId: COMP, code: id.toUpperCase(), name: `Committee ${id}`, nameArabic: `اللجنة ${id}`,
  venueHall: 'القاعة الكبرى', status: 'ready', assignedCategories: ['cat-1'],
  averageSessionMinutes: 8, judgeIds: [], completedCount: 0,
  ...over,
} as unknown as Committee);

const category = (id: string, over: Partial<Category> = {}): Category => ({
  id, competitionId: COMP, code: id.toUpperCase(), name: 'Full Quran', nameArabic: 'القرآن كامل',
  memorizationScope: 'Full Quran', juzCount: 30, riwaya: 'حفص', description: '',
  targetParticipants: 0, targetDurationMinutes: 0,
  ...over,
} as unknown as Category);

const build = (over: Partial<Parameters<typeof buildDisplayBoard>[0]> = {}) => buildDisplayBoard({
  competitionId: COMP, participants: [], committees: [], categories: [], ...over,
});

/* ── الطابور لكل لجنة ───────────────────────────────────────────────────── */

test('each panel gets its own queue — the tenth panel is not cut off by a global slice', () => {
  const committees = Array.from({ length: 10 }, (_, i) => committee(`c${i + 1}`));
  /* متسابق واحد لكل لجنة، وصاحب اللجنة العاشرة آخر الواصلين: القصّ العام كان يُسقطه. */
  const participants = committees.map((c, i) => participant({
    id: `p${i + 1}`, code: `A-${100 + i}`, assignedCommitteeId: c.id, queueOrderKey: i + 1,
  }));

  const board = build({ participants, committees });

  assert.equal(board.committees.length, 10);
  const tenth = selectCommitteeSlice(board, 'C10');
  assert.ok(tenth, 'the tenth panel has a slice');
  assert.equal(tenth.next.length, 1, 'and its waiting participant is on it');
  assert.equal(tenth.next[0].code, 'A-109');
  assert.equal(tenth.next[0].position, 1);
});

test('a panel queue follows queueOrderValue, not roster order', () => {
  const c = committee('c1');
  const participants = [
    participant({ id: 'p3', code: 'A-3', assignedCommitteeId: 'c1', queueOrderKey: 30 }),
    participant({ id: 'p1', code: 'A-1', assignedCommitteeId: 'c1', queueOrderKey: 10 }),
    participant({ id: 'p2', code: 'A-2', assignedCommitteeId: 'c1', queueOrderKey: 20 }),
  ];
  const board = build({ participants, committees: [c] });
  assert.deepEqual(board.committees[0].next.map((x) => x.code), ['A-1', 'A-2', 'A-3']);
  assert.deepEqual(board.committees[0].next.map((x) => x.position), [1, 2, 3]);
});

test('next depth is the lens, not the data — the hall asks for one, the panel for three', () => {
  const c = committee('c1');
  const participants = [1, 2, 3, 4, 5].map((n) => participant({
    id: `p${n}`, code: `A-${n}`, assignedCommitteeId: 'c1', queueOrderKey: n,
  }));
  assert.equal(build({ participants, committees: [c], nextDepth: 1 }).committees[0].next.length, 1);
  assert.equal(build({ participants, committees: [c], nextDepth: 3 }).committees[0].next.length, 3);
  /* والعدد الكامل يبقى معلومًا مهما ضاقت العدسة. */
  assert.equal(build({ participants, committees: [c], nextDepth: 1 }).committees[0].waitingCount, 5);
});

test('only waiting participants of this competition are counted', () => {
  const participants = [
    participant({ id: 'p1', code: 'A-1', assignedCommitteeId: 'c1', queueOrderKey: 1 }),
    participant({ id: 'p2', code: 'A-2', assignedCommitteeId: 'c1', status: 'tested' }),
    participant({ id: 'p3', code: 'A-3', assignedCommitteeId: 'c1', status: 'in_session' }),
    participant({ id: 'p4', code: 'B-1', assignedCommitteeId: 'c1', competitionId: OTHER }),
  ];
  const board = build({ participants, committees: [committee('c1')] });
  assert.equal(board.totalWaiting, 1);
  assert.equal(board.committees[0].waitingCount, 1);
});

/* ── ما لا يُرى إن لم يُعدّ ──────────────────────────────────────────────── */

test('a waiting participant with no panel is counted, not silently dropped', () => {
  /* البوابة تُرجع «لا إسناد» حين لا تؤهّله أيُّ لجنة. لو لم يُعدّ هنا لغاب عن الشاشة
     وعن انتباه المشرف معًا. */
  const participants = [
    participant({ id: 'p1', code: 'A-1', assignedCommitteeId: 'c1', queueOrderKey: 1 }),
    participant({ id: 'p2', code: 'A-2', queueOrderKey: 2 }),
  ];
  const board = build({ participants, committees: [committee('c1')] });
  assert.equal(board.unassignedWaiting, 1);
  assert.equal(board.totalWaiting, 2, 'the total still owns them');
  assert.equal(board.committees[0].waitingCount, 1, 'but no panel claims them');
});

test('a panel pointing at a participant who left the roster loses its call, not the board', () => {
  const c = committee('c1', { currentParticipantId: 'ghost', status: 'testing' });
  const board = build({ participants: [], committees: [c] });
  assert.equal(board.committees[0].nowCalling, undefined);
  assert.equal(board.committees[0].status, 'testing', 'the panel state is still reported honestly');
});

test('the current call is shown even though that participant is no longer waiting', () => {
  const c = committee('c1', { currentParticipantId: 'p1', status: 'testing' });
  const participants = [participant({ id: 'p1', code: 'A-1', status: 'in_session' })];
  const board = build({ participants, committees: [c] });
  assert.equal(board.committees[0].nowCalling?.code, 'A-1');
  assert.equal(board.committees[0].waitingCount, 0);
});

/* ── الخصوصية ───────────────────────────────────────────────────────────── */

test('no name, question or score can leave the projection', () => {
  const c = committee('c1', { currentParticipantId: 'p1', status: 'testing' });
  const participants = [
    participant({ id: 'p1', code: 'A-1', fullNameArabic: 'عبدالله الفلاني', status: 'in_session' }),
    participant({ id: 'p2', code: 'A-2', fullNameArabic: 'محمد الفلاني', assignedCommitteeId: 'c1', queueOrderKey: 2 }),
  ];
  const serialized = JSON.stringify(build({ participants, committees: [c], categories: [category('cat-1')] }));
  assert.ok(!serialized.includes('عبدالله'), 'the reciting participant is a code, not a name');
  assert.ok(!serialized.includes('الفلاني'), 'and so is everyone waiting');
  assert.ok(!serialized.includes('p1'), 'participant ids never reach a public surface');
  assert.ok(serialized.includes('A-1') && serialized.includes('A-2'), 'codes are what the hall is called by');
});

/* ── هوية الفئة ─────────────────────────────────────────────────────────── */

test('a panel carries the identity of the categories it judges', () => {
  const categories = [category('cat-1'), category('cat-2', { nameArabic: 'عشرون جزءًا', juzCount: 20 })];
  const c = committee('c1', { assignedCategories: ['cat-2'] });
  const tags = categoryTagsFor(c, categories);
  assert.equal(tags.length, 1);
  assert.equal(tags[0].label, 'عشرون جزءًا');
  assert.equal(tags[0].scopeLabel, '20 جزءًا');
});

test('category tags follow competition order, so two screens never disagree', () => {
  const categories = [category('cat-1'), category('cat-2', { juzCount: 20 }), category('cat-3', { juzCount: 5 })];
  const a = committee('c1', { assignedCategories: ['cat-3', 'cat-1'] });
  const b = committee('c2', { assignedCategories: ['cat-1', 'cat-3'] });
  assert.deepEqual(categoryTagsFor(a, categories).map((x) => x.id), ['cat-1', 'cat-3']);
  assert.deepEqual(categoryTagsFor(b, categories).map((x) => x.id), ['cat-1', 'cat-3']);
});

test('an unassigned category reads as a stated gap, not an empty line', () => {
  assert.equal(categoryLine([]), 'لم تُسند فئة');
  assert.equal(categoryLine([], false), 'No category assigned');
});

test('category line names one, counts many', () => {
  const categories = [category('cat-1'), category('cat-2', { nameArabic: 'عشرون جزءًا', juzCount: 20 })];
  assert.equal(categoryLine(categoryTagsFor(committee('c1', { assignedCategories: ['cat-1'] }), categories)), 'القرآن كامل');
  assert.equal(categoryLine(categoryTagsFor(committee('c2', { assignedCategories: ['cat-1', 'cat-2'] }), categories)), 'فئتان');
});

test('scope reads as Arabic, not as a raw configured string', () => {
  assert.equal(scopeLabelFor({ juzCount: 30, memorizationScope: 'Full Quran' }), 'القرآن كامل');
  assert.equal(scopeLabelFor({ juzCount: 1, memorizationScope: '' }), 'جزء واحد');
  assert.equal(scopeLabelFor({ juzCount: 2, memorizationScope: '' }), 'جزءان');
  assert.equal(scopeLabelFor({ juzCount: 5, memorizationScope: '' }), '5 أجزاء');
  assert.equal(scopeLabelFor({ juzCount: 20, memorizationScope: '' }), '20 جزءًا');
  /* فئة بلا عدد أجزاء تعود إلى ما كتبه المُعِدّ بدل أن تُعرض فارغة. */
  assert.equal(scopeLabelFor({ juzCount: 0, memorizationScope: 'ما تيسر' }), 'ما تيسر');
});

/* ── الزمن المتوقّع ─────────────────────────────────────────────────────── */

test('waiting time is measured in minutes, so a slow panel is not mistaken for a light one', () => {
  const fast = committee('fast', { averageSessionMinutes: 6 });
  const slow = committee('slow', { averageSessionMinutes: 14 });
  const participants = [
    ...[1, 2].map((n) => participant({ id: `f${n}`, code: `F-${n}`, assignedCommitteeId: 'fast', queueOrderKey: n })),
    ...[1, 2].map((n) => participant({ id: `s${n}`, code: `S-${n}`, assignedCommitteeId: 'slow', queueOrderKey: 10 + n })),
  ];
  const board = build({ participants, committees: [fast, slow] });
  const f = selectCommitteeSlice(board, 'FAST');
  const s = selectCommitteeSlice(board, 'SLOW');
  assert.equal(f?.waitingCount, s?.waitingCount, 'equal by heads');
  assert.equal(f?.estimatedWaitMinutes, 12);
  assert.equal(s?.estimatedWaitMinutes, 28, 'and far apart by minutes');
});

test('a session in progress adds its expected remainder', () => {
  const c = committee('c1', { averageSessionMinutes: 10, currentParticipantId: 'p1', status: 'testing' });
  const participants = [
    participant({ id: 'p1', code: 'A-1', status: 'in_session' }),
    participant({ id: 'p2', code: 'A-2', assignedCommitteeId: 'c1', queueOrderKey: 2 }),
  ];
  /* البداية مجهولة ⇒ نصف المتوسّط، وهو المتوقّع رياضيًا. */
  assert.equal(build({ participants, committees: [c] }).committees[0].estimatedWaitMinutes, 15);
  /* البداية معلومة ⇒ الباقي الحقيقي. */
  const known = build({ participants, committees: [c], elapsedSecondsByCommittee: { c1: 8 * 60 } });
  assert.equal(known.committees[0].estimatedWaitMinutes, 12);
});

test('an over-running session never subtracts from the estimate', () => {
  const c = committee('c1', { averageSessionMinutes: 10, currentParticipantId: 'p1', status: 'testing' });
  const participants = [participant({ id: 'p1', code: 'A-1', status: 'in_session' })];
  const board = build({ participants, committees: [c], elapsedSecondsByCommittee: { c1: 45 * 60 } });
  assert.equal(board.committees[0].estimatedWaitMinutes, 0, 'late is zero remaining, never negative');
});

test('a panel with no configured session length still produces a number, never NaN', () => {
  const c = committee('c1', { averageSessionMinutes: 0 });
  const participants = [participant({ id: 'p1', code: 'A-1', assignedCommitteeId: 'c1', queueOrderKey: 1 })];
  const board = build({ participants, committees: [c], fallbackSessionMinutes: 7 });
  assert.equal(board.committees[0].averageSessionMinutes, 7);
  assert.equal(board.committees[0].estimatedWaitMinutes, 7);

  const bare = build({ participants, committees: [c] });
  assert.ok(Number.isFinite(bare.committees[0].estimatedWaitMinutes), 'no configuration at all is still a finite estimate');
  assert.ok(bare.committees[0].estimatedWaitMinutes > 0);
});

/* ── العدسات ────────────────────────────────────────────────────────────── */

test('a panel is addressable by code or id, and the code ignores case', () => {
  const board = build({ committees: [committee('c7')] });
  assert.equal(selectCommitteeSlice(board, 'C7')?.committeeId, 'c7');
  assert.equal(selectCommitteeSlice(board, 'c7')?.committeeId, 'c7');
  assert.equal(selectCommitteeSlice(board, ' c7 ')?.committeeId, 'c7');
  assert.equal(selectCommitteeSlice(board, 'C9'), undefined);
  assert.equal(selectCommitteeSlice(board, ''), undefined);
});

test('a rotation keeps the requested order, drops the unknown, and never repeats', () => {
  const board = build({ committees: [committee('c1'), committee('c2'), committee('c3')] });
  const picked = selectCommitteeSlices(board, ['C3', 'C9', 'C1', 'C3']);
  assert.deepEqual(picked.map((x) => x.code), ['C3', 'C1']);
});

test('panel keys survive the way a supervisor actually types them', () => {
  assert.deepEqual(parsePanelKeys('C7,C8'), ['C7', 'C8']);
  assert.deepEqual(parsePanelKeys('C7, C8'), ['C7', 'C8']);
  assert.deepEqual(parsePanelKeys(' C7  C8 '), ['C7', 'C8']);
  assert.deepEqual(parsePanelKeys(''), []);
  assert.deepEqual(parsePanelKeys(null), []);
});

/* ── الصدق الزمني ───────────────────────────────────────────────────────── */

test('a frozen board admits it is frozen', () => {
  const at = new Date('2026-01-01T10:00:00.000Z').toISOString();
  const at0 = new Date('2026-01-01T10:00:00.000Z');
  assert.equal(boardAge(at, at0).state, 'LIVE');
  assert.equal(boardAge(at, new Date(at0.getTime() + BOARD_LAGGING_MS - 1)).state, 'LIVE');
  assert.equal(boardAge(at, new Date(at0.getTime() + BOARD_LAGGING_MS)).state, 'LAGGING');
  assert.equal(boardAge(at, new Date(at0.getTime() + BOARD_STALE_MS)).state, 'STALE');
  assert.equal(boardAge('not-a-date').state, 'STALE', 'an unreadable stamp is treated as stale, never as live');
});

test('a display clock running ahead of the source does not report negative age', () => {
  const at = new Date('2026-01-01T10:00:05.000Z').toISOString();
  const age = boardAge(at, new Date('2026-01-01T10:00:00.000Z'));
  assert.equal(age.ageSeconds, 0);
  assert.equal(age.state, 'LIVE');
});

test('age and wait are written to be read, with correct Arabic number agreement', () => {
  /* الثواني الأولى «الآن»: عدّادٌ يرمش كل ثانية على شاشة قاعةٍ يشدّ العين بلا فائدة. */
  assert.equal(describeAge(0), 'الآن');
  assert.equal(describeAge(2), 'الآن');
  assert.equal(describeAge(8), 'قبل 8 ثوانٍ');
  assert.equal(describeAge(40), 'قبل 40 ثانية');
  assert.equal(describeAge(120), 'قبل دقيقتين');

  assert.equal(describeWait(0), 'لا انتظار');
  assert.equal(describeWait(1), 'دقيقة تقريبًا');
  assert.equal(describeWait(2), 'دقيقتان تقريبًا');
  assert.equal(describeWait(7), '7 دقائق تقريبًا');
  assert.equal(describeWait(35), '35 دقيقة تقريبًا');
  assert.equal(describeWait(60), 'ساعة تقريبًا');
  assert.equal(describeWait(95), 'ساعة و35 دقيقة تقريبًا');
});

test('panel status reads as a sentence a waiting reciter understands', () => {
  assert.equal(describePanelStatus('testing', true), 'تحت التلاوة');
  assert.equal(describePanelStatus('testing', false), 'الجلسة جارية');
  assert.equal(describePanelStatus('ready', false), 'جاهزة لاستقبال التالي');
  assert.equal(describePanelStatus('paused', false), 'موقوفة مؤقتًا');
  assert.equal(describePanelStatus('offline', false), 'متوقفة');
});

/* ── الحالات الفارغة ────────────────────────────────────────────────────── */

test('a competition with no panels yields an honest empty board, not a crash', () => {
  const board = build({});
  assert.deepEqual(board.committees, []);
  assert.equal(board.totalWaiting, 0);
  assert.equal(board.unassignedWaiting, 0);
  assert.equal(board.activePanels, 0);
  assert.equal(board.privacyMode, 'CODES_ONLY');
});

test('panels of another competition never appear on this hall board', () => {
  const board = build({ committees: [committee('c1'), committee('x1', { competitionId: OTHER })] });
  assert.deepEqual(board.committees.map((x) => x.code), ['C1']);
});

test('active panels counts the ones actually testing', () => {
  const board = build({
    committees: [
      committee('c1', { status: 'testing' }),
      committee('c2', { status: 'ready' }),
      committee('c3', { status: 'offline' }),
      committee('c4', { status: 'testing' }),
    ],
  });
  assert.equal(board.activePanels, 2);
});

/* ── اللجنة الشاغرة وأمامها منتظرون ─────────────────────────────────────── */

test('a free panel with people waiting is flagged — that is a routing fault, not a slow panel', () => {
  const busy = committee('busy', { currentParticipantId: 'p1', status: 'testing' });
  const free = committee('free', { status: 'ready' });
  const participants = [
    participant({ id: 'p1', code: 'A-1', status: 'in_session' }),
    participant({ id: 'p2', code: 'A-2', assignedCommitteeId: 'free', queueOrderKey: 2 }),
  ];
  const board = build({ participants, committees: [busy, free] });
  assert.equal(selectCommitteeSlice(board, 'BUSY')?.stalled, false, 'a panel that is calling someone is not stalled');
  assert.equal(selectCommitteeSlice(board, 'FREE')?.stalled, true, 'a free panel with a queue is');
  assert.equal(board.stalledPanels, 1);
});

test('an idle panel with an empty queue is not stalled — it is simply free', () => {
  const board = build({ committees: [committee('c1', { status: 'ready' })] });
  assert.equal(board.committees[0].stalled, false);
  assert.equal(board.stalledPanels, 0);
});

test('an offline panel is never called stalled — it is reported offline', () => {
  const c = committee('c1', { status: 'offline' });
  const participants = [participant({ id: 'p1', code: 'A-1', assignedCommitteeId: 'c1', queueOrderKey: 1 })];
  const board = build({ participants, committees: [c] });
  assert.equal(board.committees[0].stalled, false);
  assert.equal(board.committees[0].status, 'offline');
});

test('the hall counts what it has finished today', () => {
  const board = build({
    committees: [committee('c1', { completedCount: 12 }), committee('c2', { completedCount: 9 }), committee('c3')],
  });
  assert.equal(board.totalCompleted, 21);
});

/* ── قراءة إسقاطٍ من وثيقةٍ عامة ────────────────────────────────────────── */

test('a public projection is rebuilt from known fields — an injected name can never reach a screen', () => {
  /* الوثيقة مكشوفة للقراءة وكاتبها مُصرَّح لا معصوم. فحقلٌ لم يُصمَّم يسقط بالبنية. */
  const hostile = {
    competitionId: 'comp-1',
    generatedAt: new Date().toISOString(),
    committees: [{
      committeeId: 'c1', code: 'C1', status: 'testing',
      nowCalling: { code: 'A-1', position: 0 },
      participantName: 'عبدالله الفلاني',
      questionText: 'سورة البقرة ١٢٥',
      score: 98.5,
      judgeNames: ['محكّم أول'],
    }],
  };
  const parsed = parseDisplayBoard(hostile);
  assert.ok(parsed);
  const serialized = JSON.stringify(parsed);
  assert.ok(!serialized.includes('عبدالله'), 'an injected name is not carried over');
  assert.ok(!serialized.includes('البقرة'), 'nor an injected question');
  assert.ok(!serialized.includes('98.5'), 'nor an injected score');
  assert.ok(!serialized.includes('محكّم'), 'nor injected judge names');
  assert.equal(parsed.committees[0].nowCalling?.code, 'A-1', 'what was designed still arrives');
});

test('privacy mode is enforced by the reader, never read from the document', () => {
  const parsed = parseDisplayBoard({
    competitionId: 'comp-1', generatedAt: new Date().toISOString(),
    privacyMode: 'FULL_NAMES', committees: [],
  });
  assert.equal(parsed?.privacyMode, 'CODES_ONLY', 'a document cannot widen its own privacy');
});

test('a malformed projection is refused rather than half-rendered', () => {
  assert.equal(parseDisplayBoard(null), null);
  assert.equal(parseDisplayBoard('board'), null);
  assert.equal(parseDisplayBoard({}), null, 'no competition id');
  assert.equal(parseDisplayBoard({ competitionId: 'comp-1' }), null, 'no generated-at stamp');
  assert.equal(parseDisplayBoard({ competitionId: 'comp-1', generatedAt: 'yesterday' }), null, 'unreadable stamp');
});

test('wrong types degrade to safe values instead of reaching the DOM', () => {
  const parsed = parseDisplayBoard({
    competitionId: 'comp-1', generatedAt: new Date().toISOString(),
    totalWaiting: 'many', activePanels: -4, totalCompleted: 1.9,
    committees: [
      { committeeId: 'c1', code: 'C1', status: 'exploded', waitingCount: -3, averageSessionMinutes: 0, next: 'nope', categories: 'nope' },
      { code: 'C2' },
      'not-an-object',
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.totalWaiting, 0, 'a non-numeric count is zero, not NaN');
  assert.equal(parsed.activePanels, 0, 'a negative count is zero');
  assert.equal(parsed.totalCompleted, 1, 'a fractional count is floored');
  assert.equal(parsed.committees.length, 1, 'entries without an id are dropped');
  assert.equal(parsed.committees[0].status, 'ready', 'an unknown status falls back to a known one');
  assert.equal(parsed.committees[0].waitingCount, 0);
  assert.ok(parsed.committees[0].averageSessionMinutes >= 1, 'never zero, so no division by zero downstream');
  assert.deepEqual(parsed.committees[0].next, []);
  assert.deepEqual(parsed.committees[0].categories, []);
});

test('a published board survives the round trip it was designed for', () => {
  const committees = [committee('c1', { currentParticipantId: 'p1', status: 'testing', completedCount: 4 }), committee('c2')];
  const participants = [
    participant({ id: 'p1', code: 'A-1', status: 'in_session' }),
    participant({ id: 'p2', code: 'A-2', assignedCommitteeId: 'c1', queueOrderKey: 2 }),
    participant({ id: 'p3', code: 'A-3', assignedCommitteeId: 'c2', queueOrderKey: 3 }),
  ];
  const original = build({ participants, committees, categories: [category('cat-1')] });
  /* JSON هو ما يعبر فايرستور فعلًا؛ الاختبار يعبره لا يتخطّاه. */
  const parsed = parseDisplayBoard(JSON.parse(JSON.stringify(original)));
  assert.ok(parsed);
  assert.equal(parsed.committees.length, 2);
  assert.equal(parsed.committees[0].nowCalling?.code, 'A-1');
  assert.deepEqual(parsed.committees[0].next.map((x) => x.code), ['A-2']);
  assert.equal(parsed.committees[0].categories[0]?.label, 'القرآن كامل');
  assert.equal(parsed.totalCompleted, original.totalCompleted);
  assert.equal(parsed.stalledPanels, original.stalledPanels);
});

test('an oversized document is bounded, so one screen cannot be flooded', () => {
  const parsed = parseDisplayBoard({
    competitionId: 'comp-1', generatedAt: new Date().toISOString(),
    competitionNameArabic: 'م'.repeat(5000),
    committees: Array.from({ length: 500 }, (_, i) => ({
      committeeId: `c${i}`, code: 'C'.repeat(300),
      next: Array.from({ length: 200 }, (_, n) => ({ code: `A-${n}`, position: n })),
    })),
  });
  assert.ok(parsed);
  assert.ok(parsed.committees.length <= 64, 'panel count is capped');
  assert.ok(parsed.competitionNameArabic.length <= 200, 'text length is capped');
  assert.ok(parsed.committees[0].code.length <= 24);
  assert.ok(parsed.committees[0].next.length <= 12);
});
