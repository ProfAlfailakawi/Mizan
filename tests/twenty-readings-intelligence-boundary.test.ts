import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CANONICAL_READINGS, CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { DELIVERY_READING_BY_RAWI, KFGQPC_DELIVERED_RAWI_IDS, PINNED_DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { QURAN_READINGS, quranReadingDefinition } from '../server/quran-intelligence-policy';

const INTELLIGENCE_SOURCE = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'quran-intelligence.ts'), 'utf8');

/*
 * الجسر المنصوص في `quran-intelligence.ts` هو الطريق الوحيد من مفتاح التسليم إلى معرّف
 * المحرّك. ويُقرأ هنا من المصدر لا يُستورد، لأن تلك الوحدة تستورد firebase فلا تُحمَّل في
 * اختبار عقدة.
 */
function deliveryBridge(): Record<string, string> {
  const table = INTELLIGENCE_SOURCE.match(/const DELIVERY_TO_INTELLIGENCE:Record<string,\{reading:QuranReadingId;sourcePackageId:string\}>=\{([\s\S]*?)\n\};/);
  assert.ok(table, 'the bridge table is present');
  const out: Record<string, string> = {};
  for (const m of table![1].matchAll(/'?([a-z-]+)'?\s*:\s*\{reading:'([a-z-]+)'/g)) out[m[1]] = m[2];
  return out;
}

/*
 * حدُّ القدرة يُقال، لا يُترك غامضًا.
 *
 * محرّك الذكاء القرآني (الوقف، التجويد، تتبّع التلاوة الظلّي) مبنيٌّ على بياناتٍ موثَّقة
 * من مجمع الملك فهد، ولا توجد هذه البيانات إلا لستٍّ من الروايات. وهذا حدٌّ صحيح: لا
 * يُصنع علمُ وقفٍ لروايةٍ لم يصدر لها. لكن الخطر في الحدّ الغامض — أن تُحلّ روايةٌ غير
 * مدعومة إلى أقرب معرّفٍ يشبهها فيُتتبَّع المتسابق على وقفِ روايةٍ ليست روايته.
 *
 * فهذه الاختبارات تثبت شيئين: العشرون كلّها معروفة الهوية، والأربع عشرة غير المدعومة
 * تعود «غير متاحة» صراحةً لا تنزلق إلى واحدةٍ من الستّ.
 */

test('the intelligence engine claims exactly the six readings it has KFGQPC data for', () => {
  assert.equal(QURAN_READINGS.length, 6);
  const ids = QURAN_READINGS.map(r => r.id).sort();
  assert.deepEqual(ids, ['douri-abu-amr', 'hafs', 'qaloun', 'shubah', 'sousi-abu-amr', 'warsh'].sort());
  // وكلٌّ منها مربوطٌ بحزمة مجمعٍ بعينها — لا حزمة مشتركة بين روايتين.
  const packages = QURAN_READINGS.map(r => r.packageId);
  assert.equal(new Set(packages).size, 6);
  for (const p of packages) assert.match(p, /^kfgqpc-/);
});

test('no reading outside those six resolves into the engine, by any spelling', () => {
  const supported = new Set(['hafs', 'warsh', 'shubah', 'qalun', 'al-duri-abu-amr', 'al-susi']);
  for (const reading of CANONICAL_READINGS) {
    if (supported.has(reading.rawiId)) continue;
    for (const spelling of [reading.rawiId, reading.labelArabic, reading.rawiDisplay, DELIVERY_READING_BY_RAWI[reading.rawiId]]) {
      assert.equal(quranReadingDefinition(String(spelling)), undefined,
        `${reading.rawiId} must not resolve into the intelligence engine as "${spelling}"`);
    }
  }
});

test('the twelve pinned readings never borrow a KFGQPC intelligence package', () => {
  const bridge = deliveryBridge();
  for (const rawiId of PINNED_DELIVERED_RAWI_IDS) {
    const key = DELIVERY_READING_BY_RAWI[rawiId];
    assert.equal(bridge[key], undefined, `${rawiId} (${key}) has no engine package of its own`);
    assert.equal(quranReadingDefinition(key), undefined, `${rawiId} (${key}) resolves to nothing in the engine either`);
  }
  // والستّ المدعومة كلّها من الثمانية المُسلَّمة من مرآة المجمع، لا من الأثر المثبَّت.
  for (const definition of QURAN_READINGS) {
    const deliveryKey = Object.entries(bridge).find(([, id]) => id === definition.id)?.[0];
    assert.ok(deliveryKey, `${definition.id} is reachable through the bridge`);
    const rawiId = Object.entries(DELIVERY_READING_BY_RAWI).find(([, key]) => key === deliveryKey)?.[0];
    assert.ok(rawiId, `${deliveryKey} is a real delivery key`);
    assert.ok(KFGQPC_DELIVERED_RAWI_IDS.includes(rawiId!), `${definition.id} comes from the KFGQPC mirror set`);
  }
});

/*
 * الطبقتان تحلّان الاسم بطريقتين: المحرّك بالأسماء البديلة، والجسر بجدولٍ منصوص. ومفاتيح
 * التسليم ليست أسماءً بديلة في المحرّك (`duri-abi-amr` مقابل `douri-abu-amr`)، فتمريرُ
 * مفتاح تسليمٍ إلى مُحلِّل المحرّك يعود بلا شيء. وهذا مقصودٌ ومثبَّت هنا: العبور يكون من
 * الجسر وحده، فلا يظنّ أحدٌ أن أحد المُحلِّلين يقوم مقام الآخر.
 */
test('a delivery key is not an engine alias — the bridge is the only crossing', () => {
  assert.equal(quranReadingDefinition('duri-abi-amr'), undefined);
  assert.equal(quranReadingDefinition('susi-abi-amr'), undefined);
  assert.equal(deliveryBridge()['duri-abi-amr'], 'douri-abu-amr');
  assert.equal(deliveryBridge()['susi-abi-amr'], 'sousi-abu-amr');
});

/*
 * «الدوري» المجرّدة اسمٌ لراويَين. والمحرّك يقبلها اليوم كاسمٍ بديل للدوري عن أبي عمرو —
 * وهو مقبولٌ لأن الدوري عن الكسائي ليس مدعومًا فيه أصلًا، فلا التباس داخل المحرّك. لكن
 * الخطر أن يُضاف الكسائي يومًا ويبقى الاسم المجرّد، فتنقلب الأولوية صامتةً. الاختبار
 * يثبّت الحال: الاسم المجرّد لا يعطي الكسائي أبدًا، والاسم الكامل يفرّق قطعًا.
 */
test('bare al-Duri never yields the Kisai transmission inside the engine', () => {
  const bare = quranReadingDefinition('الدوري');
  assert.notEqual(bare?.id, undefined, 'the engine does resolve the bare name today');
  assert.equal(bare?.qiraah, 'Abu Amr', 'and it resolves to Abu Amr, never Kisai');
  assert.equal(quranReadingDefinition('duri-al-kisai'), undefined);
  assert.equal(quranReadingDefinition('al-duri-kisai'), undefined);
  assert.equal(quranReadingDefinition('أبو الحارث'), undefined);
});

test('the delivery-to-engine bridge is an explicit table, never derived by guessing', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'quran-intelligence.ts'), 'utf8');
  const table = source.match(/const DELIVERY_TO_INTELLIGENCE:Record<string,\{reading:QuranReadingId;sourcePackageId:string\}>=\{([\s\S]*?)\};/);
  assert.ok(table, 'the bridge table is present and explicit');
  const keys = [...table![1].matchAll(/(?:^|\n)\s*'?([a-z-]+)'?\s*:\s*\{reading:/g)].map(m => m[1]);
  assert.equal(keys.length, 6, 'exactly six delivery keys bridge into the engine');
  for (const key of keys) {
    const rawiId = Object.entries(DELIVERY_READING_BY_RAWI).find(([, v]) => v === key)?.[0];
    assert.ok(rawiId, `bridge key ${key} is a real delivery key`);
    assert.ok(KFGQPC_DELIVERED_RAWI_IDS.includes(rawiId!), `${key} belongs to the mirror set`);
  }
  assert.match(source, /return deliveryKey\?DELIVERY_TO_INTELLIGENCE\[deliveryKey\]:undefined/,
    'an unknown delivery key returns undefined rather than a nearest match');
});

test('all twenty identities stay known even where the engine cannot serve them', () => {
  assert.equal(CANONICAL_RAWI_IDS.length, 20);
  const bridge = deliveryBridge();
  const served = CANONICAL_READINGS.filter(r => bridge[DELIVERY_READING_BY_RAWI[r.rawiId] || '']).length;
  assert.equal(served, 6, 'six served, fourteen explicitly unserved — and none of the fourteen is unknown');
});
