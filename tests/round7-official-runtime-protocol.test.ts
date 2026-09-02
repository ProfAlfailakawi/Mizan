import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {KFGQPC_OFFICIAL_PACKAGES} from '../server/kfgqpc-official-sources';
import {KFGQPC_DEVELOPER_ASSETS} from '../server/kfgqpc-developer-assets';
import {ServerQuranSourceRepository} from '../server/quran-source-repository';
import {QuestionEscrowRepository} from '../server/question-escrow';
import {SecureQuestionRuntimeRepository,ServerQuestionPoolRepository} from '../server/secure-question-runtime';
import {buildCompetitionBlackBox,runFairnessConstitutionalCourt,issueAcousticVenuePassport,buildRecitationDigitalTwin,mapMutashabihatTrap,multiRiwayahSmartRoute,buildAppealCapsule,blindAnchorCalibration,integrityEntropyRadar,tripScientificCircuitBreaker,issueMizanIntegrityPassport,MIZAN_GLOBAL_INTEGRITY_PROTOCOL_VERSION} from '../src/lib/global-integrity-protocol';

const tmp=()=>fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp','mizan-r7-'));
function officialFixture(){
 const bundle=Buffer.from('official-kfgqpc-test-bundle');
 const rows=Array.from({length:114},(_,i)=>({id:i+1,jozz:1,page:1,sura_no:i+1,sura_name_en:`S${i+1}`,sura_name_ar:`س${i+1}`,line_start:1,line_end:1,aya_no:1,aya_text:`آية-${i+1}`}));
 const dir=tmp(),bundlePath=path.join(dir,'bundle.bin'),dataPath=path.join(dir,'data.json');fs.writeFileSync(bundlePath,bundle);fs.writeFileSync(dataPath,JSON.stringify(rows));
 const pkg=KFGQPC_OFFICIAL_PACKAGES[0] as any;const old={md5:pkg.md5,sha1:pkg.sha1};pkg.md5=crypto.createHash('md5').update(bundle).digest('hex').toUpperCase();pkg.sha1=crypto.createHash('sha1').update(bundle).digest('hex').toUpperCase();
 return {dir,bundlePath,dataPath,pkg,restore:()=>{pkg.md5=old.md5;pkg.sha1=old.sha1}};
}

test('KFGQPC official packages are explicitly certified authority assets and direct-certify after official checksum + structure',()=>{
 assert.equal(KFGQPC_OFFICIAL_PACKAGES.length,6);for(const p of KFGQPC_OFFICIAL_PACKAGES){assert.equal(p.officialCertification,'CERTIFIED');assert.equal(p.localUsePolicy,'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE')}
 const f=officialFixture();try{const repo=new ServerQuranSourceRepository(path.join(f.dir,'vault'));const m=repo.ingestOfficial({packageId:f.pkg.id,bundlePath:f.bundlePath,dataPath:f.dataPath,ingestedBy:'test'});assert.equal(m.scientificApproval.state,'CERTIFIED');assert.equal(m.scientificApproval.basis,'OFFICIAL_AUTHORITY_POLICY');assert.equal(repo.verses(f.pkg.id).length,114)}finally{f.restore();fs.rmSync(f.dir,{recursive:true,force:true})}
});

test('KFGQPC developer catalog includes print vector pages, smart-device text, Tafseer, Ghareeb and Tajweed assets',()=>{
 const kinds=new Set(KFGQPC_DEVELOPER_ASSETS.map(x=>x.kind));for(const k of ['PRINT_VECTOR_MUSHAF','SMART_DEVICE_UTHMANIC_TEXT','TAFSEER_DATA','GHAREEB_DATA','TAJWEED_BOOK_DATA'])assert.ok(kinds.has(k as any));
 assert.ok(KFGQPC_DEVELOPER_ASSETS.every(x=>x.officialCertification==='CERTIFIED'));
});

