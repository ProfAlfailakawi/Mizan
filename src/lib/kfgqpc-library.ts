import {auth} from './firebase';
export type KfgqpcLibraryGroup='MUSHAF'|'QURAN_DATA'|'SCIENCE'|'PUBLISHING'|'AUDIO';
export interface KfgqpcLibraryCapability{ id:string;order:number;group:KfgqpcLibraryGroup;titleArabic:string;titleEnglish:string;summaryArabic:string;summaryEnglish:string;authority:string;authorityArabic:string;authorityState:'PRIMARY_OFFICIAL_AUTHORITY';scientificState:'CERTIFIED';operationalState:'OFFICIALLY_ACCEPTED'|'LOCAL_BYTES_REQUIRED'|'LOCAL_VERIFIED'|'SERVICE_READY';officialReference:string;sourceIds:string[];uses:string[];guardrail:string;visualMode?:'VECTOR_PAGE'|'UTHMANIC_TEXT'|'PUBLICATION_IMAGE'|'AUDIO'; }
export interface KfgqpcLibraryResponse{summary:{authority:string;protocol:string;officiallyAccepted:number;localVerified:number;serviceReady:number;requiresLocalBytes:number;groups:string[]};items:KfgqpcLibraryCapability[]}
export interface KfgqpcDeliveryStatus{protocol:string;deliverySource:'LOCAL'|'R2'|'NONE';r2Configured:boolean;localPageRootConfigured:boolean;localAudioRootConfigured:boolean;localFontRootConfigured:boolean;budget:{freeTierBytes:number;plannedBytes:number;remainingBytes:number;utilization:number;items:{key:string;labelArabic:string;bytes:number;note:string}[];assumptions:string[]}}
async function bearer(){const u=auth.currentUser;if(!u)throw new Error('IDENTITY_REQUIRED');return u.getIdToken()}
export async function fetchKfgqpcOfficialLibrary():Promise<KfgqpcLibraryResponse>{const token=await bearer();const r=await fetch('/api/science/quran/kfgqpc/library',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)throw new Error('KFGQPC_LIBRARY_UNAVAILABLE');return r.json()}
export async function fetchKfgqpcDeliveryStatus():Promise<KfgqpcDeliveryStatus>{const token=await bearer();const r=await fetch('/api/science/quran/kfgqpc/delivery-status',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)throw new Error('KFGQPC_DELIVERY_STATUS_UNAVAILABLE');return r.json()}
const VENUE_CACHE='mizan-quran-venue-v1';
/*
 * Official Mushaf page image.
 *
 * Order: signed-in governance route first (keeps venue-cache behaviour and per-role auditing),
 * then the public delivery route so an unauthenticated venue/demo screen still renders the real
 * printed page instead of falling back to plain text, then the offline venue cache.
 */
