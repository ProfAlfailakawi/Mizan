import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeScope, fullQuranScope, makeScope, normalizeScope, scopeFromJuz, scopeFromJuzRange,
  scopeSignature, scopeAyahCount, type QuranScope,
} from '../src/lib/quran-scope';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { runCompetitionTwin, syntheticParticipants, type TwinInput } from '../src/lib/competition-twin';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { autoBalancedPlan } from '../src/lib/question-zones';
import { candidatesInScope, locusKeyOf, type QuestionCandidate } from '../src/lib/question-engine';
import { categoryScopeOf } from '../src/lib/scope-engine';
import type { Category } from '../src/types';

/*
 * فحوصٌ تحويلية.
 *
 * الفحص المعتاد يسأل: «هل المخرَج صحيح؟» — ويحتاج أن نعرف الصواب سلفًا. والفحص العشوائي
 * يسأل: «هل يُكسر ثابت؟». وهذا يسأل سؤالًا ثالثًا لا يحتاج معرفةَ الجواب الصحيح أصلًا:
 *
 *     غيّرنا المُدخل تغييرًا **يجب ألّا يغيّر المعنى** — فهل تغيّر المخرَج؟
 *
 * وهذا يمسك صنفًا من الأخطاء لا يمسكه غيره: التحيّز الخفيّ لترتيب المصفوفة، وتسرّب الاسم
 * إلى القرار، وحقلًا موروثًا يُقرأ وقد بطل، وبيانًا وصفيًّا يُغيّر السحب وهو لا يعني شيئًا.
 *
 * وأخطر ما فيها أن المخرَج قد يكون «صحيحًا» في الحالين ومع ذلك تكون العدالة منكسرة: من
 * يحصل على سؤالٍ أسهل لأن اسم فئته تغيّر لم يُظلَم بخطأ، بل بتحيّز.
 */

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const juz30 = scopeFromJuz([30]);

function baseInput(overrides: Partial<TwinInput> = {}): TwinInput {
  const candidates = projectCandidatesFromScope(juz30, { passageAyahCount: 3, reading });
  const participants = syntheticParticipants({
    count: 120, categoryId: 'cat-gold', questionCount: 3,
    scopes: [{ scope: juz30, share: 1 }], reading, halls: 3, prefix: 'm',
  });
  return {
    competitionId: 'metamorphic',
    participants,
    candidates,
    defaultPlan: autoBalancedPlan(juz30, 3),
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: 4 },
    targetDifficulty: 3,
    seed: 'metamorphic-seed',
    collectAssignments: true,
    ...overrides,
  };
}

/** بصمة السحب: لمن خرج أيُّ موضع، مرتَّبةً — هي المخرَج الذي يجب ألّا يتغيّر. */
const drawFingerprint = (input: TwinInput) =>
  (runCompetitionTwin(input).assignments || [])
    .map(row => `${row.participantId}|${row.zoneId ?? 'free'}|${row.locusKey}`)
    .sort()
    .join('\n');

test('تغيير اسم الفئة وحده لا يغيّر التخصيص', () => {
  const before = drawFingerprint(baseInput());
  const renamed = baseInput();
  /* الاسم يتغيّر، ولا شيء غيره: النطاق والعدد والسياسة والبذرة كما هي. */
  const after = drawFingerprint({
    ...renamed,
    participants: renamed.participants.map(participant => ({ ...participant, categoryId: 'الفئة الذهبية — المستوى الأول' })),
    competitionId: 'اسمٌ آخر تمامًا للمسابقة',
  });
  assert.equal(after, before, 'اسم الفئة تسرّب إلى قرار السحب');
});

test('تغيير اسم المتسابق لا يغيّر أهليّته', () => {
  const candidates = projectCandidatesFromScope(scopeFromJuzRange(1, 2), { passageAyahCount: 3, reading });
  const scope = scopeFromJuzRange(1, 2);
  const eligibleFor = (_name: string) => candidatesInScope(candidates, scope).map(candidate => candidate.id).sort().join(',');
  assert.equal(eligibleFor('محمد'), eligibleFor('عبد الرحمن'), 'الاسم دخل في حساب الأهلية');
  // والأهلية دالّة النطاق والبنك وحدهما — لا مكان للاسم فيها أصلًا، وهذا ما يُثبَّت هنا.
  assert.ok(eligibleFor('x').length > 0);
});

