import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'crypto';
import {ServerQuranSourceRepository} from '../server/quran-source-repository';
import {QuranKnowledgeRepository,validateWaqfDataset} from '../server/quran-knowledge-repository';
import {deriveWaqfDatasetFromOfficialSource,verifyWaqfDatasetAgainstOfficialSource,KFGQPC_WAQF_SYMBOLS} from '../server/kfgqpc-waqf-derive';
import {generatedArtifactDigest} from '../server/quran-intelligence-policy';
import {QuranIntelligenceService} from '../server/quran-intelligence-service';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-waqf-'));const packageId='kfgqpc-hafs-uthmanic-v13';const dir=path.join(root,packageId);fs.mkdirSync(dir,{recursive:true});
  const rows=[{sura_no:1,aya_no:1,aya_text:'قَالَ ۘ قَوْلًا ۙ وَقَالَ ۚ شَيْئًا ۖ آخَرَ ۗ ثُمَّ ۛ هُنَا ۛ وَسَكَتَ ۜ',page:1,line_start:1,line_end:2}];
  const bytes=Buffer.from(JSON.stringify(rows));const dataSha256=crypto.createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(path.join(dir,'verses.json'),bytes);
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({version:2,packageId,authority:'King Fahd Glorious Quran Printing Complex',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',sourceVersion:'13.0',qiraah:'Asim',imam:'Asim ibn Abi al-Najud',rawi:'Hafs',bundleFile:'official-bundle.bin',dataFile:'verses.json',bundleMd5:'CF6841AEA5B1D1FD70D032B43FF08278',bundleSha1:'36EA5AB0D7EA1702F17FF43F9B50924CCCD77EBF',bundleChecksumVerified:true,dataSha256,packageHash:'fixture',verseCount:1,surahCount:1,ingestedAt:'2026-09-03T00:00:00Z',scientificApproval:{state:'CERTIFIED',basis:'OFFICIAL_AUTHORITY_POLICY',reviewers:[],certifiedAt:'2026-09-03T00:00:00Z'}}));
  return {root,repo:new ServerQuranSourceRepository(root)};
}

test('official KFGQPC waqf deriver extracts every supported printed mark without inventing wordIndex',()=>{
  const {root,repo}=fixture();try{const dataset=deriveWaqfDatasetFromOfficialSource(repo,'hafs');assert.equal(dataset.version,'MIZAN-KFGQPC-WAQF-2');assert.equal(dataset.provenance.status,'VERIFIED');assert.equal(dataset.occurrences.length,8);assert.equal(dataset.coverage?.occurrenceCount,8);assert.equal(dataset.symbolDefinitions?.length,KFGQPC_WAQF_SYMBOLS.length);assert.ok(dataset.occurrences.every(x=>x.wordIndex===undefined));assert.ok(dataset.occurrences.every(x=>x.assurance==='KFGQPC_OFFICIAL_DERIVED_METADATA'));assert.doesNotThrow(()=>verifyWaqfDatasetAgainstOfficialSource(dataset,repo));}finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('waqf verifier fails closed when a derived occurrence no longer matches the certified aya_text offset',()=>{
  const {root,repo}=fixture();try{const dataset=deriveWaqfDatasetFromOfficialSource(repo,'hafs');dataset.occurrences[0].sourceCodePointOffset=(dataset.occurrences[0].sourceCodePointOffset||0)+1;dataset.provenance.generatedArtifactSha256=generatedArtifactDigest(dataset);assert.throws(()=>verifyWaqfDatasetAgainstOfficialSource(dataset,repo),/WAQF_OCCURRENCE_OFFSET_MISMATCH/);}finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('waqf v2 forbids fabricated wordIndex even if the rest of the artifact is structurally valid',()=>{
  const {root,repo}=fixture();try{const dataset=deriveWaqfDatasetFromOfficialSource(repo,'hafs');dataset.occurrences[0].wordIndex=1;dataset.provenance.generatedArtifactSha256=generatedArtifactDigest(dataset);assert.throws(()=>validateWaqfDataset(dataset),/WAQF_DERIVED_WORD_INDEX_FORBIDDEN/);}finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('registered waqf artifact persists provenance and full coverage summary',()=>{
  const {root,repo}=fixture();const knowledgeRoot=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-waqf-knowledge-'));try{const dataset=deriveWaqfDatasetFromOfficialSource(repo,'hafs');const knowledge=new QuranKnowledgeRepository(knowledgeRoot);const status=knowledge.registerWaqf(dataset);assert.equal(status.status,'VERIFIED');assert.equal(status.occurrences,8);assert.equal(status.schemaVersion,'MIZAN-KFGQPC-WAQF-2');assert.equal(status.coverage?.verseCountScanned,1);assert.equal(knowledge.waqfForAyah('hafs',1,1).length,8);}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(knowledgeRoot,{recursive:true,force:true})}
});


test('Quran Intelligence bootstraps waqf automatically when a certified KFGQPC source already exists',()=>{
  const {root,repo}=fixture();const intelligenceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-waqf-service-'));try{const service=new QuranIntelligenceService(intelligenceRoot,repo);const status=service.knowledge.waqfStatus('hafs');assert.equal(status.status,'VERIFIED');assert.equal(status.schemaVersion,'MIZAN-KFGQPC-WAQF-2');assert.equal(status.occurrences,8);}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(intelligenceRoot,{recursive:true,force:true})}
});
