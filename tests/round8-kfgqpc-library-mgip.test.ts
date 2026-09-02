import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKfgqpcOfficialLibrary,kfgqpcLibrarySummary} from '../server/kfgqpc-official-library';
import {KFGQPC_DEVELOPER_ASSETS} from '../server/kfgqpc-developer-assets';
import {assessMizanGlobalIntegrityProtocol} from '../src/lib/global-integrity-protocol';

test('KFGQPC official library implements points 1-14 and 16 as certified authority capabilities',()=>{
 const items=buildKfgqpcOfficialLibrary(()=> 'NOT_INGESTED');
 assert.deepEqual(items.map(x=>x.order),[1,2,3,4,5,6,7,8,9,10,11,12,13,14,16]);
 assert.equal(items.length,15);
 assert.ok(items.every(x=>x.authorityState==='PRIMARY_OFFICIAL_AUTHORITY'&&x.scientificState==='CERTIFIED'));
 assert.ok(items.find(x=>x.id==='official-mushaf-vector')?.visualMode==='VECTOR_PAGE');
 assert.ok(items.find(x=>x.id==='official-audio')?.uses.includes('opening ayah prompt'));
});

test('local Quran package readiness never changes the official authority decision',()=>{
 const items=buildKfgqpcOfficialLibrary(id=>id==='kfgqpc-hafs-uthmanic-v13'?'CERTIFIED':'NOT_INGESTED');
 assert.equal(items.find(x=>x.id==='hafs-package')?.operationalState,'LOCAL_VERIFIED');
 assert.equal(items.find(x=>x.id==='warsh-package')?.operationalState,'LOCAL_BYTES_REQUIRED');
 assert.equal(items.find(x=>x.id==='warsh-package')?.scientificState,'CERTIFIED');
 const summary=kfgqpcLibrarySummary(id=>id==='kfgqpc-hafs-uthmanic-v13'?'CERTIFIED':'NOT_INGESTED');
 assert.equal(summary.officiallyAccepted,15);assert.ok(summary.localVerified>=1);
});

test('developer asset catalog includes fonts, desktop publishing and publication images in addition to scientific data',()=>{
 const kinds=new Set(KFGQPC_DEVELOPER_ASSETS.map(x=>x.kind));
 for(const k of ['OFFICIAL_QURAN_FONT','DESKTOP_PUBLISHING','PUBLICATION_IMAGE_SERVICE','TAFSEER_DATA','GHAREEB_DATA','TAJWEED_BOOK_DATA'])assert.ok(kinds.has(k as any));
});

test('MGIP blocks missing foundational evidence but treats lifecycle-only controls as review',async()=>{
 const x=await assessMizanGlobalIntegrityProtocol({competitionId:'c',certifiedQuranSource:false,policyVersion:'p1',fairDrawVerified:false,secureQuestionRuntime:false,presenceQuorumEvidence:false,independentJudgeLocks:false,continuityEvidence:false,blackBoxEvidence:false,sealedResult:false,proofCertificate:false,appealEvidence:false,aiAdvisoryOnly:true,integrityPassportIssued:false});
 assert.equal(x.overall,'BLOCKED');
 assert.ok(x.controls.find(c=>c.id==='source')?.state==='BLOCKED');
 assert.ok(x.controls.find(c=>c.id==='continuity')?.state==='REVIEW');
 assert.match(x.protocolHash,/^[0-9a-f]{64}$/);
});

test('MGIP becomes ready when all required controls have evidence without requiring an appeal or incident',async()=>{
 const x=await assessMizanGlobalIntegrityProtocol({competitionId:'c',certifiedQuranSource:true,policyVersion:'p1',fairDrawVerified:true,secureQuestionRuntime:true,presenceQuorumEvidence:true,independentJudgeLocks:true,continuityEvidence:false,blackBoxEvidence:true,sealedResult:true,proofCertificate:true,appealEvidence:false,aiAdvisoryOnly:true,integrityPassportIssued:false});
 assert.equal(x.blockedCount,0);
 assert.equal(x.controls.find(c=>c.id==='appeal')?.required,false);
 assert.equal(x.controls.find(c=>c.id==='continuity')?.required,false);
 assert.equal(x.overall,'READY_WITH_REVIEW');
});

import {buildKfgqpcPublishingManifest} from '../src/lib/kfgqpc-publishing';
import {hashCanonical} from '../src/lib/trust-protocol';

test('KFGQPC publishing manifest binds official source provenance to an integrity hash',async()=>{
 const m=await buildKfgqpcPublishingManifest({competitionId:'comp-1',assetId:'kfgqpc-publication-images',sourcePackageId:'kfgqpc-hafs-uthmanic-v13',sourcePackageHash:'abc123',pageNumber:42,purpose:'APPEAL_EVIDENCE'});
 assert.equal(m.authority,'King Fahd Glorious Quran Printing Complex');
 assert.equal(m.version,'MIZAN-KFGQPC-PUBLISHING-1');
 const {integrityHash,...core}=m;
 assert.equal(integrityHash,await hashCanonical(core));
 assert.match(integrityHash,/^[0-9a-f]{64}$/);
});
