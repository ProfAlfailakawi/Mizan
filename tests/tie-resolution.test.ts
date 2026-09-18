/*
 * التعادل لا يُحلّ بأبجديّة.
 *
 * كان `resolveAwards` ينتهي بين متساويين إلى `participantCode.localeCompare` — مسطرةٌ
 * لا علاقة لها بالحفظ، ولا يعلم بها من يقرأ النتيجة. وهذه البوّابة تثبت ثلاثة أشياء:
 * أن التعادل يُرصد لا يُحلّ، وأن الفاصل فيه الإدارةُ لا اللجنة، وأن قرارًا بلا سببٍ
 * مكتوب لا يُقبل.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { describeStanding, normalizeAwardPolicy, resolveAwards, type AwardPolicy } from '../src/lib/award-places';
import {
  TIE_DECISION_ROLES,
  describeTie,
  placeAwaitsTieDecision,
  tieDecision,
  tieGroupKey,
  tieNeedingDecision,
  tieWinners,
} from '../src/lib/tie-resolution';
import { buildWinnersArchive } from '../src/lib/winners-archive';

const POLICY = (seats = 1): AwardPolicy => normalizeAwardPolicy({
  version: 1,
  competingThresholdPercentage: 85,
  showCompetingOnCertificate: true,
  places: [
    { rank: 1, titleArabic: 'الأول', titleEnglish: 'First', minimumPercentage: 98, seats, whenUnmet: 'withhold' },
    { rank: 2, titleArabic: 'الثاني', titleEnglish: 'Second', minimumPercentage: 96, seats: 1, whenUnmet: 'withhold' },
  ],
});

const PLACE = { rank: 1, titleArabic: 'الأول', titleEnglish: 'First' };
const TIED = [{ participantId: 'p2', participantCode: 'Z-2' }, { participantId: 'p1', participantCode: 'A-1' }];
const group = () => tieNeedingDecision({ place: PLACE, seatsRemaining: 1, percentage: 99, tied: TIED })!;

const ADMIN = { userId: 'u-admin', role: 'comp_admin' };
const REASON = 'لائحة الدورة: يُشرَّك المركز عند التساوي التام في الدرجة النهائية.';

test('a tie within the seats is not a tie at all', () => {
  assert.equal(tieNeedingDecision({ place: PLACE, seatsRemaining: 2, percentage: 99, tied: TIED }), null,
    'two tied for two seats both win; nothing is decided');
  assert.equal(tieNeedingDecision({ place: PLACE, seatsRemaining: 1, percentage: 99, tied: [TIED[0]] }), null,
    'one candidate is not a tie');
});

test('a tie beyond the seats is surfaced, and its key binds to those exact scores', () => {
  const g = group();
  assert.equal(g.participants.length, 2);
  assert.deepEqual(g.participants.map(p => p.participantId), ['p1', 'p2'], 'listed by id — display order, not win order');
  assert.equal(g.key, tieGroupKey({ placeRank: 1, percentage: 99, participantIds: ['p2', 'p1'] }),
    'the key does not depend on the order the ids arrive in');
  assert.notEqual(g.key, tieGroupKey({ placeRank: 1, percentage: 99.5, participantIds: ['p1', 'p2'] }),
    'a corrected score is a different tie, so an old decision must not apply to it');
  assert.notEqual(g.key, tieGroupKey({ placeRank: 1, percentage: 99, participantIds: ['p1', 'p2', 'p3'] }),
    'a third tied entrant is a different tie');
});

test('the committee scores; it does not rank', () => {
  for (const role of ['head_judge', 'judge']) {
    const refused = tieDecision({ group: group(), outcome: 'shared', reason: REASON, decidedBy: { userId: 'u', role } });
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.code, 'TIE_DECISION_IS_ADMINISTRATION_NOT_COMMITTEE',
      `${role} must be refused by name, not with a generic denial`);
  }
  const participant = tieDecision({ group: group(), outcome: 'shared', reason: REASON, decidedBy: { userId: 'u', role: 'participant' } });
  assert.equal(participant.ok === false && participant.code, 'TIE_DECISION_ROLE_FORBIDDEN');
  assert.deepEqual([...TIE_DECISION_ROLES], ['comp_admin', 'org_admin', 'super_admin'],
    'the deciding roles are administrative');
});

test('a decision without a written reason is refused, and so is an anonymous one', () => {
  assert.equal(
    (tieDecision({ group: group(), outcome: 'shared', reason: 'تعادل', decidedBy: ADMIN }) as { code: string }).code,
    'TIE_DECISION_REASON_REQUIRED');
  assert.equal(
    (tieDecision({ group: group(), outcome: 'shared', reason: '   ', decidedBy: ADMIN }) as { code: string }).code,
    'TIE_DECISION_REASON_REQUIRED');
  assert.equal(
    (tieDecision({ group: group(), outcome: 'shared', reason: REASON, decidedBy: { userId: '', role: 'comp_admin' } }) as { code: string }).code,
    'TIE_DECISION_DECIDER_UNKNOWN');
  assert.equal(
    (tieDecision({ group: null, outcome: 'shared', reason: REASON, decidedBy: ADMIN }) as { code: string }).code,
    'TIE_DECISION_NO_TIE');
});

test('an ordering must cover every tied participant, exactly once, and nobody else', () => {
  const base = { group: group(), outcome: 'ordered' as const, reason: REASON, decidedBy: ADMIN };
  assert.equal((tieDecision({ ...base, orderedParticipantIds: ['p1'] }) as { code: string }).code, 'TIE_DECISION_ORDER_INCOMPLETE');
  assert.equal((tieDecision({ ...base, orderedParticipantIds: ['p1', 'p1'] }) as { code: string }).code, 'TIE_DECISION_ORDER_DUPLICATED');
  assert.equal((tieDecision({ ...base, orderedParticipantIds: ['p1', 'p9'] }) as { code: string }).code, 'TIE_DECISION_PARTICIPANTS_MISMATCH');
  const ok = tieDecision({ ...base, orderedParticipantIds: ['p2', 'p1'] });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.decision.decidedBy.role, 'comp_admin');
  assert.equal(ok.ok && ok.decision.reason, REASON);
});

test('no decision means no split — the place stays on hold', () => {
  const g = group();
  assert.equal(placeAwaitsTieDecision(g, []), true);
  assert.deepEqual(tieWinners(g, null), { winners: [], fellThrough: [] });
  const stale = tieDecision({ group: g, outcome: 'shared', reason: REASON, decidedBy: ADMIN });
  assert.ok(stale.ok);
  const other = tieNeedingDecision({ place: PLACE, seatsRemaining: 1, percentage: 97, tied: TIED })!;
  assert.equal(placeAwaitsTieDecision(other, stale.ok ? [stale.decision] : []), true,
    'a decision on one tie is not an answer for another');
  assert.deepEqual(tieWinners(other, stale.ok ? stale.decision : null), { winners: [], fellThrough: [] });
});

test('the ordered outcome seats the top and drops the rest below the place', () => {
  const g = group();
  const decided = tieDecision({ group: g, outcome: 'ordered', orderedParticipantIds: ['p2', 'p1'], reason: REASON, decidedBy: ADMIN });
  assert.ok(decided.ok);
  assert.deepEqual(tieWinners(g, decided.ok ? decided.decision : null), { winners: ['p2'], fellThrough: ['p1'] });
});

/* ── أثر ذلك في توزيع المراكز ──────────────────────────────────────────── */

