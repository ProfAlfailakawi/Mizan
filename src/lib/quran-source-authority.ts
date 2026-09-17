/*
 * نموذج سلطة المصدر — عامٌّ لا مقصورٌ على مجمع الملك فهد.
 *
 * كان النظام يتعامل مع سلطة المصدر كأنها ثنائية (مجمع الملك فهد أو الوحي)، وكانت دالةٌ
 * واحدة تخلط بين «عندنا نصٌّ مُسلَّم» و«ناشرُ هذا النصّ هو مجمع الملك فهد». وهذا الخلط
 * يفسد الإسناد: فتُدخَل بيانات Quranpedia ثم تُسمّى KFGQPC.
 *
 * هنا ثلاثة أسئلة منفصلة لا يجوز الخلط بينها:
 *   1. من ناشر المصدر؟            → `QuranSourceAuthority`
 *   2. بأي صفةٍ نستعمله؟           → `QuranAuthorityRole` (نصٌّ كامل؟ معرفةُ قراءات؟ مرجعٌ بصري؟)
 *   3. هل اعتمدته لجنة ميزان؟      → قرار نطاقٍ منفصل، لا يُستنتج من (1) ولا (2)
 *
 * ولا يُفهم من إدراج موقعٍ هنا أنه «اعتمد ميزان» أو «صدّقه». الإدراج يسجّل إسنادًا
 * واستعمالًا مُصرَّحًا به داخل ميزان، لا شهادةً من الناشر لميزان.
 */

/** بأي صفةٍ يُعتمد المصدر؟ مصدرٌ واحد قد يحمل أكثر من صفة. */
export type QuranAuthorityRole =
  | 'FULL_TEXT_AUTHORITY'          // نصٌّ قرآني كامل صالحٌ للتسليم.
  | 'QIRAAT_KNOWLEDGE_AUTHORITY'   // معرفةُ قراءاتٍ ومواضعُ اختلاف.
  | 'VISUAL_REFERENCE_AUTHORITY'   // مرجعٌ بصري للتحقّق (مصحفٌ مصوّر/PDF).
  | 'AUDIO_AUTHORITY'              // تسجيلٌ صوتي.
  | 'METADATA_AUTHORITY'           // بياناتٌ وصفية (ترقيم، أجزاء، صفحات).
  | 'SECONDARY_VERIFICATION';      // مقارنةٌ وتحقّقٌ ثانوي لا مصدرَ حقيقةٍ أول.

export type QuranSourceAuthority =
  | 'KFGQPC'
  | 'ISLAMWEB'
  | 'ALWAHY'
  | 'QURANPEDIA'
  | 'TANZIL'
  | 'ALQURAN_CLOUD'
  | 'QURAN_DATA'
  | 'QURAN_JSON'
  | 'OTHER_APPROVED';

export interface QuranSourceAuthorityInfo {
  id: QuranSourceAuthority;
  nameArabic: string;
  nameEnglish: string;
  roles: readonly QuranAuthorityRole[];
  /** الرابط المرجعي إن كان معلومًا في المشروع؛ لا يُخترع رابطٌ غير موثَّق. */
  referenceUrl?: string;
  /**
   * هل هذا المصدر مصدرُ حقيقةٍ أول للنصّ، أم للتحقّق فحسب؟ يُقرأ ولا يُدّعى.
   */
  primaryTextSource: boolean;
}

/**
 * فهرس السلطات. الأدوار مسجّلةٌ بحسب ما يُستعمل به المصدر داخل ميزان.
 * ملاحظة إسناد: هذا الفهرس يصف **من نشر البيانات**، لا من «اعتمد ميزان».
 */
