import test from 'node:test';
import assert from 'node:assert/strict';
import type { AICapabilityValidationRecord, BenchmarkRunRecord, QuranSourceManifestRecord, ScientificDatasetRecord } from '../src/types';
import {
  QURAN_PHONEME_SCHEMA_VERSION,
  TEN_QIRAAT_GRAPH,
  aiCapabilityState,
  audioQualityGate,
  approvedWajhAllowed,
  explicitConsentGranted, evaluateBinaryCapabilityBenchmark,
  canPromoteQuranSource,
  certificationReleaseGate,
  certifiedCapabilityFor,
  computeQuranPackageHash,
  detectModelChange,
  highRiskGoldLabelReady,
  immutableSourceUpdateAllowed,
  isDuriAbuAmr,
  isDuriKisai,
  resolveReading,
  sourceUsableForCompetition,
  validateSourceHash,
} from '../src/lib/scientific-core';

async function certifiedHafsSource():Promise<QuranSourceManifestRecord>{
  const source:QuranSourceManifestRecord={
    id:'src-hafs-v1',organizationId:'org-1',riwaya:'Hafs',qiraah:'Asim al-Kufi',rawi:'Hafs',imam:'Asim',edition:'Official developer data',version:'1.0.0',sourceVersion:'1.0.0',checksumSha256:'a'.repeat(64),expectedChecksumSha256:'a'.repeat(64),checksumVerificationState:'MATCH',sourceAuthority:'Authoritative Primary Source',reviewerNames:['A','B'],status:'approved',createdAt:'2026-01-01T00:00:00Z',approvedAt:'2026-01-02T00:00:00Z',sourceFiles:[{name:'hafs.json',format:'json',sha256:'a'.repeat(64),sizeBytes:100}],contentHash:'b'.repeat(64),structuralValidation:{surahCount:114,ayahCount:6236,surahCountValid:true,ayahCountProfile:'official-v1',ayahCountValid:true,errors:[]},rasmSystem:'Uthmani',dabtSystem:'Source-defined',ayahNumberingConvention:'Source-defined',surahNumberingConvention:'1–114',waqfConvention:'Source-defined',certificationState:'CERTIFIED',revocationState:'ACTIVE',immutable:true,approvalVersion:'SG-1',approvedBy:['reviewer-a','reviewer-b'],scientificReviews:[]
  };
  source.packageHash=await computeQuranPackageHash(source);
  source.scientificReviews=[
    {reviewerId:'reviewer-a',reviewerName:'A',decision:'approve',packageHash:source.packageHash,reviewedAt:'2026-01-01T01:00:00Z'},
    {reviewerId:'reviewer-b',reviewerName:'B',decision:'approve',packageHash:source.packageHash,reviewedAt:'2026-01-01T02:00:00Z'},
  ];
  return source;
}

function dataset(rawi='Hafs'):ScientificDatasetRecord{
  return {id:'dataset-1',organizationId:'org-1',name:'MIZAN-GOLD',version:'4',purpose:'validation',source:'expert adjudicated',license:'restricted',consent:['ai_validation','human_review'],recordingProvenance:'controlled venue',qiraah:rawi==='Warsh'?'Nafiʿ al-Madani':'Asim al-Kufi',rawi,speakerCount:40,utteranceCount:1000,hours:10,annotationSchema:'tajweed-v1',annotationVersion:'1',annotators:['a','b'],annotatorQualifications:['tajweed specialist','qiraat specialist'],blindAnnotation:true,interRaterAgreement:.92,adjudicationMethod:'third expert',goldLabelMethod:'expert consensus',trainSplit:'train-v1',validationSplit:'dev-v1',testSplit:'test-v1',speakerLeakageChecked:true,contentLeakageChecked:true,datasetHash:'d'.repeat(64),status:'APPROVED_BENCHMARK'};
}

function benchmark(rawi='Hafs'):BenchmarkRunRecord{
  return {id:'bench-1',organizationId:'org-1',modelName:'MIZAN Align',modelVersion:'3.2',capability:'ayah_alignment',qiraah:rawi==='Warsh'?'Nafiʿ al-Madani':'Asim al-Kufi',rawi,datasetId:'dataset-1',datasetVersion:'4',benchmark:'MIZAN-ALIGN',benchmarkVersion:'4',ranAt:'2026-01-03T00:00:00Z',metrics:{f1:.98,falseAcceptanceRate:.01,falseRejectionRate:.02,calibrationError:.03},reproducibility:{codeVersion:'git:abc',split:'test-v1',seed:'42',evaluationScriptVersion:'2',metricDefinitionsVersion:'1',environment:'linux'},status:'COMPLETED'};
}

