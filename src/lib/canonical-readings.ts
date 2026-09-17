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

/** حالة مسار التسليم لرواية بعينها — وجودُ مسارٍ لا توفّرُ بايتات. */
export type ReadingDeliveryState =
  | 'DELIVERY_MAPPED'  // له مسار تسليم في الجدول — شرطٌ لازم لا كافٍ للتوفّر وقت التشغيل.
  | 'PENDING_SOURCE';  // لا مسار تسليم بعد → لا يُفتح للاختيار.

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
  /**
   * اعتماد اللجنة العلمية لميزان لنطاق القراءات العشرين ومصادرها — قرارٌ إداري
   * منصوص (ثابت). لا يُغني عن اعتماد المصدر المُصدّق لكلّ حزمة (البصمة، مراجعان
   * مستقلّان) الذي يُتحقَّق منه في `canPromoteQuranSource` ووُصف في
   * `QURAN_SOURCE_GOVERNANCE.md`. فهذا نطاقٌ، وذاك حزمة — ولا يُخلط بينهما.
   */
  committeeScopeApproved: boolean;
  /** الصوت لكل الروايات حفصٌ عالمي — هوية الصوت مستقلّة عن هوية النص. */
  globalHafsAudio: boolean;
  /**
   * هل لهذه الرواية مسار تسليم في `DELIVERY_READING_BY_RAWI`؟ هذا وجودُ مسارٍ لا
   * توفّرُ بايتات: قد يعود بنك الأسئلة فارغًا إن غاب النصّ محليًا وفي R2 وعُطّلت
   * المرآة. فليست هذه «جاهزية إنتاج» بذاتها — انظر `readingProductionReady`.
   */
  deliveryMappingPresent: boolean;
  /** حالة مسار التسليم المقروءة. */
  deliveryState: ReadingDeliveryState;
}

function hasDeliveryMapping(rawiId: string): boolean {
  return Object.prototype.hasOwnProperty.call(DELIVERY_READING_BY_RAWI, rawiId);
}

/** يبني صفّ القدرات لرواية واحدة من حالتها الحقيقية (الحقائق المعروفة للسجلّ وحده). */
export function readingCapability(rawiId: string): ReadingCapabilityRow | undefined {
  const reading = CANONICAL_READING_BY_RAWI.get(rawiId);
  if (!reading) return undefined;
  const deliveryMappingPresent = hasDeliveryMapping(rawiId);
  return {
    rawiId: reading.rawiId,
    qiraahId: reading.qiraahId,
    canonicalIdentity: true,
    committeeScopeApproved: true,
    globalHafsAudio: true,
    deliveryMappingPresent,
    deliveryState: deliveryMappingPresent ? 'DELIVERY_MAPPED' : 'PENDING_SOURCE',
  };
}

/** مصفوفة القدرات للعشرين جميعًا — مصدرها الحالة الفعلية، لا رقمٌ ثابت 20/20. */
export function readingCapabilityMatrix(): ReadingCapabilityRow[] {
  return CANONICAL_READINGS.map(r => readingCapability(r.rawiId)!);
}

/** أدلّة الجاهزية المُحقَّقة خارج السجلّ — يحقنها من يملك رؤية التشغيل. */
export interface ReadingReadinessEvidence {
  /** هل تُحقّق فعليًا من توفّر نصّ التسليم وقت التشغيل (جذر محلي/‏R2/‏مرآة)؟ */
  deliveryAvailableAtRuntime: boolean;
  /**
   * هل يوجد سجلّ مصدرٍ مُصدّق مطابق (اعتماد بالبصمة ومراجعَين)؟ `undefined` = غير
   * معلوم للسجلّ فلا يُحتسب مانعًا؛ و`false` = معلومٌ أنه غير مُصدّق فيُمنع.
   */
  sourceCertified?: boolean;
  /**
   * هل يُحلّ إحداثي ميزان القانوني إلى ترقيم هذه الرواية الأصلي في كامل المصحف؟
   *
   * يُحقن من `isReadingQuestionSafe` في الطبقة التي تملك الجسر — والسجلّ لا يستورده
   * لئلّا تنشأ حلقة استيراد. `undefined` = غير معلوم فلا يُحتسب مانعًا، و`false` =
   * معلومٌ أن السحب منها يعطي موضعًا لا وجود له في الرواية فيُمنع.
   */
  locusMappingQuestionSafe?: boolean;
}

