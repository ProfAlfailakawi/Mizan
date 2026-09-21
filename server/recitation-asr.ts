import fs from 'fs';
import path from 'path';
import { quranReadingDefinition } from './quran-intelligence-policy';
import type { QuranReadingId } from './quran-intelligence-types';

export interface RecitationJudgingGate{reading:QuranReadingId;word:'OPEN'|'CLOSED';tashkeel:'OPEN'|'CLOSED';modelVersion:string|null;reasons:string[]}
export interface AsrBenchmarkSlice{name:string;sampleCount:number;wordErrorRate:number;diacriticErrorRate?:number;p95LatencyMs:number}
export interface AsrBenchmarkReport{reading:QuranReadingId;datasetReading:QuranReadingId;modelVersion:string;referenceIncludesDiacritics?:boolean;metrics:{wordErrorRate:number;diacriticErrorRate?:number;p95LatencyMs:number;sampleCount:number};approvedThresholds:{maxWordErrorRate:number;maxDiacriticErrorRate?:number;maxP95LatencyMs:number;minSampleCount:number};slices:AsrBenchmarkSlice[];approvedBy:string[]}
const REQUIRED=['child','adult','noise'];
const closed=(reading:QuranReadingId,...reasons:string[]):RecitationJudgingGate=>({reading,word:'CLOSED',tashkeel:'CLOSED',modelVersion:null,reasons});
const validRate=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;