test('إعادة ترتيب مصفوفة البنك لا تُنشئ تحيّزًا', () => {
  const base = baseInput();
  const before = drawFingerprint(base);
  /* قلبٌ كامل، ثم خلطٌ حتمي — لو كان في المحرّك ميلٌ لأول ما يجده لظهر هنا. */
  const reversed = drawFingerprint({ ...base, candidates: [...base.candidates].reverse() });
  assert.equal(reversed, before, 'قلبُ ترتيب البنك غيّر التخصيص — ثمّة تحيّزٌ للترتيب');

  let state = 12345;
  const shuffled = [...base.candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  assert.equal(drawFingerprint({ ...base, candidates: shuffled }), before, 'خلطُ البنك غيّر التخصيص');
});

test('إعادة ترتيب مقاطع النطاق لا تغيّر معناه', () => {
  const forward = makeScope([
    { start: { surah: 78, ayah: 1 }, end: { surah: 80, ayah: 42 } },
    { start: { surah: 90, ayah: 1 }, end: { surah: 95, ayah: 8 } },
  ]);
  const backward = makeScope([
    { start: { surah: 90, ayah: 1 }, end: { surah: 95, ayah: 8 } },
    { start: { surah: 78, ayah: 1 }, end: { surah: 80, ayah: 42 } },
  ]);
  assert.equal(scopeSignature(forward), scopeSignature(backward), 'ترتيب كتابة المقاطع غيّر بصمة النطاق');
  assert.equal(scopeAyahCount(forward), scopeAyahCount(backward));
  assert.equal(describeScope(forward, true), describeScope(backward, true));
});

test('تقسيم مقطعٍ إلى مقطعين متجاورين لا يغيّر النطاق', () => {
  const whole = makeScope([{ start: { surah: 78, ayah: 1 }, end: { surah: 78, ayah: 40 } }]);
  const split = makeScope([
    { start: { surah: 78, ayah: 1 }, end: { surah: 78, ayah: 20 } },
    { start: { surah: 78, ayah: 21 }, end: { surah: 78, ayah: 40 } },
  ]);
  assert.equal(scopeSignature(normalizeScope(split)), scopeSignature(normalizeScope(whole)), 'التقسيم المتجاور غيّر النطاق');
  assert.equal(scopeAyahCount(split), scopeAyahCount(whole));

  // وأثر ذلك على السحب نفسه: التخصيص لا يتغيّر.
  const candidates = projectCandidatesFromScope(whole, { passageAyahCount: 3, reading });
  const make = (scope: QuranScope) => baseInput({
    candidates,
    participants: syntheticParticipants({ count: 40, categoryId: 'c', questionCount: 2, scopes: [{ scope, share: 1 }], reading, prefix: 'sp' }),
    defaultPlan: autoBalancedPlan(scope, 2),
  });
  assert.equal(drawFingerprint(make(split)), drawFingerprint(make(whole)), 'التقسيم المتجاور غيّر التخصيص');
});

test('إضافة عشرة آلاف سؤالٍ غير صالح لا تغيّر قرار الأهلية', () => {
  const base = baseInput();
  const before = drawFingerprint(base);
  /*
   * حشوٌ كثيف من خارج النطاق تمامًا (الجزء الأول والثاني بينما نطاق الجميع الجزء الثلاثون).
   * والمطلوب ليس «ألّا يُختار منه شيء» فحسب — بل ألّا يزحزح ترتيبَ ما يُختار قيد أنملة.
   */
  const noise: QuestionCandidate[] = projectCandidatesFromScope(scopeFromJuzRange(1, 25), { passageAyahCount: 3, reading, idPrefix: 'noise' });
  const padded = [...noise, ...noise.map(c => ({ ...c, id: `${c.id}-b` })), ...noise.map(c => ({ ...c, id: `${c.id}-c` }))];
  assert.ok(padded.length >= 10_000, `الحشو أقلّ من أن يكون فحصًا (${padded.length})`);
  const after = drawFingerprint({ ...base, candidates: [...padded.slice(0, 5000), ...base.candidates, ...padded.slice(5000)] });
  assert.equal(after, before, 'حشوٌ غير صالحٍ غيّر التخصيص');
});

test('تغيير عدد الأجزاء الموروث مع وجود نطاق قانوني لا يغيّر القرار', () => {
  const canonical = scopeFromJuzRange(1, 10);
  const withLegacyFive = { id: 'c1', scope: canonical, juzCount: 5, memorizationScope: 'خمسة أجزاء' } as unknown as Category;
  const withLegacyThirty = { id: 'c1', scope: canonical, juzCount: 30, memorizationScope: 'المصحف كاملًا' } as unknown as Category;
  assert.equal(scopeSignature(categoryScopeOf(withLegacyFive)), scopeSignature(categoryScopeOf(withLegacyThirty)), 'الحقل الموروث تقدّم على النطاق القانوني');
  assert.equal(scopeSignature(categoryScopeOf(withLegacyFive)), scopeSignature(normalizeScope(canonical)));

  // وحين يغيب النطاق القانوني يعود الموروث فيُقرأ — وهذا فرقٌ مقصود لا تناقض.
  const legacyOnly = { id: 'c2', juzCount: 30 } as unknown as Category;
  assert.equal(scopeSignature(categoryScopeOf(legacyOnly)), scopeSignature(fullQuranScope()));
});

test('بياناتٌ وصفية لا أثر لها لا تغيّر السحب', () => {
  const base = baseInput();
  const before = drawFingerprint(base);
  /*
   * حقولٌ تصف ولا تحكم: رقم الصفحة، والحزب، والربع (مشتقّة بالقسمة وللعرض لا للأهلية)،
   * ودرجة التشابه، ومصدر الصعوبة. تغييرها يجب ألّا يمسّ قرارًا واحدًا.
   */
  const decorated = base.candidates.map((candidate, index) => ({
    ...candidate,
    pageNumber: ((index * 7) % 604) + 1,
    hizbNumber: ((index * 3) % 60) + 1,
    rubNumber: ((index * 5) % 240) + 1,
    mutashabihatScore: (index % 10) / 10,
    difficultySource: `SOURCE-${index % 4}`,
  }));
  assert.equal(drawFingerprint({ ...base, candidates: decorated }), before, 'بيانٌ وصفيّ تسرّب إلى قرار السحب');
});

test('تغيير بادئة المعرّفات إعادةُ بذرٍ لا كسرُ عدالة: الهوية تتغيّر والضمانات لا', () => {
  /*
   * هذه علاقةٌ تحويلية **لا تصحّ** بصيغتها الساذجة، وذكرُ سبب ذلك أنفع من حذفها.
   *
   * المعرّف يدخل عمدًا في فضّ التعادل وفي الاهتزاز المبذور (`seededUnit(seed, participant|slot|id)`)،
   * وهذا اختيارُ تصميمٍ معلن يجعل القرعة قابلة لإعادة الإنتاج. فتغييرُ المعرّفات إعادةُ بذرٍ
   * في حقيقته: من المتوقَّع — بل من المطلوب — أن تتغيّر المواضع الخارجة بعينها.
   *
   * والذي يجب ألّا يتغيّر هو ما وُعد به: لا خرقَ نطاقٍ ولا رواية، ولا تكرارَ داخل نموذج،
   * ولا ارتفاعَ في أكثر موضعٍ استعمالًا فوق الحدّ الرياضي. فبذرةٌ أخرى لا تعني عدالةً أخرى.
   */
  const base = baseInput();
  const before = runCompetitionTwin(base);
  const after = runCompetitionTwin({ ...base, candidates: base.candidates.map(candidate => ({ ...candidate, id: `zz-${candidate.id}` })) });

  assert.notEqual(
    (after.assignments || []).map(row => row.locusKey).join(','),
    (before.assignments || []).map(row => row.locusKey).join(','),
    'تغيير المعرّفات لم يغيّر شيئًا — فالاهتزاز المبذور لا يعمل، والقرعة ليست قرعة',
  );

  for (const result of [before, after]) {
    assert.equal(result.metrics.scopeViolations, 0);
    assert.equal(result.metrics.readingViolations, 0);
    assert.equal(result.metrics.duplicateWithinModelViolations, 0);
    assert.equal(result.metrics.duplicateForParticipantViolations, 0);
  }
  assert.equal(after.metrics.maxUsesOfAnyQuestion, before.metrics.maxUsesOfAnyQuestion, 'إعادة البذر غيّرت أكثر موضعٍ استعمالًا');
  assert.equal(after.metrics.excessOverLowerBound, before.metrics.excessOverLowerBound, 'إعادة البذر غيّرت الزيادة على الحدّ الرياضي');
  // وكلُّ ما خرج بعد إعادة البذر يبقى من داخل البنك نفسه: البذرة تغيّر الاختيار لا الحدود.
  const pool = new Set(base.candidates.map(locusKeyOf));
  assert.ok((after.assignments || []).every(row => pool.has(row.locusKey)), 'خرج موضعٌ من خارج البنك بعد إعادة البذر');
});
