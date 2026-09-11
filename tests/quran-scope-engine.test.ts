import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QURAN_TOTAL_AYAHS, QURAN_JUZ_TOTAL, ayahOrdinal, ayahCountOf, juzBounds, juzOfLocus,
  ordinalToLocus, pageOfLocus, unitBounds, MUSHAF_TOTAL_PAGES,
} from '../src/lib/quran-canon';
import {
  describeScope, fullQuranScope, isScopeSubsetOf, makeScope, normalizeScope, scopeAyahCount,
  scopeContainsLocus, scopeContainsRange, scopeFromAyahRange, scopeFromJuz, scopeFromJuzRange,
  scopeFromLegacyJuzCount, scopeFromSurahs, scopeFromUnits, scopeIntersect, scopeKey, scopeMetrics,
  scopeSignature, scopeSubtract, scopeUnion, scopesEqual, splitScopeBalanced, validateScope,
  SCOPE_PRESETS, derivedLegacyMaxJuz,
} from '../src/lib/quran-scope';

/*
 * محرك النطاق هو مرجع «أين يجوز طرح السؤال؟». إن أخطأ هنا فكل ما فوقه — السحب والعدالة
 * والكفاية — مبنيٌّ على خطأ. ولذلك تُختبر البنية القانونية أولًا، ثم الحالات الشاذّة.
 */

test('canonical Quran structure matches the Kufi count and the juz table is continuous', () => {
  assert.equal(QURAN_TOTAL_AYAHS, 6236, 'the Hafs/Kufi ayah count is 6236');
  assert.equal(ayahCountOf(1), 7);
  assert.equal(ayahCountOf(2), 286);
  assert.equal(ayahCountOf(114), 6);
  assert.deepEqual(juzBounds(1).start, { surah: 1, ayah: 1 });
  assert.deepEqual(juzBounds(30).end, { surah: 114, ayah: 6 });
  assert.deepEqual(juzBounds(2).start, { surah: 2, ayah: 142 }, 'juz 2 opens at al-Baqarah 142');
  assert.deepEqual(juzBounds(30).start, { surah: 78, ayah: 1 }, 'juz 30 opens at an-Naba 1');
  let covered = 0;
  for (let juz = 1; juz <= QURAN_JUZ_TOTAL; juz++) {
    const bounds = juzBounds(juz);
    covered += ayahOrdinal(bounds.end) - ayahOrdinal(bounds.start) + 1;
    if (juz < QURAN_JUZ_TOTAL) assert.equal(ayahOrdinal(juzBounds(juz + 1).start), ayahOrdinal(bounds.end) + 1, `no gap between juz ${juz} and ${juz + 1}`);
  }
  assert.equal(covered, QURAN_TOTAL_AYAHS, 'the thirty ajza cover the Quran exactly once');
});

test('ordinal mapping round-trips for every ayah', () => {
  for (let ordinal = 1; ordinal <= QURAN_TOTAL_AYAHS; ordinal++) {
    assert.equal(ayahOrdinal(ordinalToLocus(ordinal)), ordinal);
  }
});

test('derived units stay inside the Quran and remain ordered', () => {
  for (const unit of ['hizb', 'rub', 'page'] as const) {
    let previousEnd = 0;
    const total = unit === 'hizb' ? 60 : unit === 'rub' ? 240 : MUSHAF_TOTAL_PAGES;
    for (let index = 1; index <= total; index++) {
      const bounds = unitBounds(unit, index);
      const from = ayahOrdinal(bounds.start), to = ayahOrdinal(bounds.end);
      assert.ok(from >= 1 && to <= QURAN_TOTAL_AYAHS, `${unit} ${index} stays inside the Quran`);
      assert.ok(to >= from, `${unit} ${index} is not reversed`);
      assert.ok(from >= previousEnd, `${unit} ${index} does not run backwards`);
      previousEnd = from;
    }
  }
  assert.equal(unitBounds('hizb', 1).assurance, 'DERIVED_PROPORTIONAL', 'hizb bounds declare that they are derived, not a canonical table');
  assert.equal(unitBounds('juz', 1).assurance, 'CANONICAL_TABLE');
});

