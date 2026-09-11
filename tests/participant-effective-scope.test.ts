import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEffectiveScope, buildParticipantScopeRecord, clusterByScope, countScopeUnits,
  DEFAULT_SELECTION_RULE, nextScopeVersion, scopeRecordIsUsable, selectionIsValid,
  selectionUnitCount, touchedUnitIndexes, validateParticipantSelection,
  type ParticipantScopeSelectionRule,
} from '../src/lib/participant-scope';
import {
  fullQuranScope, scopeAyahCount, scopeFromJuz, scopeFromJuzRange, scopeFromSurahs,
  scopeSignature, scopeUnion, isScopeSubsetOf, scopeFromAyahRange,
} from '../src/lib/quran-scope';
import { juzBounds, ordinalToLocus, ayahOrdinal } from '../src/lib/quran-canon';

/*
 * Participant Effective Scope is the authoritative source for question eligibility whenever
 * participant-specific selection applies.
 *
 * الحالة الحاكمة هنا هي المثال الدولي: فئةٌ اسمها «ربع القرآن» والمتسابقون يختارون أرباعهم
 * بأنفسهم. النظام لا يفهم «ربع القرآن»؛ يفهم نطاق كل واحد منهم على حدة.
 */

const quarterRule = (): ParticipantScopeSelectionRule => ({
  ...DEFAULT_SELECTION_RULE,
  enabled: true,
  decidedBy: 'participant',
  selectionUnit: 'juz',
  exactUnits: 8,
  parentScope: fullQuranScope(),
  approval: 'committee',
});

test('a category with no participant choice gives every member the category scope', () => {
  const rule: ParticipantScopeSelectionRule = { ...DEFAULT_SELECTION_RULE, enabled: false, parentScope: scopeFromJuzRange(1, 10) };
  const effective = buildEffectiveScope(rule, scopeFromJuzRange(1, 10));
  assert.equal(scopeAyahCount(effective), scopeAyahCount(scopeFromJuzRange(1, 10)));
});

test('three participants in one "quarter Quran" category each carry their own range', () => {
  const rule = quarterRule();
  const a = buildEffectiveScope(rule, scopeFromJuzRange(1, 8));
  const b = buildEffectiveScope(rule, scopeFromJuzRange(12, 19));
  const c = buildEffectiveScope(rule, scopeFromJuzRange(23, 30));
  assert.ok(selectionIsValid(validateParticipantSelection(rule, a)));
  assert.ok(selectionIsValid(validateParticipantSelection(rule, b)));
  assert.ok(selectionIsValid(validateParticipantSelection(rule, c)));
  assert.notEqual(scopeSignature(a), scopeSignature(b));
  // لا يتسرب نطاق إلى نطاق: بداية نطاق B خارج نطاق A تمامًا.
  assert.ok(!isScopeSubsetOf(b, a) && !isScopeSubsetOf(a, b));
  assert.equal(scopeAyahCount(a), scopeAyahCount(scopeFromJuzRange(1, 8)));
});

test('selection outside the allowed parent is an error, not a silent clamp', () => {
  const rule: ParticipantScopeSelectionRule = { ...quarterRule(), parentScope: scopeFromJuzRange(1, 15), exactUnits: 5 };
  const issues = validateParticipantSelection(rule, scopeFromJuzRange(14, 18));
  assert.ok(issues.some(x => x.code === 'SCOPE_OUTSIDE_PARENT' && x.severity === 'error'));
  // والقصّ يقع مع ذلك في النطاق النهائي حتى لا يتسع نطاقٌ بخطأ واجهة.
  const effective = buildEffectiveScope(rule, scopeFromJuzRange(14, 18));
  assert.ok(isScopeSubsetOf(effective, rule.parentScope!), 'the effective scope is always clipped to the parent');
});

