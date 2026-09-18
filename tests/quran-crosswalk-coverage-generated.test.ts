/*
 * الملخّصُ الذي يقرؤه المتصفّح يجب أن يكون **الأدلّةَ نفسها**، محسوبةً مرّةً واحدة.
 *
 * دوالُّ الواجهة تسأل عن عشرين جوابًا معروفةِ الجواب سلفًا (هل تُسحب أسئلةُ هذه الرواية؟)،
 * وكانت تحسبها من جدول الأدلّة الكامل — فتُشحن ٦٧ كِبّي من أدلّة الحدود إلى كلّ متصفّح.
 * فصار الجوابُ يُحسب وقتَ البناء ويُقرأ من ملفٍّ صغير.
 *
 * **وهذا يفتح بابًا لو تُرك:** ملخّصٌ يقول «آمنة» عن روايةٍ لم يكتمل جسرُها يفتح السحبَ
 * حيث لا يجوز — وهو أخطرُ من الحجم الذي وُفِّر. فالملخّصُ يُقارَن هنا بمصدره صفًّا بصفّ،
 * ولو بحرف. وملفٌّ مُولَّد لم يُعَد توليدُه بعد تغيّر الأدلّة يسقط هنا.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { crosswalkCoverage } from '../src/lib/quran-locus-crosswalk';
import {
  GENERATED_CROSSWALK_COVERAGE,
  GENERATED_CROSSWALK_COVERAGE_RAWI_IDS,
} from '../src/lib/quran-crosswalk-coverage.generated';
import {
  categoryReadingsQuestionSafe,
  categoryUnsafeReadings,
  isReadingQuestionSafe,
  readingCrosswalkCoverage,
  readingQuestionBlockers,
} from '../src/lib/quran-crosswalk-readiness';
import { buildCoverageRows, renderCoverageModule, COVERAGE_MODULE_PATH } from '../scripts/quran-crosswalk-coverage-generate';

test('every generated row equals the row computed from the full evidence', () => {
  for (const rawiId of CANONICAL_RAWI_IDS) {
    const live = crosswalkCoverage(rawiId);
    const generated = GENERATED_CROSSWALK_COVERAGE[rawiId];
    assert.ok(generated, `${rawiId} is missing from the generated summary`);
    assert.deepEqual(generated, JSON.parse(JSON.stringify(live)), `${rawiId} drifted from its evidence`);
  }
});

test('the generated file on disk is exactly what the generator produces now', () => {
  /*
   * ملفٌّ مُولَّد يُحرَّر بيدٍ أو يُترك بعد تغيّر الأدلّة يصير ادّعاءً. والمقارنةُ بالبايت
   * تكشف الاثنين.
   */
  const onDisk = fs.readFileSync(path.join(process.cwd(), COVERAGE_MODULE_PATH), 'utf8');
  assert.equal(onDisk, renderCoverageModule(buildCoverageRows()),
    'the generated coverage is stale or hand-edited — run npm run quran:crosswalk-coverage');
});

test('the summary covers all twenty readings and nothing else', () => {
  assert.equal(GENERATED_CROSSWALK_COVERAGE_RAWI_IDS.length, 20);
  assert.deepEqual([...GENERATED_CROSSWALK_COVERAGE_RAWI_IDS].sort(), [...CANONICAL_RAWI_IDS].sort());
});

test('the readiness answers match the live ones, reading by reading', () => {
  for (const rawiId of CANONICAL_RAWI_IDS) {
    assert.equal(isReadingQuestionSafe(rawiId), crosswalkCoverage(rawiId).questionSafe, rawiId);
    assert.deepEqual(readingCrosswalkCoverage(rawiId), JSON.parse(JSON.stringify(crosswalkCoverage(rawiId))), rawiId);
  }
});

test('the five blocked readings are still blocked, by name and with their surahs', () => {
  // عدُّها هنا لا يُغني عن تسميتها: ملخّصٌ يقول «خمسٌ محجوبة» ويخطئ في أيِّها لا يُفيد.
  const blocked = CANONICAL_RAWI_IDS.filter(id => !isReadingQuestionSafe(id));
  assert.deepEqual(blocked.sort(), ['al-bazzi', 'al-duri-abu-amr', 'al-susi', 'qunbul', 'rawh'].sort());
  for (const rawiId of blocked) {
    const blockers = readingQuestionBlockers(rawiId);
    assert.equal(blockers.length, 1, rawiId);
    assert.match(blockers[0], /^CROSSWALK_UNRESOLVED_SURAHS:\d+:/, rawiId);
  }
  for (const rawiId of CANONICAL_RAWI_IDS.filter(id => isReadingQuestionSafe(id))) {
    assert.deepEqual(readingQuestionBlockers(rawiId), [], `${rawiId} is safe and must report no blocker`);
  }
});

test('an unresolvable or unknown reading is never reported safe', () => {
  for (const input of ['', '   ', 'الدوري', 'خلف', 'رواية لا وجود لها', 'not-a-rawi']) {
    assert.equal(isReadingQuestionSafe(input), false, JSON.stringify(input));
    assert.equal(categoryReadingsQuestionSafe(input), false, JSON.stringify(input));
  }
  assert.equal(readingCrosswalkCoverage('not-a-rawi'), undefined);
});

test('a category is safe only when every reading it offers is safe', () => {
  assert.equal(categoryReadingsQuestionSafe('حفص عن عاصم'), true);
  // فئةٌ تجمع روايةً آمنة وأخرى محجوبة ليست آمنة — ولا تُقبل بنصفها.
  assert.equal(categoryReadingsQuestionSafe('حفص عن عاصم / السوسي'), false);
  assert.deepEqual(categoryUnsafeReadings('حفص عن عاصم / السوسي'), ['al-susi']);
  assert.deepEqual(categoryUnsafeReadings('حفص عن عاصم'), []);
});

test('the browser bundle no longer pulls the boundary evidence through this path', () => {
  /*
   * الغرضُ من الفصل كلِّه. واستيرادٌ واحدٌ عائدٌ يُرجع الـ٦٧ كِبّي كلَّها، ولا يظهر ذلك
   * في أيّ اختبارٍ آخر — إنما في حجم الحزمة بعد النشر.
   */
  const readiness = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'quran-crosswalk-readiness.ts'), 'utf8');
  assert.equal(/from '\.\/quran-crosswalk-evidence'/.test(readiness), false,
    'the client module must not import the evidence');
  // نوعٌ فقط من جدول المواضع — يُمحى عند البناء ولا يجرّ شيئًا.
  assert.ok(/import type \{ CrosswalkCoverage \} from '\.\/quran-locus-crosswalk'/.test(readiness),
    'only the type may come from the locus table');

  for (const client of ['delivery-question-pool', 'readiness', 'participant-import', 'policy-compiler', 'quran-reading-capabilities']) {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', `${client}.ts`), 'utf8');
    assert.equal(/^import \{[^}]*\} from '\.\/quran-locus-crosswalk';$/m.test(source), false,
      `${client} must read readiness, not the locus table`);
  }
});
