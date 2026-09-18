/*
 * بوّابةٌ تنتظر سرًّا لا وجودَ له تُتخطّى إلى الأبد وهي تبدو مضبوطة.
 *
 * `preflight` كانت تشترط `VITE_REQUIRE_AUTH` و`VITE_FIREBASE_API_KEY` و
 * `VITE_FIREBASE_PROJECT_ID` من أسرار المستودع، ولا وجودَ لها هناك — فتُسجَّل «متخطّاة»
 * في كلّ تشغيل، وتُقرأ في كلّ تقرير «محجوبة بإعداد خارجي».
 *
 * **والإعدادُ لم يكن غائبًا.** هو في `substitutions` من `cloudbuild.yaml` منذ البداية،
 * ومنه يُبنى ما يُنشر فعلًا (Vite يُدمج `VITE_*` وقتَ البناء). فكانت البوّابة تنتظر نسخةً
 * ثانيةً من إعدادٍ موجود، ولا أحدَ يضبطها.
 *
 * وهذا صنفُ العطل نفسُه الذي أُغلق في R2: حارسٌ مصوَّبٌ على موضعٍ لا يكتب فيه أحد.
 *
 * ووصلُها بمصدرها لم يُليّنها: هي تحمرّ الآن على الوثائق القانونية — وذلك حاجزٌ حقيقيٌّ
 * مذكورٌ في `docs/REMAINING-WORK.md`، كان مستورًا خلف «متخطّاة».
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const READER = path.join(process.cwd(), 'scripts', 'cloudbuild-substitution.mjs');
const workflow = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'release-gates.yml'), 'utf8');
const cloudbuild = fs.readFileSync(path.join(process.cwd(), 'cloudbuild.yaml'), 'utf8');

const read = (name: string) => execFileSync('node', [READER, name], { encoding: 'utf8' });

test('the production config the gate needs is really in cloudbuild.yaml', () => {
  /*
   * ولو غاب عنها لعادت البوّابة إلى التخطّي الصامت. فيُثبَّت وجودُه هنا: نقلُه إلى مكانٍ
   * آخر يُسقط هذا الفحص بدل أن يُطفئ الحارس بلا أن يلاحظ أحد.
   */
  assert.equal(read('_VITE_REQUIRE_AUTH'), 'true', 'production must force authentication');
  assert.ok(read('_VITE_FIREBASE_PROJECT_ID').length > 0, 'the Firebase project must be named');
  assert.ok(read('_VITE_FIREBASE_API_KEY').length > 0, 'the Firebase web key must be present');
});

test('a name that is not there fails closed — an empty string is never a value', () => {
  /*
   * لو ردّ فراغًا لَـمُرِّر إلى `preflight` فقيل «غير مضبوط» ثم تُخطّيت البوّابة — وهو
   * التخطّي نفسُه بابٍ آخر.
   */
  assert.throws(() => read('_VITE_DOES_NOT_EXIST'), /Command failed|status 1/);
  assert.throws(() => execFileSync('node', [READER], { encoding: 'utf8' }), /Command failed|status 2/);
});

test('it reads the substitutions block, not any line that mentions the name', () => {
  /*
   * أسماءُ البدائل تظهر أيضًا في سطور `--build-arg` بصيغة `${_VITE_...}` ولا تحمل قيمًا.
   * فقراءةٌ بمطابقةٍ عمياء تلتقط السطرَ الخطأ وتُمرّر قيمةً لا معنى لها.
   */
  assert.ok(/--build-arg[\s\S]*?\$\{_VITE_FIREBASE_API_KEY\}/.test(cloudbuild),
    'the file really does mention the name outside the substitutions block');
  assert.equal(read('_VITE_FIREBASE_API_KEY').includes('${'), false, 'the value must not be a placeholder');
  assert.equal(read('_VITE_FIREBASE_PROJECT_ID').includes("'"), false, 'quotes must be stripped');
});

test('the gate sources its config from cloudbuild, and a secret still wins', () => {
  assert.ok(workflow.includes('scripts/cloudbuild-substitution.mjs'),
    'the gate must read the production config instead of waiting for a duplicate of it');
  for (const name of ['VITE_REQUIRE_AUTH:_VITE_REQUIRE_AUTH', 'VITE_FIREBASE_API_KEY:_VITE_FIREBASE_API_KEY',
                      'VITE_FIREBASE_PROJECT_ID:_VITE_FIREBASE_PROJECT_ID']) {
    assert.ok(workflow.includes(name), `${name} must be wired`);
  }
  // والسرُّ — إن ضُبط — يسبق: فالمالك يوجّه البوّابة إلى بيئةٍ أخرى بلا تعديل شيفرة.
  assert.ok(/if \[\[ -z "\$\{!name:-\}" \]\]/.test(workflow), 'a configured secret must take precedence');
});

test('no step prints the values it reads', () => {
  // سجلُّ الدفعة عامٌّ ويبقى. والمطبوعُ اسمٌ ومصدرُه، لا قيمة.
  assert.ok(workflow.includes('مقروءٌ من cloudbuild.yaml'), 'the source is named');
  assert.equal(/echo[^\n]*\$\{?value\}?/.test(workflow), false, 'the value itself must never be echoed');
  assert.equal(/echo[^\n]*\$\{!name\}/.test(workflow), false, 'nor indirectly');
});

test('the reader never builds a pattern out of what it is given', () => {
  /*
   * رصدت CodeQL هنا حقنَ تعبيرٍ نمطيّ (خطورة عالية): كان الاسمُ القادمُ من سطر الأوامر
   * يُركَّب داخل `new RegExp`. والحارسُ على شكل الاسم يمنع الحقنَ فعلًا — لكنّ أمانًا
   * مشروطًا بحارسٍ في موضعٍ آخر يسقط بأوّل تحريرٍ يوسّع ذلك الحارس، ولا يراه من يحرّره.
   *
   * فصارت المطابقةُ نصّيّةً: المدخلُ يُقارَن ولا يُفسَّر، فلا يبقى شيءٌ ليُحقن.
   */
  const reader = fs.readFileSync(READER, 'utf8');
  const live = reader
    .replace(/\/\*[\s\S]*?\*\//g, '')   // الشروحُ تذكر العطلَ المُصلَح، فلا تُحسب شيفرة
    .replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/new RegExp/.test(live), false,
    'a pattern built from an argument is a regular-expression injection, guard or no guard');
  assert.ok(live.includes('startsWith(wanted)'), 'the lookup must compare text literally');
});

test('a name that looks like a pattern is treated as text, not as one', () => {
  // ولو مرّ حرفٌ خاصّ يومًا، فلا مُفسِّرَ يستقبله.
  assert.throws(() => read('_VITE_.*'), /Command failed|status 2/);
});
