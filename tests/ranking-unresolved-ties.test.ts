/*
 * §24 — التعادلُ عند الصدارة لا يُفضّ بترتيب المصفوفة.
 *
 * كان الترتيب يُسنَد بـ`i+1` بعد الفرز. فمتعادلان في الدرجة لا تحسمهما قواعدُ الرُبريك
 * يأخذ أحدُهما المركز الأول والآخر الثاني — **بحسب ترتيبهما في المصفوفة**، أي بحسب
 * ترتيب إدخالهما. وهذا حكمٌ على الصدارة لا سند له، ولا يظهر في أيّ شاشة، ويُطبع في شهادة.
 *
 * والسياسةُ التي تحسم ذلك (`additional_question` — إعادةُ اختبار) قرارُ مالكٍ لا تُخترع
 * هنا. فالمطلوب ألّا يُفضّ التعادلُ اختلاسًا: يتشارك المتعادلون الرتبة، ويُعلَن التعادلُ
 * غير المحسوم ليُحسم بإعادة اختبارٍ أو بقرارٍ مُسجَّل.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { breakTie, rankResults, topPositionTie, type RankableResult } from '../src/lib/scoring-core';

const result = (finalScore: number, over: Partial<RankableResult> & { id?: string } = {}) =>
  ({ finalScore, criterionScores: {}, penaltyCount: 0, ...over }) as RankableResult & { id?: string };

test('competitors who genuinely tie share a rank, and the next rank skips past them', () => {
  const outcome = rankResults([
    result(95, { id: 'a' }),
    result(95, { id: 'b' }),
    result(90, { id: 'c' }),
  ]);
  assert.deepEqual(outcome.ranked.map(r => r.rank), [1, 1, 3], 'competition ranking: 1, 1, 3 — never 1, 2, 3');
  assert.deepEqual(outcome.ranked.map(r => r.tied), [true, true, false]);
});

test('an unresolved tie is reported, not quietly settled by array order', () => {
  const forward = rankResults([result(95, { id: 'a' }), result(95, { id: 'b' })]);
  const reversed = rankResults([result(95, { id: 'b' }), result(95, { id: 'a' })]);

  // الترتيبُ في المصفوفة لا يصنع فائزًا.
  assert.deepEqual(forward.ranked.map(r => r.rank), reversed.ranked.map(r => r.rank));
  assert.deepEqual(forward.unresolvedTies, [{ rank: 1, finalScore: 95, count: 2 }]);
  assert.deepEqual(forward.unresolvedTies, reversed.unresolvedTies);
});

test('a tie the rules do resolve is resolved, and is not reported as unresolved', () => {
  const outcome = rankResults([
    result(95, { id: 'weaker-tajweed', criterionScores: { memorization: 60, tajweed: 30 } }),
    result(95, { id: 'stronger-tajweed', criterionScores: { memorization: 60, tajweed: 35 } }),
  ], ['memorization_priority', 'tajweed_priority']);

  assert.deepEqual(outcome.ranked.map(r => r.rank), [1, 2], 'the rules decided it, so the ranks separate');
  assert.deepEqual(outcome.unresolvedTies, [], 'and nothing is flagged for a human');
  assert.equal((outcome.ranked[0].result as { id?: string }).id, 'stronger-tajweed');
});

test('fewest penalties breaks a tie the score criteria could not', () => {
  const outcome = rankResults([
    result(88, { id: 'penalised', criterionScores: { memorization: 50, tajweed: 38 }, penaltyCount: 2 }),
    result(88, { id: 'clean', criterionScores: { memorization: 50, tajweed: 38 }, penaltyCount: 0 }),
  ], ['memorization_priority', 'tajweed_priority', 'fewest_penalties']);
  assert.equal((outcome.ranked[0].result as { id?: string }).id, 'clean');
  assert.deepEqual(outcome.unresolvedTies, []);
});

test('additional_question is never auto-resolved — it is a re-test, and it stays reported', () => {
  const outcome = rankResults([
    result(91, { id: 'a', criterionScores: { memorization: 55, tajweed: 36 }, penaltyCount: 1 }),
    result(91, { id: 'b', criterionScores: { memorization: 55, tajweed: 36 }, penaltyCount: 1 }),
  ], ['memorization_priority', 'tajweed_priority', 'fewest_penalties', 'additional_question']);
  assert.deepEqual(outcome.ranked.map(r => r.rank), [1, 1]);
  assert.deepEqual(outcome.unresolvedTies, [{ rank: 1, finalScore: 91, count: 2 }],
    'the owner policy that settles this is a re-test, and inventing one here would be worse than reporting it');
});

test('a tie on a leading position is singled out — that is the one that reaches a certificate', () => {
  const top = rankResults([result(99, { id: 'a' }), result(99, { id: 'b' }), result(70, { id: 'c' })]);
  assert.deepEqual(topPositionTie(top), { rank: 1, finalScore: 99, count: 2 });

  const deep = rankResults([
    result(99, { id: 'a' }), result(95, { id: 'b' }), result(90, { id: 'c' }),
    result(50, { id: 'd' }), result(50, { id: 'e' }),
  ]);
  assert.equal(topPositionTie(deep), undefined, 'a tie for fourth place is not a podium problem');
  assert.deepEqual(deep.unresolvedTies, [{ rank: 4, finalScore: 50, count: 2 }], 'but it is still reported');
});

test('three-way and larger ties are counted correctly, not collapsed', () => {
  const outcome = rankResults([
    result(80, { id: 'a' }), result(80, { id: 'b' }), result(80, { id: 'c' }), result(75, { id: 'd' }),
  ]);
  assert.deepEqual(outcome.ranked.map(r => r.rank), [1, 1, 1, 4]);
  assert.deepEqual(outcome.unresolvedTies, [{ rank: 1, finalScore: 80, count: 3 }]);
});

test('floating point noise never invents a winner', () => {
  // 0.1 + 0.2 ليست 0.3 بالضبط. وفرقٌ بهذا الحجم ليس فرقَ أداء.
  const outcome = rankResults([result(0.1 + 0.2, { id: 'a' }), result(0.3, { id: 'b' })]);
  assert.deepEqual(outcome.ranked.map(r => r.rank), [1, 1]);
  assert.equal(outcome.unresolvedTies.length, 1);
});

test('an empty or single-entry category ranks without inventing a tie', () => {
  assert.deepEqual(rankResults([]), { ranked: [], unresolvedTies: [] });
  const single = rankResults([result(100, { id: 'only' })]);
  assert.deepEqual(single.ranked.map(r => ({ rank: r.rank, tied: r.tied })), [{ rank: 1, tied: false }]);
  assert.deepEqual(single.unresolvedTies, []);
});

test('the store assigns ranks through rankResults, not by array position', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const store = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'store.ts'), 'utf8');
  assert.equal(/rank:i\+1/.test(store), false, 'no ranking site may still use the array index as the rank');
  assert.ok(store.includes('rankResults('), 'ranking goes through the shared, tie-aware comparator');
  assert.equal((store.match(/outcome\.ranked\.forEach/g) || []).length, 2, 'both ranking sites were migrated');
});

/*
 * معايير مدير المسابقة تُنشأ بمعرّفاتٍ مولَّدة (`criterion-1739…`) وتُنسب إلى الاختصاص بـ`assignedJudgeType`.
 * وكانت «أولوية الحفظ/التجويد» تقرأ المفتاحين الحرفيين `memorization`/`tajweed` فقط، فتعيد صفرًا في كل
 * مسابقةٍ أُنشئت من الواجهة: لا فصل بين متعادلَين مهما اختلف حفظهما.
 */