export async function fetchOfficialMushafPage(packageId:string,page:number):Promise<string|null>{
 const url=`/api/science/quran/kfgqpc/page/${encodeURIComponent(packageId)}/${page}`;
 const publicUrl=`/api/public/kfgqpc/page/${encodeURIComponent(packageId)}/${page}`;
 try{const token=await bearer();const r=await fetch(url,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(r.ok){if(typeof caches!=='undefined')void caches.open(VENUE_CACHE).then(c=>c.put(url,r.clone())).catch(()=>{});const b=await r.blob();return URL.createObjectURL(b)}}catch{}
 try{const r=await fetch(publicUrl,{cache:'default'});if(r.ok){if(typeof caches!=='undefined')void caches.open(VENUE_CACHE).then(c=>c.put(url,r.clone())).catch(()=>{});const b=await r.blob();return URL.createObjectURL(b)}}catch{}
 try{if(typeof caches==='undefined')return null;const cached=await caches.open(VENUE_CACHE).then(c=>c.match(url));if(!cached)return null;return URL.createObjectURL(await cached.blob())}catch{return null}}
export async function venueResilienceStatus(){if(typeof caches==='undefined')return {supported:false,cachedPages:0};try{const c=await caches.open(VENUE_CACHE),keys=await c.keys();return {supported:true,cachedPages:keys.filter(k=>new URL(k.url).pathname.includes('/api/science/quran/kfgqpc/page/')).length}}catch{return {supported:false,cachedPages:0}}}
export async function clearVenueQuranCache(){if(typeof caches!=='undefined')await caches.delete(VENUE_CACHE)}

/*
 * Delivery-layer Quran text and generative FairDraw.
 *
 * These read the R2 delivery package for the requested reading only. They exist so JudgeOS can
 * show real Uthmanic text and real Mushaf pages instead of a development placeholder; they are
 * labelled DELIVERY_OPEN_MIRROR by the server and never claim certified Source Vault provenance.
 */
export interface TajweedSpan{rule:string;start:number;end:number}
export interface DeliveryAyah{surah:number;ayah:number;text:string;page:number;lineStart:number;lineEnd:number;juz:number;surahNameArabic?:string;surahNameEnglish?:string;tajweed?:TajweedSpan[]}
export interface DeliveryPassage{reading:string;surah:number;startAyah:number;endAyah:number;ayat:DeliveryAyah[];text:string;loci:{page:number;lineStart:number;lineEnd:number}[];surahNameArabic?:string;surahNameEnglish?:string;juz?:number;provenance:{mode:string;authority:string;note:string};tajweedScopeNote?:string}
export interface FairDrawDraw{protocol:string;reading:string;anchorType:'SURAH_START'|'JUZ_START'|'PAGE_START'|'AYAH_START';anchorNote:string;seed:string;algorithm:string;candidateCount:number;selectedIndex:number;ayahCount:number;reproducible:boolean;verifyHint:string}
export interface FairDrawResult{passage:DeliveryPassage;draw:FairDrawDraw}

/*
 * A delivery request with an empty reading collapses to a path Express cannot match, so it falls
 * through to the SPA route and comes back as index.html with status 200 — JSON parsing then fails
 * and the surface silently shows nothing. Refuse the empty reading up front, and require the
 * response to actually be JSON, so a routing mistake surfaces as no data rather than as a blank
 * Mushaf nobody can explain.
 */
async function deliveryJson<T>(url:string,init?:RequestInit):Promise<T|null>{
 try{const r=await fetch(url,init);
  if(!r.ok)return null;
  if(!(r.headers.get('content-type')||'').includes('application/json'))return null;
  return await r.json() as T}catch{return null}}

export interface MushafLayoutWord{surah:number;ayah:number;wordIndex:number;line?:number;bbox?:{x:number;y:number;width:number;height:number}}
export interface MushafPageLayout{page:number;scale:string;lineCount:number;words:MushafLayoutWord[]}
/* تخطيط الكلمة طبقة إثراء: غيابه (204) حالة عادية تُعاد فيها null، ويبقى العرض على عدسة السطر. */
export async function fetchMushafLayout(page:number):Promise<MushafPageLayout|null>{
 try{const r=await fetch(`/api/public/kfgqpc/mushaf-layout/${page}`,{cache:'default'});
  if(!r.ok||r.status===204)return null;return await r.json() as MushafPageLayout}catch{return null}}

/*
 * موضع كلمة بعينها على الصفحة المطبوعة.
 *
 * ملفات التخطيط المفتوحة المتاحة لا تحمل إحداثيات — فحصتُ ملفًا حقيقيًا فلم أجد فيها x ولا y —
 * لكنها تحمل رقم سطر كل كلمة بدقّة. فالمُعاد هنا صندوقٌ حين يوفّره المصدر، وسطرٌ حين لا يوفّره.
 * والسطر ليس تنازلًا: العدسة تنتقل مع التلاوة سطرًا سطرًا بدل أن تغطّي المقطع كله.
 */
export function findLayoutWord(layout:MushafPageLayout|null,surah:number,ayah:number,wordIndex:number){
 if(!layout)return null;
 return layout.words.find(w=>w.surah===surah&&w.ayah===ayah&&w.wordIndex===wordIndex)||null;}

export async function fetchDeliveryPassage(reading:string,surah:number,startAyah:number,endAyah:number):Promise<DeliveryPassage|null>{
 if(!reading)return null;
 return deliveryJson<DeliveryPassage>(`/api/public/kfgqpc/passage/${encodeURIComponent(reading)}/${surah}/${startAyah}/${endAyah}`,{cache:'default'});}

export async function drawFairPassage(reading='hafs',options:{seed?:string;anchor?:string;juz?:number;surah?:number;min?:number;max?:number;ayahCount?:number}={}):Promise<FairDrawResult|null>{
 const q=new URLSearchParams();for(const [k,v] of Object.entries(options))if(v!==undefined&&v!==null&&v!=='')q.set(k,String(v));
 try{const r=await fetch(`/api/public/kfgqpc/fairdraw/${encodeURIComponent(reading)}${q.toString()?`?${q}`:''}`,{cache:'no-store'});
  if(!r.ok)return null;return await r.json()}catch{return null}}

/*
 * Mutashabihat radar and the pre-emptive divergence tree.
 *
 * Both return counted text facts from the same reading's package — where a phrase genuinely
 * recurs, and where a shared phrase forks into a different next word. No probability is attached
 * to a reciter, because none is measured.
 */
export interface MutashabihatOccurrence{surah:number;ayah:number;wordIndex:number;page?:number;surahNameArabic?:string}
export interface MutashabihatMatch{phrase:string;wordCount:number;totalOccurrences:number;occurrences:MutashabihatOccurrence[]}
export interface DivergenceBranch{at:MutashabihatOccurrence;nextWord:string;surahNameArabic?:string}
export interface DivergencePoint{surah:number;ayah:number;wordIndex:number;sharedPhrase:string;sharedWordCount:number;expectedWord:string;branches:DivergenceBranch[]}
export interface DifficultyVector{mutashabihat:number;rareWords:number;endingSimilarity:number;waqfSensitivity:number;score:number}

export async function fetchMutashabihat(reading:string,surah:number,ayah:number):Promise<MutashabihatMatch[]>{
 if(!reading)return [];
 const b=await deliveryJson<{matches?:MutashabihatMatch[]}>(`/api/public/kfgqpc/mutashabihat/${encodeURIComponent(reading)}/${surah}/${ayah}`,{cache:'default'});
 return Array.isArray(b?.matches)?b!.matches!:[]}

export async function fetchDivergencePoints(reading:string,surah:number,startAyah:number,endAyah:number):Promise<DivergencePoint[]>{
 if(!reading)return [];
 const b=await deliveryJson<{points?:DivergencePoint[]}>(`/api/public/kfgqpc/divergence/${encodeURIComponent(reading)}/${surah}/${startAyah}/${endAyah}`,{cache:'default'});
 return Array.isArray(b?.points)?b!.points!:[]}

export async function fetchDifficulty(reading:string,surah:number,startAyah:number,endAyah:number):Promise<DifficultyVector|null>{
 if(!reading)return null;
 const b=await deliveryJson<{vector?:DifficultyVector}>(`/api/public/kfgqpc/difficulty/${encodeURIComponent(reading)}/${surah}/${startAyah}/${endAyah}`,{cache:'default'});
 return b?.vector||null}

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
