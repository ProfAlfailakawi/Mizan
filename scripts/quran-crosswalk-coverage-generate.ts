/*
 * يولّد ملخّصَ تغطية الجسر — عشرون صفًّا يقرؤها المتصفّح بدل ٦٧ كِبّي من الأدلّة.
 *
 * دوالُّ العميل (هل هذه الرواية آمنةٌ للسؤال؟ ما حواجزُها؟) كلُّها تمرّ من
 * `crosswalkCoverage`، وهي تُرجع ملخّصًا لكلّ رواية. لكنّها تحسبه من جدول الأدلّة
 * الكامل، والجدولُ مرجعٌ حيٌّ في وسيطٍ افتراضيّ فلا يُهزّ عند البناء — فيُشحن كاملًا
 * إلى كلّ متصفّح ليُجيب عن عشرين سؤالًا معروفةِ الجواب سلفًا.
 *
 * فالملخّصُ يُحسب هنا مرّةً واحدة **من الأدلّة نفسها**، ويُكتب ملفًّا صغيرًا. ولا يُكتب
 * بيدٍ ولا يُقدَّر: اختبارٌ يعيد حسابَه من الأدلّة الكاملة ويقارن، فلا يمكن أن يُشحن
 * ملخّصٌ يخالف مصدرَه.
 */

import fs from 'node:fs';
import path from 'node:path';

import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { crosswalkCoverage } from '../src/lib/quran-locus-crosswalk';

export const COVERAGE_MODULE_PATH = 'src/lib/quran-crosswalk-coverage.generated.ts';

export function buildCoverageRows() {
  return CANONICAL_RAWI_IDS.map(rawiId => crosswalkCoverage(rawiId));
}

export function renderCoverageModule(rows: ReturnType<typeof buildCoverageRows>) {
  return `/*
 * مُولَّد — لا يُحرَّر بيد. \`npm run quran:crosswalk-coverage\`
 *
 * ملخّصُ تغطية الجسر لكلّ رواية، محسوبٌ من جدول الأدلّة الكامل وقتَ البناء. يقرؤه
 * المتصفّح فلا يحمل الأدلّة نفسها، ويقارنه اختبارٌ بمصدره فلا يفترقان.
 */

import type { CrosswalkCoverage } from './quran-locus-crosswalk';

export const GENERATED_CROSSWALK_COVERAGE: Readonly<Record<string, CrosswalkCoverage>> = Object.freeze(${JSON.stringify(
    Object.fromEntries(rows.map(r => [r.rawiId, r])), null, 2,
  )});

export const GENERATED_CROSSWALK_COVERAGE_RAWI_IDS: readonly string[] = Object.freeze(${JSON.stringify(rows.map(r => r.rawiId))});
`;
}

if (process.argv[1] && process.argv[1].endsWith('quran-crosswalk-coverage-generate.ts')) {
  const rows = buildCoverageRows();
  const target = path.join(process.cwd(), COVERAGE_MODULE_PATH);
  fs.writeFileSync(target, renderCoverageModule(rows));
  const safe = rows.filter(r => r.questionSafe).length;
  console.log(`wrote ${COVERAGE_MODULE_PATH} — ${rows.length} readings, ${safe} question-safe`);
}
