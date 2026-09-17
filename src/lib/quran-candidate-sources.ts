/*
 * حزم النص الكامل للروايات الاثنتي عشرة الإضافية في ميزان.
 *
 * المصدر المباشر المثبّت هنا هو مستودع Al-Islam-iOS، وحزم Qiraah فيه مشتقة من مصاحف
 * Islamweb كما توثق ملفات المصدر نفسها. اعتماد اللجنة العلمية لميزان لهذه الحزم محسوم،
 * لكن هذا لا يغيّر سلطة المصدر ولا يسمح بإعادة وسمها KFGQPC.
 *
 * والأهم: الاعتمادُ لا يُكتب حرفًا ثابتًا في السجلّ. كتابة `reviewState: 'APPROVED'` في
 * الجدول تعني «معتمدٌ مهما كانت البايتات» — وهو بالضبط ما نهى عنه بروتوكول المصادر: أي
 * تغييرٍ لاحقٍ في upstream يرث الاعتماد صامتًا. فالمكتوب هنا قرارُ لجنةٍ **مربوط** بـ
 * (upstreamCommit + SHA-256 للبايتات المضغوطة الأصلية)، والحالةُ الفعلية تُشتقّ وقت
 * التشغيل من مطابقة البايتات المُدخَلة لذلك القيد — فإن لم تطابق بقيت قيد المراجعة
 * (فشلٌ مغلق)، ولو كان القرار مكتوبًا.
 */

import type { QuranSourceAuthority } from './quran-source-authority';
import type { QuranNativeCountSystemId } from './quran-native-count-systems';

export type QuranCandidateReviewState =
  | 'PENDING_SCHOLAR_REVIEW'
  | 'APPROVED'
  | 'NEEDS_FIX'
  | 'REJECTED';

export type QuranCandidatePermissionState = 'OWNER_REPORTED_PERMISSION';

/**
 * قرارُ اللجنة العلمية مربوطًا بأثرٍ بعينه. لا يُقرأ هذا القرار وحده أبدًا: يُقرأ عبر
 * `resolveCandidateReviewState` التي تقابله بالبايتات الفعلية.
 */
export interface QuranCandidateCommitteeDecision {
  state: Exclude<QuranCandidateReviewState, 'PENDING_SCHOLAR_REVIEW'>;
  authority: 'MIZAN_SCIENTIFIC_COMMITTEE';
  /** مرجع محضر القرار داخل المشروع — يُوثَّق في `docs/SOURCE-PROVENANCE.md`. */
  reference: string;
  decidedAt: string;
  /** القرار مقيَّد بهذا الـcommit تحديدًا. */
  boundUpstreamCommit: string;
  /** والقرار مقيَّد ببصمة البايتات الأصلية المضغوطة تحديدًا. */
  boundCompressedSha256: string;
}

export interface QuranCandidateSource {
  rawiId: string;
  deliveryKey: string;
  /** سلسلة الإسناد: نصٌّ مشتقٌّ من مصاحف Islamweb، لا منشورٌ من المجمع. */
  authority: 'ISLAMWEB_DERIVED';
  /** الناشر الأصل في فهرس السلطات العام — لا يُوسَم KFGQPC بحالٍ. */
  publisherAuthority: Extract<QuranSourceAuthority, 'ISLAMWEB'>;
  role: 'FULL_TEXT_CANDIDATE';
  upstreamRepository: 'TheAbubakrAbu/Al-Islam-iOS';
  upstreamCommit: string;
  upstreamPath: string;
  /** بصمة البايتات الأصلية المضغوطة عند الـcommit المثبَّت — مُتحقَّقٌ منها بالتنزيل. */
  expectedCompressedSha256: string;
  expectedSurahCount: 114;
  expectedVerseCount: number;
  /** نظام العدّ الأصلي لهذه الرواية — مستخرجٌ من الأثر نفسه لا مفترضًا. */
  nativeCountSystem: QuranNativeCountSystemId;
  permissionState: QuranCandidatePermissionState;
  committeeDecision: QuranCandidateCommitteeDecision;
  caveat?: string;
}

/**
 * Version 4.6.5 commit on 2026-09-17. Pin the commit, never `main`, so an upstream update cannot
 * silently change Quran bytes underneath an already-reviewed Mizan package.
 */
export const AL_ISLAM_IOS_QIRAAT_COMMIT = '5b3bc32158d4cf1915d5d871131a7050e5344a37';
export const AL_ISLAM_IOS_QIRAAT_REPOSITORY = 'TheAbubakrAbu/Al-Islam-iOS' as const;

/** مرجع قرار اللجنة لهذه الدفعة — نطاقُه الاثنتا عشرة رواية بالبصمات المثبتة أدناه. */
export const MIZAN_COMMITTEE_TWELVE_DECISION_REFERENCE = 'MIZAN-COMMITTEE-2026-09-17-TWELVE-CANDIDATE-SOURCES';
export const MIZAN_COMMITTEE_TWELVE_DECISION_DATE = '2026-09-17';

