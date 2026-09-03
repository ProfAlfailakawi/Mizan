/**
 * Broader KFGQPC developer/technical asset catalog.
 * This is metadata only; operational use of binary assets remains bound to exact bytes/hashes where published.
 * Official platform: https://qurancomplex.gov.sa/en/techquran/dev/
 */
export type KfgqpcDeveloperAssetKind =
  | 'PRINT_VECTOR_MUSHAF'
  | 'SMART_DEVICE_UTHMANIC_TEXT'
  | 'QURAN_UNICODE_PACKAGE'
  | 'TAFSEER_DATA'
  | 'GHAREEB_DATA'
  | 'TAJWEED_BOOK_DATA'
  | 'WAQF_REFERENCE'
  | 'OFFICIAL_QURAN_FONT'
  | 'DESKTOP_PUBLISHING'
  | 'PUBLICATION_IMAGE_SERVICE';

export interface KfgqpcDeveloperAsset {
  id:string;
  kind:KfgqpcDeveloperAssetKind;
  titleArabic:string;
  titleEnglish:string;
  authority:'King Fahd Glorious Quran Printing Complex';
  authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف';
  officialCertification:'CERTIFIED';
  officialReference:string;
  narrations?:readonly string[];
  formats:readonly string[];
  fileSizeLabel?:string;
  md5?:string;
  sha1?:string;
  notes:readonly string[];
}

