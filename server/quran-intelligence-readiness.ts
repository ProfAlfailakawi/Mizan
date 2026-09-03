import type {QuranReadingId} from './quran-intelligence-types';

export type QuranReadinessState='READY'|'WAITING_OFFICIAL_SOURCE'|'WAITING_VERIFICATION'|'WAITING_ENGINE'|'BLOCKED';
export interface QuranReadinessStage{
  id:'source'|'spatial'|'waqf'|'tajweed'|'vector'|'alignment';
  state:QuranReadinessState;
  labelArabic:string;
  labelEnglish:string;
  detailArabic:string;
  detailEnglish:string;
  blocking:boolean;
}
export interface QuranReadingReadiness{
  reading:QuranReadingId;
  completionPercent:number;
  productionReady:boolean;
  nextAction:'WAIT_FOR_KFGQPC'|'IMPORT_OFFICIAL_SCIENCE'|'VERIFY_VECTOR_GEOMETRY'|'BENCHMARK_ALIGNMENT_ENGINE'|'READY';
  stages:QuranReadinessStage[];
}

const stage=(id:QuranReadinessStage['id'],state:QuranReadinessState,ar:string,en:string,detailAr:string,detailEn:string,blocking=true):QuranReadinessStage=>({id,state,labelArabic:ar,labelEnglish:en,detailArabic:detailAr,detailEnglish:detailEn,blocking});
const ready=(id:QuranReadinessStage['id'],ar:string,en:string,detailAr:string,detailEn:string)=>stage(id,'READY',ar,en,detailAr,detailEn,false);

