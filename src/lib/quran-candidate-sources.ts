/*
 * المرشّحات النصية للروايات الاثنتي عشرة التي لم تُسلَّم بعد في ميزان.
 *
 * هذا السجل لا يساوي «تسليمًا» ولا «اعتمادًا علميًا». وظيفته أن يثبت، داخل الكود، أين
 * توجد البايتات المرشحة بالضبط وبأي نسخة من المصدر؛ ثم تمر البايتات عبر فحص السلامة
 * والاستيراد وقرار اللجنة قبل أن يجوز إضافتها إلى DELIVERY_READING_BY_RAWI.
 *
 * المصدر المباشر المثبّت هنا هو مستودع Al-Islam-iOS، وحزم Qiraah فيه مشتقة من مصاحف
 * Islamweb كما توثق ملفات المصدر نفسها. لذلك لا يجوز إعادة وسمها KFGQPC أو اعتبار مجرد
 * وجودها اعتمادًا من أي جهة خارجية لميزان.
 */

export type QuranCandidateReviewState =
  | 'PENDING_SCHOLAR_REVIEW'
  | 'APPROVED'
  | 'NEEDS_FIX'
  | 'REJECTED';

export type QuranCandidatePermissionState = 'OWNER_REPORTED_PERMISSION';

export interface QuranCandidateSource {
  rawiId: string;
  deliveryKey: string;
  authority: 'ISLAMWEB_DERIVED';
  role: 'FULL_TEXT_CANDIDATE';
  upstreamRepository: 'TheAbubakrAbu/Al-Islam-iOS';
  upstreamCommit: string;
  upstreamPath: string;
  reviewState: QuranCandidateReviewState;
  permissionState: QuranCandidatePermissionState;
  caveat?: string;
}

/**
 * Version 4.6.5 commit on 2026-09-17. Pin the commit, never `main`, so an upstream update cannot
 * silently change Quran bytes underneath an already-reviewed Mizan package.
 */
export const AL_ISLAM_IOS_QIRAAT_COMMIT = '5b3bc32158d4cf1915d5d871131a7050e5344a37';
export const AL_ISLAM_IOS_QIRAAT_REPOSITORY = 'TheAbubakrAbu/Al-Islam-iOS' as const;

const candidate = (
  rawiId: string,
  deliveryKey: string,
  filename: string,
  caveat?: string,
): QuranCandidateSource => ({
  rawiId,
  deliveryKey,
  authority: 'ISLAMWEB_DERIVED',
  role: 'FULL_TEXT_CANDIDATE',
  upstreamRepository: AL_ISLAM_IOS_QIRAAT_REPOSITORY,
  upstreamCommit: AL_ISLAM_IOS_QIRAAT_COMMIT,
  upstreamPath: `Resources/Data/Quran/${filename}`,
  reviewState: 'PENDING_SCHOLAR_REVIEW',
  permissionState: 'OWNER_REPORTED_PERMISSION',
  ...(caveat ? { caveat } : {}),
});

export const QURAN_FULL_TEXT_CANDIDATES: readonly QuranCandidateSource[] = [
  candidate('hisham', 'hisham', 'QiraahHisham.json.deflate'),
  candidate('ibn-dhakwan', 'ibn-dhakwan', 'QiraahIbnDhakwan.json.deflate'),
  candidate('khalaf-hamzah', 'khalaf-hamzah', 'QiraahKhalaf.json.deflate'),
  candidate('khallad', 'khallad', 'QiraahKhallad.json.deflate'),
  candidate('abu-al-harith', 'abu-al-harith', 'QiraahAbuHarith.json.deflate'),
  candidate('al-duri-al-kisai', 'duri-al-kisai', 'QiraahDuriKisai.json.deflate'),
  candidate('ibn-wardan', 'ibn-wardan', 'QiraahIbnWardan.json.deflate'),
  candidate('ibn-jammaz', 'ibn-jammaz', 'QiraahIbnJammaz.json.deflate'),
  candidate('ruways', 'ruways', 'QiraahRuways.json.deflate'),
  candidate('rawh', 'rawh', 'QiraahRawh.json.deflate'),
  candidate(
    'ishaq',
    'ishaq',
    'QiraahIshaq.json.deflate',
    'راجع اللجنة استقلال متن إسحاق عن إدريس؛ المصدر upstream وثّق حالة تطابق في متن المصدر.',
  ),
  candidate(
    'idris',
    'idris',
    'QiraahIdris.json.deflate',
    'راجع اللجنة استقلال متن إدريس عن إسحاق؛ المصدر upstream وثّق حالة تطابق في متن المصدر.',
  ),
] as const;

export const QURAN_FULL_TEXT_CANDIDATE_BY_RAWI = new Map(
  QURAN_FULL_TEXT_CANDIDATES.map(entry => [entry.rawiId, entry] as const),
);

export function candidateSourceForRawi(rawiId: string): QuranCandidateSource | undefined {
  return QURAN_FULL_TEXT_CANDIDATE_BY_RAWI.get(rawiId);
}
