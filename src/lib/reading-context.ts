/*
 * سياق القراءة — الهوية الواحدة التي تنتقل عبر السلسلة كلّها.
 *
 * الرواية لا تُختار عند المحكّم. تُحدَّد عند التسجيل (المسابقة، الفئة، الرواية) ثم تنتقل
 * تلقائيًا: المتسابق ← الفئة ← الجلسة ← مرشّح السؤال ← القرعة ← المقطع القرآني ← شاشة
 * المحكّم ← الدرجة ← النتيجة. هذا الملف يعرّف تلك الهوية ويحرسها: يُبنى من السجلّ القانوني
 * وحده (لا اسم عرضٍ حرّ)، ويُجمَّد عند قفل الجلسة فلا يتبدّل بعده.
 *
 * وحدة طرفية نقيّة (تُقرأ في المتصفّح والخادم والاختبار): لا شبكة، لا حالة، لا أثر جانبي.
 */

import { CANONICAL_READING_BY_RAWI, resolveCanonicalRawiId, type CanonicalReading } from './canonical-readings';
/*
 * النوعُ الأساس واحد: `ReadingContext` في محرّك الأسئلة، وتقرأه القرعة ومحرّك النطاق
 * والتوأم ومصفوفة النماذج. فلا يُنشأ هنا نوعٌ منافس — بل يُشتقّ منه بتشديد الهوية.
 *
 * واستيرادُ نوعٍ فقط (`import type`) يُمحى عند الترجمة، فلا حلقة استيرادٍ ولا كلفة تشغيل.
 */
import type { ReadingContext as EngineReadingContext } from './question-engine';

/**
 * سياقُ قراءةٍ مُشدَّد: هويةُ القراءة والراوي **إلزامية** لا اختيارية.
 *
 * محرّك الأسئلة يقبل السياق بحقولٍ اختيارية (لأنه يخدم مساراتٍ قديمة)، وسياقُ المتسابق
 * لا يجوز أن يكون ناقص الهوية: موضعٌ بلا راوٍ يُسحب من أي حزمة. فهذا النوع يشدّ الاختياري
 * إلى إلزامي، ويبقى صالحًا للتمرير إلى المحرّك كما هو.
 */
export interface ReadingContext extends EngineReadingContext {
  qiraahId: string;
  rawiId: string;
  /** الطريق — اختياري؛ لا يُخترع إن لم يكن معتمدًا في السجلّ. */
  tariqId?: string;
  /** الوجه — اختياري كسابقه. */
  wajhId?: string;
  /** حزمة المصدر التي يُقرأ منها النص (تُملأ حين تُربط الجلسة بحزمةٍ مُصدّقة). */
  sourcePackageId?: string;
  /** إصدار الحزمة — لإعادة تفسير النتيجة تاريخيًا. */
  packageVersion?: string;
}

export interface FrozenReadingContext extends ReadingContext {
  /** ختمٌ يمنع التبدّل بعد قفل الجلسة. */
  readonly frozen: true;
  readonly frozenAt: string;
}

export class ReadingContextError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'ReadingContextError'; this.code = code; }
}

/**
 * يبني سياق قراءةٍ من معرّف راوٍ قانوني. يفشل مغلقًا إن كان الراوي مجهولًا —
 * لا يخمّن ولا يعود إلى حفص.
 */
export function readingContextForRawi(rawiId: string, extra: Partial<Pick<ReadingContext, 'tariqId' | 'wajhId' | 'sourcePackageId' | 'packageVersion'>> = {}): ReadingContext {
  const reading = CANONICAL_READING_BY_RAWI.get(rawiId);
  if (!reading) throw new ReadingContextError('READING_CONTEXT_UNKNOWN_RAWI');
  return {
    qiraahId: reading.qiraahId,
    rawiId: reading.rawiId,
    ...(extra.tariqId ? { tariqId: extra.tariqId } : {}),
    ...(extra.wajhId ? { wajhId: extra.wajhId } : {}),
    ...(extra.sourcePackageId ? { sourcePackageId: extra.sourcePackageId } : {}),
    ...(extra.packageVersion ? { packageVersion: extra.packageVersion } : {}),
  };
}

/**
 * يبني سياقًا من إدخالٍ حرّ (تسجيل قديم، قيمة `category.riwaya`). يفشل مغلقًا عند الغموض
 * (مثل «الدوري» وحدها) — فلا يُبنى سياقٌ مخمَّن يُقاس عليه متسابق.
 */
export function readingContextFromInput(input: { qiraah?: string; rawi?: string; riwaya?: string }, extra: Partial<Pick<ReadingContext, 'tariqId' | 'wajhId' | 'sourcePackageId' | 'packageVersion'>> = {}): ReadingContext {
  const rawiId = resolveCanonicalRawiId(input);
  if (!rawiId) throw new ReadingContextError('READING_CONTEXT_UNRESOLVED');
  return readingContextForRawi(rawiId, extra);
}

/** الرواية القانونية الموصوفة لسياقٍ ما (للعرض والتقارير). */
export function readingForContext(context: ReadingContext): CanonicalReading | undefined {
  return CANONICAL_READING_BY_RAWI.get(context.rawiId);
}

/** مطابقة سياقين على الهوية العلمية فقط (لا على حزمة المصدر أو الطريق الاختياري). */
export function sameReadingContext(a: ReadingContext, b: ReadingContext): boolean {
  return a.qiraahId === b.qiraahId && a.rawiId === b.rawiId;
}

/**
 * لقطة مجمّدة تُحفظ داخل الجلسة عند قفلها. تُنسخ نسخًا عميقًا فلا يغيّرها تعديلٌ إداري
 * لاحق على المتسابق. المطابقة على الهوية تبقى صحيحة، لكن البايتات لا تُلمس بعد الختم.
 */
export function freezeReadingContext(context: ReadingContext, at: string = new Date().toISOString()): FrozenReadingContext {
  const reading = CANONICAL_READING_BY_RAWI.get(context.rawiId);
  if (!reading) throw new ReadingContextError('READING_CONTEXT_UNKNOWN_RAWI');
  if (context.qiraahId !== reading.qiraahId) throw new ReadingContextError('READING_CONTEXT_QIRAAH_MISMATCH');
  return Object.freeze({
    qiraahId: context.qiraahId,
    rawiId: context.rawiId,
    ...(context.tariqId ? { tariqId: context.tariqId } : {}),
    ...(context.wajhId ? { wajhId: context.wajhId } : {}),
    ...(context.sourcePackageId ? { sourcePackageId: context.sourcePackageId } : {}),
    ...(context.packageVersion ? { packageVersion: context.packageVersion } : {}),
    frozen: true,
    frozenAt: at,
  });
}

/**
 * يتحقّق أن سياقًا مقترحًا لا يخالف لقطةً مجمّدة. الجلسة المقفلة لا تتغيّر روايتها؛
 * أي محاولةٍ لتبديلها بعد القفل تُرفض هنا (READING_CONTEXT_FROZEN_MISMATCH).
 */
export function assertContextMatchesFrozen(frozen: FrozenReadingContext, proposed: ReadingContext): void {
  if (!sameReadingContext(frozen, proposed)) throw new ReadingContextError('READING_CONTEXT_FROZEN_MISMATCH');
}