test('unit counts: exact, minimum, maximum and partial units', () => {
  const rule: ParticipantScopeSelectionRule = { ...DEFAULT_SELECTION_RULE, enabled: true, selectionUnit: 'juz', exactUnits: 5 };
  assert.ok(selectionIsValid(validateParticipantSelection(rule, scopeFromJuz([1, 5, 9, 14, 22]))));
  assert.ok(!selectionIsValid(validateParticipantSelection(rule, scopeFromJuz([1, 5]))));
  const min: ParticipantScopeSelectionRule = { ...rule, exactUnits: undefined, minUnits: 3, maxUnits: 6 };
  assert.ok(selectionIsValid(validateParticipantSelection(min, scopeFromJuz([1, 2, 3, 4]))));
  assert.ok(!selectionIsValid(validateParticipantSelection(min, scopeFromJuz([1, 2]))));
  assert.ok(!selectionIsValid(validateParticipantSelection(min, scopeFromJuz([1, 2, 3, 4, 5, 6, 7]))));
  const bounds = juzBounds(4);
  const halfJuz = scopeFromAyahRange(bounds.start, ordinalToLocus(Math.floor((ayahOrdinal(bounds.start) + ayahOrdinal(bounds.end)) / 2)));
  const partial = validateParticipantSelection({ ...rule, exactUnits: undefined, minUnits: 0 }, halfJuz);
  assert.ok(partial.some(x => x.code === 'SCOPE_PARTIAL_UNIT' && x.severity === 'warning'), 'a half juz is flagged as partial, not silently counted');
  assert.equal(countScopeUnits(halfJuz, 'juz'), 0, 'a half juz is not a complete juz');
  assert.deepEqual(touchedUnitIndexes(halfJuz, 'juz'), [4], 'but it does touch juz 4');
});

test('consecutive-only rules reject scattered selections', () => {
  const rule: ParticipantScopeSelectionRule = { ...DEFAULT_SELECTION_RULE, enabled: true, selectionUnit: 'juz', exactUnits: 5, mustBeConsecutive: true };
  assert.ok(selectionIsValid(validateParticipantSelection(rule, scopeFromJuzRange(6, 10))));
  const issues = validateParticipantSelection(rule, scopeFromJuz([1, 3, 5, 7, 9]));
  assert.ok(issues.some(x => x.code === 'SCOPE_NOT_CONSECUTIVE'));
});

test('a fixed part plus a chosen part: nine fixed juz and four chosen', () => {
  const fixed = scopeFromJuzRange(1, 9);
  const rule: ParticipantScopeSelectionRule = {
    ...DEFAULT_SELECTION_RULE, enabled: true, selectionUnit: 'juz', exactUnits: 4,
    requiredSegments: fixed.segments, parentScope: fullQuranScope(),
  };
  const chosen = scopeFromJuz([20, 21, 22, 23]);
  assert.ok(selectionIsValid(validateParticipantSelection(rule, chosen)));
  const effective = buildEffectiveScope(rule, chosen);
  assert.ok(isScopeSubsetOf(fixed, effective), 'the fixed part is always present');
  assert.ok(isScopeSubsetOf(chosen, effective), 'the chosen part is present too');
  assert.equal(scopeAyahCount(effective), scopeAyahCount(scopeUnion(fixed, chosen)));
});

test('partitioned rules: X juz from the first half and Y from the second', () => {
  const rule: ParticipantScopeSelectionRule = {
    ...DEFAULT_SELECTION_RULE, enabled: true, selectionUnit: 'juz', exactUnits: 6, parentScope: fullQuranScope(),
    partitions: [
      { id: 'first', label: 'First half', labelArabic: 'النصف الأول', scope: scopeFromJuzRange(1, 15), minUnits: 4, maxUnits: 4 },
      { id: 'second', label: 'Second half', labelArabic: 'النصف الثاني', scope: scopeFromJuzRange(16, 30), minUnits: 2, maxUnits: 2 },
    ],
  };
  assert.ok(selectionIsValid(validateParticipantSelection(rule, scopeFromJuz([1, 2, 3, 4, 20, 21]))), 'four + two satisfies the split');
  const wrong = validateParticipantSelection(rule, scopeFromJuz([1, 2, 3, 4, 5, 6]));
  assert.ok(wrong.some(x => x.code === 'SCOPE_PARTITION_MIN'), 'six from one half violates the second-half minimum');
});

