/*
 * أنظمة العدّ الأصلية للروايات — حقائق مقروءة من الأثر المثبَّت، لا افتراضات.
 *
 * كان النظام كلّه يفترض ضمنًا أن «الآية ١٠٠ من البقرة» واحدةٌ في كل رواية. وهذا غير صحيح:
 * العدّ الدمشقي يخالف الكوفي في خمسين سورة، والمدني الأول في ستٍّ وأربعين، وعدّا رويس وروح
 * كذلك. فما لم يكن الانتقالُ بين إحداثي ميزان القانوني (الكوفي) وترقيم الرواية الأصلي
 * صريحًا، فُتح البابُ لسؤال متسابقٍ عن موضعٍ لا يبدأ عند حدّ آيةٍ في روايته.
 *
 * الجداول أدناه مستخرجةٌ آليًّا من بايتات الحزم المثبَّتة نفسها (عدّ آيات كل سورة في كل
 * ملف)، ويُثبت اختبارُ الخادم أنها ما زالت تطابق تلك البايتات حرفًا بحرف. فهي ليست جدولًا
 * منقولًا من ذاكرةٍ ولا من مرجعٍ غير مربوطٍ بالأثر الذي نُسلّمه فعلًا.
 *
 * وحدة طرفية نقيّة: أرقامٌ فقط، تُقرأ في المتصفّح والخادم والاختبار بلا تحميل نصٍّ قرآني.
 */

import { QURAN_SURAH_TOTAL, ayahCountOf } from './quran-canon';
import { DELIVERY_COUNT_SYSTEMS } from './quran-delivery-count-evidence.generated';

/**
 * أنظمة العدّ المستعملة في ميزان. `KUFIC` هو عدّ المصحف المدني المعتمد canonical في ميزان،
 * ورويس وروح يفترقان فأُفرد كلٌّ منهما بنظامه بدل حشرهما في «بصري» واحد.
 */
export type QuranNativeCountSystemId =
  | 'KUFIC'
  | 'DIMASHQI'
  | 'MADANI_AWWAL'
  | 'BASRI_YAQUB_RUWAYS'
  | 'BASRI_YAQUB_RAWH'
  /*
   * الثلاثة التالية مقيسةٌ من بايتات حزم مرآة التسليم المثبَّتة، لا مفترَضة. وكان النظام
   * يفترض أن الروايات الثماني المُسلَّمة من المرآة كلَّها كوفيّةُ العدّ — وهو خطأٌ مقيس في
   * ستٍّ منها. واسمُ كلِّ نظامٍ يقول من أين جاء: ما فارق النظام المنشور لا يُسمَّى باسمه.
   */
  | 'MADANI_AKHIR'
  | 'MAKKI_IBN_KATHIR_DELIVERY'
  | 'BASRI_ABU_AMR_DELIVERY';

/** عدد آيات كل سورة (١..١١٤) في كل نظام عدّ — مستخرجٌ من الأثر المثبَّت. */
export const NATIVE_SURAH_AYAH_COUNTS: Record<QuranNativeCountSystemId, readonly number[]> = {
  DIMASHQI: [
    7, 285, 200, 177, 122, 166, 205, 77, 130, 110,
    122, 111, 47, 55, 99, 128, 110, 106, 98, 140,
    111, 74, 119, 64, 77, 227, 94, 88, 69, 60,
    34, 30, 73, 55, 46, 82, 182, 86, 73, 86,
    52, 50, 88, 56, 36, 34, 39, 29, 18, 45,
    60, 49, 61, 55, 78, 99, 28, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 51, 43,
    29, 28, 20, 55, 39, 31, 50, 40, 45, 40,
    29, 19, 36, 23, 22, 17, 19, 26, 30, 20,
    15, 21, 11, 8, 8, 18, 6, 9, 9, 11,
    8, 8, 3, 9, 5, 4, 6, 3, 6, 3,
    5, 5, 5, 7,
  ],
  KUFIC: [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
    123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
    28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
    15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6,
  ],
  MADANI_AWWAL: [
    7, 285, 200, 175, 122, 167, 206, 76, 130, 109,
    122, 111, 44, 54, 99, 128, 110, 105, 98, 134,
    111, 76, 119, 62, 77, 227, 95, 88, 69, 60,
    33, 30, 73, 54, 45, 82, 181, 86, 72, 84,
    53, 50, 89, 56, 36, 34, 39, 29, 18, 45,
    60, 47, 61, 55, 77, 99, 28, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
    30, 28, 20, 56, 39, 31, 50, 40, 45, 41,
    28, 19, 36, 25, 22, 16, 19, 26, 32, 20,
    16, 21, 11, 8, 8, 20, 5, 8, 8, 11,
    10, 8, 3, 9, 5, 5, 6, 3, 6, 3,
    5, 4, 5, 6,
  ],
  BASRI_YAQUB_RUWAYS: [
    7, 287, 200, 175, 123, 166, 205, 76, 130, 109,
    121, 111, 45, 51, 99, 128, 110, 111, 98, 132,
    111, 75, 119, 64, 77, 226, 94, 88, 69, 60,
    34, 29, 73, 54, 45, 82, 181, 85, 72, 82,
    52, 50, 89, 57, 36, 34, 40, 29, 18, 45,
    60, 48, 61, 55, 76, 97, 29, 22, 24, 13,
    14, 11, 11, 18, 11, 12, 30, 52, 51, 44,
    29, 28, 19, 56, 39, 31, 50, 41, 45, 41,
    29, 19, 36, 23, 22, 17, 19, 26, 29, 20,
    15, 21, 11, 8, 8, 19, 5, 9, 9, 11,
    8, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6,
  ],
  BASRI_YAQUB_RAWH: [
    7, 287, 200, 175, 123, 166, 205, 76, 130, 109,
    121, 111, 45, 51, 99, 128, 110, 111, 98, 132,
    111, 75, 119, 64, 77, 226, 94, 88, 69, 60,
    34, 29, 73, 54, 45, 82, 181, 85, 72, 82,
    52, 50, 89, 57, 36, 34, 40, 29, 18, 45,
    60, 48, 61, 55, 76, 97, 29, 22, 24, 13,
    14, 11, 11, 18, 11, 12, 30, 52, 51, 44,
    29, 28, 19, 56, 39, 31, 50, 41, 45, 41,
    29, 19, 36, 25, 22, 17, 19, 26, 29, 20,
    15, 21, 11, 8, 8, 19, 5, 9, 9, 11,
    8, 8, 3, 9, 5, 4, 7, 3, 6, 3,
    5, 4, 5, 6,
  ],
  /*
   * تُحقَن من الأثر المولَّد لا تُكتب يدًا، فلا تنحرف الأرقام هنا عن البايتات المقيسة.
   * ويثبت اختبارٌ أنها ما زالت تطابق `quran-sources/delivery-counts/` حرفًا بحرف.
   */
  ...deliveryMeasuredCounts(),
};