function validation():AICapabilityValidationRecord{
  return {id:'ai-1',organizationId:'org-1',riwaya:'Hafs',qiraah:'Asim al-Kufi',rawi:'Hafs',capability:'ayah_alignment',modelName:'MIZAN Align',modelVersion:'3.2',datasetName:'MIZAN-GOLD',datasetVersion:'4',datasetSize:1000,benchmark:'MIZAN-ALIGN',benchmarkVersion:'4',status:'validated',certificationState:'PENDING_VALIDATION',validationStage:'LIMITED_BETA',shadowEvidenceRef:'shadow-run-44',approvalVersion:'SG-AI-44',approvedBy:['reviewer-a','reviewer-b'],updatedAt:'2026-01-03T00:00:00Z'};
}

test('ten canonical qiraat are represented structurally as twenty rawi nodes',()=>{
  assert.equal(new Set(TEN_QIRAAT_GRAPH.map(x=>x.qiraahId)).size,10);
  assert.equal(TEN_QIRAAT_GRAPH.length,20);
  assert.equal(resolveReading({riwaya:'Al-Duri'}),undefined,'ambiguous legacy label must never be guessed');
  assert.equal(isDuriAbuAmr({riwaya:"Al-Duri 'an Abi Amr"}),true);
  assert.equal(isDuriKisai({riwaya:"Al-Duri 'an Al-Kisa'i"}),true);
  assert.notEqual(resolveReading({riwaya:"Al-Duri 'an Abi Amr"})?.rawiId,resolveReading({riwaya:"Al-Duri 'an Al-Kisa'i"})?.rawiId);
});

test('Quran source package hash detects tampering and certified versions are immutable',async()=>{
  const source=await certifiedHafsSource();
  assert.equal((await validateSourceHash(source)).valid,true);
  const changed={...source,version:'1.0.1',sourceVersion:'1.0.1'};
  assert.equal((await validateSourceHash(changed)).valid,false);
  assert.equal(immutableSourceUpdateAllowed(source,changed),false);
});

test('scientific source approval is tied to exact package hash and two distinct reviewers',async()=>{
  const source=await certifiedHafsSource();
  assert.equal(canPromoteQuranSource(source,true).allowed,true);
  const oneReviewer={...source,scientificReviews:[source.scientificReviews![0]]};
  assert.equal(canPromoteQuranSource(oneReviewer,true).allowed,false);
  const wrongHash={...source,scientificReviews:source.scientificReviews!.map(r=>({...r,packageHash:'tampered'}))};
  assert.equal(canPromoteQuranSource(wrongHash,true).allowed,false);
  const checksumMismatch={...source,checksumVerificationState:'MISMATCH' as const};
  assert.ok(canPromoteQuranSource(checksumMismatch,true).errors.includes('SOURCE_CHECKSUM_MISMATCH'));
});

test('Hafs cannot satisfy Warsh source requirement',async()=>{
  const source=await certifiedHafsSource();
  assert.equal(sourceUsableForCompetition(source,{riwaya:'Hafs'}).ok,true);
  assert.equal(sourceUsableForCompetition(source,{riwaya:'Warsh'}).ok,false);
});

test('AI certification gate is exact-scope and requires shadow lifecycle evidence',async()=>{
  const source=await certifiedHafsSource();const v=validation();const d=dataset();const b=benchmark();
  assert.deepEqual(certificationReleaseGate({validation:v,dataset:d,benchmark:b,approvedQuranSource:source}),{allowed:true,failures:[]});
  const noShadow={...v,shadowEvidenceRef:undefined};
  assert.ok(certificationReleaseGate({validation:noShadow,dataset:d,benchmark:b,approvedQuranSource:source}).failures.includes('SHADOW_EVIDENCE_REQUIRED'));
  const tooEarly={...v,validationStage:'SHADOW_MODE' as const};
  assert.ok(certificationReleaseGate({validation:tooEarly,dataset:d,benchmark:b,approvedQuranSource:source}).failures.includes('SHADOW_VALIDATION_LIFECYCLE_REQUIRED'));
  const warshData=dataset('Warsh');
  assert.ok(certificationReleaseGate({validation:v,dataset:warshData,benchmark:b,approvedQuranSource:source}).failures.includes('DATASET_READING_SCOPE_MISMATCH'));
  const changedModelBenchmark={...b,modelVersion:'3.3'};
  assert.ok(certificationReleaseGate({validation:v,dataset:d,benchmark:changedModelBenchmark,approvedQuranSource:source}).failures.includes('BENCHMARK_MODEL_CAPABILITY_MISMATCH'));
  const revokedSource={...source,status:'retired' as const,certificationState:'REVOKED' as const,revocationState:'REVOKED' as const};
  assert.ok(certificationReleaseGate({validation:v,dataset:d,benchmark:b,approvedQuranSource:revokedSource}).failures.includes('APPROVED_QURAN_SOURCE_CONTEXT_REQUIRED'));
});

