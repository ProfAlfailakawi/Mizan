/*
 * جسر المواضع: إحداثي ميزان القانوني ↔ ترقيم الرواية الأصلي.
 *
 * الروايات لا تتطابق آليًا في ترقيم الآيات وحدودها: موضعٌ يُعدّ آيةً في روايةٍ يُوصَل بما
 * قبله في أخرى. وكان النظام يفترض ضمنًا `canonical ayah === native ayah` — افتراضٌ صامت لا
 * يظهر خطؤه إلا حين يُسأل متسابقٌ عن موضعٍ لا يبدأ عند حدّ آيةٍ في روايته.
 *
 * هذا الملف يجعل الافتراض صريحًا ومُدقَّقًا بدل أن يكون مخفيًّا:
 *   - محرّك الأسئلة يعمل على نطاق ميزان القانوني.
 *   - العرض يعمل على تمثيل الرواية الأصلي.
 *   - والانتقال بينهما يمرّ من هنا، ويُعلَن هل هو مبنيٌّ على دليلٍ أم على تطابقٍ افتراضي.
 *
 * مهمٌّ: هذا الملف لا يختلق صفوف جسرٍ لأي رواية. يبدأ جدول الأدلّة فارغًا، ولا يُقبل صفٌّ
 * غيرُ تطابقي إلا بدليلٍ منصوص. فالصمتُ هنا أصدق من جدولٍ مخمَّن يُقاس عليه متسابق.
 *
 * لكنّ الصمت لا يعني التطابق. فراغُ الجدول لا يُقرأ «كل شيء آيةٌ بآية»: يُسأل نظامُ العدّ
 * الأصلي للرواية (`reading-count-systems`) أولًا، وهو مستخرجٌ من بايتات الحزم المثبَّتة.
 * فإن طابق عددُ آيات السورة العدَّ القانوني فالتطابق نتيجةٌ متحقّقة، وإن خالفه — وهو واقعٌ
 * في خمسين سورة من العدّ الدمشقي وستٍّ وأربعين من المدني الأول — فالموضع `UNRESOLVED`
 * حتى يصل دليل، ولا تُسحب منه أسئلة.
 */

import { CANONICAL_READING_BY_RAWI, CANONICAL_RAWI_IDS, resolveCanonicalRawiId } from './canonical-readings';
import { resolveReadings } from './scientific-core';
import { QURAN_SURAH_TOTAL, ayahCountOf, isValidLocus, type QuranLocus } from './quran-canon';
import { countSystemForReading } from './reading-count-systems';
import { nativeAyahCountOf } from './quran-native-count-systems';
import { COMMITTEE_CROSSWALK_ROWS, COMMITTEE_CROSSWALK_VERSION } from './quran-crosswalk-evidence';

/** نوع العلاقة بين الإحداثي القانوني وترقيم الرواية. */
export type CrosswalkRelation =
  | 'EXACT'            // آيةٌ بآية.
  | 'MERGED'           // آياتٌ قانونية تُقرأ آيةً واحدة في الرواية.
  | 'SPLIT'            // آيةٌ قانونية تُقرأ آيتين أو أكثر.
  | 'BOUNDARY_SHIFT';  // الحدّ يتقدّم أو يتأخّر بلا دمجٍ ولا تقسيم.

export interface QuranLocusCrosswalk {
  rawiId: string;
  canonical: { surah: number; ayah: number };
  native: { surah: number; ayah?: number; ayahStart?: number; ayahEnd?: number };
  relation: CrosswalkRelation;
  /** مرجع الدليل — إلزاميٌّ لكل علاقةٍ غير EXACT. */
  evidence: string[];
}

export class CrosswalkError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'CrosswalkError'; this.code = code; }
}

/**
 * درجة توثيق الانتقال. الفرق بين الثالثة والرابعة هو الفرق بين «لا نعلم» و«نعلم أنه مختلف»:
 * الأولى افتراضٌ معلَن قابلٌ للرفع بالفحص، والثانية رفضٌ قاطع لأن عدّ السورة مختلفٌ فعلًا
 * فالتطابق آيةً بآية فيها خطأ مؤكَّد لا احتمالًا.
 */
export type CrosswalkAssurance =
  | 'EVIDENCED_ROW'
  | 'VERIFIED_COUNT_IDENTITY'
  | 'UNVERIFIED_COUNT_IDENTITY'
  | 'UNRESOLVED';