const CANDIDATES = [
  { participantId: 'p1', participantCode: 'A-1', finalScore: 99, maxScore: 100 },
  { participantId: 'p2', participantCode: 'Z-2', finalScore: 99, maxScore: 100 },
  { participantId: 'p3', participantCode: 'M-3', finalScore: 96, maxScore: 100 },
];

test('alphabetical order no longer decides a place', () => {
  const outcome = resolveAwards({ policy: POLICY(), candidates: CANDIDATES });
  assert.equal(outcome.awarded.some(a => a.place.rank === 1), false,
    'first place must not be handed to A-1 because A sorts before Z');
  assert.equal(outcome.contested.length, 1);
  assert.equal(outcome.contested[0].place.rank, 1);
  assert.equal(outcome.contested[0].decision, null);
  assert.deepEqual(outcome.contested[0].group.participants.map(p => p.participantId), ['p1', 'p2']);

  const standing = outcome.standings.get('p1');
  assert.equal(standing?.kind, 'contested', 'a tied entrant is neither a winner nor merely in contention');
  assert.match(describeStanding(standing, true), /بانتظار قرار الإدارة/);
  assert.equal(outcome.standings.get('p2')?.kind, 'contested');

  // ولا يسقط المتعادلان إلى المركز الثاني: ذلك حكمٌ بالخسارة قبل النظر في تعادلهما.
  const second = outcome.awarded.find(a => a.place.rank === 2);
  assert.deepEqual(second?.winners.map(w => w.participantId), ['p3']);
});

