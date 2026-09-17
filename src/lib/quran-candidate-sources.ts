/*
 * حزم النص الكامل للروايات الاثنتي عشرة الإضافية في ميزان.
 *
 * المصدر المباشر المثبّت هنا هو مستودع Al-Islam-iOS، وحزم Qiraah فيه مشتقة من مصاحف
 * Islamweb كما توثق ملفات المصدر نفسها. اعتماد اللجنة العلمية لميزان لهذه الحزم محسوم،
 * لكن هذا لا يغيّر سلطة المصدر ولا يسمح بإعادة وسمها KFGQPC. كما أن الاعتماد مربوط
 * بهذا الـ upstream commit تحديدًا؛ أي تغيير لاحق في البايتات يحتاج بصمة/مراجعة جديدة.
 */

export type QuranCandidateReviewState =
  | 'PENDING_SCHOLAR_REVIEW'
  | 'APPROVED'
  | 'NEEDS_FIX'
  | 'REJECTED';

export type QuranCandidatePermissionState = 'OWNER_REPORTED_PERMISSION';
export type QuranNativeCountFamily = 'KUFIC' | 'DIMASHQI' | 'MADANI_AWWAL' | 'BASRI_YAQUB';

export interface QuranCandidateSource {
  rawiId: string;
  deliveryKey: string;
  authority: 'ISLAMWEB_DERIVED';
  role: 'FULL_TEXT_CANDIDATE';
  upstreamRepository: 'TheAbubakrAbu/Al-Islam-iOS';
  upstreamCommit: string;
  upstreamPath: string;
  expectedSurahCount: 114;
  expectedVerseCount: number;
  nativeCountFamily: QuranNativeCountFamily;
  reviewState: QuranCandidateReviewState;
  permissionState: QuranCandidatePermissionState;
  reviewAuthority: 'MIZAN_SCIENTIFIC_COMMITTEE';
  reviewBoundToUpstreamCommit: true;
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
  expectedVerseCount: number,
  nativeCountFamily: QuranNativeCountFamily,
  caveat?: string,
): QuranCandidateSource => ({
  rawiId,
  deliveryKey,
  authority: 'ISLAMWEB_DERIVED',
  role: 'FULL_TEXT_CANDIDATE',
  upstreamRepository: AL_ISLAM_IOS_QIRAAT_REPOSITORY,
  upstreamCommit: AL_ISLAM_IOS_QIRAAT_COMMIT,
  upstreamPath: `Resources/Data/Quran/${filename}`,
  expectedSurahCount: 114,
  expectedVerseCount,
  nativeCountFamily,
  reviewState: 'APPROVED',
  permissionState: 'OWNER_REPORTED_PERMISSION',
  reviewAuthority: 'MIZAN_SCIENTIFIC_COMMITTEE',
  reviewBoundToUpstreamCommit: true,
  ...(caveat ? { caveat } : {}),
});

export const QURAN_FULL_TEXT_CANDIDATES: readonly QuranCandidateSource[] = [
  candidate('hisham', 'hisham', 'QiraahHisham.json.deflate', 6226, 'DIMASHQI'),
  candidate('ibn-dhakwan', 'ibn-dhakwan', 'QiraahIbnDhakwan.json.deflate', 6226, 'DIMASHQI'),
  candidate('khalaf-hamzah', 'khalaf-hamzah', 'QiraahKhalaf.json.deflate', 6236, 'KUFIC'),
  candidate('khallad', 'khallad', 'QiraahKhallad.json.deflate', 6236, 'KUFIC'),
  candidate('abu-al-harith', 'abu-al-harith', 'QiraahAbuHarith.json.deflate', 6236, 'KUFIC'),
  candidate('al-duri-kisai', 'duri-al-kisai', 'QiraahDuriKisai.json.deflate', 6236, 'KUFIC'),
  candidate('ibn-wardan', 'ibn-wardan', 'QiraahIbnWardan.json.deflate', 6214, 'MADANI_AWWAL'),
  candidate('ibn-jammaz', 'ibn-jammaz', 'QiraahIbnJammaz.json.deflate', 6214, 'MADANI_AWWAL'),
  candidate('ruways', 'ruways', 'QiraahRuways.json.deflate', 6204, 'BASRI_YAQUB'),
  candidate('rawh', 'rawh', 'QiraahRawh.json.deflate', 6206, 'BASRI_YAQUB'),
  candidate(
    'ishaq',
    'ishaq',
    'QiraahIshaq.json.deflate',
    6236,
    'KUFIC',
    'المصدر upstream وثّق تطابق متن إسحاق مع إدريس؛ يُحفظ هذا القيد في provenance ولا يُختلق فرق غير موجود في المصدر.',
  ),
  candidate(
    'idris',
    'idris',
    'QiraahIdris.json.deflate',
    6236,
    'KUFIC',
    'المصدر upstream وثّق تطابق متن إدريس مع إسحاق؛ يُحفظ هذا القيد في provenance ولا يُختلق فرق غير موجود في المصدر.',
  ),
] as const;

export const QURAN_FULL_TEXT_CANDIDATE_BY_RAWI = new Map(
  QURAN_FULL_TEXT_CANDIDATES.map(entry => [entry.rawiId, entry] as const),
);

export function candidateSourceForRawi(rawiId: string): QuranCandidateSource | undefined {
  return QURAN_FULL_TEXT_CANDIDATE_BY_RAWI.get(rawiId);
}
