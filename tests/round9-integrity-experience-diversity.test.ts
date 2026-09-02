import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {QuestionDiversityLedger} from '../server/question-diversity-ledger';
import {buildQuestionPoolFromCertifiedSource} from '../server/question-pool-builder';
import {QuestionEscrowRepository} from '../server/question-escrow';
import {WitnessModeRepository} from '../server/witness-mode';
import {ColdVaultRepository} from '../server/cold-vault';
import {ServerQuranSourceRepository} from '../server/quran-source-repository';
import {KFGQPC_OFFICIAL_PACKAGES} from '../server/kfgqpc-official-sources';
import {buildIntegrityCinema,certifyVenue,verifyVenueBaseline} from '../src/lib/integrity-extensions';
import {passageTransitionPlan} from '../src/lib/judging-integrity';

const tmp=(prefix='mizan-r9-')=>fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp',prefix));

test('100 participants x 3 questions receive 300 unique start loci when capacity exists',()=>{
 const dir=tmp();try{
  const ledger=new QuestionDiversityLedger(dir);
  const candidates=Array.from({length:300},(_,i)=>({
    id:`q-${i+1}`,
    surahNumber:(i%30)+1,
    startAyah:Math.floor(i/30)+2,
    endAyah:Math.floor(i/30)+4,
    juzNumber:1,
    difficultyRating:3,
    lineStart:3+(i%11),
    startClass:(i%4===0?'MID_PAGE':i%4===1?'LATE_PAGE':i%4===2?'PAGE_OPENING':'MID_PAGE') as any,
    startAssurance:'QURAN_AYAH_BOUNDARY' as const,
  }));
  const all:string[]=[];const sets=new Set<string>();
  for(let i=0;i<100;i++){
    const out=ledger.allocate({competitionId:'c',poolId:'parts-1-3',readingKey:'Asim|Hafs|',sessionId:`s-${i}`,participantId:`p-${i}`,candidates,count:3,targetDifficulty:3,acrossSurah:true,expectedParticipantCount:100});
    assert.equal(out.metrics.globalUniqueCoverageGuaranteed,true);
    assert.equal(out.metrics.requiredUniqueLociForFullField,300);
    all.push(...out.record.locusKeys);sets.add(out.record.setSignature);
  }
  assert.equal(all.length,300);
  assert.equal(new Set(all).size,300,'no start locus should repeat before unique capacity is exhausted');
  assert.equal(sets.size,100,'every participant receives a different question set');
  const snap=ledger.snapshot('c','parts-1-3','Asim|Hafs|');assert.equal(snap.uniqueLoci,300);assert.equal(snap.uniqueSets,100);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});



test('server can generate a large official-source start pool from selected juz without inventing arbitrary start characters',()=>{
 const rows=Array.from({length:12},(_,i)=>({sura_no:2,aya_no:i+1,aya_text:`DEV-${i+1}`,jozz:1,page:2,line_start:(i%15)+1,line_end:(i%15)+1}));
 const quran={manifest:()=>({scientificApproval:{state:'CERTIFIED'},packageHash:'official-hash',qiraah:'Asim',rawi:'Hafs'}),verses:()=>rows} as any;
 const report=buildQuestionPoolFromCertifiedSource({quran,packageId:'official',poolId:'juz-1',allowedJuz:[1],passageAyahCount:3,expectedParticipantCount:3,questionsPerParticipant:3,scientificallyApprovedStartLoci:['2:3']});
 assert.equal(report.uniqueStartLoci,10);assert.equal(report.fullFieldUniqueCoverage,true);assert.equal(report.requiredUniqueLoci,9);assert.equal(report.scientificallyApprovedStarts,1);assert.ok(report.items.every(x=>x.startAyah>=1&&x.endAyah===x.startAyah+2));assert.ok(report.items.some(x=>x.startClass==='MID_PAGE'||x.startClass==='LATE_PAGE'));assert.equal(report.items.find(x=>x.startAyah===3)?.startLocusAssurance,'SCIENTIFICALLY_APPROVED');assert.ok(report.neutralDifficultyStarts>0);
});
test('question starts must resolve to an exact ayah boundary in the certified Quran source and are classified away from page opening',()=>{
 const dir=tmp(),bundle=Buffer.from('kfgqpc-round9-fixture');const bundlePath=path.join(dir,'bundle.bin'),dataPath=path.join(dir,'rows.json');fs.writeFileSync(bundlePath,bundle);
 const rows:any[]=[];for(let s=1;s<=114;s++){const max=s===2?8:1;for(let a=1;a<=max;a++)rows.push({sura_no:s,aya_no:a,aya_text:`DEV-${s}-${a}`,page:s,line_start:a===1?1:a===2?2:a===3?7:a===4?12:8,line_end:a===1?1:a===2?2:a===3?7:a===4?12:8})}fs.writeFileSync(dataPath,JSON.stringify(rows));
 const pkg=KFGQPC_OFFICIAL_PACKAGES[0] as any,old={md5:pkg.md5,sha1:pkg.sha1};pkg.md5=crypto.createHash('md5').update(bundle).digest('hex').toUpperCase();pkg.sha1=crypto.createHash('sha1').update(bundle).digest('hex').toUpperCase();
 try{const repo=new ServerQuranSourceRepository(path.join(dir,'vault'));repo.ingestOfficial({packageId:pkg.id,bundlePath,dataPath,ingestedBy:'test'});const meta=repo.questionStartMetadata(pkg.id,[{id:'mid',surahNumber:2,startAyah:3},{id:'late',surahNumber:2,startAyah:4}]);assert.equal(meta[0].startClass,'MID_PAGE');assert.equal(meta[1].startClass,'LATE_PAGE');assert.equal(meta[0].startAssurance,'QURAN_AYAH_BOUNDARY');assert.throws(()=>repo.questionStartMetadata(pkg.id,[{id:'bad',surahNumber:2,startAyah:99}]),/QUESTION_START_NOT_IN_CERTIFIED_SOURCE/)}finally{pkg.md5=old.md5;pkg.sha1=old.sha1;fs.rmSync(dir,{recursive:true,force:true})}
});

test('transition plan says Hasbuk then automatically advances only when another passage exists',()=>{
 const next=passageTransitionPlan({isLastQuestion:false,ar:true,cue:{enabled:true,phraseArabic:'حسبك، جزاك الله خيرًا',autoAdvanceDelayMs:900}});assert.equal(next.phrase,'حسبك، جزاك الله خيرًا');assert.equal(next.autoAdvance,true);assert.equal(next.delayMs,900);
 const last=passageTransitionPlan({isLastQuestion:true,ar:true,cue:{enabled:true}});assert.equal(last.autoAdvance,false);assert.match(last.phrase,/حسبك/);
});

test('question exposure canary is traceable, corridor contains no plaintext, and exposure radius stays bounded',()=>{
 const dir=tmp(),repo=new QuestionEscrowRepository(dir,Buffer.alloc(32,9).toString('base64url'));const actor=(uid:string,role='judge')=>({uid,role,organizationId:'o',competitionId:'c'});
 try{repo.create({organizationId:'o',competitionId:'c',sessionId:'s',participantId:'p',committeeId:'cm',requiredJudgeIds:['j1','j2','j3'],approvalMode:'all_assigned',expiresAt:new Date(Date.now()+60_000).toISOString(),questions:[{index:0,questionId:'q',payload:{expectedTextArabic:'DEV-SERVER-ONLY'}}]});repo.confirmPresence('s',actor('j1'),'p');for(const j of ['j1','j2','j3'])repo.approve('s',0,actor(j));const one=repo.reveal('s',0,actor('j1')),two=repo.reveal('s',0,actor('j2'));assert.ok(one.exposureReceipt.canaryToken);const traced=repo.traceCanary(one.exposureReceipt.canaryToken!);assert.equal(traced.judgeId,'j1');assert.equal(traced.verified,true);assert.throws(()=>repo.traceCanary(one.exposureReceipt.canaryToken!.slice(0,-1)+'x'),/CANARY/);const corridor=repo.custodyCorridor('s');assert.equal(corridor.plaintextIncluded,false);assert.equal(JSON.stringify(corridor).includes('DEV-SERVER-ONLY'),false);const radius=repo.exposureRadius('s');assert.equal(radius.uniqueExposedRecipients,2);assert.equal(radius.allowedRecipientCount,3);assert.equal(radius.withinConfiguredRadius,true);assert.ok(two.exposureReceipt.canaryId!==one.exposureReceipt.canaryId)}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Witness Mode requires independent witnesses and binds the exact high-risk action',()=>{
 const dir=tmp();try{const repo=new WitnessModeRepository(dir),admin={uid:'admin',role:'head_judge',organizationId:'o',competitionId:'c'},w1={uid:'w1',role:'auditor',organizationId:'o',competitionId:'c'},w2={uid:'w2',role:'operations',organizationId:'o',competitionId:'c'};const rec=repo.create({actor:admin,actionType:'QUESTION_REPLACEMENT',targetRef:'question-replacement:s',reason:'physical incident witnessed',expiresAt:new Date(Date.now()+60_000).toISOString(),requiredWitnesses:2});assert.throws(()=>repo.attest(rec.id,admin),/INITIATOR_CANNOT_WITNESS/);assert.equal(repo.attest(rec.id,w1).state,'PENDING');assert.equal(repo.attest(rec.id,w2).state,'READY');assert.equal(repo.verifyReady(rec.id,{organizationId:'o',competitionId:'c',actionType:'QUESTION_REPLACEMENT',targetRef:'question-replacement:s'}).state,'READY');assert.throws(()=>repo.verifyReady(rec.id,{organizationId:'o',competitionId:'c',actionType:'FULL_RETEST',targetRef:'question-replacement:s'}),/MISMATCH/)}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Cold Vault is encrypted, rejects secret key material, and provides verifiable restore preview',()=>{
 const dir=tmp();try{const repo=new ColdVaultRepository(dir),key=Buffer.alloc(32,4);assert.throws(()=>repo.export({competitionId:'c',createdBy:'ops',transferKey:key,payload:{publicKeys:['k'],masterKey:'forbidden'}}),/FORBIDDEN_SECRET/);const out=repo.export({competitionId:'c',createdBy:'ops',transferKey:key,payload:{competitionGenome:{version:'g1'},quranSourceManifests:[{hash:'h'}],publicVerificationKeys:['pub'],offlineRouting:{version:1}}});assert.equal(out.package.privateKeysIncluded,false);assert.equal(repo.verify(out.package).valid,true);const preview=repo.restorePreview(out.package,key);assert.equal(preview.ok,true);assert.deepEqual(preview.contents,['competitionGenome','offlineRouting','publicVerificationKeys','quranSourceManifests'])}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Integrity Cinema is privacy-safe and Certified Venue seal detects baseline changes',async()=>{
 const cinema=await buildIntegrityCinema({competitionId:'c',blackBoxHeadHash:'head',events:[{id:'e1',timestamp:'2026-09-02T01:00:00Z',action:'CHECK_IN',entityType:'Participant',entityId:'p'},{id:'e2',timestamp:'2026-09-02T01:02:00Z',action:'QUESTION_REVEALED',entityType:'Session',entityId:'s'},{id:'e3',timestamp:'2026-09-02T01:05:00Z',action:'JUDGE_LOCKED',entityType:'Submission',entityId:'j'}] as any});assert.equal(cinema.privacySafe,true);assert.equal(cinema.sceneCount,3);assert.equal(cinema.scenes[0].kind,'ARRIVAL');
 const devices=[{id:'d1',status:'online',softwareVersion:'1.0',role:'JudgeOS',zone:'A'}];const seal=await certifyVenue({competitionId:'c',venueZone:'A',createdBy:'ops',acousticPassport:{id:'ac1',status:'PASS'},devices,sourcePackageHash:'source-hash',edgeReady:true,offlinePassReady:true,recoveryTested:true,printerReady:true,audioDeviceFingerprint:'mic-a'});assert.equal(seal.status,'CERTIFIED_READY');assert.equal((await verifyVenueBaseline(seal,{devices,audioDeviceFingerprint:'mic-a',sourcePackageHash:'source-hash'})).valid,true);const changed=await verifyVenueBaseline(seal,{devices:[{...devices[0],softwareVersion:'1.1'}],audioDeviceFingerprint:'mic-b',sourcePackageHash:'source-hash'});assert.equal(changed.valid,false);assert.ok(changed.changes.includes('SOFTWARE_BASELINE_CHANGED'));assert.ok(changed.changes.includes('AUDIO_DEVICE_CHANGED'));
});
