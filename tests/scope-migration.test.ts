import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyScope, planCategoryMigration } from '../src/lib/scope-migration';
import { describeScope, scopeAyahCount, scopeFromJuz, scopeFromJuzRange, fullQuranScope } from '../src/lib/quran-scope';
import { QURAN_TOTAL_AYAHS } from '../src/lib/quran-canon';
import { SEED_COMPETITION } from '../src/data/seed-data';

/*
 * قاعدة الترحيل: لا يُخترع نطاق. ما كان قاطعًا يُشتق، وما كان مبهمًا يُعلَّم ويُعرض على
 * المنظم اقتراحًا لا يُطبَّق. كسر هذه القاعدة يعني سحبًا من نطاقٍ لم يختره أحد.
 */

test('an unambiguous legacy value is derived exactly', () => {
  const full = migrateLegacyScope({ memorizationScope: 'كامل القرآن (30 جزءاً)', juzCount: 30 });
  assert.equal(full.status, 'derived_from_legacy');
  assert.equal(full.confidence, 'exact');
  assert.equal(scopeAyahCount(full.scope!), QURAN_TOTAL_AYAHS);

  const range = migrateLegacyScope({ memorizationScope: 'من الجزء 5 إلى 20', juzCount: 16 });
  assert.equal(range.status, 'derived_from_legacy');
  assert.equal(describeScope(range.scope!, true), describeScope(scopeFromJuzRange(5, 20), true));

  const amma = migrateLegacyScope({ memorizationScope: 'جزء عمّ', juzCount: 1 });
  assert.equal(scopeAyahCount(amma.scope!), scopeAyahCount(scopeFromJuz([30])));

  const named = migrateLegacyScope({ memorizationScope: 'الجزء الثلاثون', juzCount: 1 });
  assert.equal(scopeAyahCount(named.scope!), scopeAyahCount(scopeFromJuz([30])));

  const list = migrateLegacyScope({ memorizationScope: 'الأجزاء 1، 3، 7', juzCount: 3 });
  assert.equal(scopeAyahCount(list.scope!), scopeAyahCount(scopeFromJuz([1, 3, 7])));
});

test('an ambiguous juz count is never invented into a scope', () => {
  for (const count of [2, 5, 10, 15, 20, 25]) {
    const outcome = migrateLegacyScope({ memorizationScope: `${count} أجزاء`, juzCount: count });
    assert.equal(outcome.status, 'needs_scope_confirmation', `${count} juz does not say which ${count}`);
    assert.equal(outcome.scope, null, 'nothing is applied');
    assert.ok(outcome.suggestion, 'a suggestion is offered');
    assert.equal(scopeAyahCount(outcome.suggestion!), scopeAyahCount(scopeFromJuzRange(1, count)));
    assert.ok(outcome.basisArabic.includes('لا يُطبَّق حتى تعتمده'), 'the copy says plainly that the suggestion is not applied');
    assert.equal(outcome.confidence, 'none');
  }
});

test('an empty legacy record asks for a manual scope instead of guessing', () => {
  const outcome = migrateLegacyScope({ memorizationScope: '', juzCount: 0 });
  assert.equal(outcome.status, 'needs_scope_confirmation');
  assert.equal(outcome.scope, null);
  assert.equal(outcome.suggestion, null);
});

test('an already-defined scope is left untouched by migration', () => {
  const outcome = migrateLegacyScope({ memorizationScope: '10 أجزاء', juzCount: 10, existingScope: fullQuranScope() });
  assert.equal(outcome.status, 'already_defined');
  assert.equal(scopeAyahCount(outcome.scope!), QURAN_TOTAL_AYAHS);
});

test('the shipped seed competition migrates without a single invented scope', () => {
  const plan = planCategoryMigration(SEED_COMPETITION.categories);
  assert.ok(plan.length >= 3, 'the seed competition really does carry categories');
  for (const row of plan) {
    assert.ok(['derived_from_legacy', 'needs_scope_confirmation', 'already_defined'].includes(row.outcome.status));
    if (row.outcome.status === 'needs_scope_confirmation') assert.equal(row.outcome.scope, null);
    if (row.outcome.status === 'derived_from_legacy') assert.ok(scopeAyahCount(row.outcome.scope!) > 0);
  }
  const full = plan.find(x => x.legacy.juzCount === 30);
  assert.equal(full?.outcome.status, 'derived_from_legacy', 'the full-Quran category migrates safely');
  /*
   * لا فئةً معلّقة في البيانات المنشورة.
   *
   * كان هذا الاختبار يشترط بقاء فئتين بلا نطاقٍ محسوم ليُثبت أن المُرحِّل لا يخمّن — أي
   * أنه كان يحرس عطلًا لا ثابتة: تلك الفئتان لا تبدأ لهما جلسة أبدًا. فالثابتةُ تُختبر
   * على فئةٍ معدّة لذلك، وتبقى البيانات المنشورة صالحةً للتشغيل.
   */
  assert.deepEqual(plan.filter(x => x.outcome.status === 'needs_scope_confirmation').map(x => x.categoryId), [],
    'a shipped category whose scope is undecided can never start a session');
});

test('an undecided juz count waits for a human decision and says why', () => {
  const plan = planCategoryMigration([
    { id: 'cat-legacy-20', name: '20 Juz', nameArabic: 'عشرون جزءًا', memorizationScope: '20 جزءاً', juzCount: 20 },
  ]);
  assert.equal(plan[0].outcome.status, 'needs_scope_confirmation');
  assert.equal(plan[0].outcome.scope, null, 'no scope is invented');
  assert.ok(plan[0].outcome.suggestion, 'a suggestion is offered');
  assert.ok(plan[0].outcome.basisArabic.length > 0, 'and it explains why it is only a suggestion');
});

test('Arabic-Indic digits and diacritics do not defeat the parser', () => {
  const outcome = migrateLegacyScope({ memorizationScope: 'مِنَ الجزء ٥ إلى ٢٠', juzCount: 16 });
  assert.equal(outcome.status, 'derived_from_legacy');
  assert.equal(scopeAyahCount(outcome.scope!), scopeAyahCount(scopeFromJuzRange(5, 20)));
});
