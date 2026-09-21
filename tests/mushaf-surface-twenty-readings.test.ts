import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_READINGS } from '../src/lib/canonical-readings';
import { DELIVERY_READING_BY_RAWI, KFGQPC_DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { resolveReading } from '../src/lib/scientific-core';

/*
 * السطح مكوّن React يستورد firebase، فلا يُحمَّل في اختبار عقدة. لكن منطق اختيار المفتاح
 * فيه سطرٌ واحد معروف، فيُعاد هنا حرفيًّا ويُحرَس نصُّه في الملف — فلا ينحرف أحدهما عن الآخر.
 */
const deliveryReadingKeyFor = (input: { qiraah?: string; rawi?: string; riwaya?: string }): string => {
  const rawiText = input.rawi || input.riwaya;
  const reading = resolveReading({ qiraah: input.qiraah, rawi: rawiText, riwaya: rawiText });
  return DELIVERY_READING_BY_RAWI[reading?.rawiId || ''] || '';
};

const SURFACE = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'judge', 'OfficialMushafSurface.tsx'), 'utf8');
const LIBRARY = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'kfgqpc-library.ts'), 'utf8');

/*
 * سطحُ المصحف هو ما يراه المحكّم. وأخطرُ عطلٍ فيه ليس شاشةً فارغة بل شاشةً تبدو صحيحة
 * وتعرض نصّ روايةٍ أخرى. فهذه الاختبارات تحرس الحدّ: لكل رواية مفتاحها، ولا صفحةَ مصحفٍ
 * مطبوعة تُستعار لروايةٍ لا صفحات في حزمتها، ولا وسمُ سلطةٍ يُكتب ثابتًا.
 */

test('every one of the twenty resolves to its own delivery key on the judge surface', () => {
  const keys = new Map<string, string>();
  for (const reading of CANONICAL_READINGS) {
    const key = deliveryReadingKeyFor({ riwaya: reading.labelArabic });
    assert.ok(key, `${reading.rawiId} must address a delivery package`);
    assert.equal(key, DELIVERY_READING_BY_RAWI[reading.rawiId], `${reading.rawiId} uses the single delivery table`);
    assert.ok(!keys.has(key), `delivery key ${key} is already used by ${keys.get(key)} — two readings would share one package`);
    keys.set(key, reading.rawiId);
  }
  assert.equal(keys.size, 20);
});

test('an unresolvable or ambiguous reading gets no surface at all, never a default one', () => {
  assert.equal(deliveryReadingKeyFor({ riwaya: 'رواية لا وجود لها' }), '');
  assert.equal(deliveryReadingKeyFor({}), '');
  // «الدوري» المجرّدة ملتبسة بين راويَين؛ الجدول الصريح يحسمها لأبي عمرو ولا يخمّن غيره.
  assert.equal(deliveryReadingKeyFor({ riwaya: 'الدوري عن الكسائي' }), 'duri-al-kisai');
  assert.equal(deliveryReadingKeyFor({ riwaya: 'الدوري عن أبي عمرو' }), 'duri-abi-amr');
});

test('a printed Mushaf page is only ever fetched for a package that actually has one', () => {
  // خريطة الصفحات المطبوعة مقصورةٌ على حزم المجمع؛ لا رواية خارجها تأخذ صفحةً ليست لها.
  const map = LIBRARY.match(/const OFFICIAL_MUSHAF_PACKAGE_BY_READING:Record<string,string>=\{([^}]*)\}/);
  assert.ok(map, 'the shared printed-page package map is present');
  assert.match(SURFACE, /officialMushafPackageForReading\(readingKey\)/,
    'the judge surface must resolve printed pages through the shared package map');
  for (const entry of map![1].split(',')) {
    if (!entry.includes(':')) continue;
    assert.match(entry, /'kfgqpc-/, `printed pages may only map to a KFGQPC package: ${entry}`);
  }
  // وبلا معرّف حزمة لا يُطلب أصلُ صفحةٍ أصلًا.
  assert.match(SURFACE, /if\(!packageId\|\|!loci\.length\)\{setChecked\(true\);return\}/,
    'the surface must not request a page master without a package that has one');
  assert.match(SURFACE, /if\(!isKfgqpcPackage\)\{setOfficialFont\(false\)/,
    'the KFGQPC Uthmanic font is not loaded for a package from another publisher');
});

test('the surface still resolves its delivery key exactly the way this test models it', () => {
  assert.match(SURFACE, /const reading=resolveReading\(\{qiraah:input\.qiraah,rawi:rawiText,riwaya:rawiText\}\);/);
  assert.match(SURFACE, /return DELIVERY_READING_BY_RAWI\[reading\?\.rawiId\|\|''\]\|\|DELIVERY_READING_BY_NAME/);
});

test('the source label is read from the delivered passage, not assumed to be KFGQPC', () => {
  assert.match(SURFACE, /const surfaceAuthority=\(q\.officialSurfaceAuthority\|\|delivery\?\.provenance\?\.authority\|\|/,
    'the surface authority comes from the delivery provenance of the reading actually served');
});

test('the eight mirror readings keep the delivery keys they already had', () => {
  const expected: Record<string, string> = {
    hafs: 'hafs', warsh: 'warsh', shubah: 'shubah', qalun: 'qalun',
    'al-duri-abu-amr': 'duri-abi-amr', 'al-susi': 'susi-abi-amr', 'al-bazzi': 'bazzi', qunbul: 'qunbul',
  };
  for (const rawiId of KFGQPC_DELIVERED_RAWI_IDS) {
    assert.equal(DELIVERY_READING_BY_RAWI[rawiId], expected[rawiId], `${rawiId} delivery key is unchanged`);
  }
});
