import test from 'node:test';
import assert from 'node:assert/strict';

import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/data/seed-data';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import type { Category, Participant } from '../src/types';
import { CANONICAL_READINGS } from '../src/lib/canonical-readings';
import { readingContextOf, buildCandidatePool, categoryRepeatPolicy, planAllocation } from '../src/lib/scope-engine';
import { QuestionAllocationEngine } from '../src/lib/question-engine';
import { generateFairDraw, verifyFairDrawSelection } from '../src/lib/fairdraw';
import { fullQuranScope, scopeFromJuz } from '../src/lib/quran-scope';
import { freezeReadingContext, readingContextForRawi, assertContextMatchesFrozen, ReadingContextError } from '../src/lib/reading-context';
import { audioProfileForReading, LISTEN_BUTTON_LABEL_AR } from '../src/lib/global-hafs-audio';
import { isReadingQuestionSafe } from '../src/lib/quran-locus-crosswalk';
import { detectContradictions } from '../src/lib/policy-compiler';

/*
 * المسار الحقيقي كما يجري يوم المسابقة، لكلّ رواية من العشرين:
 *
 *   فئة (روايتها) → متسابق يرثها → سياق قراءة مشتقّ → نطاق → بنك مواضع → قرعة → جلسة مقفلة
 *
 * ولا خطوة فيه يختار فيها المحكّم الرواية. الاختبار يمرّ بالسلسلة كاملةً ويتحقّق في كل
 * مفصلٍ أن الهوية هي هي، وأن حمولةً مزوَّرة تحاول تبديلها تُرفض لا تُقبل.
 */

const policy = getCompetitionPolicy(SEED_COMPETITION);
const scope = scopeFromJuz([30]);

function categoryFor(riwaya: string, id: string): Category {
  return {
    id, competitionId: SEED_COMPETITION.id, code: id.toUpperCase(), name: 'Category', nameArabic: 'فئة',
    description: '', riwaya, memorizationScope: 'جزء واحد', juzCount: 1,
    targetParticipants: 40, targetDurationMinutes: 8, questionsCount: 3,
    scope, scopeMode: 'fixed', scopeVersion: 1,
  } as Category;
}

/** المتسابق يرث رواية فئته عند التسجيل — لا تُكتب له يدويًا في الجلسة. */
function participantIn(category: Category, id: string): Participant {
  return { ...SEED_PARTICIPANTS[0], id, code: id.toUpperCase(), categoryId: category.id, riwaya: category.riwaya };
}

function poolFor(category: Category, participant: Participant) {
  const reading = readingContextOf({ riwaya: participant.riwaya });
  return buildCandidatePool({ scope, category, reading }).map(c => ({
    id: c.id, surahNumber: c.surahNumber, surahNameArabic: 'سورة', surahNameEnglish: 'Surah',
    startAyah: c.startAyah, endAyah: c.endAyah, juzNumber: c.juzNumber || 1,
    riwaya: participant.riwaya, expectedTextArabic: 'نص الرواية', difficultyRating: c.difficultyRating,
    mutashabihatDensity: 'none' as const, tajweedComplexity: 'intermediate' as const, timesUsed: 0,
  }));
}

