/*
 * المرجع القانوني لبنية المصحف — surah/ayah هو مصدر الحقيقة الوحيد.
 *
 * كل وحدة أخرى (جزء، حزب، ربع، صفحة) مشتقة من هذا المرجع، ولا تُتخذ مصدرًا للحقيقة.
 * وهذا هو الفرق الذي يقوم عليه محرك النطاق: «عشرة أجزاء» عبارةٌ بشرية لا تحدد موضعًا،
 * أما «من البقرة ١ إلى التوبة ٩٢» فموضعٌ لا يحتمل تأويلًا.
 *
 * درجات التوثيق (assurance) معلنة صراحةً لكل وحدة، فلا يُدّعى دقّةٌ ليست في البيانات:
 *   CANONICAL_TABLE       — جدول قانوني ثابت (عدد آيات كل سورة، مطالع الأجزاء الثلاثين).
 *   DERIVED_PROPORTIONAL  — مشتق داخل الوحدة الأكبر بحسب عدد الآيات (الأحزاب والأرباع والصفحات).
 *   CERTIFIED_SOURCE      — مأخوذ من حزمة المصدر المعتمدة حين تكون مركّبة (الخادم).
 *
 * ما كان DERIVED_PROPORTIONAL يُعرض للمستخدم موصوفًا بأنه تقريبي، ويظل قابلًا للتعديل
 * اليدوي إلى حدّ آية حقيقي. ومتى رُكّبت حزمة المصدر المعتمدة فهي المقدَّمة على الاشتقاق.
 */

export const QURAN_SURAH_TOTAL = 114;
export const QURAN_JUZ_TOTAL = 30;
export const QURAN_HIZB_TOTAL = 60;
export const QURAN_RUB_TOTAL = 240;
export const MUSHAF_TOTAL_PAGES = 604;

export type QuranUnitAssurance = 'CANONICAL_TABLE' | 'DERIVED_PROPORTIONAL' | 'CERTIFIED_SOURCE';
export type QuranScopeUnit = 'juz' | 'hizb' | 'rub' | 'page' | 'surah' | 'ayah';

/** عدد آيات كل سورة (١..١١٤) في العدّ الكوفي المعتمد في المصحف المدني. */
const SURAH_AYAHS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
  5, 4, 5, 6,
];

const SURAH_NAMES_AR: readonly string[] = [
  'الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس',
  'هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه',
  'الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم',
  'لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر',
  'فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق',
  'الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة',
  'الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج',
  'نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس',
  'التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد',
  'الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات',
  'القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر',
  'المسد','الإخلاص','الفلق','الناس',
];

const SURAH_NAMES_EN: readonly string[] = [
  'Al-Fatihah','Al-Baqarah','Aal-Imran','An-Nisa','Al-Maidah','Al-Anam','Al-Araf','Al-Anfal','At-Tawbah','Yunus',
  'Hud','Yusuf','Ar-Rad','Ibrahim','Al-Hijr','An-Nahl','Al-Isra','Al-Kahf','Maryam','Ta-Ha',
  'Al-Anbiya','Al-Hajj','Al-Muminun','An-Nur','Al-Furqan','Ash-Shuara','An-Naml','Al-Qasas','Al-Ankabut','Ar-Rum',
  'Luqman','As-Sajdah','Al-Ahzab','Saba','Fatir','Ya-Sin','As-Saffat','Sad','Az-Zumar','Ghafir',
  'Fussilat','Ash-Shura','Az-Zukhruf','Ad-Dukhan','Al-Jathiyah','Al-Ahqaf','Muhammad','Al-Fath','Al-Hujurat','Qaf',
  'Adh-Dhariyat','At-Tur','An-Najm','Al-Qamar','Ar-Rahman','Al-Waqiah','Al-Hadid','Al-Mujadilah','Al-Hashr','Al-Mumtahanah',
  'As-Saff','Al-Jumuah','Al-Munafiqun','At-Taghabun','At-Talaq','At-Tahrim','Al-Mulk','Al-Qalam','Al-Haqqah','Al-Maarij',
  'Nuh','Al-Jinn','Al-Muzzammil','Al-Muddaththir','Al-Qiyamah','Al-Insan','Al-Mursalat','An-Naba','An-Naziat','Abasa',
  'At-Takwir','Al-Infitar','Al-Mutaffifin','Al-Inshiqaq','Al-Buruj','At-Tariq','Al-Ala','Al-Ghashiyah','Al-Fajr','Al-Balad',
  'Ash-Shams','Al-Layl','Ad-Duha','Ash-Sharh','At-Tin','Al-Alaq','Al-Qadr','Al-Bayyinah','Az-Zalzalah','Al-Adiyat',
  'Al-Qariah','At-Takathur','Al-Asr','Al-Humazah','Al-Fil','Quraysh','Al-Maun','Al-Kawthar','Al-Kafirun','An-Nasr',
  'Al-Masad','Al-Ikhlas','Al-Falaq','An-Nas',
];

