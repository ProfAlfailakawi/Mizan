/*
 * فحصٌ في المستودع لا يعمل في أيّ سير عمل أسوأ من فحصٍ لا يوجد.
 *
 * سبعةُ فحوصٍ كانت كذلك: تُكتب مرّة، ثم تُنسى، ثم تشيخ، ثم تنكسر بصمت، ثم يُكتشف أنها
 * لم تعمل منذ شهور — وهي طوال ذلك تطمئن بلا وجهٍ للطمأنينة. وقد شُغِّلت كلُّها باليد
 * ونجحت، **لكنّ تشغيلًا يدويًّا على رأسٍ بعينه ليس جدولة**، فصار لها
 * `.github/workflows/scheduled-qa.yml`.
 *
 * وهذا الاختبار يمنع عودةَ الفجوة: أيُّ فحصِ `qa:*` جديدٍ لا يذكره سيرُ عملٍ يُسقطه.
 * والقاعدةُ تُشتقّ من `package.json` لا تُكتب هنا — فقائمةٌ في اختبارٍ تفارق قائمةَ
 * المنتج بصمتٍ عند أوّل إضافة، وهي نفسُها العلّةُ التي يحرس منها.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const WORKFLOW_DIR = path.join(process.cwd(), '.github', 'workflows');
const workflows = fs.readdirSync(WORKFLOW_DIR)
  .filter(f => /\.ya?ml$/.test(f))
  .map(f => ({ name: f, body: fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8') }));

const scripts = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).scripts as Record<string, string>;

/** هل يُشغّل سيرُ عملٍ هذا الأمر؟ */
const scheduledSomewhere = (script: string) =>
  workflows.filter(w => new RegExp(`npm run ${script.replace(/[:*]/g, m => `\\${m}`)}(\\s|$)`, 'm').test(w.body));

/**
 * ما لا يُجدوَل، ولكلٍّ سببٌ يخصّه — لا «ليس مهمًّا».
 *
 * وليست هذه قائمةَ تسامح: مولِّدُ خطّ الأساس لو جُدوِل لأعاد ضبطَ الخطّ تلقائيًّا، فصار
 * الانحرافُ يُسجَّل خطًّا جديدًا بدل أن يُكشف — وهو إسكاتُ بوّابةٍ بأتمتتها.
 */
const NOT_SCHEDULED: Record<string, string> = {
  'qa:visual-baseline':
    'مولِّدُ خطّ أساسٍ لا فحص. وجدولتُه تعيد ضبطَ الخطّ تلقائيًّا، فيُبتلع الانحرافُ بدل أن يُكشف — يُشغَّل بيدٍ وبقرار.',
  'qa:firestore-rules':
    'يعمل في كل دفعة ضمن `ci.yml` على المحاكي؛ جدولتُه مرّةً أخرى تكرارٌ بلا فائدة.',
};

test('the scan sees the workflows and the scripts — an empty list proves nothing', () => {
  assert.ok(workflows.length >= 4, `expected the workflow directory, found ${workflows.length} files`);
  assert.ok(Object.keys(scripts).some(k => k.startsWith('qa:')), 'the scan must see the qa scripts');
});

test('every qa gate runs in some workflow, or says why it does not', () => {
  const unscheduled = Object.keys(scripts)
    .filter(name => name.startsWith('qa:'))
    .filter(name => !scheduledSomewhere(name).length)
    .filter(name => !(name in NOT_SCHEDULED));
  assert.deepEqual(unscheduled, [],
    'these gates exist in the repository and run nowhere — they age and break silently');
});

test('the seven that ran nowhere are scheduled now, by name', () => {
  /*
   * ولا يكفي «مذكورٌ في ملفٍّ ما»: هذه بعينها هي التي كانت الفجوة، فتُسمّى.
   */
  for (const gate of ['qa:live-day', 'qa:competition-day', 'qa:scope-visual', 'qa:venue-legibility',
                      'qa:print-document', 'quran:release-matrix', 'quran:readiness',
                      // وثامنٌ لم تذكره الوثيقة أصلًا — كشفه اشتقاقُ القائمة من `package.json`.
                      'qa:phone-overflow']) {
    assert.ok(scheduledSomewhere(gate).length, `${gate} must run in a workflow`);
  }
});

test('the schedule is a real cadence, not only a manual button', () => {
  const scheduled = workflows.find(w => w.name === 'scheduled-qa.yml');
  assert.ok(scheduled, 'the scheduled-qa workflow must exist');
  assert.ok(/schedule:/.test(scheduled!.body) && /cron: '[^']+'/.test(scheduled!.body),
    'a workflow_dispatch alone is what "run it by hand" already was');
  assert.ok(/workflow_dispatch:/.test(scheduled!.body), 'and it must still be runnable on demand');
});

test('a browser gate waits for the server to answer, never for a fixed number of seconds', () => {
  /*
   * رقمٌ ثابت يمرّ أحيانًا ويسقط أحيانًا على الآلة نفسها، فيُقرأ «تقطّعًا» ويُعاد
   * التشغيل — وذلك تدريبٌ على تجاهل الأحمر. والانتظارُ بالاستجابة حتميّ.
   */
  const scheduled = workflows.find(w => w.name === 'scheduled-qa.yml')!;
  assert.ok(/curl -fsS http:\/\/127\.0\.0\.1:4173\//.test(scheduled.body), 'it must poll the preview until it answers');
  assert.ok(/PREVIEW_DID_NOT_START/.test(scheduled.body), 'and fail by name when it never does');
  assert.equal(/sleep 30\b|sleep 60\b/.test(scheduled.body), false, 'no blind fixed wait for the server');
});

test('a scheduled gate result is not swallowed', () => {
  const scheduled = workflows.find(w => w.name === 'scheduled-qa.yml')!;
  assert.equal(/continue-on-error/.test(scheduled.body), false, 'a gate result must not be discarded');
  assert.equal(/npm run qa:[a-z-]+[^\n]*\|\| true/.test(scheduled.body), false, 'nor run with its result thrown away');
  // ورفعُ اللقطات عند الفشل وحده — لا يُغيّر النتيجة، ويُبقي الدليل.
  assert.ok(/if: failure\(\)/.test(scheduled.body), 'evidence must be kept when a gate fails');
});