const candidate = (
  rawiId: string,
  deliveryKey: string,
  filename: string,
  expectedVerseCount: number,
  nativeCountSystem: QuranNativeCountSystemId,
  expectedCompressedSha256: string,
  caveat?: string,
): QuranCandidateSource => ({
  rawiId,
  deliveryKey,
  authority: 'ISLAMWEB_DERIVED',
  publisherAuthority: 'ISLAMWEB',
  role: 'FULL_TEXT_CANDIDATE',
  upstreamRepository: AL_ISLAM_IOS_QIRAAT_REPOSITORY,
  upstreamCommit: AL_ISLAM_IOS_QIRAAT_COMMIT,
  upstreamPath: `Resources/Data/Quran/${filename}`,
  expectedCompressedSha256,
  expectedSurahCount: 114,
  expectedVerseCount,
  nativeCountSystem,
  permissionState: 'OWNER_REPORTED_PERMISSION',
  committeeDecision: {
    state: 'APPROVED',
    authority: 'MIZAN_SCIENTIFIC_COMMITTEE',
    reference: MIZAN_COMMITTEE_TWELVE_DECISION_REFERENCE,
    decidedAt: MIZAN_COMMITTEE_TWELVE_DECISION_DATE,
    boundUpstreamCommit: AL_ISLAM_IOS_QIRAAT_COMMIT,
    boundCompressedSha256: expectedCompressedSha256,
  },
  ...(caveat ? { caveat } : {}),
});

/*
 * البصمات أدناه محسوبة من تنزيل الملفات نفسها عند الـcommit المثبَّت والتحقّق من فكّ
 * ضغطها وعدّ سورها وآياتها. وتطابقُ بصمتَي إسحاق وإدريس ليس خطأً: المتنان متطابقان
 * بايتًا ببايت في المصدر المنشور، وهذا مسجَّلٌ في `caveat` ولا يُختلق له فرق.
 */
export const QURAN_FULL_TEXT_CANDIDATES: readonly QuranCandidateSource[] = [
  candidate('hisham', 'hisham', 'QiraahHisham.json.deflate', 6226, 'DIMASHQI',
    '399099727eca6b684b25e48af98d794715b9cbd19e3b15da2a729ae717a522b8'),
  candidate('ibn-dhakwan', 'ibn-dhakwan', 'QiraahIbnDhakwan.json.deflate', 6226, 'DIMASHQI',
    'dc65cf2117ef3685e2dca21f295738a5dc8d9c05044dd9048bf468bd94b50b8c'),
  candidate('khalaf-hamzah', 'khalaf-hamzah', 'QiraahKhalaf.json.deflate', 6236, 'KUFIC',
    '1d70d15a165ae185a2d2f0e63f6d9145472208b66675d04e99dcebe620e81260'),
  candidate('khallad', 'khallad', 'QiraahKhallad.json.deflate', 6236, 'KUFIC',
    'b59f9dc85d860dac30df5dd561c5cf582aa81f017f3828c4af6833f72a194b33'),
  candidate('abu-al-harith', 'abu-al-harith', 'QiraahAbuHarith.json.deflate', 6236, 'KUFIC',
    'c1e5a13d3cdb5e13ec21f6aba817a6040fca63c45c7b2d4845421cf7c063d57a'),
  candidate('al-duri-kisai', 'duri-al-kisai', 'QiraahDuriKisai.json.deflate', 6236, 'KUFIC',
    '124e6028b9dafe1b443fe332556dabbafe8a22e944489684b0e4d4a64d7a4e17'),
  candidate('ibn-wardan', 'ibn-wardan', 'QiraahIbnWardan.json.deflate', 6214, 'MADANI_AWWAL',
    '71b94c83b9983ef9770939d5e3a13713e532e2dcd8a3acc72d24e71c3bdb7678'),
  candidate('ibn-jammaz', 'ibn-jammaz', 'QiraahIbnJammaz.json.deflate', 6214, 'MADANI_AWWAL',
    '4ab22d6f5e01217318139266e3d409f30c2922faaa2d1d91d4be41c0fba0fdf1'),
  candidate('ruways', 'ruways', 'QiraahRuways.json.deflate', 6204, 'BASRI_YAQUB_RUWAYS',
    'df236a65d32ce0a68b6326c1811628cf143283e2ec788d82c0521ce1ee0ac1c6'),
  candidate('rawh', 'rawh', 'QiraahRawh.json.deflate', 6206, 'BASRI_YAQUB_RAWH',
    '01e680bf68fdfe050aa49097f253c628d8e3455836fbe63210b6ee95a689e036'),
  candidate(
    'ishaq',
    'ishaq',
    'QiraahIshaq.json.deflate',
    6236,
    'KUFIC',
    'a08d17124aab7b543e0029aabeeea06c20471286eddfe6a97f31eec69ae2eae9',
    'المصدر upstream وثّق تطابق متن إسحاق مع إدريس؛ يُحفظ هذا القيد في provenance ولا يُختلق فرق غير موجود في المصدر.',
  ),
  candidate(
    'idris',
    'idris',
    'QiraahIdris.json.deflate',
    6236,
    'KUFIC',
    'a08d17124aab7b543e0029aabeeea06c20471286eddfe6a97f31eec69ae2eae9',
    'المصدر upstream وثّق تطابق متن إدريس مع إسحاق؛ يُحفظ هذا القيد في provenance ولا يُختلق فرق غير موجود في المصدر.',
  ),
] as const;