/** نتيجة الانتقال: تُعلن صراحةً هل جاءت من دليلٍ أم من تطابقٍ مُتحقَّق أم لم تُحلّ أصلًا. */
export interface NativeResolution {
  rawiId: string;
  /** `undefined` حين `UNRESOLVED` — لا يُختلق موضعٌ أصلي. */
  native?: { surah: number; ayah?: number; ayahStart?: number; ayahEnd?: number };
  relation: CrosswalkRelation;
  assurance: CrosswalkAssurance;
  /** true = لم يأتِ من صفّ دليلٍ منصوص. */
  assumed: boolean;
  evidence: string[];
  /** سبب عدم الحلّ حين `UNRESOLVED` — قابلٌ للعرض في التقرير. */
  reason?: string;
}

/** يتحقّق من صفّ جسرٍ واحد. يفشل مغلقًا — ولا يقبل دعوى اختلافٍ بلا دليل. */
export function validateCrosswalkRow(row: QuranLocusCrosswalk): void {
  if (!CANONICAL_READING_BY_RAWI.has(row.rawiId)) throw new CrosswalkError('CROSSWALK_UNKNOWN_RAWI');
  if (!isValidLocus({ surah: row.canonical.surah, ayah: row.canonical.ayah } as QuranLocus)) {
    throw new CrosswalkError('CROSSWALK_CANONICAL_LOCUS_INVALID');
  }
  if (!Number.isInteger(row.native.surah) || row.native.surah < 1 || row.native.surah > 114) {
    throw new CrosswalkError('CROSSWALK_NATIVE_SURAH_INVALID');
  }
  const hasSingle = Number.isInteger(row.native.ayah);
  const hasRange = Number.isInteger(row.native.ayahStart) && Number.isInteger(row.native.ayahEnd);
  if (!hasSingle && !hasRange) throw new CrosswalkError('CROSSWALK_NATIVE_TARGET_REQUIRED');
  if (hasRange && row.native.ayahStart! > row.native.ayahEnd!) throw new CrosswalkError('CROSSWALK_NATIVE_RANGE_INVERTED');
  // دعوى الاختلاف تحتاج دليلًا؛ التطابق لا يحتاجه.
  if (row.relation !== 'EXACT' && !row.evidence.filter(e => String(e || '').trim()).length) {
    throw new CrosswalkError('CROSSWALK_EVIDENCE_REQUIRED');
  }
  if (row.relation === 'EXACT' && !hasSingle) throw new CrosswalkError('CROSSWALK_EXACT_REQUIRES_SINGLE_AYAH');
  if (row.relation === 'SPLIT' && !hasRange) throw new CrosswalkError('CROSSWALK_SPLIT_REQUIRES_RANGE');
}

const keyOf = (rawiId: string, surah: number, ayah: number) => `${rawiId}#${surah}:${ayah}`;

/**
 * جدول جسرٍ مُحقَّق لرواياتٍ محدّدة. يُبنى من صفوفٍ مدعومة بدليل؛ وما لا صفَّ له يُحلّ
 * بالتطابق الافتراضي مع إعلان `assumed:true` — فلا يُخلط المعلومُ بالمفترض.
 */
export class QuranCrosswalkTable {
  private readonly rows = new Map<string, QuranLocusCrosswalk>();
  /** إصدار الجسر — يُسجَّل في الجلسة لإعادة تفسير النتيجة تاريخيًا. */
  readonly mappingVersion: string;

  constructor(rows: QuranLocusCrosswalk[] = [], mappingVersion = 'mizan-crosswalk-identity-v1') {
    this.mappingVersion = mappingVersion;
    for (const row of rows) {
      validateCrosswalkRow(row);
      const key = keyOf(row.rawiId, row.canonical.surah, row.canonical.ayah);
      if (this.rows.has(key)) throw new CrosswalkError('CROSSWALK_DUPLICATE_CANONICAL_LOCUS');
      this.rows.set(key, row);
    }
  }

  get size() { return this.rows.size; }

  /** هل لهذا الموضع صفُّ دليلٍ منصوص؟ */
  hasEvidenceFor(rawiId: string, canonical: QuranLocus): boolean {
    return this.rows.has(keyOf(rawiId, canonical.surah, canonical.ayah));
  }

