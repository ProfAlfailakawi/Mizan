// Text representations & normalization (§23).
//
// The official Quran text is sacred and is NEVER mutated. For alignment we derive a *separate*
// normalized representation, and we always keep a traceable mapping back to the original word.
// Three representations coexist:
//   1. original  — exactly as delivered by the certified vault (display + source of truth).
//   2. alignment — diacritic/marks folded for acoustic tokenization (used ONLY inside the engine).
//   3. display   — what a cursor UI shows (== original here; kept as a distinct concept).
//
// Normalization here is conservative and reversible-by-mapping: each alignment token records the
// index of the original word it came from, so a position always maps back to the official word.

/** Arabic diacritics (harakāt, tanwīn, shadda, sukūn, superscript alef, etc.). */
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ࣓-ࣿ]/g;
const TATWEEL = /ـ/g;

/** Alignment-only folding of orthographic variants that are acoustically equivalent word-initially. */
function foldLetters(s: string): string {
  return s
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/ى/g, 'ي')                       // ى → ي
    .replace(/ة/g, 'ه');                      // ة → ه (waqf-friendly; alignment only)
}

/** Strip diacritics + tatweel and fold letters — used to build the alignment token of a word. */
export function toAlignmentForm(original: string): string {
  return foldLetters(original.replace(DIACRITICS, '').replace(TATWEEL, '')).trim();
}

/** A grapheme sequence (code points) of the alignment form — a stable per-word signature. */
export function toGraphemeSequence(alignmentForm: string): string[] {
  return Array.from(alignmentForm);
}

/** Deterministic non-cryptographic signature of a normalized word (for anchors/dedup). */
export function wordSignature(alignmentForm: string): string {
  let h = 2166136261;
  for (const ch of alignmentForm) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
