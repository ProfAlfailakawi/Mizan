import { QuestionPoolItem } from '../types';

export interface SurahMeta {
  number: number;
  nameArabic: string;
  nameEnglish: string;
  revelationPlace: 'Makkah' | 'Madinah';
  totalAyahs: number;
  juzStart: number;
}

export const SURAH_DIRECTORY: SurahMeta[] = [
  { number: 1, nameArabic: 'الفاتحة', nameEnglish: 'Al-Fatihah', revelationPlace: 'Makkah', totalAyahs: 7, juzStart: 1 },
  { number: 2, nameArabic: 'البقرة', nameEnglish: 'Al-Baqarah', revelationPlace: 'Madinah', totalAyahs: 286, juzStart: 1 },
  { number: 3, nameArabic: 'آل عمران', nameEnglish: 'Ali Imran', revelationPlace: 'Madinah', totalAyahs: 200, juzStart: 3 },
  { number: 4, nameArabic: 'النساء', nameEnglish: 'An-Nisa', revelationPlace: 'Madinah', totalAyahs: 176, juzStart: 4 },
  { number: 5, nameArabic: 'المائدة', nameEnglish: 'Al-Maidah', revelationPlace: 'Madinah', totalAyahs: 120, juzStart: 6 },
  { number: 6, nameArabic: 'الأنعام', nameEnglish: 'Al-Anam', revelationPlace: 'Makkah', totalAyahs: 165, juzStart: 7 },
  { number: 7, nameArabic: 'الأعراف', nameEnglish: 'Al-Araf', revelationPlace: 'Makkah', totalAyahs: 206, juzStart: 8 },
  { number: 8, nameArabic: 'الأنفال', nameEnglish: 'Al-Anfal', revelationPlace: 'Madinah', totalAyahs: 75, juzStart: 9 },
  { number: 9, nameArabic: 'التوبة', nameEnglish: 'At-Tawbah', revelationPlace: 'Madinah', totalAyahs: 129, juzStart: 10 },
  { number: 10, nameArabic: 'يونس', nameEnglish: 'Yunus', revelationPlace: 'Makkah', totalAyahs: 109, juzStart: 11 },
  { number: 11, nameArabic: 'هود', nameEnglish: 'Hud', revelationPlace: 'Makkah', totalAyahs: 123, juzStart: 11 },
  { number: 12, nameArabic: 'يوسف', nameEnglish: 'Yusuf', revelationPlace: 'Makkah', totalAyahs: 111, juzStart: 12 },
  { number: 18, nameArabic: 'الكهف', nameEnglish: 'Al-Kahf', revelationPlace: 'Makkah', totalAyahs: 110, juzStart: 15 },
  { number: 19, nameArabic: 'مريم', nameEnglish: 'Maryam', revelationPlace: 'Makkah', totalAyahs: 98, juzStart: 16 },
  { number: 20, nameArabic: 'طه', nameEnglish: 'Ta-Ha', revelationPlace: 'Makkah', totalAyahs: 135, juzStart: 16 },
  { number: 24, nameArabic: 'النور', nameEnglish: 'An-Nur', revelationPlace: 'Madinah', totalAyahs: 64, juzStart: 18 },
  { number: 36, nameArabic: 'يس', nameEnglish: 'Ya-Sin', revelationPlace: 'Makkah', totalAyahs: 83, juzStart: 22 },
  { number: 55, nameArabic: 'الرحمن', nameEnglish: 'Ar-Rahman', revelationPlace: 'Madinah', totalAyahs: 78, juzStart: 27 },
  { number: 67, nameArabic: 'الملك', nameEnglish: 'Al-Mulk', revelationPlace: 'Makkah', totalAyahs: 30, juzStart: 29 },
  { number: 112, nameArabic: 'الإخلاص', nameEnglish: 'Al-Ikhlas', revelationPlace: 'Makkah', totalAyahs: 4, juzStart: 30 }
];