export function buildQuranReadingReadiness(input:{
  reading:QuranReadingId;
  spatial:'VERIFIED'|'UNVERIFIED';
  waqfStatus:string;
  waqfScienceStatus:string;
  tajweedStatus:string;
  vectorStatus:string;
  verifiedWordMappings?:number;
  benchmarkStatus:string;
  benchmarkPassed?:boolean;
  alignmentBackendConfigured:boolean;
}):QuranReadingReadiness{
  const sourceReady=input.spatial==='VERIFIED';
  const stages:QuranReadinessStage[]=[];
  stages.push(sourceReady
    ?ready('source','المصدر الرسمي','Official source','حزمة القراءة الرسمية مستوردة ومقفلة بالمصدر.','The official reading package is imported and source-locked.')
    :stage('source','WAITING_OFFICIAL_SOURCE','المصدر الرسمي','Official source','بانتظار عودة مصدر مجمع الملك فهد؛ لا يُستخدم بديل.','Waiting for KFGQPC availability; no substitute source is allowed.'));
  stages.push(sourceReady
    ?ready('spatial','الموضع والسطر','Page & line','page + line_start + line_end جاهزة من بيانات المجمع.','Official page + line_start + line_end mapping is ready.')
    :stage('spatial','WAITING_OFFICIAL_SOURCE','الموضع والسطر','Page & line','المحول البرمجي جاهز ويبدأ فور دخول الحزمة الرسمية.','The mapper is ready and activates as soon as the official package arrives.'));
  stages.push(input.waqfStatus==='VERIFIED'&&input.waqfScienceStatus==='VERIFIED'
    ?ready('waqf','الوقف','Waqf','علامات الوقف المطبوعة مشتقة ومثبتة من النص الرسمي.','Printed waqf signs are derived and verified against official text.')
    :stage('waqf',sourceReady?'WAITING_VERIFICATION':'WAITING_OFFICIAL_SOURCE','الوقف','Waqf',sourceReady?(input.waqfStatus==='VERIFIED'?'علامات الوقف جاهزة؛ تبقى قواعد الوقف والابتداء وتطبيقاتها الرسمية.':'محرك الاشتقاق جاهز؛ يلزم إتمام الاستيراد/التحقق العلمي الموسع.'):'جاهز للاشتقاق تلقائيًا فور توفر النص الرسمي.',sourceReady?(input.waqfStatus==='VERIFIED'?'Printed signs are verified; official Waqf/Ibtida rules and applications remain.':'Derivation is ready; extended scientific import/review remains.'):'Derives automatically once the official text is available.'));
  stages.push(input.tajweedStatus==='VERIFIED'
    ?ready('tajweed','التجويد','Tajweed','قواعد ومواضع التجويد الموثقة جاهزة لهذه القراءة.','Verified Tajweed rules and occurrences are ready for this reading.')
    :stage('tajweed',sourceReady?'WAITING_VERIFICATION':'WAITING_OFFICIAL_SOURCE','التجويد','Tajweed',sourceReady?'طبقة الاستقبال والتحقق جاهزة؛ ننتظر المادة الرسمية الفعلية وربط مواضعها.':'بنية الاستيراد والتحقق جاهزة بانتظار حزمة التجويد الرسمية.',sourceReady?'The intake/verification layer is ready; official rule material and occurrence mapping remain.':'The intake/verification layer is ready for the official Tajweed package.'));
  const vectorReady=input.vectorStatus==='VERIFIED'&&(input.verifiedWordMappings||0)>0;
  stages.push(vectorReady
    ?ready('vector','هندسة الكلمات','Vector geometry','هندسة كلمات موثقة جاهزة للمؤشر الحي.','Verified word geometry is ready for the live cursor.')
    :stage('vector',input.vectorStatus==='QUARANTINED'?'BLOCKED':sourceReady?'WAITING_VERIFICATION':'WAITING_OFFICIAL_SOURCE','هندسة الكلمات','Vector geometry',input.vectorStatus==='QUARANTINED'?'أصل المتجهات محجور حتى حل عدم التطابق.':'قارئ البيانات والتحقق جاهزان؛ ننتظر SVG/Adobe AI الرسمي وإثبات ربط الكلمة.',input.vectorStatus==='QUARANTINED'?'Vector master is quarantined until the mismatch is resolved.':'Parser/validation is ready; official SVG/Adobe AI and proven word binding remain.'));
  const alignmentReady=input.benchmarkStatus==='VERIFIED'&&input.benchmarkPassed===true&&input.alignmentBackendConfigured;
  stages.push(alignmentReady
    ?ready('alignment','التتبع الحي','Live alignment','محرك معتمد لنفس القراءة موصول ويعمل في وضع الظل.','A reading-matched approved engine is connected in shadow mode.')
    :stage('alignment',input.benchmarkStatus==='VERIFIED'&&!input.alignmentBackendConfigured?'WAITING_ENGINE':'WAITING_VERIFICATION','التتبع الحي','Live alignment',input.benchmarkStatus==='VERIFIED'?'المعيار معتمد؛ ينتظر توصيل محرك المحاذاة الحقيقي.':'عقد الصوت وState Machine جاهزان؛ يلزم محرك Quran forced-alignment واختباره.',input.benchmarkStatus==='VERIFIED'?'Benchmark is approved; the real alignment backend still needs connection.':'Audio contract and state machine are ready; a Quran forced-alignment engine must be benchmarked.'));

  const weights:Record<QuranReadinessStage['id'],number>={source:20,spatial:15,waqf:15,tajweed:15,vector:20,alignment:15};
  const completionPercent=stages.reduce((n,s)=>n+(s.state==='READY'?weights[s.id]:0),0);
  const productionReady=stages.every(s=>!s.blocking);
  const nextAction:QuranReadingReadiness['nextAction']=!sourceReady?'WAIT_FOR_KFGQPC':input.tajweedStatus!=='VERIFIED'||input.waqfStatus!=='VERIFIED'||input.waqfScienceStatus!=='VERIFIED'?'IMPORT_OFFICIAL_SCIENCE':!vectorReady?'VERIFY_VECTOR_GEOMETRY':!alignmentReady?'BENCHMARK_ALIGNMENT_ENGINE':'READY';
  return {reading:input.reading,completionPercent,productionReady,nextAction,stages};
}
