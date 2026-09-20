import {auth} from './firebase';

export type QuranReadingId='hafs'|'warsh'|'shubah'|'qaloun'|'douri-abu-amr'|'sousi-abu-amr';
export type AlignmentState='LOCKED'|'PROBABLE'|'UNCERTAIN'|'LOST'|'REACQUIRING'|'REACQUIRED';
export interface QuranPageLocus{page:number;lineStart:number;lineEnd:number;lineCount?:number}
export interface WaqfOccurrence{reading:QuranReadingId;surah:number;ayah:number;wordIndex?:number;afterToken?:string;symbol:string;displayLabel?:string;sourceSymbol?:string;symbolCodePoint?:string;officialMeaning:string;category:string;source:string;version:string;assurance:string;evidenceId:string;sourceTextSha256?:string;sourceUtf16Offset?:number;sourceCodePointOffset?:number;derivation?:string}
export interface TajweedRule{id:string;version:string;nameArabic:string;nameEnglish?:string;category:string;summaryArabic:string;evidenceIds:string[]}
export interface TajweedOccurrence{id:string;reading:QuranReadingId;surah:number;ayah:number;wordIndex?:number;ruleId:string;evidenceIds:string[];assurance:string;humanReviewed:boolean}
export interface QuranPassageIntelligence{
  reading:QuranReadingId;surah:number;startAyah:number;endAyah:number;pageLoci:QuranPageLocus[];assurance:'KFGQPC_OFFICIAL_METADATA';sourcePackage:string;
  knowledge:{waqf:{status:string;occurrences:number};waqfScience:{status:string;rules:number;applications:number;taxonomyVersion?:string};tajweed:{status:string;rules:number;occurrences:number;taxonomyVersion?:string};vector:{status:string;layerCount:number;verifiedWordMappings:number;unresolvedWordLayers:number}};
  alignmentBenchmark:{status:string;passed:boolean;failures:string[];measuredAt?:string};
  ayahs:{ayah:number;location:{page:number;lineStart:number;lineEnd:number;assurance:string};waqf:WaqfOccurrence[];waqfScience?:{rules:{id:string;nameArabic:string;summaryArabic:string}[];applications:{id:string;ruleId:string;wordIndex?:number}[]};tajweed:{rules:TajweedRule[];occurrences:TajweedOccurrence[]}}[];
}
export interface QuranAlignmentResult{
  timestamp:string;reading:QuranReadingId;surah?:number;ayah?:number;wordIndex?:number;phonemeIndex?:number;confidence:number;smoothedConfidence:number;alignmentState:AlignmentState;recoveryState:string;pointerMoved:boolean;scoreAuthority:'HUMAN_ONLY';scoreDelta:0;shadowMode:true;
  visualLocation?:{page:number;lineStart:number;lineEnd:number;loci?:QuranPageLocus[];assurance:string}|null;
  wordVector?:{page:number;sourceLayerId:string;line?:number;normalizedBBox?:{x:number;y:number;width:number;height:number};resolution:string}|null;
  waqfEvidence?:WaqfOccurrence[];
  waqfAyahContext?:WaqfOccurrence[];
  backendEvidence?:{modelVersion:string;acousticQuality?:number};
  sessionEvidence?:{eventCount:number;integritySha256:string};
}
export interface QuranTimelineEvent{id:string;sessionId:string;actorId:string;timestamp:string;offsetMs:number;kind:'ALIGNMENT'|'RECOVERY'|'HUMAN_MARKER'|'SESSION_RESET';reading?:QuranReadingId;surah?:number;ayah?:number;wordIndex?:number;alignmentState?:AlignmentState;recoveryState?:string;confidence?:number;acousticQuality?:number;humanEventType?:string;source:string;scoreAuthority:'HUMAN_ONLY'}
export interface QuranSessionEvidence{protocol:'MIZAN-QURAN-SESSION-EVIDENCE-1';sessionId:string;actorId:string;startedAt:string;updatedAt:string;events:QuranTimelineEvent[];summary:{alignmentEvents:number;recoveryEvents:number;humanMarkers:number;lostEvents:number;reacquiredEvents:number};integrity:{sha256:string}}
export interface QuranReadingGuard{reading:QuranReadingId;expectedSourcePackage:string;providedSourcePackage:string;status:'CLEAR'|'BLOCKED';conflicts:string[];crossReadingFallback:'FORBIDDEN'}
export interface QuranIntelligenceHealth{protocol:'MIZAN-QURAN-HEALTH-1';authority:'KFGQPC';generatedAt:string;alignmentBackendConfigured:boolean;summary:{readyLayers:number;totalLayers:number;fullyReadyReadings:number};readings:{reading:QuranReadingId;sourcePackage:string;layers:Record<string,boolean>;ready:number;total:number;blocked:string[];provenance:Record<string,string|undefined>}[]}

