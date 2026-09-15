/*
 * مصادر الروايات المعتمدة.
 *
 * ميزان لا يعرض روايةً لا يملك لها نصًّا معتمدًا. فالعرضُ وعدٌ: من اختار روايةً في شاشة
 * الإعداد يتوقّع أن يُسأل بها، وأن يُعرض المصحف بها، وأن يُحكَّم عليها — فإن لم يكن خلفها
 * مصدرٌ معتمد كان الاختيار فخًّا يُكتشف يوم المسابقة لا قبله.
 *
 * ولذلك الرواية هنا ليست نصًّا حرًّا يكتبه المسؤول، بل اختيارٌ من جدولٍ كلُّ صفٍّ فيه
 * يحمل مصدره وسلطته ورابطه. وحفصٌ عن عاصم هو الافتراضي الوحيد في بداية كل مقطع: عليه
 * حزمة مجمع الملك فهد المعتمدة، وهو ما تعمل به المسابقات عندنا إلا استثناءً.
 *
 * وبقية الروايات مصدرها المعتمد «موقع الوحي» (alwa7y.com/downloads) — يُسحب منه النص
 * ويُختم بمعالمه (السلطة، الإصدار، البصمة) قبل أن تصير الرواية صالحة للتشغيل. وحتى
 * تكتمل حزمتها تبقى معروضةً لكن غير قابلة للاختيار، ويُقال سببُ ذلك صراحةً بدل أن
 * تختفي فيظنّها المسؤول غير موجودة.
 */

export type ReadingSourceAuthority = 'KFGQPC' | 'ALWAHY';

export interface ReadingSourceAuthorityInfo {
  id: ReadingSourceAuthority;
  nameArabic: string;
  nameEnglish: string;
  /** الرابط المعتمد الذي تُسحب منه الحزمة ويُراجَع عنده الإصدار. */
  downloadsUrl: string;
}

export const READING_SOURCE_AUTHORITIES: Record<ReadingSourceAuthority, ReadingSourceAuthorityInfo> = {
  KFGQPC: {
    id: 'KFGQPC',
    nameArabic: 'مجمع الملك فهد لطباعة المصحف الشريف',
    nameEnglish: 'King Fahd Glorious Quran Printing Complex',
    downloadsUrl: 'https://qurancomplex.gov.sa/',
  },
  ALWAHY: {
    id: 'ALWAHY',
    nameArabic: 'موقع الوحي',
    nameEnglish: 'Al-Wahy',
    downloadsUrl: 'https://www.alwa7y.com/downloads/',
  },
};

export interface ReadingOption {
  /** معرّف الراوي كما في `TEN_QIRAAT_GRAPH`. */
  rawiId: string;
  qiraahId: string;
  /** النص الذي يُخزَّن في `category.riwaya` ويُطابَق عليه عند السحب. */
  value: string;
  labelArabic: string;
  labelEnglish: string;
  authority: ReadingSourceAuthority;
  /** هل الحزمة جاهزة للتشغيل الآن؟ غير الجاهزة تُعرض معطَّلة مع سبب. */
  ready: boolean;
}

/** الافتراضي الوحيد في بداية أي مقطع أو فئة جديدة. */
export const DEFAULT_READING_VALUE = 'حفص عن عاصم';

