import fs from 'fs';
import path from 'path';
import {QuranAlignmentBenchmarkRepository} from './quran-alignment-benchmarks';
import {QuranStreamingAlignmentEngine} from './quran-alignment-engine';
import {quranReadingDefinition,QURAN_READINGS} from './quran-intelligence-policy';
import type {ServerQuranSourceRepository} from './quran-source-repository';
import {QuranKnowledgeRepository} from './quran-knowledge-repository';
import {deriveWaqfDatasetFromOfficialSource,verifyWaqfDatasetAgainstOfficialSource} from './kfgqpc-waqf-derive';
import {QuranVectorRepository} from './quran-vector-repository';
import {buildQuranReadingReadiness} from './quran-intelligence-readiness';
import type {QuranAcousticObservation,QuranAlignmentBenchmarkReport,QuranReadingId,QuranVectorArtifact,TajweedDataset,WaqfDataset,WaqfScienceDataset} from './quran-intelligence-types';

interface EngineEntry{engine:QuranStreamingAlignmentEngine;updatedAt:number}
export interface QuranAlignmentBackendConfig{url?:string;bearerToken?:string}

function boundedInt(v:unknown,min:number,max:number,code:string){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw new Error(code);return n}
function readingId(v:string):QuranReadingId{const r=quranReadingDefinition(v);if(!r)throw new Error('QURAN_READING_UNSUPPORTED');return r.id}

export class QuranIntelligenceService{
  readonly vector:QuranVectorRepository;
  readonly knowledge:QuranKnowledgeRepository;
  readonly benchmarks:QuranAlignmentBenchmarkRepository;
  private engines=new Map<string,EngineEntry>();
  private waqfDerivationErrors=new Map<QuranReadingId,string>();
  constructor(private root:string,private quran:ServerQuranSourceRepository,private alignmentBackend:QuranAlignmentBackendConfig={}){
    fs.mkdirSync(root,{recursive:true,mode:0o700});this.vector=new QuranVectorRepository(path.join(root,'vector'));this.knowledge=new QuranKnowledgeRepository(path.join(root,'knowledge'));this.benchmarks=new QuranAlignmentBenchmarkRepository(path.join(root,'benchmarks'));this.bootstrapOfficialWaqf();
  }
  capabilities(){return {protocol:'MIZAN-QURAN-INTELLIGENCE-1',authority:'KFGQPC',readings:QURAN_READINGS.map(r=>r.id),spatialMapping:true,vectorMetadata:true,waqfLayer:{enabled:true,mode:'AUTO_DERIVE_FROM_CERTIFIED_KFGQPC_AYA_TEXT',wordIndexPolicy:'NEVER_INFER'},tajweedLayer:true,streamingAlignment:{mode:'SHADOW_ONLY',backendConfigured:!!this.alignmentBackend.url,scoreAuthority:'HUMAN_ONLY',canAffectScore:false},storage:{masterOriginals:'OFFLINE_ONLY',heavyAssets:'PRIVATE_R2_OR_LOCAL_CACHE',frontendPrivateUrlAccess:false}}}
  status(){return QURAN_READINGS.map(r=>{let spatial:'VERIFIED'|'UNVERIFIED'='UNVERIFIED';let coverage:unknown;try{coverage=this.quran.canonicalCoverage(r.packageId);spatial='VERIFIED';this.ensureOfficialWaqf(r.id)}catch{}return {reading:r.id,sourcePackage:r.packageId,spatial,coverage,vector:this.vector.status(r.id),waqf:{...this.knowledge.waqfStatus(r.id),derivationError:this.waqfDerivationErrors.get(r.id)},waqfScience:this.knowledge.waqfScienceStatus(r.id),tajweed:this.knowledge.tajweedStatus(r.id),alignmentBenchmark:this.benchmarks.status(r.id)}})}
  readiness(){return QURAN_READINGS.map(r=>{let spatial:'VERIFIED'|'UNVERIFIED'='UNVERIFIED';try{this.quran.canonicalCoverage(r.packageId);spatial='VERIFIED';this.ensureOfficialWaqf(r.id)}catch{}const waqf=this.knowledge.waqfStatus(r.id),tajweed=this.knowledge.tajweedStatus(r.id),vector=this.vector.status(r.id),benchmark=this.benchmarks.status(r.id);const waqfScience=this.knowledge.waqfScienceStatus(r.id);return buildQuranReadingReadiness({reading:r.id,spatial,waqfStatus:String(waqf.status),waqfScienceStatus:String(waqfScience.status),tajweedStatus:String(tajweed.status),vectorStatus:String(vector.status),verifiedWordMappings:Number((vector as any).verifiedWordMappings||0),benchmarkStatus:String(benchmark.status),benchmarkPassed:Boolean((benchmark as any).passed),alignmentBackendConfigured:!!this.alignmentBackend.url})})}
  location(reading:string,surah:unknown,ayah:unknown){const id=readingId(reading),s=boundedInt(surah,1,114,'QURAN_SURAH_INVALID'),a=boundedInt(ayah,1,1000,'QURAN_AYAH_INVALID');return this.quran.canonicalLocation({reading:id,surah:s,ayah:a})}
  passage(input:{reading:string;surah:unknown;startAyah:unknown;endAyah:unknown}){
    const id=readingId(input.reading),def=quranReadingDefinition(id)!;const surah=boundedInt(input.surah,1,114,'QURAN_SURAH_INVALID'),startAyah=boundedInt(input.startAyah,1,1000,'QURAN_AYAH_INVALID'),endAyah=boundedInt(input.endAyah,startAyah,1000,'QURAN_AYAH_INVALID');
    this.ensureOfficialWaqf(id);const resolved=this.quran.resolvePassage({packageId:def.packageId,surah,startAyah,endAyah});const pageLoci=this.quran.resolvePassageLoci({packageId:def.packageId,surah,startAyah,endAyah});
    const ayahs=resolved.verses.map(v=>{const loc=this.quran.canonicalLocation({reading:id,surah,ayah:v.aya_no});return {ayah:v.aya_no,location:loc,waqf:this.knowledge.waqfForAyah(id,surah,v.aya_no),waqfScience:this.knowledge.waqfScienceForAyah(id,surah,v.aya_no),tajweed:this.knowledge.tajweedForAyah(id,surah,v.aya_no)}});
    return {reading:id,surah,startAyah,endAyah,pageLoci,ayahs,assurance:'KFGQPC_OFFICIAL_METADATA',sourcePackage:def.packageId,knowledge:{waqf:this.knowledge.waqfStatus(id),waqfScience:this.knowledge.waqfScienceStatus(id),tajweed:this.knowledge.tajweedStatus(id),vector:this.vector.status(id)},alignmentBenchmark:this.benchmarks.status(id)};
  }
  registerVector(x:QuranVectorArtifact){return this.vector.register(x)}
  registerWaqf(x:WaqfDataset){if(x.version==='MIZAN-KFGQPC-WAQF-2')verifyWaqfDatasetAgainstOfficialSource(x,this.quran);return this.knowledge.registerWaqf(x)}
  deriveOfficialWaqf(readingInput:string){const id=readingId(readingInput),dataset=deriveWaqfDatasetFromOfficialSource(this.quran,id);verifyWaqfDatasetAgainstOfficialSource(dataset,this.quran);const status=this.knowledge.registerWaqf(dataset);this.waqfDerivationErrors.delete(id);return {reading:id,status,datasetHash:dataset.provenance.generatedArtifactSha256,coverage:dataset.coverage}}
  deriveOfficialWaqfForPackage(packageId:string){const def=quranReadingDefinition(packageId);if(!def||def.packageId!==packageId)throw new Error('WAQF_SOURCE_PACKAGE_UNSUPPORTED');return this.deriveOfficialWaqf(def.id)}
  registerTajweed(x:TajweedDataset){return this.knowledge.registerTajweed(x)}
  registerWaqfScience(x:WaqfScienceDataset){return this.knowledge.registerWaqfScience(x)}
  registerBenchmark(x:QuranAlignmentBenchmarkReport){return this.benchmarks.register(x)}

