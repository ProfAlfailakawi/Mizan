import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDemoUniverse, demoCategories, demoParticipantScopes } from '../src/data/demo-universe';
import { resolveEffectiveScope, categoryScopeOf } from '../src/lib/scope-engine';
import { scopeAyahCount } from '../src/lib/quran-scope';

/*
 * أول ضغطة على «ابدأ جلسته» في البيئة التجريبية كانت تُردّ دائمًا.
 *
 * ثلاث فئات في البذرة تقول نطاقها بعبارةٍ للقراءة — «20 جزءاً» ومعها
 * `juzCount: 20` — بلا `scope` مبنيّ. و`migrateLegacyScope` يرفض أن يشتقّ منها
 * نطاقًا عن حقّ: «عشرون جزءًا» لا تقول أيّ عشرين، واشتقاقُها تخمينًا يعني سؤال
 * متسابقٍ عن أجزاء لم يحفظها. فيُردّ `needs_scope_confirmation` وينتظر اعتماد
 * المنظّم — ولا منظّم في العرض ينتظرونه.
 *
 * فكان `participantEffectiveScope` يعود `blocked` لكل متسابقٍ في تلك الفئات،
 * وتقف الجلسة قبل أن تبدأ. والمحكّم لا يرى إلا «تعذّر بدء الجلسة لهذا المتسابق:
 * لا توجد لجنة متوافقة معه، أو تعذّر تجهيز أسئلته» — سببان مختلفان في رسالة
 * واحدة، وأيٌّ منهما لا يظهر في أي جدول قبلها.
 *
 * ولا يكشفه فحص أنواع ولا بناء: البيانات صادقة الأنواع، والنقص في قيمةٍ غائبة لا
 * في شكلها. فهذه الاختبارات تسأل ما تسأله الشاشة نفسها قبل أن تفتح جلسة.
 */

const ORG = 'org-demo-mizan';
const COMPETITION = 'comp-dubai-2027';

const universe = buildDemoUniverse();
const categories = demoCategories();
const participantScopes = demoParticipantScopes(universe.participants, categories, ORG, COMPETITION);
const participants = universe.participants.map(p => ({ ...p, organizationId: ORG }));

test('every demo category carries a real Quran scope, not just a label', () => {
  assert.ok(categories.length > 0, 'البيئة التجريبية بلا فئات أصلًا');
  for (const category of categories) {
    const scope = categoryScopeOf(category);
    /* فئة «ربع القرآن» مظلّة يختار المتسابق من داخلها، ونطاقها المظلّة نفسها. */
    assert.ok(
      scopeAyahCount(scope) > 0,
      `الفئة ${category.id} بلا نطاق قرآني مبنيّ — لا تبدأ لها جلسة.`,
    );
  }
});

test('no demo participant is blocked from starting a session by scope', () => {
  const blocked = participants
    .map(participant => ({
      participant,
      resolution: resolveEffectiveScope({
        participant,
        category: categories.find(c => c.id === participant.categoryId),
        scopes: participantScopes,
        tenant: { organizationId: ORG, competitionId: COMPETITION },
      }),
    }))
    .filter(row => row.resolution.blocked);

  assert.deepEqual(
    blocked.map(row => `${row.participant.code} (${row.participant.categoryId}): ${row.resolution.reasonArabic}`),
    [],
    'متسابقون لا تبدأ لهم جلسة في البيئة التجريبية',
  );
});

test('a participant-selected category still resolves to the participant record, not the umbrella', () => {
  const selected = categories.find(c => c.scopeMode === 'participant_selected');
  assert.ok(selected, 'اختفت فئة النطاق الذي يختاره المتسابق — أعد توجيه هذا الاختبار.');
  const participant = participants.find(p => p.categoryId === selected.id);
  assert.ok(participant, `لا متسابق في الفئة ${selected.id}`);

  const resolution = resolveEffectiveScope({
    participant,
    category: selected,
    scopes: participantScopes,
    tenant: { organizationId: ORG, competitionId: COMPETITION },
  });

  /* لو انحدر هذا إلى `category` لصار السؤال يُسحب من المظلّة كلها لا مما اختاره
     المتسابق واعتُمد له — وهو ما تقوم عليه هذه الفئة أصلًا. */
  assert.equal(resolution.source, 'participant_approved');
  assert.equal(resolution.blocked, false);
});

test('the fixed demo scopes start at juz one and match the declared juz count', () => {
  /* العُرف الذي يعرضه المُرحِّل نفسه على المنظّم: الأجزاء الأولى بعدد ما تعلنه
     الفئة. ونثبّته هنا حتى لا يصير النطاق قيمةً عشوائية تُرضي الاختبار الأول. */
  for (const category of categories) {
    if (category.scopeMode === 'participant_selected') continue;
    const scope = categoryScopeOf(category);
    const units = scope.origin?.units;
    if (!units?.length) continue;
    assert.equal(Math.min(...units), 1, `الفئة ${category.id} لا يبدأ نطاقها من الجزء الأول`);
    assert.equal(
      Math.max(...units),
      category.juzCount,
      `الفئة ${category.id} نطاقها ${Math.max(...units)} جزءًا وهي تعلن ${category.juzCount}`,
    );
  }
});