  /**
   * القانوني ← الأصلي. يفشل مغلقًا لراوٍ مجهول أو موضعٍ غير صحيح، ولا يعود إلى روايةٍ أخرى.
   *
   * بلا صفِّ دليلٍ لا يُقفز إلى التطابق: يُسأل نظامُ العدّ الأصلي للرواية أولًا. فإن كان
   * عدد آيات هذه السورة متحقّقًا ومطابقًا للعدّ القانوني، فالتطابق آيةً بآية نتيجةٌ لا
   * افتراض. وإن كان العدّ مختلفًا فعلًا — كخمسين سورة في العدّ الدمشقي — فالنتيجة
   * `UNRESOLVED` بلا موضعٍ أصلي: لا يُسأل متسابقٌ عن موضعٍ لا نعرف أين يقع في روايته.
   */
  toNative(rawiId: string, canonical: QuranLocus): NativeResolution {
    if (!CANONICAL_READING_BY_RAWI.has(rawiId)) throw new CrosswalkError('CROSSWALK_UNKNOWN_RAWI');
    if (!isValidLocus(canonical)) throw new CrosswalkError('CROSSWALK_CANONICAL_LOCUS_INVALID');
    const row = this.rows.get(keyOf(rawiId, canonical.surah, canonical.ayah));
    if (row) {
      return { rawiId, native: { ...row.native }, relation: row.relation, assurance: 'EVIDENCED_ROW', assumed: false, evidence: [...row.evidence] };
    }
    const assurance = surahCountAssurance(rawiId, canonical.surah);
    if (assurance === 'UNRESOLVED') {
      return {
        rawiId,
        relation: 'BOUNDARY_SHIFT',
        assurance,
        assumed: true,
        evidence: [],
        reason: `NATIVE_COUNT_DIVERGES:${canonical.surah}:${ayahCountOf(canonical.surah)}:${nativeSurahCount(rawiId, canonical.surah)}`,
      };
    }
    return {
      rawiId,
      native: { surah: canonical.surah, ayah: canonical.ayah },
      relation: 'EXACT',
      assurance,
      assumed: true,
      evidence: [],
    };
  }

  /**
   * الأصلي ← القانوني، من صفوف الدليل وحدها. يعود `undefined` إن لم يوجد صفٌّ صريح —
   * فالعكسُ لا يُخمَّن، والتطابق الافتراضي لا يُستعمل هنا لأنه قد يخفي دمجًا أو تقسيمًا.
   */
  toCanonicalFromEvidence(rawiId: string, native: { surah: number; ayah: number }): QuranLocus | undefined {
    if (!CANONICAL_READING_BY_RAWI.has(rawiId)) throw new CrosswalkError('CROSSWALK_UNKNOWN_RAWI');
    for (const row of this.rows.values()) {
      if (row.rawiId !== rawiId || row.native.surah !== native.surah) continue;
      const single = row.native.ayah === native.ayah;
      const inRange = row.native.ayahStart !== undefined && row.native.ayahEnd !== undefined
        && native.ayah >= row.native.ayahStart && native.ayah <= row.native.ayahEnd;
      if (single || inRange) return { surah: row.canonical.surah, ayah: row.canonical.ayah };
    }
    return undefined;
  }

  /** صفوف رواية بعينها — للتقارير والتدقيق. */
  rowsFor(rawiId: string): QuranLocusCrosswalk[] {
    return [...this.rows.values()].filter(r => r.rawiId === rawiId);
  }
}

/** عدد آيات سورةٍ في ترقيم الرواية الأصلي، أو `undefined` إن كان النظام غير معلوم. */
function nativeSurahCount(rawiId: string, surah: number): number | undefined {
  const system = countSystemForReading(rawiId);
  if (!system?.system || system.assurance === 'UNVERIFIED') return undefined;
  return nativeAyahCountOf(system.system, surah);
}

/**
 * درجة التوثيق لسورةٍ واحدة بناءً على نظام العدّ وحده (قبل النظر في صفوف الدليل).
 */
export function surahCountAssurance(rawiId: string, surah: number): Exclude<CrosswalkAssurance, 'EVIDENCED_ROW'> {
  const system = countSystemForReading(rawiId);
  if (!system || !system.system || system.assurance === 'UNVERIFIED') return 'UNVERIFIED_COUNT_IDENTITY';
  if (system.assurance === 'CANONICAL_BY_DEFINITION') return 'VERIFIED_COUNT_IDENTITY';
  return nativeAyahCountOf(system.system, surah) === ayahCountOf(surah) ? 'VERIFIED_COUNT_IDENTITY' : 'UNRESOLVED';
}