test('server runtime holds FairDraw + Quran plaintext until presence and full judge quorum, then allows only one emergency replacement',()=>{
 const f=officialFixture();try{const source=new ServerQuranSourceRepository(path.join(f.dir,'vault'));source.ingestOfficial({packageId:f.pkg.id,bundlePath:f.bundlePath,dataPath:f.dataPath,ingestedBy:'test'});const pools=new ServerQuestionPoolRepository(path.join(f.dir,'pools'));pools.save('c1','p1',[1,2,3].map((n)=>({id:`q${n}`,poolId:'p1',qiraah:f.pkg.qiraah,rawi:f.pkg.rawi,surahNumber:n,startAyah:1,endAyah:1,juzNumber:1,difficultyRating:n})));
 const escrow=new QuestionEscrowRepository(path.join(f.dir,'escrow'),'11'.repeat(32));const runtime=new SecureQuestionRuntimeRepository(path.join(f.dir,'runtime'),source,pools,escrow);const exp=new Date(Date.now()+3600000).toISOString();const pub=runtime.provision({organizationId:'o1',competitionId:'c1',sessionId:'s1',participantId:'p1',committeeId:'cm1',requiredJudgeIds:['j1','j2'],approvalMode:'all_assigned',expiresAt:exp,sourcePackageId:f.pkg.id,poolId:'p1',questionCount:2,qiraah:f.pkg.qiraah,rawi:f.pkg.rawi});assert.equal((pub as any).selectedBlueprintIds,undefined);assert.equal((pub as any).seedSecret,undefined);
 const j1={uid:'j1',role:'judge',organizationId:'o1',competitionId:'c1'},j2={uid:'j2',role:'judge',organizationId:'o1',competitionId:'c1'};assert.throws(()=>runtime.revealQuestion('s1',0,j1),/NOT_RELEASED/);runtime.confirmPresence('s1',j1);runtime.approveQuestion('s1',0,j1);assert.throws(()=>runtime.revealQuestion('s1',0,j1),/NOT_RELEASED/);runtime.approveQuestion('s1',0,j2);const revealed=runtime.revealQuestion('s1',0,j1);assert.match(String((revealed as any).payload.expectedTextArabic),/آية-/);
 const admin={uid:'a1',role:'head_judge',organizationId:'o1',competitionId:'c1'};runtime.authorizeEmergencyReplacement({sessionId:'s1',actor:admin,reason:'طارئ موثق',expiresAt:exp});runtime.approveEmergencyReplacement({sessionId:'s1',questionIndex:0,actor:j1});const rep=runtime.approveEmergencyReplacement({sessionId:'s1',questionIndex:0,actor:j2});assert.equal((rep as any).replacementReady,true);assert.throws(()=>runtime.authorizeEmergencyReplacement({sessionId:'s1',actor:admin,reason:'مرة ثانية',expiresAt:exp}),/ALREADY_USED/);
 }finally{f.restore();fs.rmSync(f.dir,{recursive:true,force:true})}
});

test('MGIP modules remain evidence-oriented and do not mutate official outcomes',async()=>{
 assert.equal(MIZAN_GLOBAL_INTEGRITY_PROTOCOL_VERSION,'MGIP-1.0');const black=await buildCompetitionBlackBox({competitionId:'c',events:[{id:'e1',timestamp:'2026-01-01T00:00:00Z',action:'A'}],assurance:'client_hash_chain' as any});assert.equal(black.verificationState,'VERIFIED');
 const court=runFairnessConstitutionalCourt({competitionId:'c',results:[{competitionId:'c',participantId:'p1',finalScore:99},{competitionId:'c',participantId:'p2',finalScore:98}] as any});assert.equal(court.nonOfficial,true);
 const acoustic=issueAcousticVenuePassport({competitionId:'c',venueZone:'A',createdBy:'x',policyVersion:'p1',measurements:{sampleRate:48000},thresholds:{sampleRateMin:16000}});assert.equal(acoustic.status,'PASS');
 const twin=await buildRecitationDigitalTwin({competitionId:'c',source:{id:'s',certificationState:'CERTIFIED',packageHash:'abc'} as any,qiraah:'Asim',rawi:'Hafs',surah:1,ayahStart:1,ayahEnd:1,variantLoci:[],allowedWujuh:[]});assert.equal(twin.state,'PENDING_SCIENTIFIC_ENRICHMENT');
 const trap=mapMutashabihatTrap({competitionId:'c',sourceManifestId:'s',expected:{surah:2,ayah:1},possible:{surah:3,ayah:1},similarityEvidence:'manual'} as any);assert.equal(trap.status,'REVIEW_MAP');
});

test('routing, appeal, blind calibration, entropy, circuit breaker and integrity passport are scoped and privacy preserving',async()=>{
 const routing=multiRiwayahSmartRoute({competitionId:'c',participant:{id:'p',riwaya:'Hafs'} as any,committees:[{id:'cm',competitionId:'c',status:'active',judgeIds:['j'],averageSessionMinutes:5}] as any,judges:[{id:'j',userId:'j',certifiedRiwayat:['Hafs']}] as any,queueCounts:new Map([['cm',0]])});assert.equal(routing.status,'ROUTED');
 const appeal=await buildAppealCapsule({competitionId:'c',participantId:'p',createdBy:'x',evidence:[{kind:'proof',ref:'safe'},{kind:'audio',ref:'secret',private:true}]});assert.deepEqual(appeal.evidenceRefs,['safe']);
 const anchor=blindAnchorCalibration({competitionId:'c',anchorSetVersion:'a1',samples:[{committeeId:'cm',judgeId:'j',judgeScore:9,expertScore:9,tolerance:.5}]});assert.equal(anchor.individualRankingProhibited,true);
 const entropy=integrityEntropyRadar({competitionId:'c',windowStart:'a',windowEnd:'b',events:[{kind:'REISSUE_CLUSTER' as any,entityRef:'p'},{kind:'REISSUE_CLUSTER' as any,entityRef:'p'}],reviewThresholds:{REISSUE_CLUSTER:2} as any});assert.equal(entropy.accusationProhibited,true);
 const breaker=tripScientificCircuitBreaker({competitionId:'c',triggerType:'QURAN_SOURCE',triggerRef:'s',reason:'hash discrepancy',affectedCapabilities:[],createdBy:'science'} as any);assert.equal(breaker.historicalRecordsRewritten,false);
 const passport=await issueMizanIntegrityPassport({competition:{id:'c',name:'C',nameArabic:'ج'} as any,quranSource:{sourceAuthority:'KFGQPC',packageHash:'h'} as any});assert.equal(passport.privacy.rawAudio,false);assert.equal(passport.privacy.judgeScores,false);
});
