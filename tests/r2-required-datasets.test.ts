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
  KFGQPC_RETIRED_AUDIO_DATASETS,
  KFGQPC_RETIRED_DELIVERY_DATASETS,
  KFGQPC_RETIRED_TEXT_DATASETS,
} from '../server/kfgqpc-ingest-core';
import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { audioProfileForReading } from '../src/lib/global-hafs-audio';
import { candidateRawiForDeliveryKey } from '../server/quran-reading-delivery';
import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { assertResultsReady } from '../scripts/kfgqpc-ingest';

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
  assert.equal(KFGQPC_RETIRED_TEXT_DATASETS.length, 6);
  for (const id of KFGQPC_RETIRED_TEXT_DATASETS) {
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
    'audio-hafs', 'ghareeb', 'mushaf-pages', 'tafsir', 'tajweed',
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

test('the ingest preflight follows the same required list — a retired dataset never blocks publishing', () => {
  /*
   * العطبُ الذي وقع: قُصرت قائمةُ المطلوب في الكتالوج، وبقي `assertResultsReady` يشترط
   * التحقّقَ من **كلّ** حزمة. فتضييقٌ في موضعٍ يُبطله شرطٌ قديمٌ في موضعٍ آخر، ولا
   * يُنشر كتالوجٌ جاهزٌ أبدًا.
   *
   * ويُقاس هنا بالتشغيل لا بقراءة النصّ: تُستدعى الدالّةُ بحالاتٍ حقيقيّة.
   */
  const row = (id: string, status: string) => ({ spec: { id }, status: status as never });
  const allRequiredVerified = [...KFGQPC_REQUIRED_DELIVERY_DATASETS].map(id => row(id, 'VERIFIED'));

  // حزمةٌ مُخرَجةٌ غائبةٌ أو غيرُ مُتحقَّقة لا تمنع النشر.
  assert.doesNotThrow(() => assertResultsReady([...allRequiredVerified, row('hafs', 'UNVERIFIED')]));
  assert.doesNotThrow(() => assertResultsReady(allRequiredVerified));

  // وحزمةٌ مطلوبةٌ غيرُ مُتحقَّقة تمنعه، وتُسمّى.
  assert.throws(() => assertResultsReady([...allRequiredVerified.slice(1), row(KFGQPC_REQUIRED_DELIVERY_DATASETS[0], 'UNVERIFIED')]),
    new RegExp(`VERIFY_NOT_READY:${KFGQPC_REQUIRED_DELIVERY_DATASETS[0]}`));

  /*
   * وحزمةٌ مُخرَجةٌ ليست مهمَلة: غيابُها مقبولٌ لأنّا لا نقرؤها، أمّا بايتاتٌ تخالف
   * بصمتَها فعطبٌ يوقف النشر مهما كانت الحزمة.
   */
  assert.throws(() => assertResultsReady([...allRequiredVerified, row('hafs', 'QUARANTINED')]),
    /RETIRED_DATASET_QUARANTINED:hafs/);

  // والصوتان الاختياريّان يبقيان معاملةً صريحة.
  assert.throws(() => assertResultsReady([...allRequiredVerified, row('audio-warsh', 'QUARANTINED')]),
    /OPTIONAL_AUDIO_STATE_INVALID|RETIRED_DATASET_QUARANTINED/);
  assert.doesNotThrow(() => assertResultsReady([...allRequiredVerified, row('audio-duri', 'UNVERIFIED')]));
});

test('the non-Hafs audio packages are retired because every reading plays the one Hafs profile', () => {
  /*
   * الصوتُ حفصٌ عالميًّا للعشرين — قرارُ منتَجٍ مقصود. فطلبُ تحقُّقٍ من صوت شعبةَ
   * وقالونَ والسوسيِّ طلبُ تحقُّقٍ ممّا لا يُقرأ، كطلبِ تحقُّقٍ من نصٍّ صار على القرص.
   *
   * ويُقاس السببُ نفسُه: العشرون كلُّها تعيد ملفَّ حفصٍ الواحد. فلو صار يومًا لكلّ
   * روايةٍ صوتُها سقط هذا الاختبارُ ووجب ردُّ هذه الحزم إلى المطلوب.
   */
  assert.equal(KFGQPC_RETIRED_AUDIO_DATASETS.length, 3);
  assert.equal(CANONICAL_RAWI_IDS.length, 20);

  const profiles = new Set<string>();
  for (const rawiId of CANONICAL_RAWI_IDS) {
    const profile = audioProfileForReading(rawiId);
    assert.ok(profile, `${rawiId}: every reading must resolve an audio profile`);
    profiles.add(`${profile.reading}/${profile.reciterId}`);
  }
  assert.equal(profiles.size, 1, `all twenty readings must share one audio profile, found ${[...profiles].join(', ')}`);
  assert.equal([...profiles][0].split('/')[0], 'hafs');

  // وحزمةُ صوت حفصٍ تبقى مطلوبةً — هي الوحيدةُ التي تُقرأ.
  assert.ok([...KFGQPC_REQUIRED_DELIVERY_DATASETS].includes('audio-hafs'));
  for (const id of KFGQPC_RETIRED_AUDIO_DATASETS) {
    assert.equal([...KFGQPC_REQUIRED_DELIVERY_DATASETS].includes(id as never), false, `${id} must not be required`);
  }
});