/** تغطية الجسر لرواية واحدة — تُقرأ في الجاهزية والتقارير ولوحة الإدارة. */
export interface CrosswalkCoverage {
  rawiId: string;
  countSystem?: string;
  countAssurance: string;
  canonicalAyahTotal: number;
  /** مواضع قانونية يُعرف مقابلها الأصلي يقينًا (دليلٌ أو عدٌّ متحقّق مطابق). */
  resolvedLoci: number;
  /** مواضع لا يُعرف مقابلها — بسبب اختلاف عدٍّ متحقّق بلا صفّ دليل. */
  unresolvedLoci: number;
  /** مواضع محلولة بافتراضٍ معلَن لأن ترقيم الحزمة غير مفحوص. */
  assumedLoci: number;
  /** السور التي يلزمها دليلٌ صريح، بأسمائها الرقمية. */
  surahsRequiringEvidence: number[];
  /**
   * هل الجسر مكتملٌ يقينًا لكامل المصحف؟ (لا مجهول ولا مفترض)
   */
  mappingComplete: boolean;
  /**
   * هل يجوز سحبُ سؤالٍ لهذه الرواية؟ الشرط ألّا يوجد موضعٌ **معلومُ الاختلاف** بلا دليل.
   *
   * الفرق عن `mappingComplete` مقصود: رواية لم يُفحص ترقيم حزمتها بعد تبقى على ما كانت
   * عليه (تطابقٌ معلَن) فلا يُكسر ما يعمل اليوم بلا دليلٍ على عطله؛ أمّا رواية ثبت أن
   * عدّها يخالف في سورةٍ فالسحبُ منها خطأٌ مؤكَّد، فيُمنع.
   */
  questionSafe: boolean;
  blockers: string[];
}

/**
 * يحسب التغطية من الحالة الحقيقية لا من عدّاد. ما لم يُحلّ يُسمّى بسورته وسببه، حتى يقرأ
 * الإداري «المؤمنون: العدّ ١١٨ قانونيًّا و١١٩ أصليًّا، ولا صفّ دليل» بدل «غير جاهز».
 */
export function crosswalkCoverage(rawiId: string, table: QuranCrosswalkTable = MIZAN_IDENTITY_CROSSWALK): CrosswalkCoverage {
  if (!CANONICAL_READING_BY_RAWI.has(rawiId)) throw new CrosswalkError('CROSSWALK_UNKNOWN_RAWI');
  const system = countSystemForReading(rawiId);
  let resolved = 0, unresolved = 0, assumed = 0, total = 0;
  const surahsRequiringEvidence: number[] = [];
  for (let surah = 1; surah <= QURAN_SURAH_TOTAL; surah++) {
    const canonicalCount = ayahCountOf(surah);
    total += canonicalCount;
    const base = surahCountAssurance(rawiId, surah);
    if (base === 'VERIFIED_COUNT_IDENTITY') { resolved += canonicalCount; continue; }
    if (base === 'UNVERIFIED_COUNT_IDENTITY') { assumed += canonicalCount; continue; }
    // العدّ مختلف: كل موضعٍ في هذه السورة يحتاج صفَّ دليلٍ خاصًّا به.
    let evidenced = 0;
    for (let ayah = 1; ayah <= canonicalCount; ayah++) {
      if (table.hasEvidenceFor(rawiId, { surah, ayah })) evidenced++;
    }
    resolved += evidenced;
    unresolved += canonicalCount - evidenced;
    if (evidenced < canonicalCount) surahsRequiringEvidence.push(surah);
  }
  const blockers: string[] = [];
  if (unresolved > 0) blockers.push(`CROSSWALK_UNRESOLVED_LOCI:${unresolved}`);
  if (assumed > 0) blockers.push(`CROSSWALK_NATIVE_NUMBERING_UNVERIFIED:${assumed}`);
  return {
    rawiId,
    countSystem: system?.system,
    countAssurance: system?.assurance || 'UNVERIFIED',
    canonicalAyahTotal: total,
    resolvedLoci: resolved,
    unresolvedLoci: unresolved,
    assumedLoci: assumed,
    surahsRequiringEvidence,
    mappingComplete: unresolved === 0 && assumed === 0,
    questionSafe: unresolved === 0,
    blockers,
  };
}