const PACKAGE_READING:Record<string,QuranReadingId>={
  'kfgqpc-hafs-uthmanic-v13':'hafs','kfgqpc-warsh-uthmanic-v6':'warsh','kfgqpc-shubah-uthmanic-v4':'shubah','kfgqpc-qaloun-uthmanic-v5':'qaloun','kfgqpc-douri-abu-amr-uthmanic-v3':'douri-abu-amr','kfgqpc-sousi-abu-amr-uthmanic-v3':'sousi-abu-amr'
};
export function quranReadingIdForPackage(packageId?:string){return packageId?PACKAGE_READING[packageId]:undefined}

/*
 * جسرٌ صريح بين مفتاح حزمة التسليم ومعرّف رواية محرّك التتبّع.
 *
 * الطبقتان تكتبان أسماء الرواة بهجاءين مختلفين (qalun مقابل qaloun، duri-abi-amr مقابل
 * douri-abu-amr)، واشتقاقُ أحدهما من الآخر بالتخمين يُرسل تلاوةً إلى رواية أخرى. والجدول
 * هنا منصوصٌ: ما لا مقابل له يعود undefined، فيُقال «الاستماع غير متاح لروايتك» بدل أن
 * يُقاس المتسابق بحزمة ليست حزمته.
 */
const DELIVERY_TO_INTELLIGENCE:Record<string,{reading:QuranReadingId;sourcePackageId:string}>={
  hafs:{reading:'hafs',sourcePackageId:'kfgqpc-hafs-uthmanic-v13'},
  warsh:{reading:'warsh',sourcePackageId:'kfgqpc-warsh-uthmanic-v6'},
  shubah:{reading:'shubah',sourcePackageId:'kfgqpc-shubah-uthmanic-v4'},
  qalun:{reading:'qaloun',sourcePackageId:'kfgqpc-qaloun-uthmanic-v5'},
  'duri-abi-amr':{reading:'douri-abu-amr',sourcePackageId:'kfgqpc-douri-abu-amr-uthmanic-v3'},
  'susi-abi-amr':{reading:'sousi-abu-amr',sourcePackageId:'kfgqpc-sousi-abu-amr-uthmanic-v3'},
};
export function practiceReadingFor(deliveryKey?:string){return deliveryKey?DELIVERY_TO_INTELLIGENCE[deliveryKey]:undefined}
async function bearer(){const u=auth.currentUser;if(!u)throw new Error('IDENTITY_REQUIRED');return u.getIdToken()}
async function getJson<T>(url:string):Promise<T>{const token=await bearer();const r=await fetch(url,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(body.code||`HTTP_${r.status}`));return body as T}
export async function fetchQuranIntelligenceCapabilities(){return getJson<{streamingAlignment:{mode:'SHADOW_ONLY';backendConfigured:boolean;scoreAuthority:'HUMAN_ONLY';canAffectScore:false}} & Record<string,unknown>>('/api/quran/intelligence/capabilities')}
export async function fetchQuranPassageIntelligence(reading:QuranReadingId,surah:number,startAyah:number,endAyah:number){return getJson<QuranPassageIntelligence>(`/api/quran/passage/${encodeURIComponent(reading)}/${surah}/${startAyah}/${endAyah}`)}
export async function submitQuranAlignmentChunk(input:{blob:Blob;sessionId:string;reading:QuranReadingId;surah:number;startAyah:number;endAyah:number;sourcePackageId:string}){
  const token=await bearer();const qs=new URLSearchParams({sessionId:input.sessionId,reading:input.reading,surah:String(input.surah),startAyah:String(input.startAyah),endAyah:String(input.endAyah),sourcePackageId:input.sourcePackageId});
  const r=await fetch(`/api/quran/alignment/shadow/audio?${qs.toString()}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':input.blob.type||'application/octet-stream'},body:input.blob,cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(body.code||`HTTP_${r.status}`));return body as QuranAlignmentResult;
}
/*
 * تدريب المتسابق: نفس المحرّك، بلا دفتر أدلّة.
 *
 * يعود بلا `sessionEvidence` لأن التمرين لا يُقيَّد في سجلّ، ويحمل `practice:true` حتى لا
 * تُخلط نتيجته بنتيجة جلسةٍ حقيقية في أي شاشة.
 */
export async function submitPracticeAlignmentChunk(input:{blob:Blob;reading:QuranReadingId;surah:number;startAyah:number;endAyah:number;sourcePackageId:string}){
  const token=await bearer();const qs=new URLSearchParams({reading:input.reading,surah:String(input.surah),startAyah:String(input.startAyah),endAyah:String(input.endAyah),sourcePackageId:input.sourcePackageId});
  const r=await fetch(`/api/quran/practice/align?${qs.toString()}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':input.blob.type||'application/octet-stream'},body:input.blob,cache:'no-store'});
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(body.code||`HTTP_${r.status}`));
  return body as QuranAlignmentResult&{practice:true};
}