export const QURAN_FULL_TEXT_CANDIDATE_BY_RAWI = new Map(
  QURAN_FULL_TEXT_CANDIDATES.map(entry => [entry.rawiId, entry] as const),
);

export function candidateSourceForRawi(rawiId: string): QuranCandidateSource | undefined {
  return QURAN_FULL_TEXT_CANDIDATE_BY_RAWI.get(rawiId);
}

/** الأثر الفعلي المُدخَل الذي يُقابَل به قرار اللجنة. */
export interface CandidateArtifactEvidence {
  upstreamCommit: string;
  /** SHA-256 للبايتات الأصلية المضغوطة كما وصلت. */
  compressedSha256: string;
}

export type CandidateApprovalBlocker =
  | 'UNKNOWN_CANDIDATE_RAWI'
  | 'UPSTREAM_COMMIT_MISMATCH'
  | 'ARTIFACT_DIGEST_MISMATCH'
  | 'DECISION_NOT_BOUND_TO_PINNED_COMMIT'
  | 'DECISION_NOT_BOUND_TO_PINNED_DIGEST';

export interface CandidateApprovalResolution {
  rawiId: string;
  /** الحالة الفعلية — لا تكون APPROVED إلا ببايتاتٍ مطابقة للقيد. */
  state: QuranCandidateReviewState;
  blockers: CandidateApprovalBlocker[];
  /** القرار المكتوب كما هو، للتشخيص. */
  declaredDecisionState: QuranCandidateCommitteeDecision['state'] | 'NONE';
  boundUpstreamCommit?: string;
  boundCompressedSha256?: string;
}

/**
 * يشتقّ حالة المراجعة الفعلية من مقابلة القرار المكتوب بالبايتات المُدخَلة.
 * فشلٌ مغلق: أي عدم تطابقٍ يعيد `PENDING_SCHOLAR_REVIEW` مع سببٍ قابلٍ للتشخيص.
 */
export function resolveCandidateReviewState(
  rawiId: string,
  evidence: CandidateArtifactEvidence,
): CandidateApprovalResolution {
  const source = candidateSourceForRawi(rawiId);
  if (!source) {
    return { rawiId, state: 'PENDING_SCHOLAR_REVIEW', blockers: ['UNKNOWN_CANDIDATE_RAWI'], declaredDecisionState: 'NONE' };
  }
  const decision = source.committeeDecision;
  const blockers: CandidateApprovalBlocker[] = [];
  // القرار نفسه يجب أن يكون مربوطًا بما هو مثبَّت في السجلّ — لا قرارًا معلّقًا في الهواء.
  if (decision.boundUpstreamCommit !== source.upstreamCommit) blockers.push('DECISION_NOT_BOUND_TO_PINNED_COMMIT');
  if (decision.boundCompressedSha256 !== source.expectedCompressedSha256) blockers.push('DECISION_NOT_BOUND_TO_PINNED_DIGEST');
  // ثم البايتات المُدخَلة يجب أن تكون هي هي.
  if (String(evidence.upstreamCommit || '').toLowerCase() !== decision.boundUpstreamCommit.toLowerCase()) blockers.push('UPSTREAM_COMMIT_MISMATCH');
  if (String(evidence.compressedSha256 || '').toLowerCase() !== decision.boundCompressedSha256.toLowerCase()) blockers.push('ARTIFACT_DIGEST_MISMATCH');
  return {
    rawiId,
    state: blockers.length ? 'PENDING_SCHOLAR_REVIEW' : decision.state,
    blockers,
    declaredDecisionState: decision.state,
    boundUpstreamCommit: decision.boundUpstreamCommit,
    boundCompressedSha256: decision.boundCompressedSha256,
  };
}

/** رابط التنزيل الخام للأثر المثبَّت — يُستعمل في الاستيراد القابل لإعادة الإنتاج. */
export function candidateRawUrl(source: QuranCandidateSource): string {
  return `https://raw.githubusercontent.com/${source.upstreamRepository}/${source.upstreamCommit}/${source.upstreamPath}`;
}