export class AsrBenchmarkRepository{
 constructor(private root:string){if(root)fs.mkdirSync(root,{recursive:true,mode:0o700})}
 private file(reading:QuranReadingId){return path.join(this.root,`asr-benchmark-${reading}.json`)}
 register(report:AsrBenchmarkReport){
  const def=report&&quranReadingDefinition(report.reading);if(!def||report.datasetReading===undefined||!report.modelVersion?.trim())throw new Error('QURAN_ASR_BENCHMARK_INVALID');
  if(!report.metrics||!report.approvedThresholds||!validRate(report.metrics.wordErrorRate)||!validRate(report.approvedThresholds.maxWordErrorRate))throw new Error('QURAN_ASR_BENCHMARK_INVALID');
  if(!Array.isArray(report.slices)||report.slices.some(s=>!s||typeof s.name!=='string'||!Number.isFinite(s.wordErrorRate)||!Number.isFinite(s.p95LatencyMs)||!Number.isInteger(s.sampleCount)||s.sampleCount<1))throw new Error('QURAN_ASR_BENCHMARK_INVALID');
  if(!Array.isArray(report.approvedBy))throw new Error('QURAN_ASR_BENCHMARK_INVALID');if(!this.root)throw new Error('QURAN_ASR_BENCHMARK_STORE_NOT_CONFIGURED');
  fs.writeFileSync(this.file(def.id),JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});return this.gate(def.id);
 }
 gate(value:string):RecitationJudgingGate{
  const def=quranReadingDefinition(value);if(!def)return closed(value as QuranReadingId,'READING_UNKNOWN');if(!this.root)return closed(def.id,'ASR_BENCHMARK_STORE_NOT_CONFIGURED');
  let report:AsrBenchmarkReport;try{report=JSON.parse(fs.readFileSync(this.file(def.id),'utf8')) as AsrBenchmarkReport}catch{return closed(def.id,'MODEL_NOT_BENCHMARKED')}
  if(!report||typeof report!=='object')return closed(def.id,'BENCHMARK_INVALID');
  const reasons:string[]=[];if(report.reading!==def.id||report.datasetReading!==def.id)reasons.push('DATASET_OTHER_RIWAYAH');
  const slices=Array.isArray(report.slices)?report.slices:[];if(!Array.isArray(report.slices))reasons.push('BENCHMARK_INVALID');
  const approvedBy=Array.isArray(report.approvedBy)?report.approvedBy:[];if(!Array.isArray(report.approvedBy))reasons.push('BENCHMARK_INVALID');
  const t=report.approvedThresholds,m=report.metrics;
  if(!t||!m||!validRate(m.wordErrorRate)||!validRate(t.maxWordErrorRate))reasons.push('BENCHMARK_INVALID');
  else {if(m.wordErrorRate>t.maxWordErrorRate)reasons.push('WORD_ERROR_RATE');if(m.p95LatencyMs>t.maxP95LatencyMs)reasons.push('LATENCY');if(m.sampleCount<t.minSampleCount)reasons.push('SAMPLE_COUNT')}
  const names=new Set(slices.map(s=>s.name));for(const s of REQUIRED)if(!names.has(s))reasons.push(`MISSING_SLICE_${s.toUpperCase()}`);
  for(const s of slices){if(t&&s.wordErrorRate>t.maxWordErrorRate)reasons.push(`SLICE_${s.name.toUpperCase()}_WORD_ERROR_RATE`);if(t&&s.p95LatencyMs>t.maxP95LatencyMs)reasons.push(`SLICE_${s.name.toUpperCase()}_LATENCY`)}
  if(new Set(approvedBy.map(x=>String(x).trim()).filter(Boolean)).size<2)reasons.push('THRESHOLDS_NOT_DUAL_APPROVED');
  if(!report.modelVersion?.trim())reasons.push('MODEL_VERSION_MISSING');
  if(reasons.length)return closed(def.id,...reasons);
  const tashkeelReasons:string[]=[];if(!report.referenceIncludesDiacritics)tashkeelReasons.push('REFERENCE_NOT_DIACRITIZED');if(m.diacriticErrorRate===undefined||t.maxDiacriticErrorRate===undefined)tashkeelReasons.push('DIACRITIC_NOT_MEASURED');else if(m.diacriticErrorRate>t.maxDiacriticErrorRate)tashkeelReasons.push('DIACRITIC_ERROR_RATE');
  for(const s of slices){if(s.diacriticErrorRate===undefined)tashkeelReasons.push(`SLICE_${s.name.toUpperCase()}_DIACRITIC_NOT_MEASURED`);else if(t.maxDiacriticErrorRate!==undefined&&s.diacriticErrorRate>t.maxDiacriticErrorRate)tashkeelReasons.push(`SLICE_${s.name.toUpperCase()}_DIACRITIC_ERROR_RATE`)}
  return {reading:def.id,word:'OPEN',tashkeel:tashkeelReasons.length?'CLOSED':'OPEN',modelVersion:report.modelVersion,reasons:tashkeelReasons};
 }
}
export interface RecognisedWord{text:string;confidence:number;startMs?:number;endMs?:number}
export interface RecognisedChunkResult{gate:RecitationJudgingGate;words:RecognisedWord[];modelVersion:string}
export class RecitationRecogniser{
 constructor(private backend:{url?:string;bearerToken?:string},private benchmarks:AsrBenchmarkRepository){}
 gate(reading:string){const def=quranReadingDefinition(reading);if(!def)return closed(reading as QuranReadingId,'READING_UNKNOWN');if(!this.backend.url)return closed(def.id,'ASR_BACKEND_NOT_CONFIGURED');return this.benchmarks.gate(def.id)}
 async recognise(input:{reading:string;sourcePackageId:string;contentType:string;bytes:Uint8Array}):Promise<RecognisedChunkResult>{
  const def=quranReadingDefinition(input.reading);if(!def)throw new Error('QURAN_READING_UNSUPPORTED');if(!this.backend.url)throw new Error('QURAN_ASR_BACKEND_NOT_CONFIGURED');if(input.sourcePackageId!==def.packageId)throw new Error('QURAN_ASR_SOURCE_READING_MISMATCH');
  const gate=this.benchmarks.gate(def.id);if(gate.word!=='OPEN'||!gate.modelVersion)throw new Error('QURAN_ASR_JUDGING_CLOSED');if(!(input.bytes instanceof Uint8Array)||!input.bytes.length||input.bytes.length>2_000_000)throw new Error('QURAN_ASR_AUDIO_CHUNK_INVALID');
  const url=new URL(this.backend.url);url.searchParams.set('reading',def.id);const headers:Record<string,string>={'content-type':input.contentType||'application/octet-stream','x-mizan-mode':'practice','x-mizan-source-package':def.packageId};if(this.backend.bearerToken)headers.authorization=`Bearer ${this.backend.bearerToken}`;
  const r=await fetch(url,{method:'POST',headers,body:new Uint8Array(input.bytes)});if(!r.ok)throw new Error(`QURAN_ASR_BACKEND_HTTP_${r.status}`);const raw=await r.json() as any;
  if(!raw||raw.reading!==def.id||raw.modelVersion!==gate.modelVersion||!Array.isArray(raw.words))throw new Error('QURAN_ASR_RESPONSE_MISMATCH');
  const words:RecognisedWord[]=raw.words.slice(0,256).map((w:any)=>({text:String(w?.text||'').slice(0,64),confidence:Number(w?.confidence),startMs:w?.startMs===undefined?undefined:Number(w.startMs),endMs:w?.endMs===undefined?undefined:Number(w.endMs)}));
  if(words.some(w=>!w.text||!Number.isFinite(w.confidence)||w.confidence<0||w.confidence>1))throw new Error('QURAN_ASR_RESPONSE_INVALID');return {gate,words,modelVersion:gate.modelVersion};
 }
}
