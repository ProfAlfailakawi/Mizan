import test from 'node:test';
import assert from 'node:assert/strict';

import { MizanQuranDelivery } from '../server/quran-reading-delivery';
import { KFGQPC_MIRROR_CANDIDATES, QURAN_FULL_TEXT_CANDIDATES } from '../src/lib/quran-candidate-sources';

/*
 * صفحةُ المصحف تصل إلى السطح، أو لا تصل — ولا تُستعار.
 *
 * سطحُ المصحف يعرض الصفحةَ الرسمية حين يجد `loci` في المقطع، ويسقط إلى النصّ حين لا
 * يجدها. وكان يعود فارغًا دائمًا لأن التجميد أسقط موضعَ الآية، فلم تُعرض صفحةٌ قطّ.
 *
 * وهذا الملفّ يمرّ بالمسار العامل نفسِه — `MizanQuranDelivery.passage` كما يستدعيه
 * الخادم — ويقرأ ما خرج منه. لا نصَّ شيفرةٍ يُقرأ هنا.
 */

const delivery = new MizanQuranDelivery({} as NodeJS.ProcessEnv);

const MIRROR_KEYS = KFGQPC_MIRROR_CANDIDATES.map(x => x.deliveryKey);
const ISLAMWEB_KEYS = QURAN_FULL_TEXT_CANDIDATES.filter(x => x.authority === 'ISLAMWEB_DERIVED').map(x => x.deliveryKey);

test('حزمُ المرآة الثماني تُخرج موضعَ الصفحة والسطر لكلّ مقطع', async () => {
  assert.equal(MIRROR_KEYS.length, 8);
  for (const key of MIRROR_KEYS) {
    const passage = await delivery.passage(key, 35, 4, 10);
    assert.ok(passage, `${key}: لم يُسلَّم المقطع أصلًا`);
    assert.ok(passage.loci.length > 0, `${key}: عاد بلا موضع — سطحُ المصحف يسقط إلى النصّ`);
    for (const locus of passage.loci) {
      assert.ok(locus.page >= 1 && locus.page <= 604, `${key}: صفحةٌ خارج المصحف ${locus.page}`);
      assert.ok(locus.lineStart >= 1 && locus.lineEnd >= locus.lineStart, `${key}: أسطرٌ مقلوبة`);
    }
    /* وكلُّ آيةٍ في المقطع تحمل موضعَها هي، لا موضعَ جارتها. */
    for (const ayah of passage.ayat) {
      if (ayah.page === undefined) continue;
      assert.ok(passage.loci.some(l => l.page === ayah.page), `${key}: آيةٌ بصفحةٍ خارج مواضع المقطع`);
    }
  }
});

test('الموضعُ هو ما نشرته الحزمة نفسُها — فاطر ٤ عند حفص ص٤٣٥', async () => {
  const passage = await delivery.passage('hafs', 35, 4, 10);
  assert.ok(passage);
  assert.deepEqual(passage.loci, [{ page: 435, lineStart: 1, lineEnd: 12 }]);
  const first = passage.ayat.find(a => a.ayah === 4);
  assert.equal(first?.page, 435);
  assert.equal(first?.lineStart, 1);
});

test('حزمُ إسلام ويب الاثنتا عشرة تعود بلا موضع — ولا تُعار صفحةُ سواها', async () => {
  assert.equal(ISLAMWEB_KEYS.length, 12);
  for (const key of ISLAMWEB_KEYS) {
    const passage = await delivery.passage(key, 35, 4, 10);
    assert.ok(passage, `${key}: لم يُسلَّم المقطع أصلًا`);
    assert.deepEqual(passage.loci, [], `${key}: ظهر موضعٌ لا تحمله حزمتُه`);
    assert.equal(passage.ayat.every(a => a.page === undefined), true, `${key}: آيةٌ حملت صفحةً مستعارة`);
  }
});

test('مقطعٌ فيه آيةٌ عابرةٌ صفحتين يبقى له موضعُ بقيّة آياته', async () => {
  /* النساء ٤٤ تعبر ٨٥←٨٦ عند ورش. فالمقطعُ حولها لا يفقد موضعَه بسببها. */
  const passage = await delivery.passage('warsh', 4, 43, 46);
  assert.ok(passage);
  assert.ok(passage.loci.length > 0, 'ضاع موضعُ المقطع كلِّه بسبب آيةٍ واحدة');
  const crossing = passage.ayat.find(a => a.ayah === 44);
  assert.equal(crossing?.page, undefined, 'الآيةُ العابرة ادّعت صفحةً واحدة');
});
