/*
 * السجلّ القانوني الواحد للقراءات العشر ورواتها العشرين — مصدر الحقيقة الوحيد.
 *
 * كانت قائمة الروايات تُكتب مرارًا: عشرون في `TEN_QIRAAT_GRAPH`، وثمانية في طبقة التسليم
 * (`DELIVERY_READING_BY_RAWI`)، وستة بهجاءٍ مختلف في محرّك الذكاء (`QuranReadingId`). وكل
 * إضافةٍ في طبقةٍ تترك أختها خلفها، فتُعلَن رواية «بلا مصدر» وهي تعمل، أو يُطابَق راوٍ بحزمة
 * ليست حزمته لاختلاف الهجاء (qalun مقابل qaloun، al-duri-abu-amr مقابل douri-abu-amr).
 *
 * هذا الملف لا ينشئ قائمةً رابعة. هو يشتقّ العشرين من `TEN_QIRAAT_GRAPH` — الرسم القانوني
 * القائم — ويزنها بحالتها الحقيقية المقروءة من الطبقات الأخرى بلا ادّعاء. فما ليس له حزمة
 * تسليم لا يُقال إنه «جاهز للإنتاج»، وما لم تعتمده اللجنة لا يُختم باعتمادها.
 *
 * وحدة طرفية بلا استيرادٍ للطبقات الثقيلة (لا firebase، لا شبكة): تُقرأ في الاختبار والإقلاع
 * معًا دون أثرٍ جانبي. تقاطع الطبقات (الذكاء، الصوت، المصدر المُصدَّق) يُفحص في اختبار الانحراف
 * لا هنا، حتى يبقى السجلّ نقيًّا خفيفًا.
 */

import { TEN_QIRAAT_GRAPH, resolveReading, isDuriAbuAmr, isDuriKisai } from './scientific-core';
import { DELIVERY_READING_BY_RAWI } from './delivered-readings';
import { readingOptions, DEFAULT_READING_VALUE } from './quran-reading-sources';

/** اعتماد اللجنة العلمية لمشروع ميزان — قرارٌ من مالك المشروع واللجنة، لا تصديقٌ من جهةٍ خارجية. */
export const MIZAN_SCIENTIFIC_COMMITTEE_APPROVAL = 'MIZAN_SCIENTIFIC_COMMITTEE_APPROVAL' as const;

/** حالة توفّر حزمة التسليم النصّية لرواية بعينها — تُقرأ لا تُدّعى. */
export type ReadingDeliveryState =
  | 'DELIVERY_READY'   // له حزمة تسليم نصّية فعلية → يصلح لتشغيل مسابقة الآن.
  | 'PENDING_SOURCE';  // معرّفٌ قانونيًا لكن حزمته النصّية لم تصل بعد → لا يُفتح للاختيار.

export interface CanonicalReading {
  /** المعرّف القانوني الوحيد للرواية = `rawiId` كما في `TEN_QIRAAT_GRAPH`. */
  rawiId: string;
  /** معرّف القراءة (الإمام) القانوني. */
  qiraahId: string;
  /** اسم الإمام كما في الرسم القانوني. */
  imam: string;
  /** اسم القراءة كما في الرسم القانوني. */
  qiraahDisplay: string;
  /** اسم الراوي كما في الرسم القانوني. */
  rawiDisplay: string;
  /** التسمية العربية المعروضة (نفسها المخزّنة في `category.riwaya`). */
  labelArabic: string;
  labelEnglish: string;
  /** حالة الرسم القانوني لهذا الراوي. */
  graphSourceStatus: 'AVAILABLE_CANDIDATE' | 'PENDING_SCIENTIFIC_SOURCE';
}

/** الروايات العشرون مرتّبة كما في الرسم القانوني، حفصٌ منها راوٍ لعاصم لا استثناء خارجه. */
export const CANONICAL_READINGS: readonly CanonicalReading[] = (() => {
  // التسميات العربية/الإنجليزية تأتي من القائمة الوحيدة القائمة للعرض (`readingOptions`)
  // فلا يُكتب هجاءٌ جديد؛ وتطابقها مع الرسم يُفحص في اختبار الانحراف.
  const labels = new Map(readingOptions().map(o => [o.rawiId, o]));
  return TEN_QIRAAT_GRAPH.map((node): CanonicalReading => {
    const label = labels.get(node.rawiId);
    return {
      rawiId: node.rawiId,
      qiraahId: node.qiraahId,
      imam: node.imam,
      qiraahDisplay: node.qiraah,
      rawiDisplay: node.rawi,
      labelArabic: label?.labelArabic ?? node.rawi,
      labelEnglish: label?.labelEnglish ?? node.rawi,
      graphSourceStatus: node.sourceStatus,
    };
  });
})();

