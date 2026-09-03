// Hafs pronunciation lexicon — developmental, reading-scoped (§24).
//
// SCOPE & HONESTY: this is a *developmental* grapheme→phoneme (G2P) mapper for Hafs ʿan ʿĀṣim,
// built to generate acoustic pronunciation alternatives for alignment ONLY. It is NOT a tajwīd
// authority and issues NO ruling: it never decides a recitation is right or wrong. Where a rule is
// well-established and uncontested (a consonant + its short vowel; a madd letter lengthening a
// homorganic vowel; gemination on shadda; the two pronunciations of a word at waṣl vs waqf) it is
// applied to widen acoustic matching. Anything contested is simply omitted rather than guessed.
// The mapping is reading-locked: it must never be used for another riwāyah.

import { ReadingId } from './types';

export const LEXICON_READING: ReadingId = 'hafs';
export const LEXICON_VERSION = 'hafs-dev-0.1.0';

/**
 * Phoneme inventory (broad, ASCII-tagged). Long vowels are marked with ':'. Emphatics carry a
 * trailing '?' tag only as an identity marker for the acoustic layer — no tajwīd claim is made.
 */
export type Phoneme = string;

// Base consonant map (letter → broad phoneme). Emphatics kept distinct for acoustic identity.
const CONSONANT: Record<string, Phoneme> = {
  'ء': 'q', 'ا': 'A', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'H', 'خ': 'x',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 'S', 'ض': 'D',
  'ط': 'T', 'ظ': 'Z', 'ع': '3', 'غ': 'gh', 'ف': 'f', 'ق': 'Q', 'ك': 'k', 'ل': 'l',
  'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'أ': 'q', 'إ': 'q', 'آ': 'q',
  'ؤ': 'q', 'ئ': 'q', 'ى': 'y', 'ة': 't', 'ٱ': 'q',
};

const FATHA = 'َ', DAMMA = 'ُ', KASRA = 'ِ';
const FATHATAN = 'ً', DAMMATAN = 'ٌ', KASRATAN = 'ٍ';
const SHADDA = 'ّ', SUKUN = 'ْ', SUP_ALEF = 'ٰ';

const SHORT_VOWEL: Record<string, Phoneme> = { [FATHA]: 'a', [DAMMA]: 'u', [KASRA]: 'i' };
const TANWIN: Record<string, Phoneme[]> = {
  [FATHATAN]: ['a', 'n'], [DAMMATAN]: ['u', 'n'], [KASRATAN]: ['i', 'n'],
};
const SUN_LETTERS = new Set('تثدذرزسشصضطظلن'.split(''));

function isConsonant(ch: string): boolean { return ch in CONSONANT; }
function isMark(ch: string): boolean {
  return [FATHA, DAMMA, KASRA, FATHATAN, DAMMATAN, KASRATAN, SHADDA, SUKUN, SUP_ALEF].includes(ch);
}

/**
 * Convert a fully-diacritized Hafs word to a broad phoneme sequence.
 * `variant`:
 *   - 'wasl' (default): as pronounced when continuing to the next word.
 *   - 'waqf': stopping on the word — the final short vowel/tanwīn is dropped (§25). Both variants
 *     are legitimate; the engine accepts either so a natural stop is not treated as a mismatch.
 */
export function phonemizeHafs(original: string, variant: 'wasl' | 'waqf' = 'wasl'): Phoneme[] {
  const chars = Array.from(original);
  const out: Phoneme[] = [];

  // Definite-article assimilation: initial "ال" + sun letter → the lām assimilates (gemination).
  let start = 0;
  if (chars[0] === 'ا' && chars[1] === 'ل') {
    const after = chars.find((c, i) => i > 1 && isConsonant(c));
    if (after && SUN_LETTERS.has(after)) {
      // Skip the lām; the following sun letter is geminated (handled by its own shadda if present,
      // otherwise we add one extra copy to reflect the assimilated lām acoustically).
      out.push('a');
      start = 2;
    }
  }

  for (let i = start; i < chars.length; i++) {
    const ch = chars[i];
    if (!isConsonant(ch)) continue; // skip stray marks handled with their consonant
    const base = CONSONANT[ch];

    // Look ahead for marks attached to this consonant.
    let j = i + 1;
    let shadda = false, sukun = false, supAlef = false;
    let vowel: Phoneme | null = null;
    let tanwin: Phoneme[] | null = null;
    while (j < chars.length && isMark(chars[j])) {
      const m = chars[j];
      if (m === SHADDA) shadda = true;
      else if (m === SUKUN) sukun = true;
      else if (m === SUP_ALEF) supAlef = true;
      else if (m in SHORT_VOWEL) vowel = SHORT_VOWEL[m];
      else if (m in TANWIN) tanwin = TANWIN[m];
      j++;
    }

    // Gemination from shadda: emit the consonant twice.
    out.push(base);
    if (shadda) out.push(base);

    // Long-vowel (madd) detection: a bare و/ي/ا acting as a lengthener after a homorganic vowel.
    const isMaddLetter = ch === 'ا' || (ch === 'و' && !vowel && !sukun) || (ch === 'ي' && !vowel && !sukun);
    const prevVowel = out.length >= 2 ? findLastVowel(out) : null;
    if (ch === 'ا' && (prevVowel === 'a')) { replaceLastVowelWithLong(out, 'a:'); out.pop(); continue; }
    if (ch === 'و' && !vowel && !sukun && prevVowel === 'u') { replaceLastVowelWithLong(out, 'u:'); out.pop(); continue; }
    if (ch === 'ي' && !vowel && !sukun && prevVowel === 'i') { replaceLastVowelWithLong(out, 'i:'); out.pop(); continue; }
    void isMaddLetter;

    if (supAlef) { out.push('a:'); }
    else if (vowel) out.push(vowel);
    else if (tanwin) out.push(...tanwin);

    i = j - 1;
  }

  if (variant === 'waqf') trimForWaqf(out);
  return out.filter(Boolean);
}

function findLastVowel(seq: Phoneme[]): Phoneme | null {
  for (let k = seq.length - 1; k >= 0; k--) {
    if (['a', 'u', 'i', 'a:', 'u:', 'i:'].includes(seq[k])) return seq[k].replace(':', '');
  }
  return null;
}
function replaceLastVowelWithLong(seq: Phoneme[], long: Phoneme) {
  for (let k = seq.length - 1; k >= 0; k--) {
    if (['a', 'u', 'i'].includes(seq[k])) { seq[k] = long; return; }
  }
}
/** At waqf the final short vowel or tanwīn nūn is dropped (a legitimate stop pronunciation). */
function trimForWaqf(seq: Phoneme[]) {
  if (!seq.length) return;
  if (seq[seq.length - 1] === 'n' && ['a', 'u', 'i'].includes(seq[seq.length - 2])) { seq.splice(-2, 2); return; }
  if (['a', 'u', 'i'].includes(seq[seq.length - 1])) seq.pop();
}
