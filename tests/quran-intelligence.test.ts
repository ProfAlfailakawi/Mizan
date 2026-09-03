import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {QuranStreamingAlignmentEngine,DEFAULT_ALIGNMENT_POLICY} from '../server/quran-alignment-engine';
import {evaluateAlignmentBenchmark} from '../server/quran-alignment-benchmarks';
import {validateVectorLayer} from '../server/quran-vector-repository';
import {validateDatasetProvenance} from '../server/quran-intelligence-policy';
import {validateWaqfDataset} from '../server/quran-knowledge-repository';
import {ServerQuranSourceRepository} from '../server/quran-source-repository';
import type {QuranAlignmentBenchmarkReport,WaqfDataset} from '../server/quran-intelligence-types';

const obs=(timestamp:string,confidence:number,wordIndex?:number,silenceMs?:number)=>({timestamp,reading:'hafs' as const,candidate:wordIndex?{surah:2,ayah:10,wordIndex}:undefined,confidence,silenceMs});

test('streaming alignment holds the trusted pointer at low confidence and never changes score',()=>{
 const engine=new QuranStreamingAlignmentEngine('hafs',{...DEFAULT_ALIGNMENT_POLICY,emaAlpha:1,lockConfirmations:2,reacquireConfirmations:2});
 let out=engine.step(obs('2026-09-03T00:00:00.000Z',.96,3));assert.equal(out.pointerMoved,false);
 out=engine.step(obs('2026-09-03T00:00:00.200Z',.96,3));assert.equal(out.alignmentState,'LOCKED');assert.equal(out.wordIndex,3);assert.equal(out.pointerMoved,true);
 out=engine.step(obs('2026-09-03T00:00:00.400Z',.30,8));assert.equal(out.alignmentState,'UNCERTAIN');assert.equal(out.wordIndex,3);assert.equal(out.pointerMoved,false);
 assert.equal(out.scoreAuthority,'HUMAN_ONLY');assert.equal(out.scoreDelta,0);assert.equal(out.shadowMode,true);
});

test('alignment enters LOST on silence and reacquires only after confirmations',()=>{
 const engine=new QuranStreamingAlignmentEngine('hafs',{...DEFAULT_ALIGNMENT_POLICY,emaAlpha:1,lockConfirmations:1,reacquireConfirmations:2});
 engine.step(obs('2026-09-03T00:00:00.000Z',.99,4));
 let out=engine.step(obs('2026-09-03T00:00:02.000Z',.1,undefined,2200));assert.equal(out.alignmentState,'LOST');assert.equal(out.wordIndex,4);
 out=engine.step(obs('2026-09-03T00:00:02.200Z',.95,2));assert.equal(out.alignmentState,'REACQUIRING');assert.equal(out.wordIndex,4);assert.equal(out.pointerMoved,false);
 out=engine.step(obs('2026-09-03T00:00:02.400Z',.95,2));assert.equal(out.alignmentState,'REACQUIRED');assert.equal(out.wordIndex,2);assert.equal(out.pointerMoved,true);
});

test('alignment rejects observations from another riwayah',()=>{
 const engine=new QuranStreamingAlignmentEngine('hafs');
 assert.throws(()=>engine.step({timestamp:'2026-09-03T00:00:00Z',reading:'warsh',candidate:{surah:2,ayah:1,wordIndex:1},confidence:.99}),/CROSS_RIWAYAH/);
});

test('unresolved vector layer cannot be promoted to a verified word mapping without semantic evidence',()=>{
 assert.throws(()=>validateVectorLayer({page:1,sourceLayerId:'Layer 1',resolution:'VERIFIED_WORD_MAPPING',normalizedBBox:{x:.1,y:.1,width:.1,height:.1}}),/UNMAPPED_LAYER_CANNOT_BE_VERIFIED/);
 assert.doesNotThrow(()=>validateVectorLayer({page:1,sourceLayerId:'Layer 1',resolution:'UNRESOLVED_VECTOR_LAYER',normalizedBBox:{x:.1,y:.1,width:.1,height:.1}}));
});

test('waqf occurrences reject non-KFGQPC source URLs',()=>{
 const dataset:WaqfDataset={version:'MIZAN-KFGQPC-WAQF-1',reading:'hafs',provenance:{authority:'KFGQPC',sourceUrl:'https://qurancomplex.gov.sa/reference',retrievedAt:'2026-09-03T00:00:00Z',sourceVersion:'test',localSha256:'a'.repeat(64),parserVersion:'test',generatedArtifactSha256:'b'.repeat(64),status:'UNVERIFIED'},occurrences:[{reading:'hafs',surah:1,ayah:1,symbol:'م',officialMeaning:'test',category:'test',source:'https://example.com/not-official',version:'test',assurance:'KFGQPC_OFFICIAL_METADATA',evidenceId:'e1'}]};
 assert.throws(()=>validateWaqfDataset(dataset),/SOURCE_NOT_KFGQPC/);
});

