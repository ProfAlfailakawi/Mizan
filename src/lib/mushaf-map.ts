// Mushaf page map — standard 604-page Madani layout (KFGQPC-style pagination).
//
// SCOPE & HONESTY: this is the well-known public pagination reference (the page on which each
// surah begins in the 604-page Madani Mushaf). It is used ONLY to place a recitation locus on a
// hall visualization — it is never a source of Quran text, never a ruling on ibtida', and never
// a substitute for the certified Quran Source Vault package. Exact per-ayah page boundaries come
// from the certified package at deployment; here we resolve a locus to its surah's page and
// refine within the surah proportionally, which is precise enough for an aggregate heat map.

export const MUSHAF_TOTAL_PAGES = 604;

/** Page on which each surah (1..114) begins in the 604-page Madani Mushaf. */
const SURAH_START_PAGE: Record<number, number> = {
  1: 1, 2: 2, 3: 50, 4: 77, 5: 106, 6: 128, 7: 151, 8: 177, 9: 187, 10: 208,
  11: 221, 12: 235, 13: 249, 14: 255, 15: 262, 16: 267, 17: 282, 18: 293, 19: 305, 20: 312,
  21: 322, 22: 332, 23: 342, 24: 350, 25: 359, 26: 367, 27: 377, 28: 385, 29: 396, 30: 404,
  31: 411, 32: 415, 33: 418, 34: 428, 35: 434, 36: 440, 37: 446, 38: 453, 39: 458, 40: 467,
  41: 477, 42: 483, 43: 489, 44: 496, 45: 499, 46: 502, 47: 507, 48: 511, 49: 515, 50: 518,
  51: 520, 52: 523, 53: 526, 54: 528, 55: 531, 56: 534, 57: 537, 58: 542, 59: 545, 60: 549,
  61: 551, 62: 553, 63: 554, 64: 556, 65: 558, 66: 560, 67: 562, 68: 564, 69: 566, 70: 568,
  71: 570, 72: 572, 73: 574, 74: 575, 75: 577, 76: 578, 77: 580, 78: 582, 79: 583, 80: 585,
  81: 586, 82: 587, 83: 587, 84: 589, 85: 590, 86: 591, 87: 591, 88: 592, 89: 593, 90: 594,
  91: 595, 92: 595, 93: 596, 94: 596, 95: 597, 96: 597, 97: 598, 98: 598, 99: 599, 100: 599,
  101: 600, 102: 600, 103: 601, 104: 601, 105: 601, 106: 602, 107: 602, 108: 602, 109: 603,
  110: 603, 111: 603, 112: 604, 113: 604, 114: 604,
};

/** Ayah count per surah — used to refine a locus within its surah's page span. */
const SURAH_AYAHS: Record<number, number> = {
  1: 7, 2: 286, 3: 200, 4: 176, 5: 120, 6: 165, 7: 206, 8: 75, 9: 129, 10: 109,
  11: 123, 12: 111, 13: 43, 14: 52, 15: 99, 16: 128, 17: 111, 18: 110, 19: 98, 20: 135,
  21: 112, 22: 78, 23: 118, 24: 64, 25: 77, 26: 227, 27: 93, 28: 88, 29: 69, 30: 60,
  31: 34, 32: 30, 33: 73, 34: 54, 35: 45, 36: 83, 37: 182, 38: 88, 39: 75, 40: 85,
  41: 54, 42: 53, 43: 89, 44: 59, 45: 37, 46: 35, 47: 38, 48: 29, 49: 18, 50: 45,
  51: 60, 52: 49, 53: 62, 54: 55, 55: 78, 56: 96, 57: 29, 58: 22, 59: 24, 60: 13,
  61: 14, 62: 11, 63: 11, 64: 18, 65: 12, 66: 12, 67: 30, 68: 52, 69: 52, 70: 44,
  71: 28, 72: 28, 73: 20, 74: 56, 75: 40, 76: 31, 77: 50, 78: 40, 79: 46, 80: 42,
  81: 29, 82: 19, 83: 36, 84: 25, 85: 22, 86: 17, 87: 19, 88: 26, 89: 30, 90: 20,
  91: 15, 92: 21, 93: 11, 94: 8, 95: 8, 96: 19, 97: 5, 98: 8, 99: 8, 100: 11,
  101: 11, 102: 8, 103: 3, 104: 9, 105: 5, 106: 4, 107: 7, 108: 3, 109: 6, 110: 3,
  111: 5, 112: 4, 113: 5, 114: 6,
};

/** Which of the 30 ajza' a page belongs to (each juz ≈ 20.13 pages). */
export function pageToJuz(page: number): number {
  return Math.min(30, Math.max(1, Math.ceil(page / (MUSHAF_TOTAL_PAGES / 30))));
}

/**
 * Resolve a recitation locus (surah + ayah) to a Madani Mushaf page (1..604).
 * The surah's start page anchors the result; the ayah refines it proportionally across the
 * surah's page span so long surahs spread across their real range instead of a single page.
 */
export function locusToPage(surah: number, ayah = 1): number {
  const start = SURAH_START_PAGE[surah];
  if (!start) return 1;
  const nextStart = SURAH_START_PAGE[surah + 1] ?? MUSHAF_TOTAL_PAGES + 1;
  const span = Math.max(1, nextStart - start); // pages this surah occupies
  const total = SURAH_AYAHS[surah] || 1;
  const fraction = total <= 1 ? 0 : Math.min(1, Math.max(0, (ayah - 1) / (total - 1)));
  const page = start + Math.floor(fraction * (span - 1));
  return Math.min(MUSHAF_TOTAL_PAGES, Math.max(1, page));
}

export function surahStartPage(surah: number): number {
  return SURAH_START_PAGE[surah] || 1;
}