const OTHERS: [string, string, string, string][] = [
  // rawiId, qiraahId, عربي, English
  ['shubah', 'asim', 'شعبة عن عاصم', 'Shuʿbah an Asim'],
  ['qalun', 'nafi', 'قالون عن نافع', 'Qalun an Nafiʿ'],
  ['warsh', 'nafi', 'ورش عن نافع', 'Warsh an Nafiʿ'],
  ['al-bazzi', 'ibn-kathir', 'البزي عن ابن كثير', 'Al-Bazzi an Ibn Kathir'],
  ['qunbul', 'ibn-kathir', 'قنبل عن ابن كثير', 'Qunbul an Ibn Kathir'],
  ['al-duri-abu-amr', 'abu-amr', 'الدوري عن أبي عمرو', 'Al-Duri an Abi Amr'],
  ['al-susi', 'abu-amr', 'السوسي عن أبي عمرو', 'Al-Susi an Abi Amr'],
  ['hisham', 'ibn-amir', 'هشام عن ابن عامر', 'Hisham an Ibn Amir'],
  ['ibn-dhakwan', 'ibn-amir', 'ابن ذكوان عن ابن عامر', 'Ibn Dhakwan an Ibn Amir'],
  ['khalaf-hamzah', 'hamzah', 'خلف عن حمزة', 'Khalaf an Hamzah'],
  ['khallad', 'hamzah', 'خلاد عن حمزة', 'Khallad an Hamzah'],
  ['abu-al-harith', 'al-kisai', 'أبو الحارث عن الكسائي', 'Abu al-Harith an Al-Kisaʾi'],
  ['al-duri-kisai', 'al-kisai', 'الدوري عن الكسائي', 'Al-Duri an Al-Kisaʾi'],
  ['ibn-wardan', 'abu-jafar', 'ابن وردان عن أبي جعفر', 'Ibn Wardan an Abi Jafar'],
  ['ibn-jammaz', 'abu-jafar', 'ابن جماز عن أبي جعفر', 'Ibn Jammaz an Abi Jafar'],
  ['ruways', 'yaqub', 'رويس عن يعقوب', 'Ruways an Yaqub'],
  ['rawh', 'yaqub', 'روح عن يعقوب', 'Rawh an Yaqub'],
  ['ishaq', 'khalaf-al-ashir', 'إسحاق عن خلف العاشر', 'Ishaq an Khalaf al-Ashir'],
  ['idris', 'khalaf-al-ashir', 'إدريس عن خلف العاشر', 'Idris an Khalaf al-Ashir'],
];

/**
 * الروايات مرتّبةً: حفص أولًا لأنه الافتراضي، ثم البقية بمصدر «موقع الوحي».
 *
 * `readyRawiIds` يأتي من حزم التسليم المتوفرة فعلًا في هذا التشغيل؛ فحفصٌ جاهز دائمًا،
 * وغيرُه يصير جاهزًا حين تصل حزمته المعتمدة ولا يُفترض جاهزًا قبل ذلك.
 */
export function readingOptions(readyRawiIds?: Iterable<string>): ReadingOption[] {
  const ready = new Set([...(readyRawiIds || [])].map(x => String(x).toLowerCase()));
  const hafs: ReadingOption = {
    rawiId: 'hafs', qiraahId: 'asim', value: DEFAULT_READING_VALUE,
    labelArabic: DEFAULT_READING_VALUE, labelEnglish: 'Hafs an Asim',
    authority: 'KFGQPC', ready: true,
  };
  return [hafs, ...OTHERS.map(([rawiId, qiraahId, ar, en]) => ({
    rawiId, qiraahId, value: ar, labelArabic: ar, labelEnglish: en,
    authority: 'ALWAHY' as const, ready: ready.has(rawiId),
  }))];
}

export function findReadingOption(value: string | undefined, readyRawiIds?: Iterable<string>) {
  const wanted = String(value || '').trim();
  if (!wanted) return undefined;
  return readingOptions(readyRawiIds).find(option => option.value === wanted || option.rawiId === wanted);
}

/** سبب تعطيل رواية غير جاهزة، بلغة المسؤول لا بلغة الحزمة. */
export function readingUnavailableReason(option: ReadingOption, arabic: boolean) {
  const authority = READING_SOURCE_AUTHORITIES[option.authority];
  return arabic
    ? `لم تصل بعدُ حزمة النص المعتمدة لهذه الرواية من ${authority.nameArabic} (${authority.downloadsUrl}). تُفعَّل تلقائيًا فور اعتماد حزمتها.`
    : `The certified text package for this reading has not arrived yet from ${authority.nameEnglish} (${authority.downloadsUrl}). It activates automatically once its package is approved.`;
}
