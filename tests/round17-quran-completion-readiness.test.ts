import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateWaqfScienceDataset} from '../server/quran-knowledge-repository';
import {generatedArtifactDigest} from '../server/quran-intelligence-policy';
import type {WaqfScienceDataset} from '../server/quran-intelligence-types';
import {buildQuranReadingReadiness} from '../server/quran-intelligence-readiness';

test('readiness reports KFGQPC wait state instead of inventing unavailable Quran science',()=>{
 const x=buildQuranReadingReadiness({reading:'hafs',spatial:'UNVERIFIED',waqfStatus:'OFFICIAL_DATA_UNAVAILABLE',waqfScienceStatus:'OFFICIAL_DATA_UNAVAILABLE',tajweedStatus:'OFFICIAL_DATA_UNAVAILABLE',vectorStatus:'OFFICIAL_DATA_UNAVAILABLE',verifiedWordMappings:0,benchmarkStatus:'OFFICIAL_DATA_UNAVAILABLE',alignmentBackendConfigured:false});
 assert.equal(x.nextAction,'WAIT_FOR_KFGQPC');assert.equal(x.productionReady,false);assert.equal(x.completionPercent,0);assert.equal(x.stages.find(s=>s.id==='source')?.state,'WAITING_OFFICIAL_SOURCE');assert.equal(x.stages.find(s=>s.id==='vector')?.state,'WAITING_OFFICIAL_SOURCE');
});

test('readiness separates official data completion from the live alignment engine',()=>{
 const x=buildQuranReadingReadiness({reading:'hafs',spatial:'VERIFIED',waqfStatus:'VERIFIED',waqfScienceStatus:'VERIFIED',tajweedStatus:'VERIFIED',vectorStatus:'VERIFIED',verifiedWordMappings:6236,benchmarkStatus:'VERIFIED',benchmarkPassed:true,alignmentBackendConfigured:false});
 assert.equal(x.nextAction,'BENCHMARK_ALIGNMENT_ENGINE');assert.equal(x.completionPercent,85);assert.equal(x.stages.find(s=>s.id==='alignment')?.state,'WAITING_ENGINE');
 const y=buildQuranReadingReadiness({reading:'hafs',spatial:'VERIFIED',waqfStatus:'VERIFIED',waqfScienceStatus:'VERIFIED',tajweedStatus:'VERIFIED',vectorStatus:'VERIFIED',verifiedWordMappings:6236,benchmarkStatus:'VERIFIED',benchmarkPassed:true,alignmentBackendConfigured:true});assert.equal(y.nextAction,'READY');assert.equal(y.productionReady,true);assert.equal(y.completionPercent,100);
});

test('science intake is wired into both Cloud Build asset flows and remains inventory-only',()=>{
 const root=path.resolve('.');for(const file of ['cloudbuild-assets.yaml','cloudbuild-assets-upload.yaml']){const text=fs.readFileSync(path.join(root,file),'utf8');assert.match(text,/kfgqpc-science-intake\.ts --root \.mizan-ingest/)}
 const script=fs.readFileSync(path.join(root,'scripts/kfgqpc-science-intake.ts'),'utf8');assert.match(script,/semanticInference:'FORBIDDEN'/);assert.match(script,/automaticPromotionToVerifiedOccurrences:false/);assert.match(script,/isOfficialKfgqpcUrl/);
});

test('local Quran readiness CLI never needs network access or secrets',()=>{
 const text=fs.readFileSync(path.resolve('scripts/quran-intelligence-readiness.ts'),'utf8');assert.doesNotMatch(text,/fetch\(|R2_SECRET|ACCESS_KEY|Bearer/);assert.match(text,/PENDING_OFFICIAL_MASTER/);assert.match(text,/PENDING_ALIGNMENT_ENGINE/);
});


test('Waqf/Ibtida science layer requires KFGQPC evidence and never accepts unsupported fine-grained claims',()=>{
 const base:WaqfScienceDataset={version:'MIZAN-KFGQPC-WAQF-SCIENCE-1',reading:'hafs',taxonomyVersion:'kfgqpc-waqf-review/1',provenance:{authority:'KFGQPC',sourceUrl:'https://qurancomplex.gov.sa/reference',retrievedAt:'2026-09-03T00:00:00Z',sourceVersion:'official',localSha256:'a'.repeat(64),parserVersion:'mizan-waqf-science/1',generatedArtifactSha256:'0'.repeat(64),status:'UNVERIFIED'},evidence:[{id:'e1',source:'https://qurancomplex.gov.sa/reference',sourceVersion:'official',locator:'p.1',assurance:'KFGQPC_OFFICIAL_METADATA'}],rules:[{id:'r1',version:'1',nameArabic:'قاعدة',category:'WAQF_IBTIDA',summaryArabic:'مادة رسمية قيد التحقق.',evidenceIds:['e1']}],applications:[{id:'a1',reading:'hafs',surah:1,ayah:1,ruleId:'r1',evidenceIds:['e1'],assurance:'KFGQPC_OFFICIAL_METADATA',humanReviewed:false}]};
 assert.doesNotThrow(()=>validateWaqfScienceDataset(base));
 const bad=structuredClone(base);bad.evidence[0].source='https://example.com/reference';assert.throws(()=>validateWaqfScienceDataset(bad),/SOURCE_NOT_KFGQPC/);
 const human=structuredClone(base);human.applications[0].wordIndex=1;human.applications[0].assurance='HUMAN_VERIFIED_WITH_EVIDENCE';assert.throws(()=>validateWaqfScienceDataset(human),/FINE_GRAINED_REQUIRES_HUMAN_REVIEW/);
 const verified=structuredClone(base);verified.provenance.status='VERIFIED';verified.provenance.officialChecksum='abc';verified.provenance.officialChecksumVerified=true;verified.provenance.generatedArtifactSha256=generatedArtifactDigest(verified);assert.doesNotThrow(()=>validateWaqfScienceDataset(verified));
});
