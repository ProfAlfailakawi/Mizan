/*
 * ما تطلبه بوّابةُ نزاهة التسليم من R2.
 *
 * خرجت ستُّ حزمِ نصٍّ من قائمة المطلوب بعد أن صار نصُّ العشرين يُقرأ من أثرٍ مجمَّدٍ في
 * المستودع. وإخراجُ شيءٍ من بوّابةٍ خطيرٌ بطبعه: لو خرج وهو ما زال يُخدَم من R2 لصار
 * الإخراجُ تليينًا لا تصحيحًا.
 *
 * فيُقاس هنا **سببُ الإخراج نفسُه**، لا يُكتب في تعليق: كلُّ حزمةٍ مُخرَجة تُعيَّن إلى
 * أثرٍ محلّيٍّ ويُحمَّل نصُّها من القرص فعلًا. فلو عاد النصُّ يومًا يُجلب من R2 سقط هذا
 * الاختبارُ ووجب ردُّ الحزمة إلى المطلوب.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KFGQPC_REQUIRED_DELIVERY_DATASETS,
  KFGQPC_RETIRED_DELIVERY_DATASETS,
} from '../server/kfgqpc-ingest-core';
import { candidateRawiForDeliveryKey } from '../server/quran-reading-delivery';
import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';

/** معرّفُ حزمة الاستيعاب ← الراوي القانونيّ الذي تخدمه. مطابقةٌ صريحة، لا اشتقاقٌ بالاسم. */
const RETIRED_DATASET_RAWI: Record<string, string> = {
  hafs: 'hafs',
  warsh: 'warsh',
  shubah: 'shubah',
  qalun: 'qalun',
  'duri-data': 'al-duri-abu-amr',
  'susi-data': 'al-susi',
};

test('every retired dataset is retired because its text now loads from disk — measured, not assumed', () => {
  assert.equal(KFGQPC_RETIRED_DELIVERY_DATASETS.length, 6);
  for (const id of KFGQPC_RETIRED_DELIVERY_DATASETS) {
    const rawiId = RETIRED_DATASET_RAWI[id];
    assert.ok(rawiId, `${id}: a retired dataset must name the reading it used to serve`);

    // ١. مسارُ الإنتاج يعيّنها إلى أثرٍ محلّيّ قبل أن يبلغ فرعَ R2.
    assert.equal(candidateRawiForDeliveryKey(rawiId), rawiId,
      `${id}: retired from the R2 gate, yet the delivery path does not route it to a local artifact`);

    // ٢. والأثرُ يُحمَّل فعلًا ويحمل نصًّا — لا مجرّد تعيينٍ في جدول.
    const pkg = loadIslamwebReadingPackage(rawiId);
    assert.ok(pkg.verses.length > 0, `${id}: no verses load from disk for ${rawiId}`);
  }
});

test('the required list is exactly what production still reads from R2', () => {
  /*
   * والمحروسُ ألّا تُخرَج حزمةٌ صامتةً. فالصوتُ والصفحاتُ والتفسيرُ والغريبُ والتجويد
   * تُقرأ من R2 ولا بديلَ لها على القرص — فبقاؤها في المطلوب شرطٌ لا اختيار.
   */
  assert.deepEqual([...KFGQPC_REQUIRED_DELIVERY_DATASETS].sort(), [
    'audio-hafs', 'audio-qalun', 'audio-shubah', 'audio-susi',
    'ghareeb', 'mushaf-pages', 'tafsir', 'tajweed',
  ]);

  // ولا تداخُل: حزمةٌ لا تكون مطلوبةً ومُخرَجةً معًا.
  const required = new Set<string>(KFGQPC_REQUIRED_DELIVERY_DATASETS);
  for (const id of KFGQPC_RETIRED_DELIVERY_DATASETS) {
    assert.equal(required.has(id), false, `${id} cannot be both required and retired`);
  }
});

test('a retired text dataset has no local substitute for audio, pages or tafsir', () => {
  /*
   * الفرقُ الذي يبرّر الإخراج: النصُّ له أثرٌ على القرص، وهذه ليس لها. فلو عُوملت
   * معاملتَه لسقط الصوتُ يومَ المسابقة بلا حارسٍ يسبقه.
   */
  for (const id of ['audio-hafs', 'mushaf-pages', 'tafsir']) {
    assert.equal(candidateRawiForDeliveryKey(id), undefined,
      `${id} must not resolve to a reading artifact — it has no local substitute`);
  }
});
