import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildDisplayBoard, parseDisplayBoard } from '../src/lib/display-board';
import type { Category, Committee, Participant } from '../src/types';

const read = (file: string) => fs.readFileSync(file, 'utf8');

/*
 * شاشة الممرّ تعرض ما تلته القاعة، ولا تعرض من تلاه.
 *
 * هذه الشاشة أقرب شيءٍ بنيناه إلى حافة قاعدة «لا يخرج إلا الكود»: تعرض آياتٍ من المصحف
 * في ممرٍّ يقف فيه من ينتظر دوره. فما يحرسه هذا الملف ليس شكلها بل حدّها — ألّا يخرج في
 * الإسقاط المنشور موضعُ متسابقٍ بعينه، ولا يُربط ما تُلي بمن تلاه.
 */

const competitionId = 'comp-corridor-test';

const participant = (id: string, over: Partial<Participant> = {}): Participant => ({
  id,
  code: `A-${id}`,
  competitionId,
  organizationId: 'org-test',
  fullName: id,
  fullNameArabic: id,
  email: `${id}@test.local`,
  phone: '',
  country: '',
  nationality: '',
  nationalIdOrPassport: '',
  dateOfBirth: '2005-01-01',
  gender: 'male',
  categoryId: 'cat-1',
  riwaya: 'Hafs',
  institution: '',
  specialNeeds: false,
  documents: [],
  status: 'in_queue',
  statusHistory: [],
  ...over,
} as unknown as Participant);

const committee = (id: string, over: Partial<Committee> = {}): Committee => ({
  id,
  competitionId,
  name: id,
  nameArabic: id,
  code: id.toUpperCase(),
  venueHall: 'A1',
  assignedCategories: ['cat-1'],
  judgeIds: [],
  status: 'ready',
  completedCount: 0,
  averageSessionMinutes: 6,
  ...over,
} as unknown as Committee);

const category: Category = { id: 'cat-1', code: 'C1', name: 'Cat', nameArabic: 'فئة', juzCount: 30, memorizationScope: 'Full Quran' } as unknown as Category;

test('the published board carries today’s recitation as page counts only — never a participant locus', () => {
  const board = buildDisplayBoard({
    competitionId,
    participants: [participant('1'), participant('2', { status: 'in_session', assignedCommitteeId: 'c1' })],
    committees: [committee('c1', { currentParticipantId: '2' })],
    categories: [category],
    recited: [
      { surah: 1, startAyah: 1, endAyah: 7 },
      { surah: 2, startAyah: 1, endAyah: 5 },
    ],
  });

  const aggregate = board.recitation;
  assert.ok(aggregate, 'the aggregate is published');
  assert.equal(aggregate!.pages.length, 604, 'one count per Mushaf page');
  assert.ok(aggregate!.totalRecitations > 0, 'today’s recitation is counted');
  assert.ok(aggregate!.coveredPages > 0, 'covered pages are counted');

  /*
   * الحدّ نفسه: لا شيء في التجميع يحمل هوية. لو تسرّب يومًا معرّفُ متسابقٍ أو كودُه إلى
   * هذه الوثيقة لصار موضعُ جلسته مقروءًا على جدار الممرّ.
   */
  const serialized = JSON.stringify(aggregate);
  assert.doesNotMatch(serialized, /participant/i);
  assert.doesNotMatch(serialized, /A-1|A-2/);
  assert.doesNotMatch(serialized, /surah|ayah/i, 'no locus survives into the aggregate');
});

test('a board with no completed recitation publishes no aggregate at all', () => {
  const board = buildDisplayBoard({
    competitionId,
    participants: [participant('1')],
    committees: [committee('c1')],
    categories: [category],
  });
  assert.equal(board.recitation, undefined, 'nothing recited yet ⇒ nothing claimed');
});

test('an aggregate arriving over the wire is clamped to the Mushaf and read as counts', () => {
  const hostile = {
    version: 'MIZAN-DISPLAY-BOARD-1',
    competitionId,
    generatedAt: new Date().toISOString(),
    committees: [],
    recitation: { pages: new Array(5000).fill(3), participantId: 'part-1' },
  };
  const parsed = parseDisplayBoard(hostile);
  assert.ok(parsed?.recitation, 'a well-formed aggregate is accepted');
  assert.equal(parsed!.recitation!.pages.length, 604, 'an over-long page array is clamped');
  assert.doesNotMatch(JSON.stringify(parsed!.recitation), /participantId/, 'unknown fields are dropped, not carried through');
});

test('the corridor screen never claims a live session and never reads a participant locus', () => {
  const screen = read('src/components/public/CorridorScreen.tsx');
  /* التعليقات تشرح القاعدة وتذكر لفظها؛ والمحروس هو ما يُرسم على الجدار. */
  const rendered = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* لا نبض «مباشر» ولا مؤشّر صوتٍ يوحي بميكروفون: الشاشة لوحة مصحف، لا جلسة. */
  assert.doesNotMatch(rendered, /مباشر/, 'the corridor wall must not present itself as live');
  assert.doesNotMatch(rendered, /animate-pulse/, 'no live pulse on a wall that is not live');
  assert.match(rendered, /ليست تلاوة جارية/, 'it says plainly what it is not');

  /*
   * الآية المعروضة تُنتقى من التجميع على مستوى الصفحة، لا من موضعٍ مفصَّل.
   *
   * والشاشة تبني إسقاطًا محليًّا حين لا يصلها منشور، فتمرّ بسجلّ التلاوة — لكن تمريرًا
   * إلى `buildDisplayBoard` وحدها، وهي التي تجمعه على الصفحة وتُسقط المواضع. فالمحروس
   * أن ما يُرسم مصدره التجميع، وألّا يُقرأ سؤال الجلسة الجارية بحال.
   */
  assert.doesNotMatch(rendered, /questionSelection/, 'the live question never reaches this wall');
  assert.match(rendered, /recitation\?\.pages/, 'the displayed ayah is picked from the page-level aggregate');
  assert.match(rendered, /pickLocus\(pages\)/, 'and only from it');
});

test('the corridor screen works before anything is published — and in the demo', () => {
  const screen = read('src/components/public/CorridorScreen.tsx');
  const publisher = read('src/components/operations/HallScreenPublisher.tsx');

  /*
   * الشاشة تُفتح من جهاز الإدارة قبل أن يُنشر شيء، وفي بيئة العرض حيث لا خادم ولا نشر.
   * فبلا إسقاطٍ محليّ كانت جدارًا فارغًا هناك: لا لجان ولا ختمة ولا آية.
   */
  assert.match(screen, /buildDisplayBoard/, 'it builds a local projection when none is published');
  assert.match(screen, /externalBoard \|\| localBoard/, 'a published projection still wins');
  assert.match(screen, /recitationLedger/, 'the local projection carries today’s recitation too');

  /* والبطاقة التي تحمل روابط شاشات القاعة تظهر في بيئة العرض، وتقول إن لا نشر فيها. */
  assert.match(publisher, /IS_DEMO_SESSION/, 'the demo sees the hall-screen links');
  assert.match(publisher, /بيئة عرض: لا نشر من هذا الجهاز/, 'and it says plainly that nothing is published there');
});
