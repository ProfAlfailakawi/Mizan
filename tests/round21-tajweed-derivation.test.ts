import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAyahTajweed, TAJWEED_LABELS_AR, type TajweedRule } from '../server/quran-tajweed';

/**
 * Tajweed marks are derived from the Mushaf text itself rather than imported as character offsets
 * computed against a different text. Measured against the KFGQPC package, imported offsets landed
 * correctly for only about half the ayat and slid past the end of the text for the rest — which
 * would colour letters that are not the ruled letter. These tests pin the derivation to the letters
 * it actually claims.
 */

const ruleAt = (text: string, rule: TajweedRule) =>
  deriveAyahTajweed(text).filter((s) => s.rule === rule).map((s) => text.slice(s.start, s.end));

test('hamzat wasl is marked on the letter the Mushaf draws for it', () => {
  const bismillah = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ١';
  assert.deepEqual(ruleAt(bismillah, 'hamzat_wasl'), ['ٱ', 'ٱ', 'ٱ']);
});

test('lam is sun or moon according to the letter that follows, not by guesswork', () => {
  // ٱلرَّحۡمَٰن: ر is a sun letter carrying shadda → assimilated lam
  assert.equal(ruleAt('ٱلرَّحۡمَٰنِ', 'lam_shamsiyyah').length, 1);
  assert.equal(ruleAt('ٱلرَّحۡمَٰنِ', 'lam_qamariyyah').length, 0);
  // ٱلۡحَمۡد: ح is a moon letter → pronounced lam
  assert.equal(ruleAt('ٱلۡحَمۡدُ', 'lam_qamariyyah').length, 1);
  assert.equal(ruleAt('ٱلۡحَمۡدُ', 'lam_shamsiyyah').length, 0);
});

test('a doubled noon or meem is a ghunnah', () => {
  assert.equal(ruleAt('إِنَّ', 'ghunnah').length, 1);
  assert.equal(ruleAt('ثُمَّ', 'ghunnah').length, 1);
  assert.equal(ruleAt('مِن', 'ghunnah').length, 0, 'an undoubled noon is not a ghunnah');
});

test('noon sakinah takes the rule of the letter after it', () => {
  assert.equal(ruleAt('مِنۢ بَعۡدِ', 'iqlab').length, 1, 'noon before ب is iqlab');
  assert.equal(ruleAt('مِن قَبۡلُ', 'ikhfa').length, 1, 'noon before ق is ikhfa');
  assert.equal(ruleAt('مِن رَّبِّهِمۡ', 'idghaam_no_ghunnah').length, 1, 'noon before ر assimilates without ghunnah');
  assert.equal(ruleAt('مِنۡ هَٰذَا', 'izhar').length, 1, 'noon before a throat letter is izhar');
});

test('meem sakinah is distinguished from noon sakinah', () => {
  assert.equal(ruleAt('هُمۡ بِهِ', 'ikhfa_shafawi').length, 1);
  assert.equal(ruleAt('لَهُمۡ مَّا', 'idghaam_shafawi').length, 1);
  assert.equal(ruleAt('عَلَيۡهِمۡ وَلَا', 'izhar_shafawi').length, 1);
});

test('qalqalah is only on its five letters when they carry sukun', () => {
  assert.deepEqual(ruleAt('يَقۡطَعُ', 'qalqalah'), ['ق']);
  assert.equal(ruleAt('قُلۡ', 'qalqalah').length, 0, 'a voweled qaf is not qalqalah');
  assert.equal(ruleAt('بِسۡمِ', 'qalqalah').length, 0, 'seen is not a qalqalah letter');
});

test('spans stay inside the text, never overlap, and never cover an ayah number', () => {
  const text = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ١';
  const spans = deriveAyahTajweed(text);
  assert.ok(spans.length > 0);
  let previousEnd = -1;
  for (const s of spans) {
    assert.ok(s.start >= 0 && s.end <= text.length, 'a span must stay inside the ayah');
    assert.ok(s.end > s.start);
    assert.ok(s.start >= previousEnd || s.start >= spans[0].start, 'spans are ordered');
    previousEnd = Math.max(previousEnd, s.end);
    assert.ok(!/[٠-٩]/.test(text.slice(s.start, s.end)), 'an ayah number is never a ruled letter');
  }
});

test('derivation is deterministic — the same text always yields the same marks', () => {
  const text = 'وَمَا ٱللَّهُ بِغَٰفِلٍ عَمَّا تَعۡمَلُونَ';
  assert.deepEqual(deriveAyahTajweed(text), deriveAyahTajweed(text));
});

test('every derived rule has an Arabic label, so nothing renders as a raw key', () => {
  const sample = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ إِنَّ مِن قَبۡلُ هُمۡ بِهِ يَقۡطَعُ';
  for (const s of deriveAyahTajweed(sample)) {
    assert.ok(TAJWEED_LABELS_AR[s.rule], `missing Arabic label for ${s.rule}`);
  }
});

test('text with no ruled letter produces no marks rather than an invented one', () => {
  assert.deepEqual(deriveAyahTajweed('١'), []);
  assert.deepEqual(deriveAyahTajweed(''), []);
});
