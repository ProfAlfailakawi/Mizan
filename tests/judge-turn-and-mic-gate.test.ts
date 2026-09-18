import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file: string) => fs.readFileSync(file, 'utf8');

/*
 * بابان في شاشة المحكّم، كلاهما كُسر مرّة وأُصلح:
 *
 *   ١) **الترتيب.** الطابور هو العدل الوحيد الذي يراه المنتظرون بأعينهم، فلا يُتخطّى —
 *      لا داخل الطابور، ولا باستقبال من لم يصل بعدُ وإدخاله قبل الواقفين.
 *   ٢) **الميكروفون.** التسجيل شرط لائحة، فيُحرس. أمّا وصول الصوت إلى الشريط فمؤشّر
 *      جودة، وجعله بوابةً قاطعة يوقف المسابقة على قاعةٍ هادئة أو متصفّحٍ لا يمرّر مستوى.
 */

test('the judge screen shows its panel queue in order — and nothing else to start', () => {
  const judge = read('src/components/judge/JudgeOS.tsx');

  /* لا استقبال من شاشة المحكّم: الاستقبال إجراء حضورٍ يخصّ التشغيل ومكتب الاستثناء. */
  assert.doesNotMatch(judge, /admitAndCall/, 'the judge screen must not admit a late arrival');
  assert.doesNotMatch(judge, /checkInParticipant\(/, 'and must not check anyone in');
  assert.doesNotMatch(judge, /releaseStrandedSession/, 'nor release a stranded session by itself');

  /* والبدء لصاحب الدور وحده: الصفّ الأول فعّال وما بعده معطّل بسببٍ مكتوب. */
  assert.match(judge, /committeeQueue\.slice\(0,24\)\.map\(\(p,i\)=>\{const turn=i===0;/, 'only the head of the queue is actionable');
  assert.match(judge, /disabled=\{!turn\}/, 'every other row is disabled');
  assert.match(judge, /الترتيب مُلزم/, 'and the rule is stated on the screen');
});

test('the order rule is enforced where the effect happens, not only on the screen', () => {
  const store = read('src/lib/store.ts');
  const start = store.indexOf('const startSessionForParticipant');
  const end = store.indexOf('const policy = getCompetitionPolicy', start);
  const block = store.slice(start, end);

  assert.match(block, /SESSION_START_OUT_OF_TURN/, 'starting out of turn is refused');

  /*
   * والحارس على حالة اللجنة لا على حالة المتسابق: كان مشروطًا بـ`status === 'in_queue'`
   * وحده، فمسار «أدخِله وابدأ» يسجّل الحضور ثم يبدأ فورًا — فيتخطّى الطابور بلا أن يمرّ به.
   */
  assert.doesNotMatch(block, /!turnExempt && participant\.status === 'in_queue'/, 'the guard must not hinge on the participant’s own status alone');
  assert.match(block, /resumingOwnSession/, 'resuming a session stranded in this very panel is not queue-jumping');
  assert.match(block, /p\.status === 'in_queue' &&\s*\n\s*p\.assignedCommitteeId === committee\.id/, 'the head is taken from this panel’s own queue');
});

test('the microphone gate stands on recording, never on a level meter that may never move', () => {
  const judge = read('src/components/judge/JudgeOS.tsx');

  /* ما تشترطه اللائحة هو التسجيل، وهو ما يفتح ما بعده. */
  assert.match(judge, /const micRecording=!micGateApplies\|\|audioState==='ready';/, 'recording is the gate');
  assert.match(judge, /\{!questionRevealed&&!activeSession\.isLocked&&micRecording&&/, 'presence and approval appear once recording runs');
  assert.match(judge, /const submitAndLock=async\(\)=>\{if\(!micRecording\)return;/, 'submission requires recording');

  /* ووصول الصوت تحذيرٌ باقٍ، لا بوابة. */
  assert.match(judge, /micGateApplies&&micRecording&&!micHeard&&!micMeterUnavailable&&/, 'a silent meter warns');
  assert.doesNotMatch(judge, /\{micGateApplies&&!micVerified&&/, 'but it no longer blocks the screen');

  /*
   * وسفاري على الجوال يبدأ سياق الصوت موقوفًا، فيقرأ المحلّل صمتًا أبديًّا ولا يتحرّك
   * الشريط مهما قرأ المتسابق. الاستئناف يقع داخل ضغطة «تجهيز الميكروفون» فهو إيماءة صالحة.
   */
  assert.match(judge, /ctx\.resume\?\.\(\)/, 'the audio context is resumed for mobile Safari');
});

test('releasing a stranded session moved to the exception desk, it was not dropped', () => {
  const portals = read('src/components/admin/RolePortals.tsx');
  assert.match(portals, /releaseStrandedSession/, 'the exception desk can release a stranded session');
  assert.match(portals, /فكّ جلسة عالقة/, 'and names the action plainly');
});
