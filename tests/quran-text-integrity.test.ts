import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inspectQuranText,
  buildSearchableQuranText,
  toQuranSearchForm,
  quranSearchMatches,
  QuranTextIntegrityError,
  UNICODE_REPLACEMENT_CHAR,
} from '../src/lib/quran-text-integrity';

/*
 * النصوص المستعملة هنا مقاطعُ قصيرة مضبوطة موجودةٌ أصلًا في فيكستُرات المستودع،
 * فلا يُستحدث نصٌّ قرآني في الاختبار.
 */
const BISMILLAH = 'بِسْمِ اللَّهِ';
const HAMD = 'الْحَمْدُ لِلَّهِ';

test('sound Quran text passes inspection', () => {
  for (const text of [BISMILLAH, HAMD]) {
    const r = inspectQuranText(text);
    assert.equal(r.ok, true, `${text} is sound`);
    assert.deepEqual(r.findings, []);
    assert.equal(r.hadBom, false);
  }
});

test('the display form is never mutated — code point for code point', () => {
  const built = buildSearchableQuranText(BISMILLAH);
  assert.equal(built.displayText, BISMILLAH);
  // مطابقةٌ في نقاط الترميز لا في الشكل فحسب: لا .normalize() على المعروض.
  assert.deepEqual([...built.displayText], [...BISMILLAH]);
  assert.equal(built.displayText.length, BISMILLAH.length);
  // ولو اختلفت صورة التوحيد لبان الفرق هنا:
  assert.notEqual(built.displayText, built.normalizedSearchText, 'display and search forms are distinct');
});

test('a BOM is reported and stripped, but nothing else changes', () => {
  const withBom = '﻿' + BISMILLAH;
  const r = inspectQuranText(withBom);
  assert.equal(r.hadBom, true);
  assert.equal(r.ok, true, 'a BOM alone is not corruption');
  assert.equal(buildSearchableQuranText(withBom).displayText, BISMILLAH);
});

test('broken encoding is caught and fails closed', () => {
  const broken = `بِسْمِ ${UNICODE_REPLACEMENT_CHAR} اللَّهِ`;
  const r = inspectQuranText(broken);
  assert.equal(r.ok, false);
  assert.ok(r.findings.some(f => f.code === 'REPLACEMENT_CHARACTER'));
  assert.throws(() => buildSearchableQuranText(broken),
    (e: unknown) => e instanceof QuranTextIntegrityError && e.code === 'QURAN_TEXT_INTEGRITY_FAILED');
});

test('control, invisible-format and mojibake artefacts are caught', () => {
  assert.ok(inspectQuranText(`${BISMILLAH}`).findings.some(f => f.code === 'DISALLOWED_CONTROL_CHARACTER'));
  assert.ok(inspectQuranText(`${BISMILLAH}‏`).findings.some(f => f.code === 'INVISIBLE_FORMAT_CHARACTER'));
  assert.ok(inspectQuranText('Ø¨Ø³Ù').findings.some(f => f.code === 'MOJIBAKE_SUSPECTED'));
  // legitimate whitespace is not a control finding
  assert.equal(inspectQuranText(`${BISMILLAH}\n${HAMD}`).ok, true);
});

test('empty or non-Arabic text is refused', () => {
  assert.ok(inspectQuranText('   ').findings.some(f => f.code === 'EMPTY_TEXT'));
  assert.ok(inspectQuranText('Bismillah').findings.some(f => f.code === 'NO_ARABIC_CONTENT'));
  assert.throws(() => buildSearchableQuranText(''), (e: unknown) => e instanceof QuranTextIntegrityError);
});

test('the search form folds diacritics and tatweel without touching display', () => {
  const search = toQuranSearchForm(BISMILLAH);
  // الضبط مطوي في صورة البحث
  assert.ok(!/[ً-ٟ]/.test(search), 'diacritics folded for search');
  // والتطويل كذلك
  assert.equal(toQuranSearchForm('بِســـمِ'), toQuranSearchForm('بِسمِ'));
  // وصور الألف والياء والتاء المربوطة موحّدة
  assert.equal(toQuranSearchForm('إبراهيم'), toQuranSearchForm('ابراهيم'));
  assert.equal(toQuranSearchForm('موسى'), toQuranSearchForm('موسي'));
  assert.equal(toQuranSearchForm('رحمة'), toQuranSearchForm('رحمه'));
  // المعروض لم يُلمس في كل ذلك
  assert.equal(buildSearchableQuranText(BISMILLAH).displayText, BISMILLAH);
});

test('search matches undiacritised queries but never matches on empty input', () => {
  assert.ok(quranSearchMatches(BISMILLAH, 'بسم'), 'undiacritised query matches diacritised text');
  assert.ok(quranSearchMatches(HAMD, 'الحمد'));
  assert.ok(!quranSearchMatches(BISMILLAH, 'الحمد'));
  // استعلامٌ فارغ لا يطابق كل شيء
  assert.equal(quranSearchMatches(BISMILLAH, ''), false);
  assert.equal(quranSearchMatches(BISMILLAH, '   '), false);
});