/** الصفحة التي تبدأ عندها كل سورة في المصحف المدني (٦٠٤ صفحات). */
const SURAH_START_PAGE: readonly number[] = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208,
  221, 235, 249, 255, 262, 267, 282, 293, 305, 312,
  322, 332, 342, 350, 359, 367, 377, 385, 396, 404,
  411, 415, 418, 428, 434, 440, 446, 453, 458, 467,
  477, 483, 489, 496, 499, 502, 507, 511, 515, 518,
  520, 523, 526, 528, 531, 534, 537, 542, 545, 549,
  551, 553, 554, 556, 558, 560, 562, 564, 566, 568,
  570, 572, 574, 575, 577, 578, 580, 582, 583, 585,
  586, 587, 587, 589, 590, 591, 591, 592, 593, 594,
  595, 595, 596, 596, 597, 597, 598, 598, 599, 599,
  600, 600, 601, 601, 601, 602, 602, 602, 603, 603,
  603, 604, 604, 604,
];

/** مطالع الأجزاء الثلاثين — جدول قانوني ثابت (سورة، آية). */
const JUZ_STARTS: readonly (readonly [number, number])[] = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

export interface QuranLocus { surah: number; ayah: number }

export const isValidSurah = (surah: number) => Number.isInteger(surah) && surah >= 1 && surah <= QURAN_SURAH_TOTAL;
export const ayahCountOf = (surah: number) => (isValidSurah(surah) ? SURAH_AYAHS[surah - 1] : 0);
export const surahNameArabic = (surah: number) => (isValidSurah(surah) ? SURAH_NAMES_AR[surah - 1] : '');
export const surahNameEnglish = (surah: number) => (isValidSurah(surah) ? SURAH_NAMES_EN[surah - 1] : '');
export const surahName = (surah: number, arabic: boolean) => (arabic ? surahNameArabic(surah) : surahNameEnglish(surah));
export const surahStartPage = (surah: number) => (isValidSurah(surah) ? SURAH_START_PAGE[surah - 1] : 1);
export const isValidLocus = (locus: QuranLocus) =>
  isValidSurah(locus.surah) && Number.isInteger(locus.ayah) && locus.ayah >= 1 && locus.ayah <= ayahCountOf(locus.surah);

/** مجموع آيات المصحف في العدّ الكوفي. يُحسب من الجدول ولا يُكتب رقمًا حرًّا. */
export const QURAN_TOTAL_AYAHS = SURAH_AYAHS.reduce((sum, n) => sum + n, 0);

const CUMULATIVE: readonly number[] = (() => {
  const out: number[] = [0];
  for (let i = 0; i < SURAH_AYAHS.length; i++) out.push(out[i] + SURAH_AYAHS[i]);
  return out;
})();

/** ترتيب الآية في المصحف كله (١..QURAN_TOTAL_AYAHS). الأساس الحسابي لكل قياس نطاق. */
export function ayahOrdinal(locus: QuranLocus): number {
  if (!isValidLocus(locus)) throw new Error(`QURAN_LOCUS_INVALID:${locus.surah}:${locus.ayah}`);
  return CUMULATIVE[locus.surah - 1] + locus.ayah;
}

