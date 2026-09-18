import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file: string) => fs.readFileSync(file, 'utf8');

/*
 * عنصرٌ واحد أعرض من شاشة الهاتف يجرّ الوثيقة كلَّها جانبًا.
 *
 * رُئي على الهاتف: الترويسة مزاحة، والتبويبات مقصوصة، والعنوان خارج الإطار — وكأن العطب
 * في كل مكان. والسبب واحد: أربعة أزرارٍ في صفحة النتائج داخل صفٍّ لا يلتفّ ولا ينكمش.
 *
 * وهذا الملف حارسٌ ساكن يقرأ الشيفرة. والحارس الذي يقيس فعلًا هو
 * `scripts/phone-overflow-audit.mjs`: يفتح المنتَج على ٣٩٠px ويسأل المتصفّح عن أعرض ما
 * مرّره. جُرّب بإرجاع العطب فصار أحمر ١٣٤px، ثم بإصلاحه فصار أخضر.
 */

test('the results toolbar stacks on a phone instead of dragging the page sideways', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  const toolbar = overview.slice(overview.indexOf('كشف المتسابقين') - 900, overview.indexOf('كشف الفئات') + 200);

  assert.match(toolbar, /grid w-full grid-cols-2 gap-2 sm:flex/, 'four buttons wrap into a grid on a narrow screen');
  assert.doesNotMatch(toolbar, /className="flex gap-2"><Button variant="outline" disabled=\{sealBusy\}/, 'and no longer sit in a row that cannot wrap');
});

test('the phone-width overflow audit exists, is registered, and fails closed', () => {
  const script = read('scripts/phone-overflow-audit.mjs');
  const pkg = JSON.parse(read('package.json'));

  assert.equal(pkg.scripts['qa:phone-overflow'], 'node scripts/phone-overflow-audit.mjs', 'it is runnable by name');

  /* قياسٌ حقيقي في متصفّح، لا قراءةُ أصناف. */
  assert.match(script, /scrollWidth/, 'it measures what the browser actually scrolled');
  assert.match(script, /width: WIDTH, height: 844/, 'at a phone viewport');

  /*
   * وصمتُه ليس نجاحًا: فحصٌ لم يدخل، أو لم يجد تبويبًا، أو لم يقِس شاشةً واحدة — يفشل.
   * وإلّا مرّ أخضرَ وهو لم ينظر إلى شيء، وهو أسوأ من ألّا يوجد.
   */
  assert.match(script, /لم تُقَس شاشةٌ واحدة/, 'measuring nothing is a failure, not a pass');
  assert.match(script, /مدخل البيئة التجريبية غير موجود/, 'and so is failing to get in');
  assert.match(script, /process\.exitCode = problems\.length \? 1 : 0/, 'and problems set a non-zero exit');
});
