import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * قواعد Firestore هي الحماية الحقيقية للبيانات — لا إخفاء المفاتيح. وكانت تُنشر يدويًا من
 * جهاز المالك بأمر يُكتب من الذاكرة، فكانت الشيفرة تُنشر وقواعدها لم تُنشر: تعمل المنصّة
 * على قواعد قديمة لا يعلم أحد أنها قديمة.
 */

const pipeline = fs.readFileSync('cloudbuild.yaml', 'utf8');
const firebaseJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));

test('the rules file the pipeline deploys is the one in this repository', () => {
  assert.equal(firebaseJson.firestore?.rules, 'firestore.rules',
    'firebase.json must declare the firestore target, or --only firestore:rules has nothing to match');
  assert.ok(fs.existsSync('firestore.rules'), 'the declared rules file must exist');
  assert.ok(fs.readFileSync('firestore.rules', 'utf8').includes('service cloud.firestore'),
    'and it must actually be a Firestore rules file');
});

test('rules ship with every deploy, not when someone remembers', () => {
  assert.match(pipeline, /firebase-tools@\d+\.\d+\.\d+ deploy --only firestore:rules/,
    'the pipeline must deploy the rules, at a pinned version');
  assert.match(pipeline, /--non-interactive/, 'a prompt in CI is a hang, not a question');
});

test('rules go out before the service that relies on them', () => {
  /* البناء إن فشل لم تُمسّ القواعد، والقواعد إن فشلت لم تُنشر شيفرة تعتمد عليها. */
  const rulesAt = pipeline.indexOf('--only firestore:rules');
  const runDeployAt = pipeline.indexOf("- 'run'");
  const pushAt = pipeline.indexOf("- 'push'");
  assert.ok(rulesAt > 0 && runDeployAt > 0 && pushAt > 0, 'all three stages must exist');
  assert.ok(pushAt < rulesAt, 'a failed image build must not leave the rules changed');
  assert.ok(rulesAt < runDeployAt, 'the service must not go live ahead of its rules');
});

test('the rules step fails loudly and says how to fix the likely cause', () => {
  // خطوةُ أمنٍ تمرّ صامتة عند الفشل أسوأ من غيابها.
  assert.match(pipeline, /exit 1/, 'a failed rules deploy must fail the build');
  assert.match(pipeline, /firebaserules\.admin/, 'and must name the one-time grant that fixes it');
});

test('Cloud Build substitution cannot eat the script', () => {
  /*
   * Cloud Build يستبدل كل `$` قبل أن تصل إلى الصدفة. فمتغيّر صدفة أو `$(...)` هنا لا يصل
   * كما كُتب — إمّا يُفرَّغ أو يُسقط البناء بخطأ استبدال. وحده `$PROJECT_ID` مقصود.
   */
  const step = /- name: 'node:22-slim'[\s\S]*?(?=\n  - name: )/.exec(pipeline)?.[0] || '';
  assert.ok(step, 'the rules step must exist');
  const dollars = step.match(/\$[A-Za-z_(?{][A-Za-z_0-9]*/g) || [];
  assert.deepEqual([...new Set(dollars)], ['$PROJECT_ID'],
    'only the intended Cloud Build substitution may appear in the script');
});

test('the release guidance matches what the pipeline actually does', () => {
  /*
   * كان التحذير يقول «البناء لا ينشرها، شغّلها بيدك» — وصار كذبًا بعد الأتمتة، يدفع
   * المشغّل إلى نشرها خارج الخط فيتجاوز الترتيب الذي وُضع ليحميه. وتوثيقٌ يناقض الخط
   * أسوأ من غياب التوثيق: كلاهما يترك المشغّل بلا هدى، وهذا يعطيه هدًى خاطئًا.
   */
  const preflight = fs.readFileSync('scripts/go-live-preflight.mjs', 'utf8');
  /* الفحص على ما يُطبع للمشغّل لا على النثر الذي يشرح ما تغيّر: التعليق يقتبس التحذير
     القديم ليقول لماذا زال، وذلك ليس تناقضًا. */
  const emitted = preflight.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(emitted, /البناء لا ينشرها/, 'the preflight must not contradict the pipeline');
  // والفحص الآن على بقاء الخطوة، لا على وجود الملف: حذفها لاحقًا يُكشف.
  assert.match(preflight, /--only firestore:rules/, 'the preflight must verify the step still exists');

  const doc = fs.readFileSync('docs/GO-LIVE.md', 'utf8');
  assert.doesNotMatch(doc, /والبناء لا ينشرها/, 'the go-live doc must not send operators to publish out of band');
});

test('a failed service deploy never silently rolls the rules back', () => {
  /*
   * التراجع التلقائي يُعيد قواعد أوسع، وقد يكون التغيير سدّ ثغرة. فالفشل يُترك مرئيًا
   * ويُترك القرار لمن يعرف ماذا غيّر.
   */
  assert.doesNotMatch(pipeline, /rules:release|firestore:rules.*rollback|rollback.*firestore/i,
    'no automatic rules rollback: it can reopen access that was just closed');
  // والشرط الذي يحلّ محلّه مذكور صراحةً، لا متروكًا للفهم.
  assert.match(pipeline, /متوافقًا مع النسخة العاملة/, 'the compatibility requirement must be stated in the pipeline');
});
