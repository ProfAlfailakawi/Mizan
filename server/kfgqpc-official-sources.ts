/**
 * King Fahd Glorious Qur'an Printing Complex (KFGQPC) official developer-source catalog.
 *
 * IMPORTANT: authorityTrust === PRIMARY_OFFICIAL_AUTHORITY means MIZAN accepts the
 * institution as an authoritative source. A concrete local package is still usable in an
 * official competition only after the bytes imported into MIZAN match the published
 * checksum and the configured scientific approval policy is satisfied.
 *
 * Metadata below is transcribed from the official KFGQPC developer platform.
 * Landing page: https://qurancomplex.gov.sa/en/techquran/dev/
 */
export type KfgqpcPackageId =
  | 'kfgqpc-hafs-uthmanic-v13'
  | 'kfgqpc-warsh-uthmanic-v6'
  | 'kfgqpc-shubah-uthmanic-v4'
  | 'kfgqpc-qaloun-uthmanic-v5'
  | 'kfgqpc-douri-abu-amr-uthmanic-v3'
  | 'kfgqpc-sousi-abu-amr-uthmanic-v3';

export interface KfgqpcOfficialPackage {
  id:KfgqpcPackageId;
  authority:'King Fahd Glorious Quran Printing Complex';
  authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف';
  authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY';
  officialCertification:'CERTIFIED';
  localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE';
  publication:'Glorious Quran Platform for Developers';
  landingPage:'https://qurancomplex.gov.sa/en/techquran/dev/';
  sourceKind:'UNICODE_UTHMANIC_DEVELOPER_PACKAGE';
  qiraah:string;
  imam:string;
  rawi:string;
  tariq?:string;
  riwayaArabic:string;
  riwayaEnglish:string;
  sourceVersion:string;
  officialUpdateLabel:string;
  fileSizeLabel:string;
  md5:string;
  sha1:string;
  expectedDeveloperFormats:readonly string[];
  expectedDataFields:readonly string[];
  expectedInternalDataHint:string;
  notes?:readonly string[];
}

const commonFormats=['Excel','CSV','HTML5','SQL','XML','JSON','TXT','PDF'] as const;
const commonFields=['id','jozz','page','sura_no','sura_name_en','sura_name_ar','line_start','line_end','aya_no','aya_text'] as const;