export const KFGQPC_DEVELOPER_ASSETS:readonly KfgqpcDeveloperAsset[]=[
  {
    id:'kfgqpc-madinah-print-vector',
    kind:'PRINT_VECTOR_MUSHAF',
    titleArabic:'النسخة الرقمية من مصحف المدينة النبوية لأعمال الطباعة',
    titleEnglish:'Digital copy of Mus’haf al-Madinah for printing works',
    authority:'King Fahd Glorious Quran Printing Complex',
    authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',
    officialCertification:'CERTIFIED',
    officialReference:'https://qurancomplex.gov.sa/en/techquran/dev/',
    narrations:['Hafs','Warsh'],
    formats:['Adobe Illustrator/vector assets'],
    notes:[
      'High-quality vector source intended for printing/publishing and digital products.',
      'The official technical guide states high-quality digital Mus’haf copies for Hafs and Warsh; the developer page explicitly describes compressed Hafs Adobe AI files.'
    ]
  },
  {
    id:'kfgqpc-hafs-smart-device-v6',
    kind:'SMART_DEVICE_UTHMANIC_TEXT',
    titleArabic:'خط الرسم العثماني لرواية حفص للأجهزة الذكية',
    titleEnglish:'Unicode Uthmanic Hafs for smart devices',
    authority:'King Fahd Glorious Quran Printing Complex',
    authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',
    officialCertification:'CERTIFIED',
    officialReference:'https://qurancomplex.gov.sa/en/techquran/dev/',
    narrations:['Hafs'],
    formats:['MS document','Excel','CSV','HTML5','SQL','XML','JSON','PDF'],
    fileSizeLabel:'21.6MB',
    md5:'53D82B553E5FE919CA1A732E35BF4EB0',
    sha1:'1DBEAE3847880B1C21A956DCFDC0A2D9D490E729',
    notes:[
      'Verse-level Uthmanic display for smart devices; the official page explicitly says it is not intended to reproduce the full Mushaf page layout.',
      'Includes aya_text_emlaey for search use.'
    ]
  },
  ...([] as KfgqpcDeveloperAsset[]),
  {
    id:'kfgqpc-tafseer-muyassar',
    kind:'TAFSEER_DATA',
    titleArabic:'التفسير الميسر للقرآن الكريم',
    titleEnglish:'Tafseer Muyassar',
    authority:'King Fahd Glorious Quran Printing Complex',
    authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',
    officialCertification:'CERTIFIED',
    officialReference:'https://qurancomplex.gov.sa/en/techquran/dev/',
    narrations:['Hafs'],
    formats:['Excel','CSV','HTML5','SQL','XML','JSON','TXT'],
    fileSizeLabel:'7.51MB',
    md5:'5601682965E32F4DD6992C7600FDCCC3',
    sha1:'5F533113C2F54F32EDED734BB49E6A5837965722',
    notes:['Contains Hafs Quran data plus aya_tafseer aligned to each ayah.']
  },
  {
    id:'kfgqpc-muyassar-ghareeb',
    kind:'GHAREEB_DATA',
    titleArabic:'الميسر في غريب القرآن الكريم',
    titleEnglish:'Muyassar of Ghareeb Al-Quran',
    authority:'King Fahd Glorious Quran Printing Complex',
    authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',
    officialCertification:'CERTIFIED',
    officialReference:'https://qurancomplex.gov.sa/en/techquran/dev/',
    narrations:['Hafs'],
    formats:['Excel','CSV','HTML5','SQL','XML','JSON'],
    fileSizeLabel:'934KB',
    md5:'7E22381EEDB152EE7ED6488F2395C6CD',
    sha1:'055A908C6EC7F06912C33BD00920406C665CC5F9',
    notes:['Word-level Quranic terms with explanatory text.']
  },

  {
    id:'kfgqpc-computer-fonts',kind:'OFFICIAL_QURAN_FONT',titleArabic:'الخطوط الحاسوبية الرسمية',titleEnglish:'Official Quran computer fonts',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',officialCertification:'CERTIFIED',officialReference:'https://qurancomplex.gov.sa/en/techquran/dev/',formats:['Computer font packages'],notes:['Use only within the exact source/riwayah scope published by KFGQPC. MIZAN must not visually substitute one reading font for another.']
  },
  {
    id:'kfgqpc-desktop-publishing',kind:'DESKTOP_PUBLISHING',titleArabic:'النشر الحاسوبي لمصحف المدينة',titleEnglish:'Madinah Mushaf desktop publishing',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',officialCertification:'CERTIFIED',officialReference:'https://qurancomplex.gov.sa/en/techquran/dev/',formats:['Desktop publishing assets/tools'],notes:['Approved source path for official print/export workflows; every generated artifact must retain source/version provenance.']
  },
  {
    id:'kfgqpc-publication-images',kind:'PUBLICATION_IMAGE_SERVICE',titleArabic:'صور إصدارات المجمع',titleEnglish:'Images of KFGQPC publications',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',officialCertification:'CERTIFIED',officialReference:'https://qurancomplex.gov.sa/en/techquran/techquran-apps/techquran-apps-publishios/',formats:['Official publication image service'],notes:['Visual reference only. Structured Quran text/package remains the scientific source used by FairDraw and question resolution.']
  },
  {
    id:'kfgqpc-waqf-reference',
    kind:'WAQF_REFERENCE',
    titleArabic:'قواعد الوقف وعلاماته وتطبيقاته',
    titleEnglish:'Rules of Quranic pauses, symbols and applications',
    authority:'King Fahd Glorious Quran Printing Complex',
    authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',
    officialCertification:'CERTIFIED',
    officialReference:'https://qurancomplex.gov.sa/en/kfgqpc/kfq-structure/',
    formats:['Official reference/publication material'],
    notes:['Official scientific reference discovery only. MIZAN does not claim a structured word-indexed waqf dataset until such data are imported with exact provenance.']
  },
  {
    id:'kfgqpc-tajweed-muyassar',
    kind:'TAJWEED_BOOK_DATA',
    titleArabic:'التجويد الميسر',
    titleEnglish:'Al-Tajweed al-Muyassar',
    authority:'King Fahd Glorious Quran Printing Complex',
    authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',
    officialCertification:'CERTIFIED',
    officialReference:'https://qurancomplex.gov.sa/en/techquran/dev/',
    formats:['Digital book package'],
    fileSizeLabel:'178KB',
    md5:'B4A265A810C0CE4A722019791910B67E',
    sha1:'D2496382FC5E843CCB693B94DD19407EAA174BEA',
    notes:['Official concise Tajweed reference. It is a scientific reference asset, not an automatically executable AI rule engine.']
  }
] as const;