export const QURAN_SOURCE_FIXTURES = [
  {
    id: 'fixture-hafs-development',
    nameArabic: 'مصدر تطوير — حفص عن عاصم',
    nameEnglish: 'Development source fixture — Hafs',
    riwaya: 'حفص عن عاصم (Hafs an Asim)',
    checksumSha256: null,
    approvalStatus: 'Not production certified',
    effectiveDate: null,
    capabilities: {
      humanJudging: 'Requires institutional approval',
      wordAlignment: 'Not certified',
      silentMemorizationWatch: 'Not certified',
      tajweedPhonemeModel: 'Not certified'
    }
  },
  {
    id: 'fixture-warsh-development',
    nameArabic: 'مصدر تطوير — ورش عن نافع',
    nameEnglish: 'Development source fixture — Warsh',
    riwaya: 'ورش عن نافع (Warsh an Nafi)',
    checksumSha256: null,
    approvalStatus: 'Not production certified',
    effectiveDate: null,
    capabilities: {
      humanJudging: 'Requires institutional approval',
      wordAlignment: 'Not certified',
      silentMemorizationWatch: 'Not certified',
      tajweedPhonemeModel: 'Not certified'
    }
  }
];

/**
 * Development-only question fixtures. The text here must never be treated as the
 * production source of truth. Production deployment must import an institutionally
 * approved, versioned Quran corpus into the Quran Source Vault and replace these fixtures.
 */

export const DEVELOPMENT_QUESTION_BANK: QuestionPoolItem[] = [
  {
    id: 'q-baqarah-142',
    surahNumber: 2,
    surahNameArabic: 'البقرة',
    surahNameEnglish: 'Al-Baqarah',
    startAyah: 142,
    endAyah: 147,
    juzNumber: 2,
    riwaya: 'Hafs',
    expectedTextArabic: 'DEVELOPMENT — resolve text from a certified Quran Source Vault package before any official use.',
    difficultyRating: 3,
    mutashabihatDensity: 'high',
    tajweedComplexity: 'intermediate',
    timesUsed: 12
  },
  {
    id: 'q-ali-imran-102',
    surahNumber: 3,
    surahNameArabic: 'آل عمران',
    surahNameEnglish: 'Ali Imran',
    startAyah: 102,
    endAyah: 107,
    juzNumber: 4,
    riwaya: 'Hafs',
    expectedTextArabic: 'DEVELOPMENT — resolve text from a certified Quran Source Vault package before any official use.',
    difficultyRating: 2,
    mutashabihatDensity: 'medium',
    tajweedComplexity: 'intermediate',
    timesUsed: 15
  },
  {
    id: 'q-an-nisa-58',
    surahNumber: 4,
    surahNameArabic: 'النساء',
    surahNameEnglish: 'An-Nisa',
    startAyah: 58,
    endAyah: 63,
    juzNumber: 5,
    riwaya: 'Hafs',
    expectedTextArabic: 'DEVELOPMENT — resolve text from a certified Quran Source Vault package before any official use.',
    difficultyRating: 3,
    mutashabihatDensity: 'medium',
    tajweedComplexity: 'advanced',
    timesUsed: 8
  },
  {
    id: 'q-kahf-1',
    surahNumber: 18,
    surahNameArabic: 'الكهف',
    surahNameEnglish: 'Al-Kahf',
    startAyah: 1,
    endAyah: 8,
    juzNumber: 15,
    riwaya: 'Hafs',
    expectedTextArabic: 'DEVELOPMENT — resolve text from a certified Quran Source Vault package before any official use.',
    difficultyRating: 2,
    mutashabihatDensity: 'low',
    tajweedComplexity: 'intermediate',
    timesUsed: 19
  },
  {
    id: 'q-yusuf-21',
    surahNumber: 12,
    surahNameArabic: 'يوسف',
    surahNameEnglish: 'Yusuf',
    startAyah: 21,
    endAyah: 26,
    juzNumber: 12,
    riwaya: 'Hafs',
    expectedTextArabic: 'DEVELOPMENT — resolve text from a certified Quran Source Vault package before any official use.',
    difficultyRating: 4,
    mutashabihatDensity: 'high',
    tajweedComplexity: 'advanced',
    timesUsed: 10
  },
  {
    id: 'q-nur-35',
    surahNumber: 24,
    surahNameArabic: 'النور',
    surahNameEnglish: 'An-Nur',
    startAyah: 35,
    endAyah: 38,
    juzNumber: 18,
    riwaya: 'Hafs',
    expectedTextArabic: 'DEVELOPMENT — resolve text from a certified Quran Source Vault package before any official use.',
    difficultyRating: 3,
    mutashabihatDensity: 'low',
    tajweedComplexity: 'advanced',
    timesUsed: 14
  }
];

export function getSurahByNumber(num: number): SurahMeta | undefined {
  return SURAH_DIRECTORY.find((s) => s.number === num);
}