export const KFGQPC_OFFICIAL_PACKAGES:readonly KfgqpcOfficialPackage[]=[
  {
    id:'kfgqpc-hafs-uthmanic-v13',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE',publication:'Glorious Quran Platform for Developers',landingPage:'https://qurancomplex.gov.sa/en/techquran/dev/',sourceKind:'UNICODE_UTHMANIC_DEVELOPER_PACKAGE',
    qiraah:'Asim',imam:'Asim ibn Abi al-Najud',rawi:'Hafs',riwayaArabic:'حفص عن عاصم',riwayaEnglish:"Hafs 'an Asim",sourceVersion:'13.0',officialUpdateLabel:'Update 13.0',fileSizeLabel:'10MB',md5:'CF6841AEA5B1D1FD70D032B43FF08278',sha1:'36EA5AB0D7EA1702F17FF43F9B50924CCCD77EBF',expectedDeveloperFormats:commonFormats,expectedDataFields:[...commonFields,'aya_text_emlaey'],expectedInternalDataHint:'UthmanicHafs_v2-0 / hafsData_v2-0',
    notes:['Last-modified date shown by the official developer platform: 2023-09-19.']
  },
  {
    id:'kfgqpc-warsh-uthmanic-v6',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE',publication:'Glorious Quran Platform for Developers',landingPage:'https://qurancomplex.gov.sa/en/techquran/dev/',sourceKind:'UNICODE_UTHMANIC_DEVELOPER_PACKAGE',
    qiraah:'Nafi',imam:"Nafi al-Madani",rawi:'Warsh',riwayaArabic:'ورش عن نافع',riwayaEnglish:"Warsh 'an Nafi",sourceVersion:'6.0',officialUpdateLabel:'Update 6.0',fileSizeLabel:'8.62MB',md5:'4701E8BBF053098220CF2CF4CDA206A1',sha1:'44ECEA8FEB23817FDC01A8EE2162A6A0CF08CAE7',expectedDeveloperFormats:commonFormats,expectedDataFields:commonFields,expectedInternalDataHint:'UthmanicWarsh_v2-0'
  },
  {
    id:'kfgqpc-shubah-uthmanic-v4',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE',publication:'Glorious Quran Platform for Developers',landingPage:'https://qurancomplex.gov.sa/en/techquran/dev/',sourceKind:'UNICODE_UTHMANIC_DEVELOPER_PACKAGE',
    qiraah:'Asim',imam:'Asim ibn Abi al-Najud',rawi:"Shu'bah",riwayaArabic:'شعبة عن عاصم',riwayaEnglish:"Shu'bah 'an Asim",sourceVersion:'4.0',officialUpdateLabel:'Update 4.0',fileSizeLabel:'8.33MB',md5:'5CDA29121BF0D7234E039002E1FBF600',sha1:'8D66BDF0CAB96DC7D1032792C19F77980CA6682A',expectedDeveloperFormats:commonFormats,expectedDataFields:commonFields,expectedInternalDataHint:'UthmanicShuba_v2-0'
  },
  {
    id:'kfgqpc-qaloun-uthmanic-v5',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE',publication:'Glorious Quran Platform for Developers',landingPage:'https://qurancomplex.gov.sa/en/techquran/dev/',sourceKind:'UNICODE_UTHMANIC_DEVELOPER_PACKAGE',
    qiraah:'Nafi',imam:"Nafi al-Madani",rawi:'Qalun',riwayaArabic:'قالون عن نافع',riwayaEnglish:"Qalun 'an Nafi",sourceVersion:'5.0',officialUpdateLabel:'Update 5.0',fileSizeLabel:'8.35MB',md5:'964208FF04C8AADD3DDC1BE262D8CFD3',sha1:'81733666BE17742E13C9FA4C7D26D42B1ADC67C8',expectedDeveloperFormats:commonFormats,expectedDataFields:commonFields,expectedInternalDataHint:'UthmanicQaloun_v2-1'
  },
  {
    id:'kfgqpc-douri-abu-amr-uthmanic-v3',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE',publication:'Glorious Quran Platform for Developers',landingPage:'https://qurancomplex.gov.sa/en/techquran/dev/',sourceKind:'UNICODE_UTHMANIC_DEVELOPER_PACKAGE',
    qiraah:'Abu Amr',imam:'Abu Amr al-Basri',rawi:'Al-Duri',riwayaArabic:'الدوري عن أبي عمرو البصري',riwayaEnglish:"Al-Duri 'an Abi Amr",sourceVersion:'3.0',officialUpdateLabel:'Update 3.0',fileSizeLabel:'8.38MB',md5:'A60BDD18397B3E27E4617478968A35C8',sha1:'8049482F04B4FF1053A7859F96B2B113B9771EFB',expectedDeveloperFormats:commonFormats,expectedDataFields:commonFields,expectedInternalDataHint:'UthmanicDouri_v2-0',
    notes:["This package is Al-Duri 'an Abi Amr. It must never be mapped to Al-Duri 'an Al-Kisa'i."]
  },
  {
    id:'kfgqpc-sousi-abu-amr-uthmanic-v3',authority:'King Fahd Glorious Quran Printing Complex',authorityArabic:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE',publication:'Glorious Quran Platform for Developers',landingPage:'https://qurancomplex.gov.sa/en/techquran/dev/',sourceKind:'UNICODE_UTHMANIC_DEVELOPER_PACKAGE',
    qiraah:'Abu Amr',imam:'Abu Amr al-Basri',rawi:'Al-Susi',riwayaArabic:'السوسي عن أبي عمرو البصري',riwayaEnglish:"Al-Susi 'an Abi Amr",sourceVersion:'3.0',officialUpdateLabel:'Update 3.0',fileSizeLabel:'8.44MB',md5:'1BF6023E29B7622A52B6171232C17096',sha1:'E52DBC6D8B43797A8FAA0FD1EC1D8E5000265674',expectedDeveloperFormats:commonFormats,expectedDataFields:commonFields,expectedInternalDataHint:'UthmanicSousi_v2-0'
  }
] as const;

export function kfgqpcPackageById(id:string){return KFGQPC_OFFICIAL_PACKAGES.find(x=>x.id===id)}
export function kfgqpcPackageForReading(rawi:string,imam?:string){
  const norm=(v:string)=>String(v||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,'');
  const r=norm(rawi),i=norm(imam||'');
  return KFGQPC_OFFICIAL_PACKAGES.find(x=>norm(x.rawi)===r&&(!i||norm(x.imam)===i));
}
