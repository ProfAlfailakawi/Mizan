import {auth} from './firebase';
export type KfgqpcLibraryGroup='MUSHAF'|'QURAN_DATA'|'SCIENCE'|'PUBLISHING'|'AUDIO';
export interface KfgqpcLibraryCapability{ id:string;order:number;group:KfgqpcLibraryGroup;titleArabic:string;titleEnglish:string;summaryArabic:string;summaryEnglish:string;authority:string;authorityArabic:string;authorityState:'PRIMARY_OFFICIAL_AUTHORITY';scientificState:'CERTIFIED';operationalState:'OFFICIALLY_ACCEPTED'|'LOCAL_BYTES_REQUIRED'|'LOCAL_VERIFIED'|'SERVICE_READY';officialReference:string;sourceIds:string[];uses:string[];guardrail:string;visualMode?:'VECTOR_PAGE'|'UTHMANIC_TEXT'|'PUBLICATION_IMAGE'|'AUDIO'; }
export interface KfgqpcLibraryResponse{summary:{authority:string;protocol:string;officiallyAccepted:number;localVerified:number;serviceReady:number;requiresLocalBytes:number;groups:string[]};items:KfgqpcLibraryCapability[]}
async function bearer(){const u=auth.currentUser;if(!u)throw new Error('IDENTITY_REQUIRED');return u.getIdToken()}
export async function fetchKfgqpcOfficialLibrary():Promise<KfgqpcLibraryResponse>{const token=await bearer();const r=await fetch('/api/science/quran/kfgqpc/library',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)throw new Error('KFGQPC_LIBRARY_UNAVAILABLE');return r.json()}
export async function fetchOfficialMushafPage(packageId:string,page:number):Promise<string|null>{try{const token=await bearer();const r=await fetch(`/api/science/quran/kfgqpc/page/${encodeURIComponent(packageId)}/${page}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)return null;const b=await r.blob();return URL.createObjectURL(b)}catch{return null}}

export async function loadKfgqpcOfficialQuranFont(fontId='primary'):Promise<boolean>{try{if(typeof FontFace==='undefined'||typeof document==='undefined')return false;const name='MIZAN KFGQPC Official';const face=new FontFace(name,`url(/api/public/kfgqpc/font/${encodeURIComponent(fontId)})`);const loaded=await face.load();document.fonts.add(loaded);return document.fonts.check(`16px \"${name}\"`)}catch{return false}}

const USE_AR:Record<string,string>={
 'Official Mushaf Surface':'سطح المصحف الرسمي','print fallback':'الطباعة الاحتياطية','ceremony/appeal visual evidence':'الدليل البصري للحفل والاعتراض',
 'JudgeOS text surface':'سطح النص في منصة التحكيم','search':'البحث','page-line binding':'ربط الصفحة بالسطر',
 'FairDraw':'السحب العادل','server passage resolution':'حل موضع السؤال على الخادم','scientific comparison':'المقارنة العلمية','reading-aware judging':'التحكيم الواعي بالرواية',
 'post-session explanation':'الشرح بعد الجلسة','training':'التدريب','scientific context':'السياق العلمي','word context':'سياق الكلمة','digital twin enrichment':'إثراء التوأم الرقمي',
 'rule provenance':'مصدر القاعدة','scientific review':'المراجعة العلمية','print/export':'الطباعة والتصدير','research':'البحث العلمي',
 'question print fallback':'طباعة السؤال الاحتياطية','official booklets':'الكتيبات الرسمية','emergency packet':'حزمة الطوارئ','appeal visual reference':'المرجع البصري للاعتراض','public education':'التثقيف العام',
 'opening ayah prompt':'تلاوة آية البداية','judge calibration':'معايرة التحكيم','scientific alignment':'المحاذاة العلمية'
};
const GUARD_AR:Record<string,string>={
 'Never reconstruct a missing page from another riwayah.':'لا تُعاد صناعة صفحة مفقودة من رواية أخرى.',
 'This text surface does not claim to reproduce the full printed page.':'هذا السطح النصي لا يدّعي أنه يعيد إنتاج الصفحة المطبوعة كاملة.',
 'Exact official package only.':'الحزمة الرسمية المطابقة فقط.',
 'No Hafs fallback.':'لا رجوع إلى حفص عند غياب رواية أخرى.',
 'Reading isolation is mandatory.':'عزل الروايات إلزامي.',
 'Al-Duri Abu Amr can never satisfy Al-Duri Al-Kisa’i.':'الدوري عن أبي عمرو لا يمكن أن يحل محل الدوري عن الكسائي.',
 'Never changes scoring unless competition policy explicitly defines a human-reviewed criterion.':'لا يغيّر الدرجات إلا إذا عرّفت سياسة المسابقة معيارًا صريحًا يراجعه الإنسان.',
 'Explanatory evidence only.':'دليل تفسيري فقط.',
 'Reference authority does not certify model detection capability.':'اعتماد المرجع لا يعني اعتماد قدرة نموذج الذكاء الاصطناعي على الاكتشاف.',
 'Font choice follows the exact riwayah/source package; no visual substitution across readings.':'اختيار الخط يتبع الرواية وحزمة المصدر الدقيقة؛ لا استبدال بصري بين الروايات.',
 'Generated material must retain source/version provenance.':'أي مادة مولدة يجب أن تحتفظ بمصدرها ونسختها.',
 'A publication image never replaces the structured Quran source used by FairDraw.':'صورة الإصدار لا تستبدل مصدر القرآن المنظم المستخدم في السحب العادل.',
 'No TTS and no cross-riwayah audio fallback.':'لا تحويل نص إلى كلام للقرآن، ولا استخدام صوت من رواية أخرى.'
};
export function kfgqpcUseLabel(value:string,ar:boolean){return ar?(USE_AR[value]||value):value}
export function kfgqpcGuardrailLabel(value:string,ar:boolean){return ar?(GUARD_AR[value]||value):value}
