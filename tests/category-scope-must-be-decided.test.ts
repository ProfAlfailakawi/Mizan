import test from 'node:test';
import assert from 'node:assert/strict';

import { SEED_CATEGORIES, SEED_COMPETITION } from '../src/data/seed-data';
import { categoryScopeOf } from '../src/lib/scope-engine';
import { scopeAyahCount } from '../src/lib/quran-scope';
import { migrateLegacyScope } from '../src/lib/scope-migration';
import { detectContradictions } from '../src/lib/policy-compiler';
import type { Category } from '../src/types';

/*
 * أخطر عطلٍ في الإعداد هو الذي لا يظهر حتى ينادي المحكّم متسابقه.
 *
 * فئةٌ تحمل «عشرين جزءًا» بلا نطاقٍ محسوم تمرّ في كل الشاشات: اسمها صحيح، ولها متسابقون
 * ولجنة ومحكّمون. ثم تفشل عند أول نداء بـ«تعذّر بدء الجلسة»، لأن النظام — بحقّ — يرفض أن
 * يخمّن أيّ عشرين جزءًا. فالرفض صواب، وموضعُه كان خطأً: يوم المسابقة بدل يوم الإعداد.
 */

test('a legacy juz count is deliberately not enough to derive a scope', () => {
  const outcome = migrateLegacyScope({ memorizationScope: '20 جزءاً', juzCount: 20 });
  assert.equal(outcome.status, 'needs_scope_confirmation');
  assert.equal(outcome.scope, null, 'the system must not pick which twenty juz on its own');
  assert.ok(outcome.suggestion, 'it may suggest, and a suggestion is not an application');
});

test('every seeded category carries a decided scope, so none of them is a session that cannot start', () => {
  for (const category of SEED_CATEGORIES) {
    const ayat = scopeAyahCount(categoryScopeOf(category));
    assert.ok(ayat > 0, `${category.id} (${category.nameArabic}) must have a decided scope, not only a juz count`);
  }
});

test('a category without a decided scope is blocked while configuring, not on the day', () => {
  const undecided: Category = {
    ...SEED_CATEGORIES[0],
    id: 'cat-undecided',
    name: 'Fifteen Juz',
    nameArabic: 'خمسة عشر جزءًا',
    memorizationScope: '15 جزءًا',
    juzCount: 15,
    scope: undefined as never,
  };
  assert.equal(scopeAyahCount(categoryScopeOf(undecided)), 0, 'the fixture really is undecided');

  const issues = detectContradictions({
    competition: { ...SEED_COMPETITION, categories: [undecided] },
    quranSources: [], aiValidations: [], availableQualifiedJudges: 99, committeeCount: 1,
  });
  const finding = issues.find(i => /no decided scope/i.test(i.title));
  assert.ok(finding, 'the contradiction radar must name the category');
  assert.equal(finding!.severity, 'BLOCKER');
  assert.ok(finding!.evidence.some(e => /juzCount=15/.test(e)), 'the evidence says what the category actually carries');

  // والفئة المحسومة لا تُرفع عليها هذه الملاحظة.
  const decided = detectContradictions({
    competition: { ...SEED_COMPETITION, categories: [SEED_CATEGORIES[1]] },
    quranSources: [], aiValidations: [], availableQualifiedJudges: 99, committeeCount: 1,
  });
  assert.ok(!decided.some(i => /no decided scope/i.test(i.title)));
});