test('the full Quran scope covers every ayah and is described as such', () => {
  const full = fullQuranScope();
  assert.equal(scopeAyahCount(full), QURAN_TOTAL_AYAHS);
  assert.equal(scopeMetrics(full).fullJuz.length, 30);
  assert.equal(describeScope(full, true), 'المصحف كاملًا');
  assert.equal(scopeMetrics(full).surahCount, 114);
});

test('normalization repairs reversed bounds, merges overlap and adjacency, and de-duplicates', () => {
  const messy = makeScope([
    { start: { surah: 2, ayah: 20 }, end: { surah: 2, ayah: 5 } },   // مقلوب
    { start: { surah: 2, ayah: 1 }, end: { surah: 2, ayah: 10 } },   // متداخل
    { start: { surah: 2, ayah: 21 }, end: { surah: 2, ayah: 30 } },  // متجاور
    { start: { surah: 2, ayah: 1 }, end: { surah: 2, ayah: 10 } },   // مكرر
  ]);
  assert.equal(messy.segments.length, 1, 'four messy segments normalize to one continuous range');
  assert.deepEqual(messy.segments[0], { start: { surah: 2, ayah: 1 }, end: { surah: 2, ayah: 30 } });
  assert.equal(scopeAyahCount(messy), 30, 'overlap is counted once, never twice');
});

test('an out-of-range locus is clamped rather than accepted, and validation says why', () => {
  const clamped = makeScope([{ start: { surah: 2, ayah: 9999 }, end: { surah: 2, ayah: 9999 } }]);
  assert.deepEqual(clamped.segments[0].start, { surah: 2, ayah: 286 });
  const issues = validateScope({ version: 1, segments: [{ start: { surah: 2, ayah: 300 }, end: { surah: 2, ayah: 5 } }], assurance: 'CANONICAL_TABLE' });
  assert.ok(issues.some(x => x.code === 'SCOPE_AYAH_INVALID'), 'an ayah past the end of its surah is reported');
});

test('non-contiguous juz selections stay non-contiguous', () => {
  const scope = scopeFromJuz([1, 3, 7, 12, 26]);
  const metrics = scopeMetrics(scope);
  assert.equal(metrics.segmentCount, 5, 'five disjoint juz give five segments');
  assert.deepEqual(metrics.fullJuz, [1, 3, 7, 12, 26]);
  assert.equal(metrics.partialJuz.length, 0);
  assert.ok(scopeContainsLocus(scope, juzBounds(3).start));
  assert.ok(!scopeContainsLocus(scope, juzBounds(4).start));
});

test('a range that starts mid-juz and ends mid-juz is represented exactly', () => {
  const fourth = juzBounds(4), nineteenth = juzBounds(19);
  const midFourth = ordinalToLocus(Math.floor((ayahOrdinal(fourth.start) + ayahOrdinal(fourth.end)) / 2));
  const midNineteenth = ordinalToLocus(Math.floor((ayahOrdinal(nineteenth.start) + ayahOrdinal(nineteenth.end)) / 2));
  const scope = scopeFromAyahRange(midFourth, midNineteenth);
  const metrics = scopeMetrics(scope);
  assert.equal(metrics.segmentCount, 1);
  assert.ok(metrics.partialJuz.includes(4) && metrics.partialJuz.includes(19), 'the two edge juz are partial, not full');
  assert.ok(metrics.fullJuz.includes(10), 'the juz in between are complete');
  assert.ok(!scopeContainsLocus(scope, fourth.start), 'the ayat before the start are excluded');
  assert.ok(!scopeContainsLocus(scope, nineteenth.end), 'the ayat after the end are excluded');
});

test('surah selections and mixed scopes compose', () => {
  const scope = scopeUnion(scopeFromSurahs([2, 19, 36]), scopeFromJuz([30]));
  assert.ok(scopeContainsLocus(scope, { surah: 19, ayah: 1 }));
  assert.ok(scopeContainsLocus(scope, { surah: 114, ayah: 6 }));
  assert.ok(!scopeContainsLocus(scope, { surah: 3, ayah: 1 }));
  assert.equal(scopeAyahCount(scope), 286 + 98 + 83 + scopeAyahCount(scopeFromJuz([30])) - scopeAyahCount(scopeIntersect(scopeFromSurahs([2, 19, 36]), scopeFromJuz([30]))));
});

