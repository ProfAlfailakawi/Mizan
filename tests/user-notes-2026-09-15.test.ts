/*
 * ملاحظات المستخدم — ١٥ سبتمبر ٢٠٢٦.
 *
 * كل اختبار هنا يقابل ملاحظةً قيلت بلسان صاحب المسابقة، ويثبت أنّ ما قيل صار سلوكًا لا وعدًا.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { DEFAULT_AWARD_POLICY, describeStanding, normalizeAwardPolicy, resolveAwards, scorePercentage, validateAwardPolicy } from '../src/lib/award-places';
import { buildWinnersArchive } from '../src/lib/winners-archive';
import { DEFAULT_READING_VALUE, readingOptions } from '../src/lib/quran-reading-sources';
import { topicOf, topicRepetitionPenalty } from '../src/lib/question-topics';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { QuestionAllocationEngine, type QuestionCandidate } from '../src/lib/question-engine';
import { scopeFromJuz } from '../src/lib/quran-scope';
import { unitBounds } from '../src/lib/quran-canon';

const read = (path: string) => fs.readFileSync(path, 'utf8');

/* ── ٢ — الصعوبة المستهدفة لا تُظهر ٣.٥٠٠٠٠٠٠٠٠٠٠٠٠٠٠٤ ─────────────────── */

test('a fractional step never leaks binary float noise into the screen', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /const quantize=\(v:number,step:number\)=>/,
    'the step control rounds to the precision of its own step');
  assert.match(overview, /const clamp=\(v:number\)=>quantize\(/,
    'and every clamp — typed, incremented or decremented — goes through it');
});

/* ── ٣ — هامش الصعوبة صار مشروحًا ──────────────────────────────────────── */

test('the difficulty spread explains itself in the organiser’s own terms', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /هامش الصعوبة المسموح/);
  assert.match(overview, /كم يُسمح للسؤال أن يبتعد عن الصعوبة المستهدفة/,
    'the hint says what the number does, not what it is called');
});

/* ── ٥ — «الدولي» صار «الجهات» ─────────────────────────────────────────── */

test('the enterprise tab speaks of participating entities, not only international ones', () => {
  const enterprise = read('src/components/admin/EnterpriseWorkspace.tsx');
  assert.match(enterprise, /ar\?'الجهات':'Entities'/);
  assert.doesNotMatch(enterprise, /ar\?'الدولي':'International'/);
});

/* ── ٦ — بطاقة البدائل تقول ما تريده وماذا يحدث بدونها ─────────────────── */

test('the spare-model recommendation says what it is for and what the button does', () => {
  const readiness = read('src/lib/scope-readiness.ts');
  assert.match(readiness, /نموذج بديل جاهز/);
  assert.match(readiness, /لو سقط سؤال يوم المسابقة/);
  const workspace = read('src/components/admin/QuestionEngineWorkspace.tsx');
  assert.match(workspace, /تجهيز البدائل/, 'the fix button names the action it performs');
});

/* ── ٧ — لا اشتراط مراجعة علمية، فلا لجنة علمية ────────────────────────── */

test('the scientific-review requirement is gone from the question policy screen', () => {
  const workspace = read('src/components/admin/QuestionEngineWorkspace.tsx');
  assert.doesNotMatch(workspace, /اشترط مراجعة علمية لتقدير صعوبة السؤال/);
});

/* ── ٨ — المناطق تُضاف ويُحفظ تعديلها ──────────────────────────────────── */