/**
 * هل يجوز سحبُ سؤالٍ لهذه الرواية من إحداثي ميزان القانوني؟
 *
 * يُقرأ من الإدخال الحرّ (قيمة `category.riwaya`) فيحلّ الهوية أولًا. رواية لا تُحلّ هويتها
 * ليست آمنة — لا يُخمَّن «الدوري».
 */
export function isReadingQuestionSafe(input: { qiraah?: string; rawi?: string; riwaya?: string } | string, table: QuranCrosswalkTable = MIZAN_IDENTITY_CROSSWALK): boolean {
  const rawiId = typeof input === 'string'
    ? (CANONICAL_READING_BY_RAWI.has(input) ? input : resolveCanonicalRawiId({ riwaya: input }))
    : resolveCanonicalRawiId(input);
  if (!rawiId) return false;
  return crosswalkCoverage(rawiId, table).questionSafe;
}

/**
 * فئةٌ قد تتيح أكثر من رواية («حفص عن عاصم / ورش / قالون»)، فالمتسابق يعلن روايته منها.
 * وسلامتُها أن تكون **كلُّ** روايةٍ تتيحها قابلةً للسحب — فلا يُقبل متسابقٌ على واحدةٍ
 * منها ثم لا تبدأ له جلسة. وقيمةٌ لا تُحلّ إلى رواية واحدة على الأقل ليست فئةً صالحة.
 */
export function categoryReadingsQuestionSafe(riwaya: string | undefined, table: QuranCrosswalkTable = MIZAN_IDENTITY_CROSSWALK): boolean {
  const readings = resolveReadings({ riwaya, rawi: riwaya });
  if (!readings.length) return false;
  return readings.every(r => crosswalkCoverage(r.rawiId, table).questionSafe);
}

/** الروايات التي تتيحها فئةٌ ولا يكتمل جسر مواضعها — بأسمائها، للتقرير والمنع. */
export function categoryUnsafeReadings(riwaya: string | undefined, table: QuranCrosswalkTable = MIZAN_IDENTITY_CROSSWALK): string[] {
  return resolveReadings({ riwaya, rawi: riwaya })
    .filter(r => !crosswalkCoverage(r.rawiId, table).questionSafe)
    .map(r => r.rawiId);
}

/** سبب المنع مسمّى بسورته — للوحة الإدارة وفحص ما قبل الانطلاق والدعم. */
export function readingQuestionBlockers(rawiId: string, table: QuranCrosswalkTable = MIZAN_IDENTITY_CROSSWALK): string[] {
  const coverage = crosswalkCoverage(rawiId, table);
  if (coverage.questionSafe) return [];
  const head = coverage.surahsRequiringEvidence.slice(0, 6).join('، ');
  const more = coverage.surahsRequiringEvidence.length > 6 ? ` و${coverage.surahsRequiringEvidence.length - 6} غيرها` : '';
  return [`CROSSWALK_UNRESOLVED_SURAHS:${coverage.surahsRequiringEvidence.length}:${head}${more}`];
}

/** التغطية للعشرين جميعًا — مصدر مصفوفة الجاهزية، لا رقمٌ ثابت. */
export function crosswalkCoverageMatrix(table: QuranCrosswalkTable = MIZAN_IDENTITY_CROSSWALK): CrosswalkCoverage[] {
  return CANONICAL_RAWI_IDS.map(rawiId => crosswalkCoverage(rawiId, table));
}

/**
 * جسر ميزان العامل: يُبنى من صفوف اللجنة المعتمدة في `quran-crosswalk-evidence`.
 * وهي فارغةٌ اليوم، فما خالف عدُّه العدَّ القانوني يبقى `UNRESOLVED` — لا مختلَقًا.
 * وبمجرّد وصول الصفوف بمراجعها تنتقل روايتها إلى «جاهزة للسؤال» بلا تعديل منطق.
 */
export const MIZAN_IDENTITY_CROSSWALK = new QuranCrosswalkTable(
  [...COMMITTEE_CROSSWALK_ROWS],
  COMMITTEE_CROSSWALK_VERSION,
);
