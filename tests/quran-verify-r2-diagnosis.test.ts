/*
 * «غائبٌ كلُّه» ليس «فاسدٌ بعضُه».
 *
 * أوّلُ تشغيلٍ للبوّابة بأسرارٍ حقيقية ردّ `MISSING_MANIFEST` للعشرين جميعًا، ثم حكم:
 * «`R2_OBJECT_INTEGRITY_FAILED` — الحزمة غير صالحة للاستعمال العلمي».
 *
 * والحكمُ خاطئ. لم تفسد حزمة؛ لم تُرفع واحدةٌ قطّ. والفرقُ يقرّر مَن يُستدعى ولماذا:
 *
 *   · حزمةٌ **موجودةٌ ببايتاتٍ تخالف المثبَّت** ⇒ كتابةٌ لم تُؤذن. يُحقَّق فيها.
 *   · شجرةٌ **لم تُرفع** ⇒ يُشغَّل رفع.
 *
 * وخلطُهما يُرسل المسؤولَ إلى غير العطل — وهو نفسُ الخطأ الذي أُصلح في القرعة حين كان
 * «بنكٌ فارغ» يُشخَّص «اختلافَ رواية».
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = fs.readFileSync(path.join(process.cwd(), 'scripts', 'quran-verify-r2.ts'), 'utf8');

test('a tree that was never published is named as unpublished, not as corrupted', () => {
  assert.ok(SCRIPT.includes('R2_QURAN_PACKAGES_NOT_PUBLISHED'), 'the empty case needs its own code');
  assert.ok(SCRIPT.includes('missingManifests === readings.length'),
    'it applies only when not one reading is present');
  // وتُذكر الحقيقةُ التي تنفي الشبهة: الاتصالُ نجح، فالعطلُ ليس في الاعتماد.
  assert.ok(/التخزين وصلته الأوامرُ واعتمادُه صحيح/.test(SCRIPT),
    'it must say the credentials worked, so nobody hunts a permissions problem');
  assert.ok(SCRIPT.includes('quranPackageKey(readings[0], version)'),
    'and print the expected key, so the reader knows where the upload belongs');
  /*
   * وبروايةٍ حقيقية لا بقالب: أوّلُ تشغيلٍ طبع `R2_KEY_UNSAFE_SEGMENT` مكانَ السطر
   * المُرشِد، لأن `<rawiId>` مرّت على بانٍ يرفض المحارف غير الآمنة فرمى.
   */
  assert.equal(/quranPackageKey\('<[^']*>'/.test(SCRIPT), false,
    'a placeholder with angle brackets throws in the key builder and swallows the guidance');
});

test('the unpublished case still exits non-zero — it is a release blocker, not a pass', () => {
  const block = SCRIPT.slice(SCRIPT.indexOf('R2_QURAN_PACKAGES_NOT_PUBLISHED') - 400);
  assert.ok(/R2_QURAN_PACKAGES_NOT_PUBLISHED[\s\S]{0,600}?process\.exit\(1\)/.test(block),
    'an empty delivery tree must fail the gate');
});

test('a partly published tree is still an integrity failure, and says how many are simply absent', () => {
  /*
   * الحالةُ المختلطة هي الأخطر: بعضُها مرفوعٌ وبعضُها لا. وقولُ «فاسدة» عن الغائب
   * يُضيّع وقتَ من يبحث عن فساد، وقولُ «غائبة» عن الفاسد يُمرّر بايتاتٍ مخالفة.
   */
  assert.ok(SCRIPT.includes("if (failures) {"), 'the mixed case still fails');
  assert.ok(/ومنها \$\{missingManifests\} روايةً لا بيانَ لها أصلًا/.test(SCRIPT),
    'and reports how many of the failures are absences rather than mismatches');
});

test('the integrity verdict is untouched for packages that are actually present', () => {
  // لم يُليَّن شيء: بايتاتٌ تخالف المثبَّت ما زالت تُسقط البوّابة بالرمز نفسه.
  assert.ok(SCRIPT.includes('R2_OBJECT_INTEGRITY_FAILED'), 'the original verdict must remain');
  assert.ok(SCRIPT.includes('verifyIntegrity(expected'), 'digests are still compared object by object');
  assert.equal(/process\.exit\(0\)/.test(SCRIPT), false, 'no path may exit clean on a failure');
});

test('--deep is what compares bytes; a tag-only run proves less and says so', () => {
  // حزمةٌ موجودةٌ ببايتاتٍ أخرى تمرّ من فحصٍ يقرأ الوسمَ ولا يحسب البصمة.
  assert.ok(SCRIPT.includes('if (deep) {'), 'deep mode must recompute from the bytes');
  assert.ok(SCRIPT.includes("' · وضع البصمة العميقة' : ' · وسم البصمة'"),
    'the summary must say which of the two was run');
});