const report=(sliceWord=.98):QuranAlignmentBenchmarkReport=>({version:'MIZAN-QURAN-ALIGNMENT-BENCHMARK-1',reading:'hafs',datasetId:'bench-1',modelVersion:'model-1',measuredAt:'2026-09-03T00:00:00Z',metrics:{falseAcceptRate:.01,falseRejectRate:.02,ayahLocalizationAccuracy:.99,wordAlignmentAccuracy:.98,reacquisitionAccuracy:.97,p95LatencyMs:250},approvedThresholds:{maxFalseAcceptRate:.03,maxFalseRejectRate:.05,minAyahLocalizationAccuracy:.95,minWordAlignmentAccuracy:.95,minReacquisitionAccuracy:.94,maxP95LatencyMs:500},slices:['child','adult','noise'].map(name=>({name,sampleCount:100,ayahLocalizationAccuracy:.98,wordAlignmentAccuracy:name==='child'?sliceWord:.97,reacquisitionAccuracy:.96,p95LatencyMs:320})),approvedBy:['scientist-a','scientist-b']});

test('reading benchmark requires child/adult/noise slices to meet thresholds',()=>{
 assert.equal(evaluateAlignmentBenchmark(report()).passed,true);
 const failed=evaluateAlignmentBenchmark(report(.90));assert.equal(failed.passed,false);assert.ok(failed.failures.includes('SLICE_CHILD_WORD_ALIGNMENT'));
});


test('VERIFIED provenance requires matched checksum proof or dual review',()=>{
 const base={authority:'KFGQPC' as const,sourceUrl:'https://qurancomplex.gov.sa/reference',retrievedAt:'2026-09-03T00:00:00Z',sourceVersion:'v1',localSha256:'a'.repeat(64),parserVersion:'p1',generatedArtifactSha256:'b'.repeat(64),status:'VERIFIED' as const};
 assert.throws(()=>validateDatasetProvenance({...base,reviewedAt:'2026-09-03T00:00:00Z',reviewedBy:['one']}),/DUAL_REVIEW/);
 assert.doesNotThrow(()=>validateDatasetProvenance({...base,reviewedAt:'2026-09-03T00:00:00Z',reviewedBy:['one','two']}));
 assert.doesNotThrow(()=>validateDatasetProvenance({...base,officialChecksum:'ABC123',officialChecksumVerified:true}));
});

test('canonical spatial mapping supports an official page_end field without cross-reading fallback',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-quran-intel-'));const repo=new ServerQuranSourceRepository(root);const packageId='kfgqpc-hafs-uthmanic-v13';const dir=path.join(root,packageId);fs.mkdirSync(dir,{recursive:true});
 const rows=Array.from({length:114},(_,i)=>({sura_no:i+1,aya_no:1,aya_text:`آية-${i+1}`,page:i===1?10:1,page_end:i===1?11:undefined,line_start:i===1?14:(i===0?15:1),line_end:i===1?2:(i===0?15:1)}));const bytes=Buffer.from(JSON.stringify(rows));const dataSha256=crypto.createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(path.join(dir,'verses.json'),bytes);
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({version:2,packageId,authority:'King Fahd Glorious Quran Printing Complex',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',sourceVersion:'13.0',qiraah:'Asim',imam:'Asim',rawi:'Hafs',bundleFile:'official-bundle.bin',dataFile:'verses.json',bundleMd5:'x',bundleSha1:'y',bundleChecksumVerified:true,dataSha256,packageHash:'z',verseCount:114,surahCount:114,ingestedAt:'2026-09-03T00:00:00Z',scientificApproval:{state:'CERTIFIED',basis:'OFFICIAL_AUTHORITY_POLICY',reviewers:[],certifiedAt:'2026-09-03T00:00:00Z'}}));
 const loc=repo.canonicalLocation({reading:'hafs',surah:2,ayah:1});assert.deepEqual(loc.loci,[{page:10,lineStart:14,lineEnd:15,lineCount:15},{page:11,lineStart:1,lineEnd:2,lineCount:15}]);
 assert.throws(()=>repo.canonicalLocation({reading:'warsh',surah:2,ayah:1}),/NOT_INGESTED/);
 fs.rmSync(root,{recursive:true,force:true});
});