type MeasuredDeliverySystemId = 'MADANI_AKHIR' | 'MAKKI_IBN_KATHIR_DELIVERY' | 'BASRI_ABU_AMR_DELIVERY';

function deliveryMeasuredCounts(): Record<MeasuredDeliverySystemId, readonly number[]> {
  const required: MeasuredDeliverySystemId[] = ['MADANI_AKHIR', 'MAKKI_IBN_KATHIR_DELIVERY', 'BASRI_ABU_AMR_DELIVERY'];
  const out = {} as Record<MeasuredDeliverySystemId, readonly number[]>;
  for (const entry of DELIVERY_COUNT_SYSTEMS) {
    // الكوفي معرَّفٌ أصلًا في الجدول أعلاه؛ القياس يؤكّده ولا يعيد تعريفه.
    if (entry.system === 'KUFIC') continue;
    out[entry.system as MeasuredDeliverySystemId] = entry.perSurahAyahCounts;
  }
  // فشلٌ مغلق عند الإقلاع: نظامٌ مُعلَنٌ بلا أرقامٍ مقيسة خطأُ بناءٍ لا يُمرَّر صامتًا.
  for (const system of required) {
    const counts = out[system];
    if (!counts || counts.length !== QURAN_SURAH_TOTAL) {
      throw new Error(`NATIVE_COUNT_SYSTEM_EVIDENCE_MISSING:${system}`);
    }
  }
  return out;
}

/** مجموع آيات كل نظام عدّ — يُحسب ولا يُكتب يدًا. */
export function nativeTotalAyahs(system: QuranNativeCountSystemId): number {
  return NATIVE_SURAH_AYAH_COUNTS[system].reduce((sum, n) => sum + n, 0);
}

/** عدد آيات سورةٍ بعينها في نظام عدٍّ بعينه. يعود صفرًا لسورةٍ غير صحيحة (فشلٌ مغلق). */
export function nativeAyahCountOf(system: QuranNativeCountSystemId, surah: number): number {
  if (!Number.isInteger(surah) || surah < 1 || surah > QURAN_SURAH_TOTAL) return 0;
  return NATIVE_SURAH_AYAH_COUNTS[system][surah - 1];
}

/**
 * السور التي يخالف فيها نظامُ العدّ الأصلي عدَّ ميزان القانوني. هذه — لا غيرها — هي
 * المواضع التي يلزمها دليلُ جسرٍ صريح قبل أن تصير قابلةً للسؤال.
 */
export function surahsDivergingFromCanonical(system: QuranNativeCountSystemId): number[] {
  const out: number[] = [];
  for (let surah = 1; surah <= QURAN_SURAH_TOTAL; surah++) {
    if (nativeAyahCountOf(system, surah) !== ayahCountOf(surah)) out.push(surah);
  }
  return out;
}

/** هل هذا النظام مطابقٌ للعدّ القانوني في السور كلّها؟ */
export function isIdenticalToCanonicalCount(system: QuranNativeCountSystemId): boolean {
  return surahsDivergingFromCanonical(system).length === 0;
}
