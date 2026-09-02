import type {
  AICapability,
  AICapabilityValidationRecord,
  AICertificationState,
  BenchmarkRunRecord,
  QiraatGraphNode,
  QuranSourceManifestRecord,
  ScientificDatasetRecord,
  VariantLocusRecord,
  ConsentRecord,
} from '../types';
import { hashCanonical, canonicalStringify } from './trust-protocol';

export const QURAN_PHONEME_SCHEMA_VERSION = 'QPS_v1';

const n=(v:string|undefined)=>String(v||'').toLowerCase().normalize('NFKC').replace(/[\s'’`_-]+/g,'');

export const TEN_QIRAAT_GRAPH: QiraatGraphNode[] = [
  ['nafi','Nafiʿ al-Madani','Nāfiʿ','qalun','Qalun',['pending'],[],true,'AVAILABLE_CANDIDATE'],
  ['nafi','Nafiʿ al-Madani','Nāfiʿ','warsh','Warsh',['al-azraq','al-asbahani'],[],true,'AVAILABLE_CANDIDATE'],
  ['ibn-kathir','Ibn Kathir al-Makki','Ibn Kathir','al-bazzi','Al-Bazzi',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['ibn-kathir','Ibn Kathir al-Makki','Ibn Kathir','qunbul','Qunbul',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['abu-amr','Abu Amr al-Basri','Abu Amr','al-duri-abu-amr','Al-Duri an Abi Amr',['pending'],[],true,'AVAILABLE_CANDIDATE'],
  ['abu-amr','Abu Amr al-Basri','Abu Amr','al-susi','Al-Susi',['pending'],[],true,'AVAILABLE_CANDIDATE'],
  ['ibn-amir','Ibn Amir al-Dimashqi','Ibn Amir','hisham','Hisham',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['ibn-amir','Ibn Amir al-Dimashqi','Ibn Amir','ibn-dhakwan','Ibn Dhakwan',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['asim','Asim al-Kufi','Asim','shubah','Shuʿbah',['pending'],[],true,'AVAILABLE_CANDIDATE'],
  ['asim','Asim al-Kufi','Asim','hafs','Hafs',['pending'],[],true,'AVAILABLE_CANDIDATE'],
  ['hamzah','Hamzah al-Kufi','Hamzah','khalaf-hamzah','Khalaf an Hamzah',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['hamzah','Hamzah al-Kufi','Hamzah','khallad','Khallad',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['al-kisai','Al-Kisaʾi','Al-Kisaʾi','abu-al-harith','Abu al-Harith',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['al-kisai','Al-Kisaʾi','Al-Kisaʾi','al-duri-kisai','Al-Duri an Al-Kisaʾi',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['abu-jafar','Abu Jafar al-Madani','Abu Jafar','ibn-wardan','Ibn Wardan',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['abu-jafar','Abu Jafar al-Madani','Abu Jafar','ibn-jammaz','Ibn Jammaz',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['yaqub','Yaqub al-Hadrami','Yaqub','ruways','Ruways',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['yaqub','Yaqub al-Hadrami','Yaqub','rawh','Rawh',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['khalaf-al-ashir','Khalaf al-Ashir','Khalaf al-Ashir','ishaq','Ishaq',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
  ['khalaf-al-ashir','Khalaf al-Ashir','Khalaf al-Ashir','idris','Idris',['pending'],[],true,'PENDING_SCIENTIFIC_SOURCE'],
].map(([qiraahId,qiraah,imam,rawiId,rawi,tariqIds,allowedWujuh,canonical,sourceStatus])=>({qiraahId,qiraah,imam,rawiId,rawi,tariqIds,allowedWujuh,canonical,sourceStatus} as QiraatGraphNode));

const RAWI_ALIASES:Record<string,string[]>={
  qalun:['qalun','قالون','قالونعننافع'],warsh:['warsh','ورش','ورشعننافع'],
  'al-bazzi':['albazzi','البزي','البزيعنابنكثير'],qunbul:['qunbul','قنبل','قنبلعنابنكثير'],
  'al-duri-abu-amr':['alduriabiamr','aldurianabiamr','الدوريعنابيعمرو','الدوريابيعمرو','الدوريعنأبيعمرو'],
  'al-susi':['alsusi','السوسي','السوسيعنابيعمرو','السوسيعنأبيعمرو'],
  hisham:['hisham','هشام','هشامعنابنعامر'],'ibn-dhakwan':['ibndhakwan','ابنذكوان','ابنذكوانعنابنعامر'],
  shubah:['shubah','shuba','شعبة','شعبه','شعبةعنعاصم'],hafs:['hafs','حفص','حفصعنعاصم'],
  'khalaf-hamzah':['khalafhamzah','خلفعنحمزة','خلفحمزة'],khallad:['khallad','خلاد','خلادعنحمزة'],
  'abu-al-harith':['abualharith','أبوالحارث','ابوالحارث','أبوالحارثعنالكسائي','ابوالحارثعنالكسائي'],
  'al-duri-kisai':['aldurialkisai','alduriankisai','aldurianalkisai','الدوريعنالكسائي','الدوريالكسائي'],
  'ibn-wardan':['ibnwardan','ابنوردان','ابنوردانعنأبيجعفر','ابنوردانعنابيجعفر'],
  'ibn-jammaz':['ibnjammaz','ابنجماز','ابنجمازعنأبيجعفر','ابنجمازعنابيجعفر'],
  ruways:['ruways','رويس','رويسعنيعقوب'],rawh:['rawh','روح','روحعنيعقوب'],
  ishaq:['ishaq','إسحاق','اسحاق','إسحاقعنخلفالعاشر','اسحاقعنخلفالعاشر'],idris:['idris','إدريس','ادريس','إدريسعنخلفالعاشر','ادريسعنخلفالعاشر']
};
const QIRAAH_ALIASES:Record<string,string[]>={
  nafi:['nafi','نافع'],'ibn-kathir':['ibnkathir','ابنكثير'],'abu-amr':['abuamr','أبوعمرو','ابوعمرو'],
  'ibn-amir':['ibnamir','ابنعامر'],asim:['asim','عاصم'],hamzah:['hamzah','حمزة'],'al-kisai':['alkisai','الكسائي'],
  'abu-jafar':['abujafar','أبوجعفر','ابوجعفر'],yaqub:['yaqub','يعقوب'],'khalaf-al-ashir':['khalafalashir','خلفالعاشر']
};
function aliasMatch(value:string,aliases:string[]){return aliases.some(a=>{const x=n(a);return value===x||value.includes(x)})}
export function resolveReadings(input:{qiraah?:string;rawi?:string;riwaya?:string}){
  const raw=n(input.rawi||input.riwaya);const qi=n(input.qiraah);
  if(!raw)return [];
  return TEN_QIRAAT_GRAPH.filter(x=>aliasMatch(raw,[x.rawi,x.rawiId,...(RAWI_ALIASES[x.rawiId]||[])])&&(!qi||aliasMatch(qi,[x.qiraah,x.qiraahId,...(QIRAAH_ALIASES[x.qiraahId]||[])])));
}
export function resolveReading(input:{qiraah?:string;rawi?:string;riwaya?:string}){
  const matches=resolveReadings(input);
  // Scientific code must not guess when a legacy display string maps to multiple canonical transmissions.
  return matches.length===1?matches[0]:undefined;
}

export function sameReading(a:{qiraah?:string;rawi?:string;riwaya?:string},b:{qiraah?:string;rawi?:string;riwaya?:string}){
  const ra=resolveReading(a), rb=resolveReading(b);
  return !!ra&&!!rb&&ra.qiraahId===rb.qiraahId&&ra.rawiId===rb.rawiId;
}

export function isDuriAbuAmr(record:{qiraah?:string;rawi?:string;riwaya?:string}){return resolveReading(record)?.rawiId==='al-duri-abu-amr'}
export function isDuriKisai(record:{qiraah?:string;rawi?:string;riwaya?:string}){return resolveReading(record)?.rawiId==='al-duri-kisai'}

export async function computeQuranPackageHash(record:QuranSourceManifestRecord){
  return hashCanonical({
    sourceAuthority:record.sourceAuthority, sourcePublication:record.sourcePublication, sourceEdition:record.sourceEdition||record.edition,
    sourceVersion:record.sourceVersion||record.version, qiraah:record.qiraah, rawi:record.rawi||record.riwaya, tariq:record.tariq, wajh:record.wajh,
    rasmSystem:record.rasmSystem,dabtSystem:record.dabtSystem,ayahNumberingConvention:record.ayahNumberingConvention,
    surahNumberingConvention:record.surahNumberingConvention,waqfConvention:record.waqfConvention,
    sourceFiles:(record.sourceFiles||[]).map(f=>({name:f.name,format:f.format,sha256:f.sha256,sizeBytes:f.sizeBytes})).sort((a,b)=>a.name.localeCompare(b.name)),
    checksumSha256:record.checksumSha256, expectedChecksumSha256:record.expectedChecksumSha256, checksumVerificationState:record.checksumVerificationState, contentHash:record.contentHash, structuralValidation:record.structuralValidation, licenseProvenance:record.licenseProvenance,
  });
}

export async function validateSourceHash(record:QuranSourceManifestRecord){
  const computed=await computeQuranPackageHash(record);
  return {valid:!!record.packageHash&&computed===record.packageHash,computed,expected:record.packageHash};
}

export function validateQuranSourceStructure(record:QuranSourceManifestRecord){
  const errors:string[]=[]; const warnings:string[]=[];
  if(!record.sourceAuthority?.trim())errors.push('SOURCE_AUTHORITY_REQUIRED');
  if(!record.version?.trim())errors.push('SOURCE_VERSION_REQUIRED');
  if(!record.checksumSha256?.trim())errors.push('SOURCE_CHECKSUM_REQUIRED');
  const reading=resolveReading({qiraah:record.qiraah,rawi:record.rawi,riwaya:record.riwaya});
  if(!reading)errors.push('CANONICAL_READING_MAPPING_REQUIRED');
  if(!record.sourceFiles?.length)warnings.push('SOURCE_FILES_NOT_ATTACHED');
  if(!record.rasmSystem)warnings.push('RASM_SYSTEM_UNSPECIFIED');
  if(!record.dabtSystem)warnings.push('DABT_SYSTEM_UNSPECIFIED');
  return {valid:errors.length===0,errors,warnings,reading};
}

export function canPromoteQuranSource(record:QuranSourceManifestRecord,requireTwo=true){
  const reviews=(record.scientificReviews||[]).filter(r=>r.decision==='approve'&&r.packageHash===record.packageHash);
  const distinct=new Set(reviews.map(r=>r.reviewerId));
  const structural=validateQuranSourceStructure(record);const errors=[...structural.errors];
  if(!record.contentHash)errors.push('SOURCE_CONTENT_HASH_REQUIRED');
  if(record.expectedChecksumSha256&&record.checksumVerificationState!=='MATCH')errors.push('SOURCE_CHECKSUM_MISMATCH');
  if(!record.structuralValidation?.surahCountValid)errors.push('SURAH_COUNT_VALIDATION_REQUIRED');
  if(record.structuralValidation?.ayahCountValid!==true)errors.push('AYAH_COUNT_PROFILE_VALIDATION_REQUIRED');
  if(record.structuralValidation?.errors?.length)errors.push(...record.structuralValidation.errors.map(x=>`STRUCTURE:${x}`));
  return {allowed:errors.length===0&&!!record.packageHash&&distinct.size>=(requireTwo?2:1),reviewers:distinct.size,errors};
}

export function immutableSourceUpdateAllowed(previous:QuranSourceManifestRecord,next:QuranSourceManifestRecord){
  if(previous.certificationState==='CERTIFIED'||previous.status==='approved'){
    const protectedFields=['sourceAuthority','sourcePublication','sourceEdition','sourceVersion','publicationDate','checksumSha256','expectedChecksumSha256','checksumVerificationState','packageHash','contentHash','version','edition','qiraah','imam','rawi','riwaya','tariq','wajh','rasmSystem','dabtSystem','ayahNumberingConvention','surahNumberingConvention','waqfConvention','sourceFiles','sourceReference','licenseProvenance','ingestionTimestamp','ingestedBy','structuralValidation','scientificReviews','approvalVersion','approvedBy','approvedAt'] as const;
    return !protectedFields.some(k=>canonicalStringify(previous[k])!==canonicalStringify(next[k]));
  }
  return true;
}

export function sourceUsableForCompetition(source:QuranSourceManifestRecord,reading:{qiraah?:string;rawi?:string;riwaya?:string;tariq?:string}){
  if(source.certificationState!=='CERTIFIED'&&source.status!=='approved')return {ok:false,reason:'SOURCE_NOT_CERTIFIED'};
  if(source.revocationState==='REVOKED'||source.certificationState==='REVOKED')return {ok:false,reason:'SOURCE_REVOKED'};
  if(!sameReading(source,reading))return {ok:false,reason:'READING_MISMATCH'};
  if(reading.tariq&&source.tariq&&n(reading.tariq)!==n(source.tariq))return {ok:false,reason:'TARIQ_MISMATCH'};
  return {ok:true as const};
}

export function aiCapabilityState(v:AICapabilityValidationRecord):AICertificationState{
  if(v.certificationState)return v.certificationState;
  return v.status==='certified'?'CERTIFIED':v.status==='suspended'?'SUSPENDED':v.status==='validated'?'PENDING_VALIDATION':'RESEARCH';
}

export function capabilityMatchesReading(v:AICapabilityValidationRecord,reading:{qiraah?:string;rawi?:string;riwaya?:string;tariq?:string;wajh?:string}){
  if(!sameReading(v,reading))return false;
  if(v.tariq&&reading.tariq&&n(v.tariq)!==n(reading.tariq))return false;
  if(v.wajh&&reading.wajh&&n(v.wajh)!==n(reading.wajh))return false;
  return true;
}

export function certifiedCapabilityFor(validations:AICapabilityValidationRecord[],input:{capability:AICapability;modelName?:string;modelVersion?:string;qiraah?:string;rawi?:string;riwaya?:string;tariq?:string;wajh?:string}){
  return validations.find(v=>v.capability===input.capability&&aiCapabilityState(v)==='CERTIFIED'&&capabilityMatchesReading(v,input)&&(!input.modelName||v.modelName===input.modelName)&&(!input.modelVersion||v.modelVersion===input.modelVersion));
}

export function certificationReleaseGate(input:{validation:AICapabilityValidationRecord;dataset?:ScientificDatasetRecord;benchmark?:BenchmarkRunRecord;approvedQuranSource?:QuranSourceManifestRecord}){
  const failures:string[]=[]; const {validation:v,dataset,benchmark,approvedQuranSource:source}=input;
  if(!source||sourceUsableForCompetition(source,v).ok!==true)failures.push('APPROVED_QURAN_SOURCE_CONTEXT_REQUIRED');
  if(!dataset||dataset.status!=='APPROVED_BENCHMARK')failures.push('APPROVED_DATASET_REQUIRED');
  if(dataset&&(!sameReading(dataset,v)||Boolean(v.tariq&&dataset.tariq&&n(v.tariq)!==n(dataset.tariq))))failures.push('DATASET_READING_SCOPE_MISMATCH');
  if(dataset&&v.datasetName&&dataset.name!==v.datasetName)failures.push('DATASET_IDENTITY_MISMATCH');
  if(dataset&&v.datasetVersion&&v.datasetVersion!=='unbound'&&dataset.version!==v.datasetVersion)failures.push('DATASET_VERSION_MISMATCH');
  if(!dataset?.speakerLeakageChecked)failures.push('SPEAKER_LEAKAGE_CHECK_REQUIRED');
  if(!dataset?.contentLeakageChecked)failures.push('CONTENT_LEAKAGE_CHECK_REQUIRED');
  if(!benchmark||benchmark.status!=='COMPLETED')failures.push('BENCHMARK_RUN_REQUIRED');
  if(benchmark&&(benchmark.modelName!==v.modelName||benchmark.modelVersion!==v.modelVersion||benchmark.capability!==v.capability))failures.push('BENCHMARK_MODEL_CAPABILITY_MISMATCH');
  if(benchmark&&(!sameReading(benchmark,v)||Boolean(v.tariq&&benchmark.tariq&&n(v.tariq)!==n(benchmark.tariq))))failures.push('BENCHMARK_READING_SCOPE_MISMATCH');
  if(benchmark&&dataset&&(benchmark.datasetId!==dataset.id||benchmark.datasetVersion!==dataset.version))failures.push('BENCHMARK_DATASET_MISMATCH');
  if(v.benchmark&&v.benchmark!=='unbound'&&benchmark&&v.benchmark!==benchmark.benchmark)failures.push('BENCHMARK_IDENTITY_MISMATCH');
  if(v.benchmarkVersion&&v.benchmarkVersion!=='unbound'&&benchmark&&v.benchmarkVersion!==benchmark.benchmarkVersion)failures.push('BENCHMARK_VERSION_MISMATCH');
  if(benchmark&&!benchmark.reproducibility?.codeVersion)failures.push('REPRODUCIBILITY_CODE_VERSION_REQUIRED');
  if(benchmark&&!benchmark.reproducibility?.evaluationScriptVersion)failures.push('REPRODUCIBILITY_SCRIPT_VERSION_REQUIRED');
  if(benchmark&&!benchmark.reproducibility?.metricDefinitionsVersion)failures.push('METRIC_DEFINITIONS_VERSION_REQUIRED');
  if(v.falseAcceptanceRate===undefined&&benchmark?.metrics.falseAcceptanceRate===undefined)failures.push('FALSE_ACCEPTANCE_REQUIRED');
  if(v.falseRejectionRate===undefined&&benchmark?.metrics.falseRejectionRate===undefined)failures.push('FALSE_REJECTION_REQUIRED');
  if(v.calibrationError===undefined&&benchmark?.metrics.calibrationError===undefined&&benchmark?.metrics.expectedCalibrationError===undefined)failures.push('CALIBRATION_REQUIRED');
  if(new Set(v.approvedBy).size<2)failures.push('DUAL_SCIENTIFIC_APPROVAL_REQUIRED');
  if(v.validationStage!=='LIMITED_BETA'&&v.validationStage!=='CERTIFIED')failures.push('SHADOW_VALIDATION_LIFECYCLE_REQUIRED');
  if(!v.shadowEvidenceRef)failures.push('SHADOW_EVIDENCE_REQUIRED');
  if(!v.modelVersion)failures.push('MODEL_VERSION_REQUIRED');
  if(!v.approvalVersion)failures.push('SCIENTIFIC_APPROVAL_VERSION_REQUIRED');
  return {allowed:failures.length===0,failures:[...new Set(failures)]};
}

export function detectModelChange(v:AICapabilityValidationRecord,current:{modelVersion:string;modelHash?:string}){
  const changed=v.modelVersion!==current.modelVersion || (!!v.modelHash&&!!current.modelHash&&v.modelHash!==current.modelHash);
  return {changed,nextState:changed?'PENDING_VALIDATION' as const:aiCapabilityState(v)};
}

export interface AudioQualityThresholds { maxClippingRatio?:number;minSignalDb?:number;minSnrDb?:number;maxPacketLossRatio?:number;requiredSampleRate?:number }
export function audioQualityGate(input:{clipping?:number;signalDb?:number;noiseDb?:number;packetLoss?:number;sampleRate?:number;echo?:boolean;missingSegment?:boolean;thresholds?:AudioQualityThresholds}){
  const reasons:string[]=[];const t=input.thresholds;
  if(t?.maxClippingRatio!==undefined&&input.clipping!==undefined&&input.clipping>t.maxClippingRatio)reasons.push('CLIPPING');
  if(t?.minSignalDb!==undefined&&input.signalDb!==undefined&&input.signalDb<t.minSignalDb)reasons.push('LOW_SIGNAL');
  if(t?.minSnrDb!==undefined&&input.noiseDb!==undefined&&input.signalDb!==undefined&&input.signalDb-input.noiseDb<t.minSnrDb)reasons.push('HIGH_NOISE');
  if(t?.maxPacketLossRatio!==undefined&&input.packetLoss!==undefined&&input.packetLoss>t.maxPacketLossRatio)reasons.push('PACKET_LOSS');
  if(t?.requiredSampleRate!==undefined&&input.sampleRate!==undefined&&input.sampleRate<t.requiredSampleRate)reasons.push('SAMPLE_RATE_MISMATCH');
  if(input.echo)reasons.push('ECHO');if(input.missingSegment)reasons.push('MISSING_SEGMENT');
  return {usable:reasons.length===0,reasons,thresholdPolicyConfigured:!!t,state:reasons.length?'AUDIO_NOT_SUITABLE_FOR_AI_REVIEW' as const:'USABLE' as const};
}

export function approvedWajhAllowed(loci:VariantLocusRecord[],input:{surah:number;ayah:number;qiraah:string;rawi:string;tariq?:string;wajh?:string}){
  if(!input.wajh)return true;
  return loci.some(l=>l.approvalState==='CERTIFIED'&&l.surah===input.surah&&l.ayah===input.ayah&&sameReading(l,input)&&(!l.tariq||!input.tariq||n(l.tariq)===n(input.tariq))&&n(l.allowedWajh)===n(input.wajh));
}

export function highRiskGoldLabelReady(dataset:ScientificDatasetRecord){
  return dataset.status==='APPROVED_BENCHMARK'&&dataset.annotators.length>=2&&dataset.annotatorQualifications.length>=2&&!!dataset.adjudicationMethod&&!!dataset.goldLabelMethod;
}

export function explicitConsentGranted(consents:ConsentRecord[],input:{participantId:string;competitionId:string;kind:ConsentRecord['kind']}){
  const latest=consents.filter(c=>c.participantId===input.participantId&&c.competitionId===input.competitionId&&c.kind===input.kind).sort((a,b)=>b.acceptedAt.localeCompare(a.acceptedAt))[0];
  return latest?.accepted===true;
}

export async function sourceFileHash(bytes:Uint8Array){const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}


export interface BinaryCapabilityBenchmarkSample { expectedPositive:boolean; predictedPositive:boolean; confidence?:number }
/**
 * Computes evidence metrics only. It never decides a religious/scientific acceptance threshold.
 * Positive means the target condition/error is truly present. False Acceptance therefore means
 * a truly positive/incorrect case was accepted as negative by the model.
 */
export function evaluateBinaryCapabilityBenchmark(samples:BinaryCapabilityBenchmarkSample[],calibrationBins=10){
  if(!samples.length)throw new Error('BENCHMARK_SAMPLES_REQUIRED');
  let tp=0,tn=0,fp=0,fn=0;
  for(const s of samples){if(s.expectedPositive&&s.predictedPositive)tp++;else if(!s.expectedPositive&&!s.predictedPositive)tn++;else if(!s.expectedPositive&&s.predictedPositive)fp++;else fn++;}
  const div=(a:number,b:number)=>b? a/b:undefined;
  const precision=div(tp,tp+fp),recall=div(tp,tp+fn);const f1=precision!==undefined&&recall!==undefined&&precision+recall?2*precision*recall/(precision+recall):undefined;
  const confidenceSamples=samples.filter(s=>typeof s.confidence==='number'&&Number.isFinite(s.confidence)&&s.confidence!>=0&&s.confidence!<=1);
  const curve:{lower:number;upper:number;count:number;meanConfidence:number;observedAccuracy:number}[]=[];
  let weightedCalibrationError=0;
  if(confidenceSamples.length){
    const bins=Math.max(1,Math.floor(calibrationBins));
    for(let i=0;i<bins;i++){const lower=i/bins,upper=(i+1)/bins;const rows=confidenceSamples.filter(s=>s.confidence!>=lower&&(i===bins-1?s.confidence!<=upper:s.confidence!<upper));if(!rows.length)continue;const mean=rows.reduce((a,b)=>a+b.confidence!,0)/rows.length;const accuracy=rows.filter(r=>r.expectedPositive===r.predictedPositive).length/rows.length;weightedCalibrationError+=Math.abs(mean-accuracy)*(rows.length/confidenceSamples.length);curve.push({lower,upper,count:rows.length,meanConfidence:mean,observedAccuracy:accuracy});}
  }
  return {metrics:{precision,recall,f1,falseAcceptanceRate:div(fn,tp+fn),falseRejectionRate:div(fp,tn+fp),diagnosticErrorRate:(fp+fn)/samples.length,sensitivity:recall,specificity:div(tn,tn+fp),expectedCalibrationError:confidenceSamples.length?weightedCalibrationError:undefined},confusionMatrix:[[tn,fp],[fn,tp]],calibrationCurve:curve};
}