test('a seven-segment scattered scope survives normalization without losing a segment', () => {
  const scope = makeScope([
    { start: { surah: 2, ayah: 1 }, end: { surah: 2, ayah: 20 } },
    { start: { surah: 5, ayah: 1 }, end: { surah: 5, ayah: 10 } },
    { start: { surah: 12, ayah: 5 }, end: { surah: 12, ayah: 40 } },
    { start: { surah: 19, ayah: 1 }, end: { surah: 19, ayah: 98 } },
    { start: { surah: 36, ayah: 1 }, end: { surah: 36, ayah: 83 } },
    { start: { surah: 67, ayah: 1 }, end: { surah: 67, ayah: 30 } },
    { start: { surah: 112, ayah: 1 }, end: { surah: 114, ayah: 6 } },
  ]);
  assert.equal(scopeMetrics(scope).segmentCount, 7);
  assert.equal(scopeAyahCount(scope), 20 + 10 + 36 + 98 + 83 + 30 + (4 + 5 + 6));
});

test('a single-ayah scope is a legal scope', () => {
  const scope = scopeFromAyahRange({ surah: 2, ayah: 255 }, { surah: 2, ayah: 255 });
  assert.equal(scopeAyahCount(scope), 1);
  assert.ok(scopeContainsRange(scope, { surah: 2, ayah: 255 }, { surah: 2, ayah: 255 }));
  assert.ok(!scopeContainsRange(scope, { surah: 2, ayah: 255 }, { surah: 2, ayah: 256 }), 'a passage may not run past the scope end');
});

test('a scope that runs from the end of one surah into the start of another is continuous', () => {
  const scope = scopeFromAyahRange({ surah: 18, ayah: 110 }, { surah: 19, ayah: 1 });
  assert.equal(scopeAyahCount(scope), 2);
  assert.equal(scopeMetrics(scope).segmentCount, 1, 'crossing a surah boundary does not split the segment');
});

test('containment is asked of the whole passage, not only its start', () => {
  const scope = scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 10 });
  assert.ok(scopeContainsRange(scope, { surah: 2, ayah: 8 }, { surah: 2, ayah: 10 }));
  assert.ok(!scopeContainsRange(scope, { surah: 2, ayah: 9 }, { surah: 2, ayah: 12 }), 'a passage spilling past the scope end is rejected');
});

test('set algebra: subset, intersection, union and subtraction', () => {
  const full = fullQuranScope();
  assert.ok(isScopeSubsetOf(scopeFromJuz([1]), full));
  assert.ok(!isScopeSubsetOf(full, scopeFromJuz([1])));
  assert.equal(scopeAyahCount(scopeIntersect(scopeFromJuzRange(1, 10), scopeFromJuzRange(5, 15))), scopeAyahCount(scopeFromJuzRange(5, 10)));
  assert.equal(scopeAyahCount(scopeSubtract(full, full)), 0);
  assert.ok(scopesEqual(scopeUnion(scopeFromJuzRange(1, 10), scopeFromJuzRange(11, 30)), full));
  assert.equal(scopeAyahCount(scopeSubtract(scopeFromJuz([1, 2, 3]), scopeFromJuz([2]))), scopeAyahCount(scopeFromJuz([1, 3])));
});

test('every juz-count scenario the brief lists produces an exact, containment-correct scope', () => {
  for (const count of [1, 2, 3, 5, 7, 10, 15, 17, 22, 23, 25, 29, 30]) {
    const scope = scopeFromJuzRange(1, count);
    const metrics = scopeMetrics(scope);
    assert.equal(metrics.fullJuz.length, count, `${count} juz selected gives ${count} complete juz`);
    assert.equal(metrics.partialJuz.length, 0);
    assert.ok(scopeContainsLocus(scope, juzBounds(count).end), 'the last ayah of the last juz is inside');
    if (count < QURAN_JUZ_TOTAL) assert.ok(!scopeContainsLocus(scope, juzBounds(count + 1).start), 'the first ayah of the next juz is outside');
    assert.equal(derivedLegacyMaxJuz(scope), count, 'the legacy maxJuz bridge still reports the top juz');
  }
});

