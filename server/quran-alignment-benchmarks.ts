import fs from 'fs';
import path from 'path';
import {quranReadingDefinition} from './quran-intelligence-policy';
import type {QuranAlignmentBenchmarkReport,QuranReadingId} from './quran-intelligence-types';

function pct(v:number){return Number.isFinite(v)&&v>=0&&v<=1}
function finitePositive(v:number){return Number.isFinite(v)&&v>=0}
export function evaluateAlignmentBenchmark(report:QuranAlignmentBenchmarkReport){
  if(report.version!=='MIZAN-QURAN-ALIGNMENT-BENCHMARK-1')throw new Error('QURAN_ALIGNMENT_BENCHMARK_VERSION_INVALID');
  const reading=quranReadingDefinition(report.reading);if(!reading||reading.id!==report.reading)throw new Error('QURAN_ALIGNMENT_BENCHMARK_READING_INVALID');
  if(!report.datasetId.trim()||!report.modelVersion.trim()||Number.isNaN(Date.parse(report.measuredAt)))throw new Error('QURAN_ALIGNMENT_BENCHMARK_IDENTITY_INVALID');
  const m=report.metrics,t=report.approvedThresholds;
  if(!pct(m.falseAcceptRate)||!pct(m.falseRejectRate)||!pct(m.ayahLocalizationAccuracy)||!pct(m.wordAlignmentAccuracy)||!pct(m.reacquisitionAccuracy)||!finitePositive(m.p95LatencyMs))throw new Error('QURAN_ALIGNMENT_BENCHMARK_METRIC_INVALID');
  if(!pct(t.maxFalseAcceptRate)||!pct(t.maxFalseRejectRate)||!pct(t.minAyahLocalizationAccuracy)||!pct(t.minWordAlignmentAccuracy)||!pct(t.minReacquisitionAccuracy)||!finitePositive(t.maxP95LatencyMs))throw new Error('QURAN_ALIGNMENT_BENCHMARK_THRESHOLD_INVALID');
  const names=new Set(report.slices.map(s=>s.name));const requiredSlices=['child','adult','noise'];const missingSlices=requiredSlices.filter(x=>!names.has(x));
  for(const s of report.slices){if(!Number.isInteger(s.sampleCount)||s.sampleCount<1||!pct(s.ayahLocalizationAccuracy)||!pct(s.wordAlignmentAccuracy)||!pct(s.reacquisitionAccuracy)||!finitePositive(s.p95LatencyMs))throw new Error(`QURAN_ALIGNMENT_BENCHMARK_SLICE_INVALID:${s.name}`)}
  const failures:string[]=[];
  for(const s of report.slices){const prefix=`SLICE_${String(s.name).toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`;if(s.ayahLocalizationAccuracy<t.minAyahLocalizationAccuracy)failures.push(`${prefix}_AYAH_LOCALIZATION`);if(s.wordAlignmentAccuracy<t.minWordAlignmentAccuracy)failures.push(`${prefix}_WORD_ALIGNMENT`);if(s.reacquisitionAccuracy<t.minReacquisitionAccuracy)failures.push(`${prefix}_REACQUISITION`);if(s.p95LatencyMs>t.maxP95LatencyMs)failures.push(`${prefix}_LATENCY`)}
  if(m.falseAcceptRate>t.maxFalseAcceptRate)failures.push('FAR');if(m.falseRejectRate>t.maxFalseRejectRate)failures.push('FRR');if(m.ayahLocalizationAccuracy<t.minAyahLocalizationAccuracy)failures.push('AYAH_LOCALIZATION');if(m.wordAlignmentAccuracy<t.minWordAlignmentAccuracy)failures.push('WORD_ALIGNMENT');if(m.reacquisitionAccuracy<t.minReacquisitionAccuracy)failures.push('REACQUISITION');if(m.p95LatencyMs>t.maxP95LatencyMs)failures.push('LATENCY');if(missingSlices.length)failures.push(...missingSlices.map(x=>`MISSING_SLICE_${x.toUpperCase()}`));if(new Set(report.approvedBy.map(x=>String(x).trim()).filter(Boolean)).size<2)failures.push('THRESHOLDS_NOT_DUAL_APPROVED');
  return {passed:failures.length===0,failures,missingSlices,reading:report.reading,modelVersion:report.modelVersion,datasetId:report.datasetId};
}

export class QuranAlignmentBenchmarkRepository{
  constructor(private root:string){fs.mkdirSync(root,{recursive:true,mode:0o700})}
  private file(reading:QuranReadingId){return path.join(this.root,`alignment-benchmark-${reading}.json`)}
  register(report:QuranAlignmentBenchmarkReport){const result=evaluateAlignmentBenchmark(report);fs.writeFileSync(this.file(report.reading),JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});return result}
  load(reading:QuranReadingId){const f=this.file(reading);if(!fs.existsSync(f))return null;return JSON.parse(fs.readFileSync(f,'utf8')) as QuranAlignmentBenchmarkReport}
  status(reading:QuranReadingId){const report=this.load(reading);if(!report)return {status:'UNVERIFIED' as const,passed:false,failures:['BENCHMARK_NOT_AVAILABLE']};const result=evaluateAlignmentBenchmark(report);return {status:result.passed?'VERIFIED' as const:'UNVERIFIED' as const,...result,measuredAt:report.measuredAt}}
}