test('a shared decision awards the place to both, with the reason on the record', () => {
  const pending = resolveAwards({ policy: POLICY(), candidates: CANDIDATES });
  const decided = tieDecision({ group: pending.contested[0].group, outcome: 'shared', reason: REASON, decidedBy: ADMIN });
  assert.ok(decided.ok);
  const outcome = resolveAwards({ policy: POLICY(), candidates: CANDIDATES, tieDecisions: decided.ok ? [decided.decision] : [] });
  const first = outcome.awarded.find(a => a.place.rank === 1);
  assert.deepEqual(first?.winners.map(w => w.participantId).sort(), ['p1', 'p2']);
  assert.equal(outcome.standings.get('p1')?.kind, 'place');
  assert.equal(outcome.contested[0].decision?.reason, REASON, 'the decision stays visible after it is applied');
  assert.match(describeTie(outcome.contested[0].group, outcome.contested[0].decision, true), /بقرار الإدارة/);
});

test('an ordered decision seats one and lets the other compete for the place below', () => {
  const pending = resolveAwards({ policy: POLICY(), candidates: CANDIDATES });
  const decided = tieDecision({
    group: pending.contested[0].group, outcome: 'ordered', orderedParticipantIds: ['p2', 'p1'],
    reason: 'لائحة الدورة: يُقدَّم عند التساوي الأقلّ خطأً في الأداء المسجَّل.', decidedBy: ADMIN,
  });
  assert.ok(decided.ok);
  const outcome = resolveAwards({ policy: POLICY(), candidates: CANDIDATES, tieDecisions: decided.ok ? [decided.decision] : [] });
  assert.deepEqual(outcome.awarded.find(a => a.place.rank === 1)?.winners.map(w => w.participantId), ['p2']);
  assert.deepEqual(outcome.awarded.find(a => a.place.rank === 2)?.winners.map(w => w.participantId), ['p1'],
    'the one who was not seated falls through and competes below, rather than being dropped');
  assert.equal(outcome.standings.get('p3')?.kind, 'competing');
});

test('a certain winner is still awarded while only the last seat is contested', () => {
  // مركزٌ بمقعدين: الأعلى ناله بحقّه، والتعادل على المقعد الثاني وحده.
  const outcome = resolveAwards({
    policy: POLICY(2),
    candidates: [
      { participantId: 'top', participantCode: 'A-0', finalScore: 100, maxScore: 100 },
      ...CANDIDATES.slice(0, 2),
    ],
  });
  assert.deepEqual(outcome.awarded.find(a => a.place.rank === 1)?.winners.map(w => w.participantId), ['top']);
  assert.equal(outcome.contested[0].group.seatsRemaining, 1);
  assert.deepEqual(outcome.contested[0].group.participants.map(p => p.participantId), ['p1', 'p2']);
});