test('coverage rules measure the real size, not the unit count', () => {
  const rule: ParticipantScopeSelectionRule = {
    ...DEFAULT_SELECTION_RULE, enabled: true, selectionUnit: 'surah',
    coverage: { minAyah: 500, maxAyah: 1200 },
  };
  assert.ok(!selectionIsValid(validateParticipantSelection(rule, scopeFromSurahs([112, 113, 114]))), 'three tiny surahs fall short');
  // البقرة ٢٨٦ + آل عمران ٢٠٠ + مريم ٩٨ = ٥٨٤ آية، فتقع داخل المدى المطلوب.
  assert.ok(selectionIsValid(validateParticipantSelection(rule, scopeFromSurahs([2, 3, 19]))));
  assert.ok(!selectionIsValid(validateParticipantSelection(rule, scopeFromSurahs([2, 19, 36]))), '٤٦٧ آية دون الحد الأدنى');
});

test('segment limits cap how scattered a selection may be', () => {
  const rule: ParticipantScopeSelectionRule = { ...DEFAULT_SELECTION_RULE, enabled: true, selectionUnit: 'juz', maxSegments: 3 };
  assert.ok(selectionIsValid(validateParticipantSelection(rule, scopeFromJuz([1, 2, 3, 10, 11, 20]))), 'three runs are allowed');
  assert.ok(!selectionIsValid(validateParticipantSelection(rule, scopeFromJuz([1, 5, 9, 14, 22]))), 'five scattered juz exceed the segment cap');
});

test('a scope record carries its version, signature and lifecycle', () => {
  const rule = quarterRule();
  const record = buildParticipantScopeRecord({
    id: 'psc-1', organizationId: 'org', competitionId: 'comp', categoryId: 'cat', participantId: 'p1',
    rule, selection: scopeFromJuzRange(1, 8), version: nextScopeVersion(undefined),
  });
  assert.equal(record.version, 1);
  assert.equal(record.status, 'draft');
  assert.equal(record.scopeSignature, scopeSignature(record.scope));
  assert.equal(scopeRecordIsUsable(record), false, 'a draft scope is not usable for a draw');
  assert.equal(scopeRecordIsUsable({ ...record, status: 'approved' }), true);
  assert.equal(scopeRecordIsUsable({ ...record, status: 'locked' }), true);
  assert.equal(nextScopeVersion(record), 2, 'the next revision is version two, the first is not overwritten');
});

test('participants cluster by scope signature so identical scopes are computed once', () => {
  const rows = [
    { participantId: 'a', scope: scopeFromJuzRange(1, 5) },
    { participantId: 'b', scope: scopeFromJuz([1, 2, 3, 4, 5]) },
    { participantId: 'c', scope: scopeFromJuzRange(10, 20) },
  ];
  const clusters = clusterByScope(rows);
  assert.equal(clusters.size, 2, 'the same range expressed two ways is one cluster');
  assert.equal([...clusters.values()].find(c => c.members.length === 2)?.members.length, 2);
});

test('selectionUnitCount falls back to segment counting for free ayah ranges', () => {
  const rule: ParticipantScopeSelectionRule = { ...DEFAULT_SELECTION_RULE, enabled: true, selectionUnit: 'ayah_range', minUnits: 2, maxUnits: 3 };
  const scope = scopeUnion(scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 50 }), scopeFromAyahRange({ surah: 19, ayah: 1 }, { surah: 19, ayah: 40 }));
  assert.equal(selectionUnitCount(rule, scope), 2);
  assert.ok(selectionIsValid(validateParticipantSelection(rule, scope)));
});
