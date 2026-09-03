// Canonical Quran Alignment Representation (§4).
//
// A reading-locked, UI-independent representation of the EXPECTED passage. It is the only "truth"
// the engine aligns against. In production the words come from MIZAN's certified Quran Source Vault
// (server-side), carrying the canonicalTextHash + package version for provenance. For engine tests
// and the benchmark we use a clearly-labelled DEVELOPMENT fixture — never a substitute for the
// certified source, and reading-locked to Hafs.

import crypto from 'crypto';
import { ReadingId } from './types';
import { toAlignmentForm, toGraphemeSequence, wordSignature } from './normalize';
import { phonemizeHafs, LEXICON_READING } from './lexicon-hafs';

export interface CanonicalWord {
  readingId: ReadingId;
  surah: number;
  ayah: number;
  wordIndex: number;        // 0-based within its ayah
  globalWordIndex: number;  // 0-based within the passage window
  wordText: string;         // original, diacritized, official (never mutated)
  alignmentForm: string;    // normalized form used inside the engine
  graphemes: string[];
  phonemesWasl: string[];   // pronunciation when continuing
  phonemesWaqf: string[];   // pronunciation when stopping on this word
  signature: string;        // stable per-word signature (for anchors)
  prevGlobalWordIndex: number | null;
  nextGlobalWordIndex: number | null;
}

export interface CanonicalPassage {
  readingId: ReadingId;
  surah: number;
  startAyah: number;
  endAyah: number;
  words: CanonicalWord[];
  canonicalTextHash: string;
  ayahWordRanges: { ayah: number; from: number; to: number }[]; // global index ranges per ayah
}

export interface RawAyah { surah: number; ayah: number; text: string; }

/** Build a canonical passage from official ayah texts (space-separated words). Reading-locked. */
export function buildCanonicalPassage(readingId: ReadingId, ayat: RawAyah[]): CanonicalPassage {
  if (readingId !== LEXICON_READING) {
    // Reading isolation: only Hafs has an operational lexicon in this build.
    throw new Error(`CANONICAL_READING_UNSUPPORTED: ${readingId}`);
  }
  const words: CanonicalWord[] = [];
  const ayahWordRanges: CanonicalPassage['ayahWordRanges'] = [];
  let g = 0;
  for (const a of ayat) {
    const tokens = a.text.trim().split(/\s+/).filter(Boolean);
    const from = g;
    tokens.forEach((tok, wi) => {
      const alignmentForm = toAlignmentForm(tok);
      words.push({
        readingId,
        surah: a.surah,
        ayah: a.ayah,
        wordIndex: wi,
        globalWordIndex: g,
        wordText: tok,
        alignmentForm,
        graphemes: toGraphemeSequence(alignmentForm),
        phonemesWasl: phonemizeHafs(tok, 'wasl'),
        phonemesWaqf: phonemizeHafs(tok, 'waqf'),
        signature: wordSignature(alignmentForm),
        prevGlobalWordIndex: g > 0 ? g - 1 : null,
        nextGlobalWordIndex: null, // filled below
      });
      g++;
    });
    ayahWordRanges.push({ ayah: a.ayah, from, to: g - 1 });
  }
  for (let i = 0; i < words.length; i++) words[i].nextGlobalWordIndex = i < words.length - 1 ? i + 1 : null;

  const canonicalTextHash = crypto.createHash('sha256')
    .update(`${readingId}\n` + ayat.map(a => `${a.surah}:${a.ayah}\t${a.text}`).join('\n'))
    .digest('hex');

  return {
    readingId,
    surah: ayat[0].surah,
    startAyah: ayat[0].ayah,
    endAyah: ayat[ayat.length - 1].ayah,
    words,
    canonicalTextHash,
    ayahWordRanges,
  };
}

export function positionForGlobalIndex(passage: CanonicalPassage, globalWordIndex: number) {
  const w = passage.words[globalWordIndex];
  if (!w) return null;
  return { surah: w.surah, ayah: w.ayah, wordIndex: w.wordIndex, globalWordIndex: w.globalWordIndex };
}

// ---------------------------------------------------------------------------------------------
// DEVELOPMENT fixture — NON-OFFICIAL. Production MUST replace this with certified-vault text.
// Passage: al-Baqarah 255–257 (Āyat al-Kursī + following), Hafs. Used only by engine tests and the
// synthetic benchmark; it carries no certification and must not drive any official session.
// ---------------------------------------------------------------------------------------------
export const DEV_HAFS_AYAT: RawAyah[] = [
  { surah: 2, ayah: 255, text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ وَلَا يَئُودُهُ حِفْظُهُمَا وَهُوَ الْعَلِيُّ الْعَظِيمُ' },
  { surah: 2, ayah: 256, text: 'لَا إِكْرَاهَ فِي الدِّينِ قَد تَّبَيَّنَ الرُّشْدُ مِنَ الْغَيِّ فَمَن يَكْفُرْ بِالطَّاغُوتِ وَيُؤْمِن بِاللَّهِ فَقَدِ اسْتَمْسَكَ بِالْعُرْوَةِ الْوُثْقَىٰ لَا انفِصَامَ لَهَا وَاللَّهُ سَمِيعٌ عَلِيمٌ' },
  { surah: 2, ayah: 257, text: 'اللَّهُ وَلِيُّ الَّذِينَ آمَنُوا يُخْرِجُهُم مِّنَ الظُّلُمَاتِ إِلَى النُّورِ وَالَّذِينَ كَفَرُوا أَوْلِيَاؤُهُمُ الطَّاغُوتُ يُخْرِجُونَهُم مِّنَ النُّورِ إِلَى الظُّلُمَاتِ أُولَٰئِكَ أَصْحَابُ النَّارِ هُمْ فِيهَا خَالِدُونَ' },
];

/** Convenience: the development passage as a CanonicalPassage (Hafs). Clearly non-official. */
export function devHafsPassage(startAyah = 255, endAyah = 257): CanonicalPassage {
  return buildCanonicalPassage('hafs', DEV_HAFS_AYAT.filter(a => a.ayah >= startAyah && a.ayah <= endAyah));
}
