import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const store = fs.readFileSync('src/lib/store.ts', 'utf8');
const judgeOs = fs.readFileSync('src/components/judge/JudgeOS.tsx', 'utf8');
const dashboard = fs.readFileSync('src/components/participant/ParticipantDashboard.tsx', 'utf8');
const desk = fs.readFileSync('src/components/operations/QueueJustice.tsx', 'utf8');
const transfer = store.slice(store.indexOf('const transferQueueParticipants'), store.indexOf('/* ── توزيع الموجات'));

/*
 * النقل الاستثنائي.
 *
 * حالتان تلتقيان في مشهدٍ واحد: متسابقٌ انتظر خمسين دقيقة ثم نُقل فوجد أمامه عشرة،
 * ولجنةٌ استقبلته وهي لا تحكم فئته. الأولى ظلمٌ في الدور، والثانية خطرٌ في الحكم.
 *
 * وأخطر ما في الثانية أنها **تعمل بصمت**: النظام يسأله في نطاق فئته هو (وهذا صحيح)،
 * فترى اللجنة موضعًا خارج ما اعتادت ولا تعرف لماذا — فتظنّه عطبًا، أو تحكم بمسطرتها.
 */

/* ── عدالة الانتظار ─────────────────────────────────────────────────────── */

test('the transfer desk offers a third currency: time waited, not time of arrival', () => {
  assert.match(desk, /EQUITY_BY_WAITING_TIME/, 'the mode must be reachable by a supervisor');
  assert.match(desk, /recommendFairPosition/, 'and it must be computed, not guessed');
});

test('equity is shown in numbers before it is applied, never after', () => {
  /* استثناءٌ على ترتيب الوصول يُخصم من يقين الآخرين؛ فلا يقع قبل أن يُرى أثره. */
  assert.match(desk, /positionIfAppended\}\s*←\s*\$\{rec\.fairPosition/, 'the desk shows from-position → to-position');
  assert.match(desk, /لا أحد يخسر مركزًا بهذا النقل/, 'and says plainly when no exception is warranted');
});

test('a batch is placed longest-wait first, so movers do not collide on one key', () => {
  assert.match(transfer, /sort\(\(a,b\)=>accruedWaitMinutes\(b,now\)-accruedWaitMinutes\(a,now\)\)/,
    'without ordering the batch, two movers could claim the same position');
  assert.match(transfer, /growing\.push\(/, 'each placement must see the ones already placed');
});

test('what equity gave each participant is recorded on the transfer', () => {
  assert.match(transfer, /equity:equityByParticipant\.size\?/, 'the record carries the compensation');
  assert.match(transfer, /waitedMinutes:r\.waitedMinutes,positionIfAppended:r\.positionIfAppended,fairPosition:r\.fairPosition/,
    'with the numbers that justified it');
});

test('the participant is told, not left to discover a changed panel', () => {
  assert.match(transfer, /lastQueueTransfer:\{at:stamp,fromCommitteeCode:source\.code,toCommitteeCode:target\.code/);
  assert.match(transfer, /appendParticipantNotifications\(p,`queue\.transferred:\$\{stamp\}`\)/,
    'and the key carries its moment, so a second transfer is not swallowed as a duplicate');
  assert.match(dashboard, /lastQueueTransfer\.equityApplied/, 'his own page explains what happened');
  assert.match(dashboard, /positionIfAppended\}، وصار رقم/, 'in the two numbers that matter to him');
});

/* ── الاستثناء عبر الفئات ───────────────────────────────────────────────── */

test('a panel that does not judge his category is refused unless the exception is asked for', () => {
  assert.match(transfer, /if\(invalid\.length&&!input\.allowCrossCategory\)return \{ok:false,reason:'INCOMPATIBLE_TARGET'/,
    'the default still refuses');
  assert.match(desk, /allowCrossCategory/, 'and the supervisor must tick it deliberately');
});

test('the exception needs a competition or operations manager, not any transfer right', () => {
  assert.match(transfer, /if\(exceptionIds\.size&&!\['ops_manager','comp_admin'\]\.includes\(globalState\.currentUser\.role\)\)return \{ok:false,reason:'EXCEPTION_NOT_AUTHORIZED'\}/,
    'a head judge may move queues but may not override category eligibility');
});

test('the exception is marked on the participant, with who approved it and why', () => {
  assert.match(transfer, /crossCategoryException:exceptionIds\.has\(p\.id\)\?\{at:stamp/);
  assert.match(transfer, /approvedBy:globalState\.currentUser\.name,reason:input\.reason\.trim\(\)/);
  assert.match(transfer, /crossCategoryException:exceptionIds\.size>0\|\|undefined/, 'and on the transfer record');
});

test('the panel is warned, because silence here is the dangerous part', () => {
  /*
   * من يحفظ خمسة وعشرين جزءًا يُسأل فيها ولو جلس أمام لجنةٍ مختصّةٍ بخمسة. بلا هذا
   * التنبيه ترى اللجنة موضعًا خارج نطاقها المعتاد فتظنّه عطبًا أو تحكم بمسطرتها.
   */
  assert.match(judgeOs, /participant\?\.crossCategoryException&&/, 'JudgeOS must render the warning');
  assert.match(judgeOs, /role="alert"/, 'and announce it to assistive technology');
  assert.match(judgeOs, /استثناء: هذا المتسابق ليس من فئة هذه اللجنة/);
  assert.match(judgeOs, /ونطاقها هو ما يُسأل فيه — لا تخصّص هذه اللجنة/,
    'it must say which scope governs the questions');
  assert.match(judgeOs, /والتقييم يكون بمسطرة فئته هو/, 'and which rubric governs the score');
});

test('questions keep coming from the participant scope, never from the panel specialty', () => {
  /* هذا هو الضمان الذي يقوم عليه الاستثناء كله. */
  assert.match(store, /participantEffectiveScope\(participant\.id\)/, 'the draw resolves the participant scope');
  assert.match(store, /categories\.find\(c=>c\.id===participant\.categoryId\)/, 'and his own category');
  assert.doesNotMatch(store, /categories\.find\(c=>c\.id===committee\.assignedCategories/,
    'a panel specialty must never select the question scope');
});

test('the audit says which currency was used and whether an exception was taken', () => {
  assert.match(transfer, /بترتيبٍ يراعي ما انتظره كلٌّ منهم فعلًا/);
  assert.match(transfer, /استثناء عبر الفئات/);
  assert.match(transfer, /يُحكَّمون بنطاق فئتهم لا بتخصّص اللجنة/);
});
