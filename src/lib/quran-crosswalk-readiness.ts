/*
 * جاهزيةُ الروايات للسؤال — للمتصفّح، بلا حمل الأدلّة.
 *
 * كلُّ ما تسأله الواجهةُ عن الجسر ينتهي إلى ملخّصٍ لكلّ رواية: هل تُسحب لها أسئلة؟ وما
 * حاجزُها إن لم تُسحب؟ وعشرون جوابًا لا يتغيّران بين طلبٍ وآخر.
 *
 * لكنّ الجواب كان يُحسب من جدول الأدلّة الكامل، والجدولُ وسيطٌ افتراضيّ في كلّ دالّة —
 * مرجعٌ حيٌّ لا يُهزّ عند البناء. فكانت **٦٧ كِبّي** من أدلّة الحدود تُشحن إلى كلّ
 * متصفّحٍ ليُجاب عن عشرين سؤالًا معروفةِ الجواب سلفًا.
 *
 * فالجوابُ يُحسب مرّةً وقتَ البناء (`npm run quran:crosswalk-coverage`) ويُقرأ من هنا.
 * والأدلّةُ الكاملة تبقى حيث تُستعمل فعلًا: الخادمُ والمولّداتُ والاختبارات.
 *
 * **ولا يُكتب هذا الملخّصُ بيد.** اختبارٌ يعيد حسابه من الأدلّة الكاملة ويقارن صفًّا
 * بصفّ، فلا يُشحن ملخّصٌ يخالف مصدرَه — وملخّصٌ يقول «آمنة» عن روايةٍ ليست كذلك يفتح
 * بابًا للسحب حيث لا يجوز.
 */

import { CANONICAL_READING_BY_RAWI } from './canonical-readings';
import { resolveReadings, resolveReading } from './scientific-core';
import { GENERATED_CROSSWALK_COVERAGE } from './quran-crosswalk-coverage.generated';
import type { CrosswalkCoverage } from './quran-locus-crosswalk';

/** تغطيةُ روايةٍ بعينها، أو `undefined` لهويةٍ لا يعرفها الجدولُ القانوني. */
export function readingCrosswalkCoverage(rawiId: string): CrosswalkCoverage | undefined {
  return GENERATED_CROSSWALK_COVERAGE[rawiId];
}

/** التغطيةُ للعشرين جميعًا — مصدرُ لوحات الجاهزية. */
export function crosswalkReadinessMatrix(): CrosswalkCoverage[] {
  return Object.values(GENERATED_CROSSWALK_COVERAGE);
}

const rawiIdOf = (input: { qiraah?: string; rawi?: string; riwaya?: string } | string) =>
  typeof input === 'string'
    ? (CANONICAL_READING_BY_RAWI.has(input) ? input : resolveReading({ riwaya: input })?.rawiId)
    : resolveReading(input)?.rawiId;

/**
 * هل يجوز سحبُ سؤالٍ لهذه الرواية؟
 *
 * رواية لا تُحلّ هويتها ليست آمنة — ولا يُخمَّن «الدوري»، فهو راويان.
 */
export function isReadingQuestionSafe(input: { qiraah?: string; rawi?: string; riwaya?: string } | string): boolean {
  const rawiId = rawiIdOf(input);
  return rawiId ? readingCrosswalkCoverage(rawiId)?.questionSafe === true : false;
}

/**
 * فئةٌ قد تتيح أكثر من رواية، فالمتسابق يعلن روايته منها. وسلامتُها أن تكون **كلُّ**
 * روايةٍ تتيحها قابلةً للسحب — فلا يُقبل متسابقٌ على واحدةٍ منها ثم لا تبدأ له جلسة.
 */
export function categoryReadingsQuestionSafe(riwaya: string | undefined): boolean {
  const readings = resolveReadings({ riwaya, rawi: riwaya });
  if (!readings.length) return false;
  return readings.every(r => readingCrosswalkCoverage(r.rawiId)?.questionSafe === true);
}

/** الرواياتُ التي تتيحها فئةٌ ولا يكتمل جسرُ مواضعها — بأسمائها، للتقرير والمنع. */
export function categoryUnsafeReadings(riwaya: string | undefined): string[] {
  return resolveReadings({ riwaya, rawi: riwaya })
    .filter(r => readingCrosswalkCoverage(r.rawiId)?.questionSafe !== true)
    .map(r => r.rawiId);
}

/** سببُ المنع مُسمًّى بسوره — للوحة الإدارة وفحص ما قبل الانطلاق والدعم. */
export function readingQuestionBlockers(rawiId: string): string[] {
  const coverage = readingCrosswalkCoverage(rawiId);
  if (!coverage || coverage.questionSafe) return [];
  const head = coverage.surahsRequiringEvidence.slice(0, 6).join('، ');
  const more = coverage.surahsRequiringEvidence.length > 6 ? ` و${coverage.surahsRequiringEvidence.length - 6} غيرها` : '';
  return [`CROSSWALK_UNRESOLVED_SURAHS:${coverage.surahsRequiringEvidence.length}:${head}${more}`];
}