for (const reading of CANONICAL_READINGS) {
  const { rawiId, qiraahId, labelArabic } = reading;

  test(`[${rawiId}] the reading travels from the category to the draw without anyone choosing it`, async () => {
    const category = categoryFor(labelArabic, `cat-${rawiId}`);
    const participant = participantIn(category, `part-${rawiId}`);

    // ١) السياق مشتقٌّ من تسجيل المتسابق، لا مُرسَلٌ من شاشة.
    const context = readingContextOf({ riwaya: participant.riwaya });
    assert.equal(context.rawiId, rawiId, `${labelArabic} resolves to ${rawiId}`);
    assert.equal(context.qiraahId, qiraahId);

    // ٢) بنك المواضع مبنيٌّ لهذه الرواية وحدها.
    const pool = poolFor(category, participant);
    assert.ok(pool.length > 0, `${rawiId} has a candidate pool inside the category scope`);
    for (const item of pool) assert.equal(item.riwaya, labelArabic, 'every pool item carries the participant reading');

    // ٣) القرعة حتمية داخل النطاق، ومقروءة من السياق نفسه.
    const scoped = () => ({
      scope, participantScopeVersion: 1, slots: planAllocation({ category, policy, effectiveScope: scope }).slots,
      engine: new QuestionAllocationEngine({ policy: categoryRepeatPolicy(category, policy), seed: `flow:${rawiId}`, defaultTargetDifficulty: policy.questions.targetDifficulty }),
      reading: context, sequencePosition: 0,
    });
    const draw = await generateFairDraw({ pool, participant, policy, scoped: scoped() });
    assert.ok(draw.questions.length > 0, `${rawiId} draws at least one passage`);
    for (const question of draw.questions) assert.equal(question.riwaya, labelArabic, 'the drawn question belongs to the participant reading');

    const verified = await verifyFairDrawSelection({ selection: draw, pool, participant, policy, scoped: scoped() });
    assert.ok(verified.valid, `${rawiId} draw is independently reproducible: ${verified.reason || ''}`);

    // ٤) الجلسة تُقفل على الهوية، ولا تتبدّل بعدها.
    const frozen = freezeReadingContext(readingContextForRawi(rawiId));
    assert.doesNotThrow(() => assertContextMatchesFrozen(frozen, readingContextForRawi(rawiId)));

    // ٥) الصوت حفصٌ للجميع، والنصّ يبقى على روايته.
    const audio = audioProfileForReading(rawiId)!;
    assert.equal(audio.reading, 'hafs');
    assert.equal(LISTEN_BUTTON_LABEL_AR, 'استمع إلى الآية');
    assert.equal(frozen.rawiId, rawiId, 'audio identity never leaks into text identity');
  });

  test(`[${rawiId}] a payload that tries to swap the reading mid-session is refused`, () => {
    const frozen = freezeReadingContext(readingContextForRawi(rawiId));
    for (const other of CANONICAL_READINGS) {
      if (other.rawiId === rawiId) continue;
      // حمولةٌ من شاشة المحكّم تدّعي روايةً أخرى — تُرفض بالرمز لا تُقبل صامتة.
      assert.throws(
        () => assertContextMatchesFrozen(frozen, readingContextOf({ riwaya: other.labelArabic }) as never),
        (e: unknown) => e instanceof ReadingContextError && e.code === 'READING_CONTEXT_FROZEN_MISMATCH',
        `${rawiId} session refuses a ${other.rawiId} payload`,
      );
    }
  });
}

/*
 * الفئة التي لا يُحلّ جسر مواضع روايتها تُمنع قبل الحدث لا أمام المتسابق — ويُسمّى
 * السبب بسورته حتى يعرف المنظّم ما ينقص.
 */
test('a category on a reading with unresolved loci is blocked by the compiler, with its reason', () => {
  const blocked = CANONICAL_READINGS.filter(r => !isReadingQuestionSafe(r.rawiId));
  assert.ok(blocked.length > 0, 'this test is only meaningful while some readings await crosswalk evidence');

  for (const reading of blocked) {
    const competition = { ...SEED_COMPETITION, categories: [categoryFor(reading.labelArabic, `cat-${reading.rawiId}`)] };
    const list = detectContradictions({ competition, quranSources: [], aiValidations: [], availableQualifiedJudges: 99, committeeCount: 1 });
    const crosswalk = list.find(i => /crosswalk/i.test(i.title));
    assert.ok(crosswalk, `${reading.rawiId} must raise a crosswalk finding`);
    assert.equal(crosswalk!.severity, 'BLOCKER');
    assert.match(String(crosswalk!.evidence?.[0] ?? ''), /CROSSWALK_UNRESOLVED_SURAHS:\d+:/);
  }
});

test('every question-safe reading passes the compiler without a crosswalk blocker', () => {
  for (const reading of CANONICAL_READINGS.filter(r => isReadingQuestionSafe(r.rawiId))) {
    const competition = { ...SEED_COMPETITION, categories: [categoryFor(reading.labelArabic, `cat-${reading.rawiId}`)] };
    const list = detectContradictions({ competition, quranSources: [], aiValidations: [], availableQualifiedJudges: 99, committeeCount: 1 });
    assert.ok(!list.some(i => /crosswalk/i.test(i.title)), `${reading.rawiId} must not be blocked on the crosswalk`);
  }
});

test('no reading in the twenty is left without a scope-engine identity', () => {
  assert.equal(CANONICAL_READINGS.length, 20);
  for (const reading of CANONICAL_READINGS) {
    const context = readingContextOf({ riwaya: reading.labelArabic });
    assert.equal(context.rawiId, reading.rawiId);
  }
  // و«الدوري» المجرّدة لا تُحلّ إلى أيّ منهما — لا تخمين.
  assert.deepEqual(readingContextOf({ riwaya: 'الدوري' }), {});
});