test('scope signature clusters identical scopes and separates different ones', () => {
  assert.equal(scopeSignature(scopeFromJuzRange(1, 10)), scopeSignature(scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), 'the same range written two ways has one signature');
  assert.notEqual(scopeSignature(scopeFromJuz([1])), scopeSignature(scopeFromJuz([2])));
  assert.equal(scopeKey(scopeFromJuz([1])), scopeKey(scopeFromJuz([1])));
});

test('balanced splitting covers the scope exactly, with no overlap and no loss', () => {
  for (const parts of [2, 3, 5, 7]) {
    const slices = splitScopeBalanced(fullQuranScope(), parts);
    assert.equal(slices.length, parts);
    const total = slices.reduce((sum, slice) => sum + scopeAyahCount(slice), 0);
    assert.equal(total, QURAN_TOTAL_AYAHS, `${parts} parts cover the Quran exactly once`);
    for (let i = 0; i < slices.length; i++) for (let j = i + 1; j < slices.length; j++) {
      assert.equal(scopeAyahCount(scopeIntersect(slices[i], slices[j])), 0, 'parts never overlap');
    }
    const sizes = slices.map(scopeAyahCount);
    const spread = (Math.max(...sizes) - Math.min(...sizes)) / (QURAN_TOTAL_AYAHS / parts);
    assert.ok(spread < 0.05, `parts are balanced within 5% (was ${(spread * 100).toFixed(1)}%)`);
  }
});

test('balanced splitting can weigh real content instead of ayah count', () => {
  // وزنٌ يجعل النصف الأول من المصحف ضعف كثافة النصف الثاني: القسمة تتبع الوزن لا العدد.
  const half = QURAN_TOTAL_AYAHS / 2;
  const slices = splitScopeBalanced(fullQuranScope(), 2, ordinal => (ordinal <= half ? 2 : 1));
  assert.ok(scopeAyahCount(slices[0]) < scopeAyahCount(slices[1]), 'the denser half gets fewer ayat for the same load');
});

test('a legacy juz count alone never invents a scope', () => {
  assert.equal(scopeFromLegacyJuzCount(10).scope, null, 'ten juz does not say WHICH ten');
  assert.equal(scopeFromLegacyJuzCount(10).unambiguous, false);
  assert.equal(scopeAyahCount(scopeFromLegacyJuzCount(30).scope!), QURAN_TOTAL_AYAHS, 'thirty juz is unambiguous');
});

test('the one shortcut is a shortcut, not a type: it builds an ordinary editable scope', () => {
  /* اختصارٌ واحد يكفي؛ وما عداه تعطيه شبكة الأجزاء بضغطتين، فلا يختصر شيئًا. */
  assert.equal(SCOPE_PRESETS.length, 1, 'the picker offers one shortcut, not a crowded row');
  const preset = SCOPE_PRESETS[0];
  assert.equal(preset.id, 'full_quran');
  const scope = preset.build();
  assert.equal(validateScope(scope).length, 0);
  assert.equal(scopeAyahCount(scope), QURAN_TOTAL_AYAHS);
  // التعديل بعد الاختصار ممكن دائمًا: الاختصار لا يقيّد شيئًا.
  assert.ok(scopeAyahCount(scopeSubtract(scope, scopeFromJuz([30]))) < scopeAyahCount(scope));
});

test('pages and units resolve to loci inside the Quran', () => {
  assert.equal(pageOfLocus({ surah: 1, ayah: 1 }), 1);
  assert.equal(pageOfLocus({ surah: 114, ayah: 6 }), MUSHAF_TOTAL_PAGES);
  const pageScope = scopeFromUnits('page', [1, 2, 3]);
  assert.ok(scopeAyahCount(pageScope) > 0);
  assert.equal(juzOfLocus({ surah: 78, ayah: 1 }), 30);
  assert.equal(juzOfLocus({ surah: 1, ayah: 1 }), 1);
});

test('an empty scope is empty, and normalization of nothing is stable', () => {
  const empty = normalizeScope({ version: 1, segments: [], assurance: 'CANONICAL_TABLE' });
  assert.equal(scopeAyahCount(empty), 0);
  assert.equal(describeScope(empty, true), 'لا نطاق');
  assert.ok(validateScope(empty).some(x => x.code === 'SCOPE_EMPTY'));
});