  private ensureOfficialWaqf(id:QuranReadingId){
    try{const def=quranReadingDefinition(id)!;const manifest=this.quran.manifest(def.packageId);if(manifest.scientificApproval.state!=='CERTIFIED')return;const existing=this.knowledge.loadWaqf(id);if(existing?.version==='MIZAN-KFGQPC-WAQF-2'&&existing.sourcePackageId===def.packageId&&existing.sourceDataSha256===manifest.dataSha256&&existing.provenance.status==='VERIFIED'){verifyWaqfDatasetAgainstOfficialSource(existing,this.quran);this.waqfDerivationErrors.delete(id);return}this.deriveOfficialWaqf(id)}catch(err){const code=err instanceof Error?err.message:'WAQF_DERIVATION_FAILED';if(code!=='QURAN_SOURCE_NOT_INGESTED')this.waqfDerivationErrors.set(id,code)}
  }
  private bootstrapOfficialWaqf(){for(const r of QURAN_READINGS)this.ensureOfficialWaqf(r.id)}

  async processAlignmentChunk(input:{actorId:string;sessionId:string;reading:string;surah:unknown;startAyah:unknown;endAyah:unknown;sourcePackageId:string;contentType:string;bytes:Buffer}){
    if(!this.alignmentBackend.url)throw new Error('QURAN_ALIGNMENT_BACKEND_NOT_CONFIGURED');
    if(!input.actorId.trim()||!input.sessionId.trim())throw new Error('QURAN_ALIGNMENT_SESSION_IDENTITY_REQUIRED');
    const id=readingId(input.reading),def=quranReadingDefinition(id)!;if(input.sourcePackageId!==def.packageId)throw new Error('QURAN_ALIGNMENT_SOURCE_READING_MISMATCH');
    const benchmarkReport=this.benchmarks.load(id),benchmark=this.benchmarks.status(id);if(!benchmarkReport||!benchmark.passed)throw new Error('QURAN_ALIGNMENT_BENCHMARK_NOT_APPROVED');
    const surah=boundedInt(input.surah,1,114,'QURAN_SURAH_INVALID'),startAyah=boundedInt(input.startAyah,1,1000,'QURAN_AYAH_INVALID'),endAyah=boundedInt(input.endAyah,startAyah,1000,'QURAN_AYAH_INVALID');const passage=this.quran.resolvePassage({packageId:def.packageId,surah,startAyah,endAyah});
    if(!input.bytes.length||input.bytes.length>2_000_000)throw new Error('QURAN_ALIGNMENT_AUDIO_CHUNK_INVALID');
    const backend=new URL(this.alignmentBackend.url);backend.searchParams.set('reading',id);backend.searchParams.set('surah',String(surah));backend.searchParams.set('startAyah',String(startAyah));backend.searchParams.set('endAyah',String(endAyah));
    const headers:Record<string,string>={'content-type':input.contentType||'application/octet-stream','x-mizan-mode':'shadow','x-mizan-source-package':def.packageId,'x-mizan-source-hash':passage.package.packageHash};if(this.alignmentBackend.bearerToken)headers.authorization=`Bearer ${this.alignmentBackend.bearerToken}`;
    const response=await fetch(backend,{method:'POST',headers,body:new Uint8Array(input.bytes)});if(!response.ok)throw new Error(`QURAN_ALIGNMENT_BACKEND_HTTP_${response.status}`);const raw=await response.json() as any;
    const backendModelVersion=String(raw.modelVersion||'');if(!backendModelVersion||backendModelVersion!==benchmarkReport.modelVersion)throw new Error('QURAN_ALIGNMENT_MODEL_NOT_BENCHMARKED');
    const alternatives=Array.isArray(raw.alternatives)?raw.alternatives.map((a:any)=>({surah:Number(a.surah),ayah:Number(a.ayah),wordIndex:Number(a.wordIndex),phonemeIndex:a.phonemeIndex===undefined?undefined:Number(a.phonemeIndex),confidence:Number(a.confidence)})).filter((a:any)=>a.surah===surah&&a.ayah>=startAyah&&a.ayah<=endAyah&&Number.isInteger(a.wordIndex)&&a.wordIndex>0&&Number.isFinite(a.confidence)&&a.confidence>=0&&a.confidence<=1).slice(0,5):[];
    const observation:QuranAcousticObservation={timestamp:String(raw.timestamp||new Date().toISOString()),reading:id,candidate:raw.candidate&&typeof raw.candidate==='object'?{surah:Number(raw.candidate.surah),ayah:Number(raw.candidate.ayah),wordIndex:Number(raw.candidate.wordIndex),phonemeIndex:raw.candidate.phonemeIndex===undefined?undefined:Number(raw.candidate.phonemeIndex)}:undefined,confidence:Number(raw.confidence||0),alternatives,silenceMs:raw.silenceMs===undefined?undefined:Number(raw.silenceMs),acousticQuality:raw.acousticQuality===undefined?undefined:Number(raw.acousticQuality)};
    if(observation.candidate&&(observation.candidate.surah!==surah||observation.candidate.ayah<startAyah||observation.candidate.ayah>endAyah||!Number.isInteger(observation.candidate.wordIndex)||observation.candidate.wordIndex<1))throw new Error('QURAN_ALIGNMENT_CANDIDATE_OUTSIDE_EXPECTED_PASSAGE');
    const k=[input.actorId,input.sessionId,id,surah,startAyah,endAyah].join('|');this.cleanupEngines();let entry=this.engines.get(k);if(!entry){entry={engine:new QuranStreamingAlignmentEngine(id),updatedAt:Date.now()};this.engines.set(k,entry)}entry.updatedAt=Date.now();const output=entry.engine.step(observation);
    let visualLocation=null,wordVector=null,waqfEvidence:unknown[]=[],waqfAyahContext:unknown[]=[];if(output.ayah){visualLocation=this.quran.canonicalLocation({reading:id,surah:output.surah!,ayah:output.ayah});if(output.wordIndex)wordVector=this.vector.resolveWord({reading:id,surah:output.surah!,ayah:output.ayah,wordIndex:output.wordIndex});waqfAyahContext=this.knowledge.waqfForAyah(id,output.surah!,output.ayah);waqfEvidence=output.wordIndex?waqfAyahContext.filter((x:any)=>x.wordIndex!==undefined&&x.wordIndex===output.wordIndex):[]}
    return {...output,visualLocation,wordVector,waqfEvidence,waqfAyahContext,backendEvidence:{modelVersion:backendModelVersion,acousticQuality:observation.acousticQuality},scoreAuthority:'HUMAN_ONLY' as const,scoreDelta:0 as const,shadowMode:true as const};
  }
  resetAlignment(actorId:string,sessionId:string){for(const k of this.engines.keys())if(k.startsWith(`${actorId}|${sessionId}|`))this.engines.delete(k)}
  private cleanupEngines(){const cutoff=Date.now()-20*60_000;for(const [k,v] of this.engines)if(v.updatedAt<cutoff)this.engines.delete(k)}
}