/** خريطة سريعة `rawiId` → الرواية القانونية. */
export const CANONICAL_READING_BY_RAWI: ReadonlyMap<string, CanonicalReading> = new Map(
  CANONICAL_READINGS.map(r => [r.rawiId, r]),
);

/** كل معرّفات الرواة القانونية (العشرون). */
export const CANONICAL_RAWI_IDS: readonly string[] = CANONICAL_READINGS.map(r => r.rawiId);

/**
 * مصفوفة القدرات لكل رواية — كلٌّ مستقلّ، لا رايةٌ واحدة اسمها «جاهز».
 * كل حقلٍ محسوبٌ من حالةٍ فعلية أو من قرارٍ منصوصٍ للجنة، لا من تفاؤل.
 */
export interface ReadingCapabilityRow {
  rawiId: string;
  qiraahId: string;
  /** هوية قانونية ثابتة في الرسم — صحيحة للعشرين جميعًا. */
  canonicalIdentity: boolean;
  /** اعتماد اللجنة العلمية لميزان للمصادر والروايات — قرارٌ منصوص للعشرين. */
  committeeApproved: boolean;
  /** هل توجد حزمة تسليم نصّية فعلية لهذه الرواية؟ (مقروءة من طبقة التسليم) */
  deliveryPackageAvailable: boolean;
  /** الصوت لكل الروايات حفصٌ عالمي — هوية الصوت مستقلّة عن هوية النص. */
  globalHafsAudio: boolean;
  /** حالة التسليم المقروءة. */
  deliveryState: ReadingDeliveryState;
  /**
   * جاهزٌ لتشغيل مسابقة = له حزمة تسليم نصّية. لا يُرفع هذا العلم بغير حزمة،
   * فالعرضُ وعدٌ لا يجوز إخلافه يوم المسابقة.
   */
  productionReady: boolean;
}

/** يبني صفّ القدرات لرواية واحدة من حالتها الحقيقية. */
export function readingCapability(rawiId: string): ReadingCapabilityRow | undefined {
  const reading = CANONICAL_READING_BY_RAWI.get(rawiId);
  if (!reading) return undefined;
  const deliveryPackageAvailable = Object.prototype.hasOwnProperty.call(DELIVERY_READING_BY_RAWI, rawiId);
  return {
    rawiId: reading.rawiId,
    qiraahId: reading.qiraahId,
    canonicalIdentity: true,
    committeeApproved: true,
    deliveryPackageAvailable,
    globalHafsAudio: true,
    deliveryState: deliveryPackageAvailable ? 'DELIVERY_READY' : 'PENDING_SOURCE',
    productionReady: deliveryPackageAvailable,
  };
}

/** مصفوفة القدرات للعشرين جميعًا — مصدرها الحالة الفعلية، لا رقمٌ ثابت 20/20. */
export function readingCapabilityMatrix(): ReadingCapabilityRow[] {
  return CANONICAL_READINGS.map(r => readingCapability(r.rawiId)!);
}

/** ملخّص صادق للإصدار: يُحسب من الحالة، فلا يطبع 20/20 إلا إن كانت 20 فعلًا. */
export interface ReadingReleaseSummary {
  canonicalIdentities: number;      // من أصل 20
  committeeApproved: number;        // من أصل 20
  deliveryPackages: number;         // الروايات ذات حزمة تسليم نصّية
  productionReady: number;
  globalHafsAudio: number;
  total: number;
  pendingSource: string[];          // معرّفات الرواة التي لم تصل حزمتها بعد
}

export function readingReleaseSummary(): ReadingReleaseSummary {
  const rows = readingCapabilityMatrix();
  return {
    canonicalIdentities: rows.filter(r => r.canonicalIdentity).length,
    committeeApproved: rows.filter(r => r.committeeApproved).length,
    deliveryPackages: rows.filter(r => r.deliveryPackageAvailable).length,
    productionReady: rows.filter(r => r.productionReady).length,
    globalHafsAudio: rows.filter(r => r.globalHafsAudio).length,
    total: rows.length,
    pendingSource: rows.filter(r => !r.deliveryPackageAvailable).map(r => r.rawiId),
  };
}

/**
 * حلّ رواية من إدخالٍ حرّ إلى معرّفها القانوني، مع منع التخمين.
 * يعيد المعرّف الواحد إن كان قاطعًا، وإلا `undefined` (فشلٌ مغلق) — لا يخمّن «الدوري».
 */
export function resolveCanonicalRawiId(input: { qiraah?: string; rawi?: string; riwaya?: string }): string | undefined {
  return resolveReading(input)?.rawiId;
}

/** ضمانة صريحة: التفريق بين الدوريَّين لا يُترك للتخمين. */
export const AL_DURI_ABU_AMR = 'al-duri-abu-amr' as const;
export const AL_DURI_KISAI = 'al-duri-kisai' as const;

export { isDuriAbuAmr, isDuriKisai, DEFAULT_READING_VALUE };