/** عكس ayahOrdinal — من الترتيب المطلق إلى (سورة، آية). */
export function ordinalToLocus(ordinal: number): QuranLocus {
  const n = Math.max(1, Math.min(QURAN_TOTAL_AYAHS, Math.round(ordinal)));
  let low = 1, high = QURAN_SURAH_TOTAL;
  while (low < high) { const mid = (low + high) >> 1; if (CUMULATIVE[mid] >= n) high = mid; else low = mid + 1; }
  return { surah: low, ayah: n - CUMULATIVE[low - 1] };
}

export const compareLoci = (a: QuranLocus, b: QuranLocus) => a.surah - b.surah || a.ayah - b.ayah;
export const lociEqual = (a: QuranLocus, b: QuranLocus) => a.surah === b.surah && a.ayah === b.ayah;
export const FIRST_LOCUS: QuranLocus = { surah: 1, ayah: 1 };
export const LAST_LOCUS: QuranLocus = { surah: QURAN_SURAH_TOTAL, ayah: ayahCountOf(QURAN_SURAH_TOTAL) };

export const surahStartLocus = (surah: number): QuranLocus => ({ surah, ayah: 1 });
export const surahEndLocus = (surah: number): QuranLocus => ({ surah, ayah: ayahCountOf(surah) });

/** حدود الجزء (١..٣٠) — من جدول قانوني، لا اشتقاق. */
export function juzBounds(juz: number): { start: QuranLocus; end: QuranLocus; assurance: QuranUnitAssurance } {
  const n = Math.max(1, Math.min(QURAN_JUZ_TOTAL, Math.round(juz)));
  const [ss, sa] = JUZ_STARTS[n - 1];
  const end = n === QURAN_JUZ_TOTAL ? LAST_LOCUS : ordinalToLocus(ayahOrdinal({ surah: JUZ_STARTS[n][0], ayah: JUZ_STARTS[n][1] }) - 1);
  return { start: { surah: ss, ayah: sa }, end, assurance: 'CANONICAL_TABLE' };
}

const JUZ_START_ORDINALS: readonly number[] = JUZ_STARTS.map(([surah, ayah]) => CUMULATIVE[surah - 1] + ayah);

export function juzOfLocus(locus: QuranLocus): number {
  const ordinal = ayahOrdinal(locus);
  let low = 0, high = QURAN_JUZ_TOTAL - 1;
  while (low < high) { const mid = (low + high + 1) >> 1; if (JUZ_START_ORDINALS[mid] <= ordinal) low = mid; else high = mid - 1; }
  return low + 1;
}

/*
 * الأحزاب والأرباع: حزمة المجمع المستعملة في MIZAN لا تحمل حقلي الحزب والربع، فلا تُختلق
 * جداول لهما. تُشتق الحدود داخل الجزء بقسمة آياته قسمةً متساوية، ويُعلن ذلك في assurance.
 * والاشتقاق قريب عمليًا لأن آيات الجزء الواحد متقاربة الطول، لكنه يبقى تقريبًا معلنًا
 * لا جدولًا قانونيًا — ويظل المنظم قادرًا على تحريك الحدّ إلى آية بعينها.
 */
function subdivideJuz(juz: number, parts: number, index: number) {
  const bounds = juzBounds(juz);
  const first = ayahOrdinal(bounds.start), last = ayahOrdinal(bounds.end), total = last - first + 1;
  const startOffset = Math.round((total * index) / parts);
  const endOffset = Math.round((total * (index + 1)) / parts) - 1;
  return {
    start: ordinalToLocus(first + startOffset),
    end: ordinalToLocus(first + Math.max(startOffset, endOffset)),
    assurance: 'DERIVED_PROPORTIONAL' as QuranUnitAssurance,
  };
}

/** حدود الحزب (١..٦٠) — مشتقة بقسمة الجزء نصفين. */
export function hizbBounds(hizb: number) {
  const n = Math.max(1, Math.min(QURAN_HIZB_TOTAL, Math.round(hizb)));
  return subdivideJuz(Math.ceil(n / 2), 2, (n - 1) % 2);
}

