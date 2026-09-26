/*
 * صوت القرآن في ميزان — مصدرٌ واحدٌ مركزيّ.
 *
 * التلاوة الوحيدة المعتمدة: الشيخ محمود خليل الحصري — المصحف المرتل (حفص عن عاصم)،
 * آيةً آية، من مجلّد EveryAyah `Husary_128kbps`. لا قارئ غيره، ولا بديل احتياطيّ.
 *
 * - `getHusaryAudioUrl` رابط المصدر الأصلي (يستعمله الخادم وحده).
 * - `getQuranAudioUrl` الرابط الذي يشغّله المتصفح: من الأصل نفسه عبر وكيل الخادم،
 *   فلا قيود CORS على فكّ الصوت (قصّ السطر الأول، كلمة القارئ) ولا خرق لـ CSP (media-src 'self').
 */

export const QURAN_AUDIO_RECITER_ID = 'husary-murattal' as const;
export const QURAN_AUDIO_RECITER_AR = 'الشيخ محمود خليل الحصري' as const;
export const QURAN_AUDIO_RECITER_EN = 'Sheikh Mahmoud Khalil Al-Husary' as const;
export const QURAN_AUDIO_RECITATION_AR = 'محمود خليل الحصري – المصحف المرتل' as const;
/** قراءة التسجيل — حفص عن عاصم (مستقلّة عن رواية النص المعروض). */
export const QURAN_AUDIO_READING = 'hafs' as const;
export const HUSARY_EVERYAYAH_FOLDER = 'Husary_128kbps' as const;
export const HUSARY_EVERYAYAH_BASE = `https://everyayah.com/data/${HUSARY_EVERYAYAH_FOLDER}` as const;

/** عدد آيات كل سورة (١..١١٤) للتحقق من صحة الطلب قبل أي جلب. */
const AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6] as const;

export function isValidAyahRef(surah: number, ayah: number): boolean {
  return Number.isInteger(surah) && surah >= 1 && surah <= 114 && Number.isInteger(ayah) && ayah >= 1 && ayah <= AYAH_COUNTS[surah - 1];
}

/** «SSSAAA» — ثلاث خانات للسورة وثلاث للآية: (2,5) → "002005". */
export function quranAudioFileId(surah: number, ayah: number): string {
  if (!isValidAyahRef(surah, ayah)) throw new RangeError(`Invalid ayah reference ${surah}:${ayah}`);
  return `${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}`;
}

/** رابط ملف الآية في EveryAyah (الحصري المرتل 128kbps). */
export function getHusaryAudioUrl(surah: number, ayah: number): string {
  return `${HUSARY_EVERYAYAH_BASE}/${quranAudioFileId(surah, ayah)}.mp3`;
}

/** الرابط الذي يشغّله التطبيق: الوكيل ذو الأصل نفسه لتلاوة الحصري. */
export function getQuranAudioUrl(surah: number, ayah: number): string {
  return `/api/public/quran-audio/${quranAudioFileId(surah, ayah)}.mp3`;
}