test('editing zones leaves the automatic split instead of being silently discarded', () => {
  const workspace = read('src/components/admin/QuestionEngineWorkspace.tsx');
  assert.match(workspace, /const asCommitteeZones =/);
  assert.match(workspace, /const addZone = \(\) => \{/);
  assert.match(workspace, /const balanceCounts = \(\) => \{/,
    'and the counts can be made to match the participant question count in one action');
  assert.match(workspace, /onClick=\{addZone\}/);
});

/* ── ٤ — «ما عندنا لائحة»: لا تجميد ولا تسمية لا تخصّ الجهة ─────────────── */

test('judging criteria stay editable: there is no freeze anywhere', () => {
  /*
   * أصل الملاحظة الرابعة: المعايير كانت تُقفل تلقائيًا عند أول جلسة ولا تُفتح أبدًا،
   * فجلسةُ تجربةٍ واحدة تحبس الجهة عن تعديل معاييرها إلى الأبد. والجهة صاحبةُ معاييرها.
   */
  const store = read('src/lib/store.ts');
  assert.doesNotMatch(store, /freezeRulesOnce/, 'nothing freezes the criteria any more');
  assert.doesNotMatch(store, /if \(current\.frozenAt\) return false;/, 'and policy edits are not gated on it either');
  assert.match(store, /const updateRuleSet = \(patch: Partial<Competition\['ruleSet'\]>/);
  assert.doesNotMatch(store, /if \(frozen && !opts\?\.allowWhenFrozen\) return false;/,
    'a criteria edit is never refused');
  /* الأثر يبقى: نسخة ترتفع عند كل تعديل. */
  assert.match(store, /version: `\$\{previous\.version\}-rev`/);

  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.doesNotMatch(overview, /frozenAt/, 'the screen no longer reads a freeze that cannot happen');
  assert.doesNotMatch(overview, /لائحة هذه المسابقة مجمَّدة|فكّ التجميد/,
    'and no longer speaks of a frozen rulebook, nor offers to unfreeze one');
  assert.match(overview, /<button type="button" onClick=\{addCriterion\}/, 'the add button is never disabled');
});

test('a criteria edit preserves the revision each locked submission was judged under', () => {
  /*
   * المعايير صارت تُعدَّل بلا تجميد — وهذا يفتح بابًا: إرسالٌ قُفل على جدولٍ سابق لو جُمع
   * بجدولٍ لاحق، أسقط حذفُ معيارٍ درجةً مُنحت، ومنحت إضافةُ معيارٍ درجةً كاملة عن بندٍ
   * لم يُقيَّم فيه صاحبه قط. فلا يكفي رفع النسخة: لا بدّ من حفظ ما قبلها وربط كل إرسال بها.
   */
  const store = read('src/lib/store.ts');
  assert.match(store, /const snapshot = \{ \.\.\.previous, id: ruleSetSnapshotId\(previous\) \}/,
    'the previous revision is kept, not overwritten');
  assert.match(store, /ruleSets: \[next, snapshot, \.\.\.history\]/);
  assert.match(store, /ruleSetId: sessionRuleSet\.id, ruleSetVersion: sessionRuleSet\.version/,
    'and every submission records the table it was judged against');

  /*
   * والنسخة تُستخرج بالهوية والرقم معًا: الأرقام ليست فريدة عبر `ruleSets`، ففئتان بجدولين
   * مستقلّين قد تحملان الرقم نفسه، وبحثٌ بالرقم وحده يُجمِّع متسابقًا بمعايير فئةٍ أخرى.
   */
  assert.match(store, /function ruleSetRevision\(id\?: string, version\?: string\)/);
  assert.match(store, /pool\.find\(r => r\.id === id && r\.version === version\)/,
    'a revision is resolved by identity and version together, never by version alone');
  assert.doesNotMatch(store, /\.find\(r => r\.version === panelRevision\)/,
    'the ambiguous version-only lookup is gone');

  /* الجلسة تُثبَّت عند أوّل قفل، فلا يقفل محكّمان على نسختين مختلفتين أصلًا. */
  assert.match(store, /function pinnedRuleSetForSession\(sessionId: string, fallback: RuleSet\): RuleSet/);
  assert.match(store, /const sessionRuleSet = pinnedRuleSetForSession\(/);
  assert.match(store, /const panelRuleSet = pinnedRuleSetForSession\(submission\.sessionId, sessionRuleSet\)/);

  /* وما اختلط قبل هذا الربط يُرفع إلى المراجعة البشرية، ولا يُجمَع بتخمين. */
  assert.match(store, /recordInvariantBlock\('panel_revision_mixed'/);

  /* والختم يأخذ الجدول كاملًا لا معاييره وحدها: `dropExtremes` يتبع نسخة الإرسال. */
  assert.match(store, /const sealRuleSet = ruleSetOfSubmission\(/);
  assert.match(store, /criteria: sealRuleSet\.criteria,\s*\n\s*mode: policy\.judging\.mode, dropExtremes: sealRuleSet\.dropExtremes/,
    'the historical revision decides drop-extremes too, not the live table');

  const types = read('src/types/index.ts');
  assert.match(types, /ruleSetId\?: string;\s*\n\s*ruleSetVersion\?: string;/);
});

test('the product speaks of judging criteria, not of a rulebook the organiser does not have', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /ar\?'معايير التحكيم':'Judging criteria'/);
  assert.doesNotMatch(overview, /لائحتها/, 'the screen no longer assumes the organiser has a written regulation');
  for (const file of [
    'src/components/admin/EnterpriseWorkspace.tsx',
    'src/components/design-system/ClarityGuide.tsx',
    'src/components/scope/ModelFairnessStudio.tsx',
    'src/lib/readiness.ts',
    'src/lib/competition-config.ts',
    'src/lib/scope-readiness.ts',
    'src/lib/participant-scope.ts',
    'src/lib/allocation-verifier.ts',
  ]) {
    assert.doesNotMatch(read(file), /اللائحة|لائحة/, `${file} still shows the word to the user`);
  }
});

test('empty criteria are called out where they are edited, not only at the readiness gate', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /\{!r\.criteria\.length&&/);
  assert.match(overview, /لا توجد معايير تحكيم بعد/);
  const readiness = read('src/lib/readiness.ts');
  assert.match(readiness, /c\.ruleSet\.criteria\.length>0/, 'and the launch gate still blocks it independently');
});

/* ── ٩ — ترتيب الأسئلة تصاعدي حسب المصحف ──────────────────────────────── */

test('a participant is asked in Mushaf order, not in draw or zone order', () => {
  const engine = new QuestionAllocationEngine({
    policy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', neighborhoodAyahRadius: 0 },
    seed: 'order-test',
  });
  const scope = scopeFromJuz([1, 2, 3]);
  const candidate = (id: string, surah: number, ayah: number): QuestionCandidate => ({
    id, surahNumber: surah, startAyah: ayah, endAyah: ayah + 2,
    difficultyRating: 3, difficultyAssurance: 'human_reviewed', approvalStatus: 'approved',
  });
  const candidates = [
    candidate('c-late', 3, 50),
    candidate('c-early', 2, 5),
    candidate('c-middle', 2, 200),
  ];
  const result = engine.selectForParticipant({
    participantId: 'p1',
    effectiveScope: scope,
    slots: candidates.map((_, index) => ({
      index, zoneId: null, zoneName: 'open', zoneNameArabic: 'النطاق', scope,
    })),
  }, candidates);
  assert.equal(result.questions.length, 3);
  const starts = result.questions.map(q => [q.candidate.surahNumber, q.candidate.startAyah]);
  const sorted = [...starts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.deepEqual(starts, sorted, 'the questions are presented from the start of the range to its end');
});

/* ── ١٠ — الحزب وحدة تحديد كاملة ───────────────────────────────────────── */

test('a hizb is selectable the way a juz is, and its bounds come from the canon', () => {
  const picker = read('src/components/scope/QuranScopePicker.tsx');
  assert.match(picker, /const toggleHizb = /);
  assert.match(picker, /QURAN_HIZB_TOTAL/);
  assert.match(picker, /اختيار بالأحزاب/);
  const first = unitBounds('hizb', 1), last = unitBounds('hizb', 60);
  assert.deepEqual(first.start, { surah: 1, ayah: 1 });
  assert.equal(last.end.surah, 114);
});

/* ── ١١ — لا آيات وحدةً لطول السؤال؛ الأوجه فقط ────────────────────────── */

test('question length is measured in pages, never in a hand-typed ayah count', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.doesNotMatch(overview, /onMode\('ayat'\)/, 'the by-ayat mode button is gone');
  assert.doesNotMatch(overview, /ar\?'بالآيات':'By ayat'/);
  assert.match(overview, /passageMode:'page_quarters'/);
});

/* ── ١٢ — سجل الفائزين ─────────────────────────────────────────────────── */

test('the public page carries a roll of honour built only from sealed results', () => {
  const editions = buildWinnersArchive({
    competitions: [
      {
        id: 'c-2025', name: 'Past', nameArabic: 'الدورة الماضية', startDate: '2025-03-01',
        categories: [{ id: 'cat', name: 'Branch', nameArabic: 'الفرع' }],
        awards: DEFAULT_AWARD_POLICY,
      },
      {
        id: 'c-draft', name: 'Unsealed', nameArabic: 'غير مختومة', startDate: '2024-03-01',
        categories: [{ id: 'cat', name: 'Branch', nameArabic: 'الفرع' }],
      },
    ],
    results: [
      { competitionId: 'c-2025', categoryId: 'cat', participantId: 'p1', participantCode: 'A-1', participantName: 'One', participantNameArabic: 'الأول', finalScore: 99, status: 'sealed' },
      { competitionId: 'c-2025', categoryId: 'cat', participantId: 'p2', participantCode: 'A-2', participantName: 'Two', participantNameArabic: 'الثاني', finalScore: 90, status: 'published' },
      { competitionId: 'c-draft', categoryId: 'cat', participantId: 'p3', participantCode: 'B-1', participantName: 'Three', participantNameArabic: 'الثالث', finalScore: 99, status: 'calculated' },
    ],
  });
  assert.equal(editions.length, 1, 'an unsealed edition is not history yet');
  const branch = editions[0].categories[0];
  assert.equal(branch.winners[0].participantCode, 'A-1');
  assert.equal(branch.winners[0].percentage, 99);
  assert.ok(branch.withheld.some(x => x.rank === 2), 'a place nobody reached is listed as withheld, not dropped');

  const landing = read('src/components/public/CompetitionLanding.tsx');
  assert.match(landing, /سجل الفائزين/);
  assert.match(landing, /buildWinnersArchive/);
});

/* ── ١٣ — التهيئة قبل الدور ────────────────────────────────────────────── */

test('the pre-turn section is no longer a lone breathing circle', () => {
  const warmup = read('src/components/participant/WarmupSanctuary.tsx');
  assert.match(warmup, /التهيئة قبل دورك/, 'it is renamed in the participant’s own words');
  assert.match(warmup, /مواضع اختبارك/, 'it shows where they will be tested');
  assert.match(warmup, /شهيق…/, 'the breathing exercise stays');
  assert.match(warmup, /const RehearsalDoor/, 'and a timed rehearsal marks slips the way a judge would');
  assert.match(warmup, /لا يُسجَّل ولا يُرسل ولا يمسّ درجتك/,
    'and says plainly that the drill never reaches the panel');
});

/* ── ١٤ — قطر الأجزاء إلى جانب قطر الآيات ──────────────────────────────── */

test('a juz neighbourhood radius keeps one model from crowding into a single juz', () => {
  const scope = scopeFromJuz([1, 2, 3, 4]);
  const candidate = (id: string, surah: number, ayah: number): QuestionCandidate => ({
    id, surahNumber: surah, startAyah: ayah, endAyah: ayah + 1,
    difficultyRating: 3, difficultyAssurance: 'human_reviewed', approvalStatus: 'approved',
  });
  /* ثلاثة مرشحين: اثنان في الجزء الأول وواحد بعيد عنه. */
  const candidates = [candidate('a', 2, 3), candidate('b', 2, 20), candidate('c', 2, 200)];
  const run = (juzRadius: number) => {
    const engine = new QuestionAllocationEngine({
      policy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', neighborhoodAyahRadius: 0, neighborhoodJuzRadius: juzRadius },
      seed: 'juz-radius',
    });
    return engine.selectForParticipant({
      participantId: 'p1', effectiveScope: scope,
      slots: [0, 1].map(index => ({ index, zoneId: null, zoneName: 'open', zoneNameArabic: 'النطاق', scope })),
    }, candidates).questions.map(q => q.candidate.juzNumber ?? 0);
  };
  const withRadius = run(1);
  assert.equal(withRadius.length, 2);
  const picked = run(1).length;
  assert.equal(picked, 2, 'the model is still filled — the radius steers, it does not starve');
  const constraints = read('src/lib/repeat-policy.ts');
  assert.match(constraints, /neighborhoodJuzRadius/);
  const workspace = read('src/components/admin/QuestionEngineWorkspace.tsx');
  assert.match(workspace, /نصف قطر الجوار \(أجزاء\)/);
});

/* ── ١٥ — المراكز بالنِّسَب والحجب ──────────────────────────────────────── */

test('a place is a published threshold, and it is withheld when nobody reaches it', () => {
  const policy = normalizeAwardPolicy({
    version: 1,
    competingThresholdPercentage: 85,
    showCompetingOnCertificate: true,
    places: [
      { rank: 1, titleArabic: 'الأول', titleEnglish: 'First', minimumPercentage: 98, seats: 1, whenUnmet: 'withhold' },
      { rank: 2, titleArabic: 'الثاني', titleEnglish: 'Second', minimumPercentage: 96, seats: 1, whenUnmet: 'withhold' },
    ],
  });
  const outcome = resolveAwards({
    policy,
    candidates: [
      { participantId: 'p97', participantCode: 'A-97', finalScore: 97, maxScore: 100 },
      { participantId: 'p88', participantCode: 'A-88', finalScore: 88, maxScore: 100 },
    ],
  });
  assert.equal(outcome.withheld.length, 1);
  assert.equal(outcome.withheld[0].place.rank, 1, 'ninety-seven does not become first place by default');
  assert.match(outcome.withheld[0].reasonArabic, /حُجب/);
  assert.equal(outcome.awarded[0].place.rank, 2);
  assert.equal(outcome.awarded[0].winners[0].participantCode, 'A-97');

  const eightyEight = outcome.standings.get('p88');
  assert.equal(eightyEight?.kind, 'competing');
  assert.match(describeStanding(eightyEight, true), /ضمن المنافسة/);
  assert.equal(scorePercentage(88, 100), 88);
});

test('award thresholds must descend with rank, and the screen says so before the day', () => {
  const broken = normalizeAwardPolicy({
    version: 1, competingThresholdPercentage: 50, showCompetingOnCertificate: true,
    places: [
      { rank: 1, titleArabic: 'الأول', titleEnglish: 'First', minimumPercentage: 90, seats: 1, whenUnmet: 'withhold' },
      { rank: 2, titleArabic: 'الثاني', titleEnglish: 'Second', minimumPercentage: 95, seats: 1, whenUnmet: 'withhold' },
    ],
  });
  assert.equal(validateAwardPolicy(broken, true).length, 1);
  assert.equal(validateAwardPolicy(normalizeAwardPolicy(DEFAULT_AWARD_POLICY), true).length, 0);
});

/* ── ١٦ — تنويع الموضوعات ──────────────────────────────────────────────── */

test('question topics are derived from the locus and used to vary what a participant is asked', () => {
  assert.equal(topicOf({ surahNumber: 12, startAyah: 4, endAyah: 10 }), 'qasas_anbiya');
  assert.equal(topicOf({ surahNumber: 2, startAyah: 178, endAyah: 180 }), 'ahkam');
  assert.equal(topicOf({ surahNumber: 103, startAyah: 2, endAyah: 3 }), 'short_ayat');
  assert.equal(topicOf({ surahNumber: 30, startAyah: 1, endAyah: 3 }), 'surah_opening');
  assert.equal(topicRepetitionPenalty(['ahkam', 'ahkam'], 'ahkam'), 2);
  assert.equal(topicRepetitionPenalty(['ahkam'], 'short_ayat'), 0);
  assert.equal(topicRepetitionPenalty(['general', 'general'], 'general'), 0,
    '“general” is the absence of a tag, not a topic that can be over-used');
  const engine = read('src/lib/question-engine.ts');
  assert.match(engine, /topicDiversity/);
});

/* ── ١٧ و ١٨ — حفص افتراضًا، وبقية الروايات من مصدرها المعتمد ──────────── */

test('every passage starts on Hafs, and no other reading opens without a certified source', () => {
  const options = readingOptions(['hafs']);
  assert.equal(options[0].value, DEFAULT_READING_VALUE);
  assert.equal(options[0].ready, true);
  assert.equal(options[0].authority, 'KFGQPC');
  assert.ok(options.length > 10, 'the ten qiraat and their transmissions are all listed');
  assert.ok(options.slice(1).every(x => x.authority === 'ALWAHY'),
    'the other readings carry their certified source rather than appearing from nowhere');
  assert.ok(options.slice(1).every(x => !x.ready),
    'and none of them is selectable before its package lands');
  assert.equal(readingOptions(['hafs', 'warsh']).find(x => x.rawiId === 'warsh')?.ready, true,
    'a reading becomes selectable the moment its delivery package exists');

  const sources = read('src/lib/quran-reading-sources.ts');
  assert.match(sources, /alwa7y\.com\/downloads/, 'the approved provenance is recorded, not remembered');

  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /<ReadingControl /, 'the reading is chosen from the table, not typed by hand');
  assert.doesNotMatch(overview, /label=\{ar\?'الرواية \/ القراءة'/, 'the free-text reading field is gone');
});

/* ── ١ — شاشة التحكيم لا تُترك فارغة والكشوف ليست فارغة ────────────────── */

test('an empty judging screen says why it is empty and offers the next real step', () => {
  const judge = read('src/components/judge/JudgeOS.tsx');
  assert.match(judge, /awaitingArrival/);
  assert.match(judge, /لم يُسجَّل حضورهم بعد/);
  assert.match(judge, /admitAndCall/, 'a judge can admit the participant standing in front of them');
  assert.match(judge, /طلبًا تحت المراجعة/, 'and is told when the roster is pending approval instead');
});
