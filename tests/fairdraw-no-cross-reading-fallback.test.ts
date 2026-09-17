import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFairDraw } from '../src/lib/fairdraw';
import { DEVELOPMENT_QUESTION_BANK } from '../src/data/development-question-bank';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/data/seed-data';

/*
 * لا سقوطَ بين الروايات — أهمّ ضمانةٍ علمية في القرعة، ولم يكن لها اختبار.
 *
 * القرعة تمنع الاختلاط فعلًا (ترمي FAIRDRAW_READING_SOURCE_MISMATCH حين لا يوجد في البنك
 * موضعٌ من رواية المتسابق)، لكن الضمانة كانت بلا حرس: تعديلٌ لاحق يُحوّل الرميَ إلى
 * «أقربِ موضعٍ متاح» فيُسأل متسابقُ هشام بنصّ حفص، ولا يسقط اختبارٌ واحد.
 *
 * والبنكُ في هذه الفيكستُرة حفصٌ وحده، فهو موضعُ الاختبار الطبيعي: أي رواية أخرى يجب أن
 * تُمنَع لا أن تُخدَم من حفص.
 */

const policy = getCompetitionPolicy(SEED_COMPETITION);
const hafsParticipant = SEED_PARTICIPANTS.find(p => /حفص|hafs/i.test(p.riwaya)) ?? SEED_PARTICIPANTS[0];

test('a participant whose reading is in the pool is served normally', async () => {
  const draw = await generateFairDraw({ pool: DEVELOPMENT_QUESTION_BANK, participant: hafsParticipant, policy });
  assert.ok(draw.questions.length > 0, 'the positive control draws, so the refusals below mean something');
  assert.equal(draw.questions.length, policy.questions.questionsPerParticipant);
});

test('a reading absent from the pool is refused — never served from another reading', async () => {
  // كلٌّ من هؤلاء لا موضعَ له في بنكٍ حفصيّ، فيجب أن يُمنَع صراحةً.
  for (const riwaya of ['هشام عن ابن عامر', 'الدوري عن الكسائي', 'ابن جماز عن أبي جعفر', 'Warsh']) {
    await assert.rejects(
      () => generateFairDraw({ pool: DEVELOPMENT_QUESTION_BANK, participant: { ...hafsParticipant, riwaya }, policy }),
      /FAIRDRAW_READING_SOURCE_MISMATCH/,
      `${riwaya} must be refused, not served from the Hafs pool`,
    );
  }
});

/** يُرجع الخطأ إن رُفض الوعد، و`null` إن نجح — حتى يبقى النوع صريحًا. */
async function rejectionOf(run: () => Promise<unknown>): Promise<Error | null> {
  try { await run(); return null; } catch (e) { return e instanceof Error ? e : new Error(String(e)); }
}

test('a reading mismatch is named as such, not blurred into a generic empty-pool error', async () => {
  // فرقٌ مقصود: «لا موضعَ لروايتك» ليس «البنك فارغ». والخطأ يجب أن يسمّي العائق الحقيقي،
  // وإلا ظنّ المسؤول أن البنك ناقصٌ فأضاف مواضع، والعائقُ أن روايته غير مُسلَّمة.
  const mismatch = await rejectionOf(() => generateFairDraw({
    pool: DEVELOPMENT_QUESTION_BANK, participant: { ...hafsParticipant, riwaya: 'هشام عن ابن عامر' }, policy,
  }));
  assert.ok(mismatch, 'a mismatched reading must reject');
  assert.match(mismatch.message, /FAIRDRAW_READING_SOURCE_MISMATCH/);

  const emptyPool = await rejectionOf(() => generateFairDraw({ pool: [], participant: hafsParticipant, policy }));
  assert.ok(emptyPool, 'an empty pool must reject too');
  // العائقان مختلفان، فلا يُخلط تشخيصُ أحدهما بالآخر.
  assert.notEqual(emptyPool.message, mismatch.message, 'an empty pool and a reading mismatch are different blockers');
});

test('the two Duris are not interchangeable in the draw', async () => {
  // بنكٌ من الدوري عن أبي عمرو لا يخدم متسابق الدوري عن الكسائي، ولو تشابه الاسم المختصر.
  const duriAbuAmrPool = DEVELOPMENT_QUESTION_BANK.map(q => ({ ...q, riwaya: 'الدوري عن أبي عمرو' }));
  await assert.rejects(
    () => generateFairDraw({ pool: duriAbuAmrPool, participant: { ...hafsParticipant, riwaya: 'الدوري عن الكسائي' }, policy }),
    /FAIRDRAW_READING_SOURCE_MISMATCH/,
    'al-Duri an al-Kisai must never be served from an al-Duri an Abi Amr pool',
  );
  // وفي المقابل يُخدَم صاحبُ الرواية نفسها.
  const ok = await generateFairDraw({ pool: duriAbuAmrPool, participant: { ...hafsParticipant, riwaya: 'الدوري عن أبي عمرو' }, policy });
  assert.ok(ok.questions.length > 0);
});
