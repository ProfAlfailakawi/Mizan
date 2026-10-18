import test from 'node:test';
import assert from 'node:assert/strict';
import { toWesternDigits, keepArabic, keepLatin, normalizePhone, isValidEmail, normalizeFieldValue } from '../src/lib/input-normalize';

test('Arabic-Indic and Persian digits convert to Western', () => {
  assert.equal(toWesternDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(toWesternDigits('۰۱۲۳'), '0123');
  assert.equal(toWesternDigits('رقم ١٢٣'), 'رقم 123');
});

test('Arabic-name field keeps Arabic, drops Latin', () => {
  assert.equal(keepArabic('أحمد Ahmed حسين'), 'أحمد  حسين');
  assert.equal(keepArabic('عبدالله'), 'عبدالله');
});

test('English-name field keeps Latin, drops Arabic', () => {
  assert.equal(keepLatin('Ahmed أحمد Hussain'), 'Ahmed  Hussain');
  assert.equal(keepLatin("O'Brien-Smith"), "O'Brien-Smith");
});

test('phone keeps only digits (Arabic converted) and a leading +', () => {
  assert.equal(normalizePhone('+965 ٩٩٨٨ 1122'), '+96599881122');
  assert.equal(normalizePhone('abc123'), '123');
  assert.equal(normalizePhone('٠٥٠١٢٣'), '050123');
});

test('email validity', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('bad@'), false);
  assert.equal(isValidEmail('no-at.example.com'), false);
  assert.equal(isValidEmail('x y@z.com'), false);
});

test('normalizeFieldValue routes by field/type', () => {
  assert.equal(normalizeFieldValue('fullNameArabic', 'text', 'أحمد A1'), 'أحمد ');
  assert.equal(normalizeFieldValue('fullName', 'text', 'Ahmed أ'), 'Ahmed ');
  assert.equal(normalizeFieldValue('phone', 'phone', '٠٥٠-x'), '050');
  assert.equal(normalizeFieldValue('email', 'email', ' A@B.com '), 'A@B.com');
  assert.equal(normalizeFieldValue('dateOfBirth', 'date', '٢٠١٠-٠١-٠١'), '2010-01-01');
});

test('search folds Arabic spelling variants, diacritics, digits and spaced codes', async () => {
  const { searchMatches, foldForSearch } = await import('../src/lib/input-normalize');
  assert.ok(searchMatches('أحمد بن عبد الله', 'احمد'), 'alef with hamza matches bare alef');
  assert.ok(searchMatches('مُحَمَّد يوسف', 'محمد'), 'tashkeel is ignored');
  assert.ok(searchMatches('فاطمة الزهراء', 'فاطمه'), 'ta marbuta matches ha');
  assert.ok(searchMatches('عيسى موسى', 'عيسي'), 'alef maqsura matches ya');
  assert.ok(searchMatches('A-2920655 · أحمد', 'A-2 920 655'), 'a code copied from the spaced display still matches');
  assert.ok(searchMatches('A-104', 'a104'), 'case and dash are forgiven for codes');
  assert.ok(searchMatches('A-٢٠٤', 'a-204'), 'Arabic-Indic digits match Western digits');
  assert.ok(searchMatches('anything', '   '), 'an empty query matches everything');
  assert.equal(searchMatches('يوسف', 'ابراهيم'), false, 'and unrelated text still does not match');
  assert.equal(foldForSearch('ـمُـحَـمَّـد'), 'محمد', 'tatweel and marks are stripped');
});
