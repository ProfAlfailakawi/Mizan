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

test('"nothing uploaded" and "this layout is unused" are two verdicts, not one', () => {
  /*
   * الجردُ القرائيّ للدلو ردّ حقيقةً تنفي التشخيصَ السابق: `quran/` خالية تمامًا،
   * و«delivery/» فيها ٧٤٧٢ كائنًا. فقولُ «شغّل الرفع» لمن أمامه مئاتُ الميجابايتات
   * مرفوعةً تحت مفتاحٍ آخر يُرسله إلى غير العطل — وهو نفسُ الخطأ مرّةً ثالثة.
   *
   * والفرقُ عملان مختلفان: الأوّلُ يُشغَّل له رفع، والثاني قرارُ مالكٍ في أيِّ
   * التخطيطين هو التخطيط.
   */
  assert.ok(SCRIPT.includes('R2_QURAN_PACKAGES_PREFIX_UNUSED'),
    'a bucket full under another prefix is not an upload that has not run');
  // ولا يُخمَّن أيُّهما: يُسأل التخزينُ بطلبين محدودين قبل الحكم.
  assert.ok(SCRIPT.includes("listObjects('quran/'"), 'it must ask whether the prefix is used at all');
  assert.ok(SCRIPT.includes("listObjects(''"), 'and whether the bucket is empty or merely organised elsewhere');
  assert.ok(SCRIPT.indexOf("listObjects('quran/'") < SCRIPT.indexOf('R2_QURAN_PACKAGES_PREFIX_UNUSED'),
    'the verdict must follow the evidence, not precede it');
});

test('the unused-layout verdict blocks the release and names the decision, without making it', () => {
  const block = SCRIPT.slice(SCRIPT.indexOf('R2_QURAN_PACKAGES_PREFIX_UNUSED'));
  assert.ok(/process\.exit\(1\)/.test(block.slice(0, 1400)), 'it is a blocker, not a note');
  // والقرارُ يُعرض ولا يُتّخذ: بناءُ ناشرٍ أو اعتمادُ الموجود — كلاهما قرارُ مالك.
  assert.ok(/قرارُ مالكٍ لا إصلاحُ سكربت/.test(block), 'the script must not pick a layout on its own');
});

test('no reading-id mapping is invented to bridge the two layouts', () => {
  /*
   * «الدوري» وحدها ليست معرّفًا، ومعرّفُ روايةٍ في شجرة التسليم ليس بالضرورة معرّفَها
   * القانونيّ. ومطابقةٌ تُكتب هنا لتمرير البوّابة مطابقةٌ مخترعة — وهي من المحظورات.
   */
  assert.equal(/duri-abi-amr|susi-abi-amr/.test(SCRIPT), false,
    'a delivery-tree id must not be hard-coded here as if it were the canonical one');
  assert.equal(/delivery\/quran-data/.test(SCRIPT), false,
    'the verifier must not silently start reading the other tree instead');
  assert.ok(/لا تُسدّ الفجوة بمطابقةٍ مخترعة/.test(SCRIPT),
    'and it must say plainly that the gap is not closed by inventing one');
});

test('the gate verifies the tree the product actually uses, not only the declared one', () => {
  /*
   * حارسٌ على بابٍ ليس في الجدار أسوأ من لا حارس: يبقى أحمرَ أبدًا فيُعتاد تجاهلُه،
   * وتمرّ الشجرةُ الحقيقيّة من تحته بلا تحقّقٍ من أحد. فصار يتحقّق من كتالوج التسليم
   * وحزمِه المطلوبة — وهي ما يقرؤه المنتج فعلًا.
   */
  assert.ok(SCRIPT.includes('verifyDeliveryTree'), 'the live tree must be verified');
  assert.ok(SCRIPT.includes('DELIVERY_CATALOG_KEY'), 'and measured against the catalog the product publishes');
  assert.ok(SCRIPT.includes('deliveryDirectoryDigest'), 'by recomputed digest, not by existence');
  assert.ok(SCRIPT.includes('requiredDatasetVerdicts'), 'over the required datasets the product itself declares');
  // ولا يُخلط الاكتمالُ بالنزاهة مرّةً أخرى: العشرون شأنُ مصفوفة الإصدار لا شأنُ هذه البوّابة.
  assert.ok(/quran:release-matrix/.test(SCRIPT),
    'the header must point completeness at the matrix that owns it, so the two are not conflated again');
});

test('the unpublished layout is declared off, never deleted and never silently skipped', () => {
  assert.ok(SCRIPT.includes('packageLayoutMode'), 'the layout must be a declared setting');
  assert.ok(SCRIPT.includes('MIZAN_QURAN_PACKAGE_LAYOUT'), 'named by the variable that turns it on');
  // ويُطبع في كلّ تشغيل: بوّابةٌ صامتةٌ عن حاجزٍ مفتوحٍ تُقرأ شهادةً بأن لا حاجز.
  assert.ok(/ليس قيد الاستعمال/.test(SCRIPT), 'every run must say the layout is not in use');
  assert.ok(/REMAINING-WORK/.test(SCRIPT), 'and point at the open decision');
  // والشيفرةُ باقية: القرار متى اتُّخذ يُشغّلها بمتغيّرٍ واحد، ولا يُعاد كتابتها.
  assert.ok(SCRIPT.includes('verifyPackageLayout'), 'the layout check itself must still exist');
});

test('a delivery failure still fails the run', () => {
  assert.ok(/deliveryFailures\) process\.exit\(1\)/.test(SCRIPT), 'an unsound live tree must block the release');
  assert.equal(/process\.exit\(0\)/.test(SCRIPT), false, 'no path may exit clean on a failure');
});