test('the public roll of honour says a place is on hold rather than dropping it', () => {
  const archive = buildWinnersArchive({
    competitions: [{
      id: 'c1', name: 'C', nameArabic: 'م', startDate: '2026-01-01',
      categories: [{ id: 'cat', name: 'Cat', nameArabic: 'فرع' }],
      awards: POLICY(),
    }],
    results: CANDIDATES.map(c => ({
      competitionId: 'c1', categoryId: 'cat', participantId: c.participantId, participantCode: c.participantCode,
      participantName: c.participantCode, participantNameArabic: c.participantCode,
      finalScore: c.finalScore, status: 'sealed',
    })),
  });
  const category = archive[0].categories[0];
  assert.equal(category.winners.some(w => w.rank === 1), false, 'a contested place is not published as won');
  assert.equal(category.contested.length, 1);
  assert.equal(category.contested[0].decided, false);
  assert.match(category.contested[0].noteArabic, /موقوف/);
  assert.match(category.contested[0].noteEnglish, /on hold/);
});

test('a published rubric rule settles the tie before anyone is asked to decide', () => {
  /*
   * قواعد كسر التعادل معلنة في رُبريك المسابقة قبل يومها. فتصعيدُ تعادلٍ تفصله قاعدةٌ
   * معلنة تعطيلٌ للّائحة، لا احترامٌ لها — والإدارة لا تُستدعى إلا لما عجزت عنه.
   */
  const outcome = resolveAwards({
    policy: POLICY(),
    tieBreakRules: ['memorization_priority'],
    candidates: [
      { participantId: 'p1', participantCode: 'A-1', finalScore: 99, maxScore: 100, criterionScores: { memorization: 48 } },
      { participantId: 'p2', participantCode: 'Z-2', finalScore: 99, maxScore: 100, criterionScores: { memorization: 50 } },
    ],
  });
  assert.equal(outcome.contested.length, 0, 'the published rule decided it');
  assert.deepEqual(outcome.awarded.find(a => a.place.rank === 1)?.winners.map(w => w.participantId), ['p2']);
});

test('a rule that does not separate them still escalates, and says it was tried', () => {
  const outcome = resolveAwards({
    policy: POLICY(),
    tieBreakRules: ['memorization_priority', 'fewest_penalties'],
    candidates: [
      { participantId: 'p1', participantCode: 'A-1', finalScore: 99, maxScore: 100, criterionScores: { memorization: 50 }, penaltyCount: 2 },
      { participantId: 'p2', participantCode: 'Z-2', finalScore: 99, maxScore: 100, criterionScores: { memorization: 50 }, penaltyCount: 2 },
    ],
  });
  assert.equal(outcome.contested.length, 1);
  assert.deepEqual(outcome.contested[0].group.rulesTried, ['memorization_priority', 'fewest_penalties']);
  assert.match(describeTie(outcome.contested[0].group, null, true), /طُبِّقت ولم تفصل/);
});

test('a competition with no published rule says so rather than implying none was tried', () => {
  const outcome = resolveAwards({ policy: POLICY(), candidates: CANDIDATES });
  assert.deepEqual(outcome.contested[0].group.rulesTried, []);
  assert.match(describeTie(outcome.contested[0].group, null, true), /لم تُعلن/);
});