test('certified AI capability never inherits certification to another riwayah',()=>{
  const v={...validation(),status:'certified' as const,certificationState:'CERTIFIED' as const,validationStage:'CERTIFIED' as const};
  assert.equal(aiCapabilityState(v),'CERTIFIED');
  assert.equal(certifiedCapabilityFor([v],{capability:'ayah_alignment',riwaya:'Hafs'})?.id,'ai-1');
  assert.equal(certifiedCapabilityFor([v],{capability:'ayah_alignment',riwaya:'Warsh'}),undefined);
});

test('model changes return capability to pending validation and audio gate suppresses unsuitable inference',()=>{
  const v={...validation(),status:'certified' as const,certificationState:'CERTIFIED' as const};
  assert.equal(detectModelChange(v,{modelVersion:'3.3'}).nextState,'PENDING_VALIDATION');
  const audio=audioQualityGate({clipping:.15,signalDb:-30,noiseDb:-34,sampleRate:8000,thresholds:{maxClippingRatio:.05,minSignalDb:-24,minSnrDb:10,requiredSampleRate:16000}});
  assert.equal(audio.usable,false);assert.equal(audio.state,'AUDIO_NOT_SUITABLE_FOR_AI_REVIEW');
});

test('gold data governance requires expert adjudication and phoneme evidence schema is versioned',()=>{
  assert.equal(highRiskGoldLabelReady(dataset()),true);
  assert.equal(highRiskGoldLabelReady({...dataset(),annotators:['crowd-1'],annotatorQualifications:['unknown'],adjudicationMethod:undefined}),false);
  assert.match(QURAN_PHONEME_SCHEMA_VERSION,/^QPS_v\d+$/);
});

test('approved alternate wajh is accepted only when its exact reading locus is certified',()=>{
  const loci=[{id:'l1',surah:2,ayah:10,qiraah:'Nafiʿ al-Madani',rawi:'Warsh',tariq:'al-azraq',allowedWajh:'wajh-a',version:'1',approvalState:'CERTIFIED' as const}];
  assert.equal(approvedWajhAllowed(loci,{surah:2,ayah:10,qiraah:'Nafiʿ al-Madani',rawi:'Warsh',tariq:'al-azraq',wajh:'wajh-a'}),true);
  assert.equal(approvedWajhAllowed(loci,{surah:2,ayah:10,qiraah:'Nafiʿ al-Madani',rawi:'Warsh',tariq:'al-azraq',wajh:'other'}),false);
});

test('consent scopes are explicit and do not inherit from competition recording',()=>{
  const consents=[{id:'c1',participantId:'p1',competitionId:'comp',kind:'audio_recording' as const,version:'1',accepted:true,acceptedAt:'2026-01-01T00:00:00Z'}];
  assert.equal(explicitConsentGranted(consents,{participantId:'p1',competitionId:'comp',kind:'audio_recording'}),true);
  assert.equal(explicitConsentGranted(consents,{participantId:'p1',competitionId:'comp',kind:'ai_inference'}),false);
  assert.equal(explicitConsentGranted(consents,{participantId:'p1',competitionId:'comp',kind:'ai_training'}),false);
});


test('benchmark engine reports FAR, FRR, sensitivity, specificity and calibration without inventing a threshold',()=>{
 const result=evaluateBinaryCapabilityBenchmark([
  {expectedPositive:true,predictedPositive:true,confidence:.9},
  {expectedPositive:true,predictedPositive:false,confidence:.6},
  {expectedPositive:false,predictedPositive:true,confidence:.7},
  {expectedPositive:false,predictedPositive:false,confidence:.95},
 ]);
 assert.equal(result.metrics.falseAcceptanceRate,.5);
 assert.equal(result.metrics.falseRejectionRate,.5);
 assert.equal(result.metrics.sensitivity,.5);
 assert.equal(result.metrics.specificity,.5);
 assert.deepEqual(result.confusionMatrix,[[1,1],[1,1]]);
 assert.ok((result.metrics.expectedCalibrationError??-1)>=0);
 assert.ok(result.calibrationCurve.length>0);
});
