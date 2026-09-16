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
 * وحدة طرفية نقيّة: القارئ قابلٌ للتهيئة، والملف لا يجلب صوتًا بنفسه.
 */

import { CANONICAL_RAWI_IDS } from './canonical-readings';

/** نصّ زرّ الاستماع — ثابتٌ حرفيًّا، يُختبَر أنه لا يتغيّر. */
export const LISTEN_BUTTON_LABEL_AR = 'استمع إلى الآية';

export interface GlobalQuranAudioProfile {
  id: 'global-hafs';
  /** هوية الصوت — حفص دائمًا، مستقلّةٌ عن rawi النص. */
  reading: 'hafs';
  /** القارئ قابلٌ للتهيئة داخل الملف الصوتي الواحد. */
  reciterId: string;
  reciterNameArabic: string;
  packageVersion: string;
  /** مستوى المزامنة المسموح لغير حفص: الآية/المقطع لا الكلمة. */
  nonHafsSyncGranularity: 'AYAH';
}

/**
 * القارئ الافتراضي = ماهر المعيقلي (مصحف حفص المُنزَّل رسميًا من مجمع الملك فهد).
 * يُبدَّل عبر البيئة دون لمس المنطق التجاري.
 */
export const DEFAULT_GLOBAL_HAFS_RECITER = { id: 'hafs-muaiqly', nameArabic: 'الشيخ د. ماهر بن حمد المعيقلي' } as const;

const RECITERS_AR: Record<string, string> = {
  'hafs-muaiqly': 'الشيخ د. ماهر بن حمد المعيقلي',
  'hafs-hudhaifi': 'الشيخ د. علي بن عبدالرحمن الحذيفي',
  'hafs-basfar': 'الشيخ عبدالله بن علي بصفر',
  'hafs-ayyub': 'الشيخ محمد أيوب',
};

/** يبني الملف الصوتي العالمي الواحد؛ القارئ من البيئة إن وُجد وإلا الافتراضي. */
export function globalHafsAudioProfile(env: Record<string, string | undefined> = {}): GlobalQuranAudioProfile {
  const reciterId = String(env.MIZAN_GLOBAL_HAFS_RECITER_ID || DEFAULT_GLOBAL_HAFS_RECITER.id).trim() || DEFAULT_GLOBAL_HAFS_RECITER.id;
  const packageVersion = String(env.MIZAN_GLOBAL_HAFS_AUDIO_VERSION || 'kfgqpc-hafs-audio-v1').trim() || 'kfgqpc-hafs-audio-v1';
  return {
    id: 'global-hafs',
    reading: 'hafs',
    reciterId,
    reciterNameArabic: RECITERS_AR[reciterId] || DEFAULT_GLOBAL_HAFS_RECITER.nameArabic,
    packageVersion,
    nonHafsSyncGranularity: 'AYAH',
  };
}

/**
 * الملف الصوتي لأيّ رواية = العالمي بحفص نفسه. يفشل مغلقًا لراوٍ مجهول، فلا يُشتقّ
 * صوتٌ من هوية غير قانونية. النتيجة واحدةٌ للعشرين — والهوية النصّية تبقى كما هي.
 */
export function audioProfileForReading(rawiId: string, env: Record<string, string | undefined> = {}): GlobalQuranAudioProfile | undefined {
  if (!CANONICAL_RAWI_IDS.includes(rawiId)) return undefined;
  return globalHafsAudioProfile(env);
}

/** هل هذه الرواية غيرُ حفص؟ (لِمنع مزامنة الكلمة المضلّلة في طبقة العرض) */
export function requiresAyahLevelSyncOnly(rawiId: string): boolean {
  return rawiId !== 'hafs';
}
