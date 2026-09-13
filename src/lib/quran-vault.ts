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

export function getSurahByNumber(num: number): SurahMeta | undefined {
  return SURAH_DIRECTORY.find((s) => s.number === num);
}

