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
 * مهمٌّ: هذا الملف لا يختلق صفوف جسرٍ لأي رواية. يبدأ الجدول فارغًا — أي تطابقٌ افتراضي
 * (`assumed:true`) — ولا يُقبل صفٌّ غيرُ تطابقي إلا بدليلٍ منصوص. فالصمتُ هنا أصدق من
 * جدولٍ مخمَّن يُقاس عليه متسابق.
 */

import { CANONICAL_READING_BY_RAWI } from './canonical-readings';
import { isValidLocus, type QuranLocus } from './quran-canon';

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

/** نتيجة الانتقال: تُعلن صراحةً هل جاءت من دليلٍ أم من تطابقٍ افتراضي. */
export interface NativeResolution {
  rawiId: string;
  native: { surah: number; ayah?: number; ayahStart?: number; ayahEnd?: number };
  relation: CrosswalkRelation;
  /** true = لا صفَّ دليلٍ لهذا الموضع، فاستُعمل التطابق الافتراضي آيةً بآية. */
  assumed: boolean;
  evidence: string[];
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
   * بلا صفِّ دليلٍ يعود بالتطابق الافتراضي موسومًا `assumed:true`.
   */
  toNative(rawiId: string, canonical: QuranLocus): NativeResolution {
    if (!CANONICAL_READING_BY_RAWI.has(rawiId)) throw new CrosswalkError('CROSSWALK_UNKNOWN_RAWI');
    if (!isValidLocus(canonical)) throw new CrosswalkError('CROSSWALK_CANONICAL_LOCUS_INVALID');
    const row = this.rows.get(keyOf(rawiId, canonical.surah, canonical.ayah));
    if (row) {
      return { rawiId, native: { ...row.native }, relation: row.relation, assumed: false, evidence: [...row.evidence] };
    }
    return {
      rawiId,
      native: { surah: canonical.surah, ayah: canonical.ayah },
      relation: 'EXACT',
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

/**
 * الجسر الافتراضي لميزان: فارغٌ قصدًا. لا يُختلق فيه صفٌّ لأي رواية؛ يُحمَّل من مصادر
 * اللجنة المعتمدة حين تصل، فيصير الانتقال مبنيًّا على دليلٍ لا على افتراض.
 */
export const MIZAN_IDENTITY_CROSSWALK = new QuranCrosswalkTable([], 'mizan-crosswalk-identity-v1');
