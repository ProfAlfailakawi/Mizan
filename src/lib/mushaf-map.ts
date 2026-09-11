// Mushaf page map — standard 604-page Madani layout (KFGQPC-style pagination).
//
// SCOPE & HONESTY: this is the well-known public pagination reference (the page on which each
// surah begins in the 604-page Madani Mushaf). It is used ONLY to place a recitation locus on a
// hall visualization — it is never a source of Quran text, never a ruling on ibtida', and never
// a substitute for the certified Quran Source Vault package. Exact per-ayah page boundaries come
// from the certified package at deployment; here we resolve a locus to its surah's page and
// refine within the surah proportionally, which is precise enough for an aggregate heat map.
//
// الجداول نفسها تعيش في quran-canon.ts — مرجع بنية المصحف الوحيد — فلا تُنسخ هنا مرة ثانية.

import { MUSHAF_TOTAL_PAGES, QURAN_JUZ_TOTAL, ayahCountOf, pageOfLocus, surahStartPage as canonicalSurahStartPage } from './quran-canon';

export { MUSHAF_TOTAL_PAGES };

/** Which of the 30 ajza' a page belongs to (each juz ≈ 20.13 pages). */
export function pageToJuz(page: number): number {
  return Math.min(QURAN_JUZ_TOTAL, Math.max(1, Math.ceil(page / (MUSHAF_TOTAL_PAGES / QURAN_JUZ_TOTAL))));
}

/**
 * Resolve a recitation locus (surah + ayah) to a Madani Mushaf page (1..604).
 * The surah's start page anchors the result; the ayah refines it proportionally across the
 * surah's page span so long surahs spread across their real range instead of a single page.
 */
export function locusToPage(surah: number, ayah = 1): number {
  return pageOfLocus({ surah, ayah });
}

export function surahStartPage(surah: number): number {
  return canonicalSurahStartPage(surah);
}

/** عدد آيات السورة، لقصر أي اختيار على ما فيها فعلًا. من الجدول القانوني في quran-canon. */
export function surahAyahCount(surah: number): number {
  return ayahCountOf(surah);
}