/*
 * الإذنُ بالحكم، وما يُسمع من كلمات.
 *
 * ومسارُ المحاذاة أعلاه يعود بموضعٍ لا بنصّ. وهذان مسارُ التعرّف: الأوّل يسأل
 * «أيجوز أن يُقال لهذا الطالب أخطأت في روايته؟»، والثاني يرسل المقطعَ فيعود بما
 * سُمع كلماتٍ. ولا حكمَ في أيّهما: الحكمُ في `judgeRecitation` حيث يُعرف نصُّ الوجه.
 */
export interface QuranJudgingGate{reading:QuranReadingId;word:'OPEN'|'CLOSED';tashkeel:'OPEN'|'CLOSED';modelVersion:string|null;reasons:string[]}
export interface QuranRecognisedWord{text:string;confidence:number;startMs?:number;endMs?:number}
export interface QuranRecognitionResult{gate:QuranJudgingGate;words:QuranRecognisedWord[];modelVersion:string}

export async function fetchPracticeJudgingGate(reading:QuranReadingId){return getJson<QuranJudgingGate>(`/api/quran/practice/judging-gate?reading=${encodeURIComponent(reading)}`)}

export async function submitPracticeRecognitionChunk(input:{blob:Blob;reading:QuranReadingId;sourcePackageId:string}){
  const token=await bearer();const qs=new URLSearchParams({reading:input.reading,sourcePackageId:input.sourcePackageId});
  const r=await fetch(`/api/quran/practice/recognise?${qs.toString()}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':input.blob.type||'application/octet-stream'},body:input.blob,cache:'no-store'});
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(body.code||`HTTP_${r.status}`));
  return body as QuranRecognitionResult;
}

export async function resetQuranAlignment(sessionId:string){const token=await bearer();const r=await fetch('/api/quran/alignment/shadow/reset',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({sessionId}),cache:'no-store'});if(!r.ok)throw new Error('QURAN_ALIGNMENT_RESET_FAILED')}

export async function fetchQuranSessionEvidence(sessionId:string){return getJson<QuranSessionEvidence>(`/api/quran/alignment/shadow/session/${encodeURIComponent(sessionId)}`)}
export async function postQuranHumanMarker(sessionId:string,eventType:string){const token=await bearer();const r=await fetch(`/api/quran/alignment/shadow/session/${encodeURIComponent(sessionId)}/human-marker`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({eventType}),cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(body.code||`HTTP_${r.status}`));return body as QuranSessionEvidence}
export async function fetchQuranReadingGuard(reading:QuranReadingId,sourcePackageId:string){return getJson<QuranReadingGuard>(`/api/quran/intelligence/reading-guard/${encodeURIComponent(reading)}/${encodeURIComponent(sourcePackageId)}`)}
export async function fetchQuranIntelligenceHealth(){return getJson<QuranIntelligenceHealth>('/api/quran/intelligence/health')}