test('memorization priority works with generated criterion ids via the criterion specialty', async () => {
  const { specialtyScoresOf } = await import('../src/lib/scoring-core');
  const criteria = [
    { id: 'criterion-1001', assignedJudgeType: 'memorization' },
    { id: 'criterion-1002', assignedJudgeType: 'tajweed' },
    { id: 'criterion-1003', assignedJudgeType: 'all' },
  ];
  const strong = { finalScore: 90, criterionScores: { 'criterion-1001': 60, 'criterion-1002': 25, 'criterion-1003': 5 } };
  const weak = { finalScore: 90, criterionScores: { 'criterion-1001': 55, 'criterion-1002': 30, 'criterion-1003': 5 } };
  const withSpecialty = (r: typeof strong) => ({ ...r, specialtyScores: specialtyScoresOf(r.criterionScores, criteria) });
  assert.deepEqual(withSpecialty(strong).specialtyScores, { memorization: 60, tajweed: 25 });
  const outcome = rankResults([withSpecialty(weak), withSpecialty(strong)].map((r, i) => ({ ...r, id: i ? 'strong' : 'weak' })), ['memorization_priority']);
  assert.deepEqual(outcome.ranked.map(r => (r.result as { id?: string }).id), ['strong', 'weak']);
  assert.deepEqual(outcome.unresolvedTies, [], 'the owner-declared rule decided it; nothing is left for a human');
  const byTajweed = rankResults([withSpecialty(strong), withSpecialty(weak)].map((r, i) => ({ ...r, id: i ? 'weak' : 'strong' })), ['tajweed_priority']);
  assert.equal((byTajweed.ranked[0].result as { id?: string }).id, 'weak');
});

test('standard criterion ids still resolve without an explicit specialty map', () => {
  const a = { finalScore: 90, criterionScores: { 'crit-memorization': 60, 'crit-tajweed': 25 } };
  const b = { finalScore: 90, criterionScores: { 'crit-memorization': 55, 'crit-tajweed': 30 } };
  assert.ok(breakTie(a, b, ['memorization_priority']) < 0);
  assert.ok(breakTie(a, b, ['tajweed_priority']) > 0);
});
