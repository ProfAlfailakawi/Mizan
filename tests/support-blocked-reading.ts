/*
 * روايةٌ محجوبةٌ مُحاكاة — للاختبار وحده.
 *
 * منذ قرار اللجنة (1 أكتوبر 2026) لم تبقَ روايةٌ محجوبة بجسر المواضع: العشرون كلُّها مُثبَتة.
 * لكنّ حرّاس الحجب (الاستيراد، وتجميع المسابقة، ومخزن الأسئلة، والجاهزية) يجب أن يبقوا
 * مختبَرين — فحارسٌ لا يُختبر لأن لا أحد يمرّ به اليوم يتعطّل صامتًا ويُكتشف يوم يُحتاج.
 *
 * فهذا يضع روايةً حقيقيةً مؤقتًا في حالة «محجوبة» داخل الملخّص المولَّد نفسه الذي تقرؤه تلك
 * الحرّاس، ثم يعيدها كما كانت. فالمسارُ المختبَر هو مسار الإنتاج بعينه، لا نسخةٌ موازية.
 */

import { GENERATED_CROSSWALK_COVERAGE } from '../src/lib/quran-crosswalk-coverage.generated';
import type { CrosswalkCoverage } from '../src/lib/quran-locus-crosswalk';

export function withBlockedReading<T>(rawiId: string, surahs: readonly number[], run: () => T): T {
  const coverage = GENERATED_CROSSWALK_COVERAGE[rawiId] as CrosswalkCoverage | undefined;
  if (!coverage) throw new Error(`UNKNOWN_READING:${rawiId}`);
  const saved = { ...coverage };
  const live = coverage as { -readonly [K in keyof CrosswalkCoverage]: CrosswalkCoverage[K] };
  Object.assign(live, {
    questionSafe: false,
    mappingComplete: false,
    unresolvedLoci: surahs.length * 10,
    resolvedLoci: coverage.canonicalAyahTotal - surahs.length * 10,
    surahsRequiringEvidence: [...surahs],
    blockers: ['SIMULATED_FOR_TEST'],
  });
  try {
    return run();
  } finally {
    Object.assign(live, saved);
  }
}