export const QURAN_SOURCE_AUTHORITIES: Record<QuranSourceAuthority, QuranSourceAuthorityInfo> = {
  KFGQPC: {
    id: 'KFGQPC',
    nameArabic: 'مجمع الملك فهد لطباعة المصحف الشريف',
    nameEnglish: 'King Fahd Glorious Quran Printing Complex',
    roles: ['FULL_TEXT_AUTHORITY', 'AUDIO_AUTHORITY', 'METADATA_AUTHORITY', 'VISUAL_REFERENCE_AUTHORITY'],
    referenceUrl: 'https://qurancomplex.gov.sa/',
    primaryTextSource: true,
  },
  ISLAMWEB: {
    id: 'ISLAMWEB',
    nameArabic: 'إسلام ويب — مصاحف الروايات',
    nameEnglish: 'IslamWeb — riwayat mushafs',
    roles: ['FULL_TEXT_AUTHORITY', 'QIRAAT_KNOWLEDGE_AUTHORITY', 'VISUAL_REFERENCE_AUTHORITY'],
    referenceUrl: 'https://www.islamweb.net/',
    primaryTextSource: true,
  },
  ALWAHY: {
    id: 'ALWAHY',
    nameArabic: 'موقع الوحي — مصاحف التيسير',
    nameEnglish: 'Al-Wahy — Taysir Mushafs',
    roles: ['FULL_TEXT_AUTHORITY', 'VISUAL_REFERENCE_AUTHORITY', 'QIRAAT_KNOWLEDGE_AUTHORITY'],
    referenceUrl: 'https://www.alwa7y.com/downloads/',
    primaryTextSource: true,
  },
  QURANPEDIA: {
    id: 'QURANPEDIA',
    nameArabic: 'قرآنبيديا',
    nameEnglish: 'Quranpedia',
    roles: ['QIRAAT_KNOWLEDGE_AUTHORITY', 'METADATA_AUTHORITY', 'SECONDARY_VERIFICATION'],
    referenceUrl: 'https://quranpedia.net/dumps',
    primaryTextSource: false,
  },
  TANZIL: {
    id: 'TANZIL',
    nameArabic: 'تنزيل',
    nameEnglish: 'Tanzil',
    roles: ['METADATA_AUTHORITY', 'SECONDARY_VERIFICATION'],
    referenceUrl: 'https://tanzil.net/docs/quran_metadata',
    primaryTextSource: false,
  },
  ALQURAN_CLOUD: {
    id: 'ALQURAN_CLOUD',
    nameArabic: 'القرآن كلاود',
    nameEnglish: 'AlQuran Cloud',
    roles: ['SECONDARY_VERIFICATION', 'METADATA_AUTHORITY'],
    referenceUrl: 'https://alquran.cloud/quran',
    primaryTextSource: false,
  },
  QURAN_DATA: {
    id: 'QURAN_DATA',
    nameArabic: 'مجموعات بيانات قرآنية مفتوحة',
    nameEnglish: 'Open Quran data sets',
    roles: ['SECONDARY_VERIFICATION'],
    primaryTextSource: false,
  },
  QURAN_JSON: {
    id: 'QURAN_JSON',
    nameArabic: 'حزم قرآنية بصيغة JSON',
    nameEnglish: 'Quran JSON packages',
    roles: ['SECONDARY_VERIFICATION'],
    primaryTextSource: false,
  },
  OTHER_APPROVED: {
    id: 'OTHER_APPROVED',
    nameArabic: 'مصدر معتمد آخر',
    nameEnglish: 'Other approved source',
    roles: ['SECONDARY_VERIFICATION'],
    primaryTextSource: false,
  },
};

/** يحلّ سلطةً من نصٍّ حرّ إلى معرّفٍ معروف. يعود `undefined` بلا تخمين. */
export function resolveSourceAuthority(value: string | undefined | null): QuranSourceAuthority | undefined {
  const key = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (Object.keys(QURAN_SOURCE_AUTHORITIES) as QuranSourceAuthority[]).find(id => id === key);
}

/** هل تحمل هذه السلطة هذه الصفة؟ */
export function authorityHasRole(authority: QuranSourceAuthority, role: QuranAuthorityRole): boolean {
  return QURAN_SOURCE_AUTHORITIES[authority].roles.includes(role);
}

/**
 * هل يصلح هذا المصدر ليكون نصَّ رواية للتسليم؟ الصفةُ وحدها لا تكفي: لا بدّ أن يكون
 * مصدرَ حقيقةٍ أول يحمل صفة النصّ الكامل. والتحقّق الثانوي لا يصير نصًّا بحالٍ.
 */
export function canServeAsReadingText(authority: QuranSourceAuthority): boolean {
  const info = QURAN_SOURCE_AUTHORITIES[authority];
  return info.primaryTextSource && info.roles.includes('FULL_TEXT_AUTHORITY');
}

/**
 * إسنادٌ صادق: ثلاثة أسئلة منفصلة في كائنٍ واحد بلا خلط. `committeeScopeApproved` قرارُ
 * نطاقٍ من لجنة ميزان، ولا يُفهم منه أن الناشر صدّق ميزان.
 */
export interface SourceProvenanceStatement {
  authority: QuranSourceAuthority;
  authorityNameArabic: string;
  roles: readonly QuranAuthorityRole[];
  usableAsReadingText: boolean;
  committeeScopeApproved: boolean;
  /** نصٌّ صريح يمنع الادّعاء العكسي. */
  publisherCertifiedMizan: false;
}

export function sourceProvenanceStatement(authority: QuranSourceAuthority, committeeScopeApproved = true): SourceProvenanceStatement {
  const info = QURAN_SOURCE_AUTHORITIES[authority];
  return {
    authority,
    authorityNameArabic: info.nameArabic,
    roles: info.roles,
    usableAsReadingText: canServeAsReadingText(authority),
    committeeScopeApproved,
    publisherCertifiedMizan: false,
  };
}