/** حدود ربع الحزب (١..٢٤٠) — مشتقة بقسمة الجزء ثمانية أقسام. */
export function rubBounds(rub: number) {
  const n = Math.max(1, Math.min(QURAN_RUB_TOTAL, Math.round(rub)));
  return subdivideJuz(Math.ceil(n / 8), 8, (n - 1) % 8);
}

/**
 * صفحة الموضع في المصحف المدني. مرساة الصفحة من جدول مطالع السور، ثم تُنسَّب الآية داخل
 * مدى سورتها. تقريب كافٍ للخرائط والملخصات، وتُستبدل بالصفحة الحقيقية متى قُرئت من حزمة
 * المصدر المعتمدة على الخادم.
 */
export function pageOfLocus(locus: QuranLocus): number {
  if (!isValidSurah(locus.surah)) return 1;
  const start = surahStartPage(locus.surah);
  const next = locus.surah < QURAN_SURAH_TOTAL ? surahStartPage(locus.surah + 1) : MUSHAF_TOTAL_PAGES + 1;
  const span = Math.max(1, next - start);
  const total = ayahCountOf(locus.surah);
  const fraction = total <= 1 ? 0 : Math.min(1, Math.max(0, (locus.ayah - 1) / (total - 1)));
  return Math.min(MUSHAF_TOTAL_PAGES, Math.max(1, start + Math.floor(fraction * (span - 1))));
}

/** أول موضع في صفحة معلومة — مشتق بالبحث عن أول آية تقع فيها. */
let PAGE_INDEX: { first: number; last: number }[] | null = null;
function pageIndex() {
  if (PAGE_INDEX) return PAGE_INDEX;
  const index: { first: number; last: number }[] = Array.from({ length: MUSHAF_TOTAL_PAGES + 1 }, () => ({ first: 0, last: 0 }));
  for (let ordinal = 1; ordinal <= QURAN_TOTAL_AYAHS; ordinal++) {
    const page = pageOfLocus(ordinalToLocus(ordinal));
    const slot = index[page];
    if (!slot.first) slot.first = ordinal;
    slot.last = ordinal;
  }
  PAGE_INDEX = index;
  return index;
}

export function pageBounds(page: number): { start: QuranLocus; end: QuranLocus; assurance: QuranUnitAssurance } {
  const target = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, Math.round(page)));
  const slot = pageIndex()[target];
  if (!slot.first) { const fallback = ordinalToLocus(Math.round((target / MUSHAF_TOTAL_PAGES) * QURAN_TOTAL_AYAHS)); return { start: fallback, end: fallback, assurance: 'DERIVED_PROPORTIONAL' }; }
  return { start: ordinalToLocus(slot.first), end: ordinalToLocus(slot.last), assurance: 'DERIVED_PROPORTIONAL' };
}

export function unitAssurance(unit: QuranScopeUnit): QuranUnitAssurance {
  return unit === 'juz' || unit === 'surah' || unit === 'ayah' ? 'CANONICAL_TABLE' : 'DERIVED_PROPORTIONAL';
}

export function unitTotal(unit: QuranScopeUnit): number {
  switch (unit) {
    case 'juz': return QURAN_JUZ_TOTAL;
    case 'hizb': return QURAN_HIZB_TOTAL;
    case 'rub': return QURAN_RUB_TOTAL;
    case 'page': return MUSHAF_TOTAL_PAGES;
    case 'surah': return QURAN_SURAH_TOTAL;
    case 'ayah': return QURAN_TOTAL_AYAHS;
  }
}

export function unitBounds(unit: QuranScopeUnit, index: number): { start: QuranLocus; end: QuranLocus; assurance: QuranUnitAssurance } {
  switch (unit) {
    case 'juz': return juzBounds(index);
    case 'hizb': return hizbBounds(index);
    case 'rub': return rubBounds(index);
    case 'page': return pageBounds(index);
    case 'surah': {
      const surah = Math.max(1, Math.min(QURAN_SURAH_TOTAL, Math.round(index)));
      return { start: surahStartLocus(surah), end: surahEndLocus(surah), assurance: 'CANONICAL_TABLE' };
    }
    case 'ayah': {
      const locus = ordinalToLocus(index);
      return { start: locus, end: locus, assurance: 'CANONICAL_TABLE' };
    }
  }
}