export interface ReadingProductionReadiness {
  rawiId: string;
  productionReady: boolean;
  blockers: string[];
}

/**
 * الجاهزية للإنتاج مركّبةٌ من أدلّة لا مُدّعاة: تتطلّب مسار تسليم + توفّرًا فعليًا
 * وقت التشغيل + ألّا يكون المصدر المُصدّق غائبًا صراحةً. بلا دليل التوفّر تبقى غير
 * جاهزة (فشلٌ مغلق)، فلا يعِد السجلّ بما لا يملك التحقّق منه.
 */
export function readingProductionReady(rawiId: string, evidence: ReadingReadinessEvidence): ReadingProductionReadiness {
  const cap = readingCapability(rawiId);
  if (!cap) return { rawiId, productionReady: false, blockers: ['UNKNOWN_READING'] };
  const blockers: string[] = [];
  if (!cap.deliveryMappingPresent) blockers.push('NO_DELIVERY_MAPPING');
  if (!evidence.deliveryAvailableAtRuntime) blockers.push('DELIVERY_TEXT_UNAVAILABLE_AT_RUNTIME');
  if (evidence.sourceCertified === false) blockers.push('SOURCE_NOT_CERTIFIED');
  if (evidence.locusMappingQuestionSafe === false) blockers.push('LOCUS_MAPPING_INCOMPLETE');
  return { rawiId, productionReady: blockers.length === 0, blockers };
}

/**
 * ملخّص صادق للإصدار: يُحسب من الحالة فقط، ويقتصر على ما يعرفه السجلّ وحده.
 * الجاهزية للإنتاج ليست هنا لأنها تتطلّب دليل توفّرٍ وقت التشغيل — تُحسب عبر
 * `readingProductionReadySummary(evidenceByRawi)` بعد حقن الأدلّة.
 */
export interface ReadingReleaseSummary {
  canonicalIdentities: number;      // من أصل 20
  committeeScopeApproved: number;   // من أصل 20 (قرار نطاقٍ إداري، لا اعتماد حزمة)
  deliveryMappings: number;         // الروايات ذات مسار تسليم في الجدول
  globalHafsAudio: number;
  total: number;
  pendingSource: string[];          // معرّفات الرواة بلا مسار تسليم بعد
}

export function readingReleaseSummary(): ReadingReleaseSummary {
  const rows = readingCapabilityMatrix();
  return {
    canonicalIdentities: rows.filter(r => r.canonicalIdentity).length,
    committeeScopeApproved: rows.filter(r => r.committeeScopeApproved).length,
    deliveryMappings: rows.filter(r => r.deliveryMappingPresent).length,
    globalHafsAudio: rows.filter(r => r.globalHafsAudio).length,
    total: rows.length,
    pendingSource: rows.filter(r => !r.deliveryMappingPresent).map(r => r.rawiId),
  };
}

/**
 * عدد الروايات الجاهزة للإنتاج بحسب أدلّةٍ محقونة لكلّ راوٍ. ما لا دليل له يُعدّ
 * غير جاهزٍ (فشلٌ مغلق)، فلا يُحتسب جاهزًا بمجرّد وجود مساره في الجدول.
 */
export function readingProductionReadySummary(evidenceByRawi: Record<string, ReadingReadinessEvidence>): {
  productionReady: number;
  total: number;
  blockedByRawi: Record<string, string[]>;
} {
  const blockedByRawi: Record<string, string[]> = {};
  let productionReady = 0;
  for (const r of CANONICAL_READINGS) {
    const evidence = evidenceByRawi[r.rawiId] ?? { deliveryAvailableAtRuntime: false };
    const res = readingProductionReady(r.rawiId, evidence);
    if (res.productionReady) productionReady++;
    else blockedByRawi[r.rawiId] = res.blockers;
  }
  return { productionReady, total: CANONICAL_READINGS.length, blockedByRawi };
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