test('no tiebreak criterion is invented in code', () => {
  /*
   * العمر وأسبقيّة التسجيل وعدد الأخطاء كلُّها قرارُ لائحةٍ يملكه المالك. وكتابةُ
   * أيٍّ منها هنا اختراعُ سياسةٍ باسم من لم يقلها.
   */
  const source = fs.readFileSync('src/lib/tie-resolution.ts', 'utf8');
  for (const invented of ['birthDate', 'age', 'registeredAt', 'createdAt', 'errorCount', 'mistakes']) {
    // بحدود الكلمة: «age» داخل «percentage» ليست معيارَ ترجيح.
    assert.equal(new RegExp(`\\b${invented}\\b`).test(source), false, `${invented} would be an invented tiebreak rule`);
  }
  // وحارسٌ يثبت أنه يرصد فعلًا: المسطرةُ الأبجديّة التي أُزيلت لا تعود من هنا.
  assert.equal(/\bbirthDate\b/.test('const birthDate = 1;'), true, 'the word-boundary guard must actually match');
  /*
   * ولا يعود رمزُ المتسابق فاصلًا: الترتيب الوحيد هنا بالمعرّف، وهو ترتيبُ عرضٍ ثابت
   * لقائمة المتعادلين لا ترتيبُ فوز. والتعليقات تُنزع أولًا كي لا يمرّ الحارس بذكر
   * العطل في شرحه.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/participantCode[\s\S]{0,60}localeCompare/.test(code), false,
    'a tie must not be resolved by comparing participant codes');
  assert.equal(code.includes('participantId.localeCompare'), true,
    'the only ordering left is the stable display ordering by id');
});

/* ── أن يكون للباب مفتاح ────────────────────────────────────────────────── */

/** الشيفرة بلا تعليقات: حارسٌ يطابق شرحَ العطل يمرّ وإن أُزيل العطلُ نفسه. */
const codeOf = (file: string) =>
  fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the administration has a screen to decide on, and it is mounted', () => {
  /*
   * رصدُ تعادلٍ بلا شاشةٍ يُفصل فيها أسوأ من الحكم الصامت الذي أُزيل: المركز يبقى موقوفًا
   * إلى الأبد ولا يجد أحدٌ أين يقرّر.
   */
  const panel = codeOf('src/components/admin/TieDecisionPanel.tsx');
  assert.match(panel, /store\.decideTie\(/, 'the panel must actually record a decision');
  assert.match(panel, /store\.contestedTies\(\)/, 'and read the open ties from the store');
  assert.match(panel, /TIE_REASON_MIN_LENGTH/, 'and state the reason requirement rather than hide it');
  // والرفض يُقال بنصّه ولا يبتلعه الزر.
  assert.match(panel, /setNote\(ar \? out\.messageArabic : out\.messageEnglish\)/,
    'a refusal must reach the screen');

  const overview = codeOf('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /<TieDecisionPanel ar=\{ar\}\/>/, 'a built-but-unmounted panel is not a screen');

  const store = codeOf('src/lib/store.ts');
  assert.match(store, /contestedTies, decideTie,/, 'the store must expose both to the screen');
});

test('sealing is refused while a place is on hold, and the refusal is spoken', () => {
  const store = codeOf('src/lib/store.ts');
  assert.match(store, /reason:'undecided_tie'/, 'an undecided tie must block the seal');
  assert.ok(store.indexOf("reason:'undecided_tie'") < store.indexOf('const sealedAt') + 4000,
    'the guard belongs inside sealResults, before anything is written');

  // ورفضٌ بلا جملةٍ يقرؤها المشغّل زرٌّ لا يعمل بلا سبب معروف.
  const language = fs.readFileSync('src/lib/ui-language.ts', 'utf8');
  assert.match(language, /undecided_tie: 'مركزٌ موقوف/, 'the Arabic refusal must be written');
  assert.match(language, /undecided_tie: 'A place is on hold/, 'and the English one');
});

test('the decision is recorded as a document and in the audit log, not only in memory', () => {
  const store = codeOf('src/lib/store.ts');
  assert.match(store, /persistScopedDocument\('tie_decisions'/, 'the decision must survive the session');
  assert.match(store, /watch\('tie_decisions'/, 'and reach the other devices in the hall');
  assert.match(store, /action:'TIE_DECIDED'/, 'and be answerable for in the audit log');
  // ولا يُقبل مفتاحٌ من الشاشة على علّاته: يُبحث عنه في التعادلات المحسوبة الآن.
  assert.match(store, /const open = contestedTies\(\)\.find\(x => x\.group\.key === input\.key\)/,
    'a key that matches no open tie must not get a decision');
  assert.match(store, /TIE_DECISION_ALREADY_RECORDED/, 'and a decided tie is not decided twice');
});
