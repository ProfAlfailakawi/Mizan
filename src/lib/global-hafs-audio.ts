/*
 * الصوت العالمي بحفص — هوية صوتٍ واحدة لكل الروايات العشرين.
 *
 * قرارُ منتَجٍ متعمّد: الصوت لجميع الروايات حفصٌ عن عاصم، بلا استثناء. لكنّ هوية الصوت
 * مستقلّةٌ تمامًا عن هوية النص: نصّ هشام يبقى هشامًا وإن كان الصوت حفصًا. فلا يُتّخذ صوتُ
 * حفصٍ دليلًا على أن النصّ حفص، ولا تُبنى مزامنةٌ على مستوى الكلمة بين صوت حفصٍ ونصّ
 * روايةٍ أخرى وكأنّهما متطابقان — التشغيل لغير حفص على مستوى الآية/المقطع لا الكلمة.
 *
 * زرّ الواجهة يبقى حرفيًا «استمع إلى الآية» — بلا «بحفص» ولا تحذير؛ اللجنة تعرف المنهج.
 *
 * وحدة طرفية نقيّة: القارئ ثابت (الحصري المرتل)، والملف لا يجلب صوتًا بنفسه.
 */

import { CANONICAL_RAWI_IDS } from './canonical-readings';
import { HUSARY_EVERYAYAH_FOLDER, QURAN_AUDIO_RECITER_AR, QURAN_AUDIO_RECITER_ID } from './quran-audio';

/** نصّ زرّ الاستماع — ثابتٌ حرفيًّا، يُختبَر أنه لا يتغيّر. */
export const LISTEN_BUTTON_LABEL_AR = 'استمع إلى الآية';

export interface GlobalQuranAudioProfile {
  id: 'global-hafs';
  /** هوية الصوت — حفص دائمًا، مستقلّةٌ عن rawi النص. */
  reading: 'hafs';
  /** القارئ الوحيد: الشيخ محمود خليل الحصري — المصحف المرتل. غير قابلٍ للتبديل. */
  reciterId: typeof QURAN_AUDIO_RECITER_ID;
  reciterNameArabic: typeof QURAN_AUDIO_RECITER_AR;
  packageVersion: typeof HUSARY_EVERYAYAH_FOLDER;
  /** مستوى المزامنة المسموح لغير حفص: الآية/المقطع لا الكلمة. */
  nonHafsSyncGranularity: 'AYAH';
}

/** الملف الصوتي العالمي الواحد (الحصري المرتل، `quran-audio.ts`). */
export function globalHafsAudioProfile(): GlobalQuranAudioProfile {
  return {
    id: 'global-hafs',
    reading: 'hafs',
    reciterId: QURAN_AUDIO_RECITER_ID,
    reciterNameArabic: QURAN_AUDIO_RECITER_AR,
    packageVersion: HUSARY_EVERYAYAH_FOLDER,
    nonHafsSyncGranularity: 'AYAH',
  };
}

/**
 * الملف الصوتي لأيّ رواية = العالمي بحفص نفسه. يفشل مغلقًا لراوٍ مجهول، فلا يُشتقّ
 * صوتٌ من هوية غير قانونية. النتيجة واحدةٌ للعشرين — والهوية النصّية تبقى كما هي.
 */
export function audioProfileForReading(rawiId: string): GlobalQuranAudioProfile | undefined {
  if (!CANONICAL_RAWI_IDS.includes(rawiId)) return undefined;
  return globalHafsAudioProfile();
}

/** هل هذه الرواية غيرُ حفص؟ (لِمنع مزامنة الكلمة المضلّلة في طبقة العرض) */
export function requiresAyahLevelSyncOnly(rawiId: string): boolean {
  return rawiId !== 'hafs';
}
