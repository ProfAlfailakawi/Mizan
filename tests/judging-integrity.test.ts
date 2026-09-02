import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJudgeIndependenceCommitment, buildParticipantFairnessEvidence, openingAudioWindow, planQueueTransfer, questionRevealReady, queueTransferImpact, recommendBalancedQueueMove, selectApprovedOpeningAudio } from '../src/lib/judging-integrity';
import type { Participant, QuranReferenceAudioRecord } from '../src/types';

const approval=(judgeId:string)=>({judgeId,judgeName:judgeId,approvedAt:'2026-09-02T00:00:00.000Z'});

test('question remains sealed until participant is physically confirmed',()=>{
  const state=questionRevealReady({participantPresent:false,requiredJudgeIds:['j1','j2','j3'],approvals:[approval('j1'),approval('j2'),approval('j3')],mode:'all_assigned'});
  assert.equal(state.ready,false);
  assert.equal(state.reason,'PARTICIPANT_NOT_PRESENT');
});

test('all assigned judges must independently approve question reveal by default',()=>{
  const partial=questionRevealReady({participantPresent:true,requiredJudgeIds:['j1','j2','j3'],approvals:[approval('j1'),approval('j2')],mode:'all_assigned'});
  assert.equal(partial.ready,false);
  assert.equal(partial.approved,2);
  assert.equal(partial.required,3);
  const complete=questionRevealReady({participantPresent:true,requiredJudgeIds:['j1','j2','j3'],approvals:[approval('j1'),approval('j2'),approval('j3')],mode:'all_assigned'});
  assert.equal(complete.ready,true);
});

const baseAudio:QuranReferenceAudioRecord={
  id:'a1',organizationId:'org',reciter:'Approved Reciter',qiraah:"Qira'at Asim",rawi:"Hafs 'an Asim",surah:1,ayahStart:1,ayahEnd:1,
  recordingSource:'Scientific reference',audioFormat:'audio/mpeg',fileHash:'a'.repeat(64),audioUrl:'https://example.org/fatiha-1.mp3',approvalState:'APPROVED_REFERENCE',usageScope:['opening_prompt']
};

test('opening Quran audio requires an approved exact-reading reference',()=>{
  assert.equal(selectApprovedOpeningAudio({references:[baseAudio],qiraah:"Qira'at Asim",rawi:"Hafs 'an Asim",surah:1,ayah:1})?.id,'a1');
  assert.equal(selectApprovedOpeningAudio({references:[baseAudio],qiraah:"Qira'at Nafi'",rawi:"Warsh 'an Nafi'",surah:1,ayah:1}),undefined);
  assert.equal(selectApprovedOpeningAudio({references:[{...baseAudio,approvalState:'PENDING_REVIEW'}],qiraah:"Qira'at Asim",rawi:"Hafs 'an Asim",surah:1,ayah:1}),undefined);
});

test('preferred approved reciter is selected without weakening reading isolation',()=>{
  const alternate={...baseAudio,id:'a2',reciter:'Second Approved Reciter',audioUrl:'https://example.org/fatiha-1-b.mp3'};
  const selected=selectApprovedOpeningAudio({references:[baseAudio,alternate],qiraah:baseAudio.qiraah,rawi:baseAudio.rawi,preferredReciter:'Second Approved Reciter',surah:1,ayah:1});
  assert.equal(selected?.id,'a2');
  const wrongReading=selectApprovedOpeningAudio({references:[baseAudio,alternate],qiraah:"Qira'at Nafi'",rawi:"Warsh 'an Nafi'",preferredReciter:'Second Approved Reciter',surah:1,ayah:1});
  assert.equal(wrongReading,undefined);
});

test('multi-ayah audio is unusable for an opening ayah unless exact timings exist',()=>{
  const multi={...baseAudio,ayahStart:1,ayahEnd:3};
  assert.equal(selectApprovedOpeningAudio({references:[multi],qiraah:multi.qiraah,rawi:multi.rawi,surah:1,ayah:2}),undefined);
  const timed={...multi,ayahTimings:[{ayah:2,startMs:1250,endMs:5400}]};
  const found=selectApprovedOpeningAudio({references:[timed],qiraah:timed.qiraah,rawi:timed.rawi,surah:1,ayah:2});
  assert.ok(found);
  assert.deepEqual(openingAudioWindow(found!,2),{startMs:1250,endMs:5400});
});

const p=(id:string,committee:string,original:number,order=original):Participant=>({
  id,code:id,competitionId:'c',organizationId:'o',fullName:id,fullNameArabic:id,email:'',phone:'',country:'KW',nationality:'KW',nationalIdOrPassport:id,dateOfBirth:'2000-01-01',gender:'male',categoryId:'cat',riwaya:"Hafs 'an Asim",status:'in_queue',statusHistory:[],assignedCommitteeId:committee,queueNumber:original,originalQueueNumber:original,queueOrderKey:order,createdAt:'2026-09-02T00:00:00.000Z'
});

test('bulk committee transfer preserves original arrival priority and relative fairness',()=>{
  const participants=[p('A','c1',2),p('B','c1',5),p('C','c2',1),p('D','c2',4),p('E','c2',8)];
  const plan=planQueueTransfer({participants,sourceCommitteeId:'c1',targetCommitteeId:'c2',mode:'PRESERVE_ORIGINAL_TURN'});
  assert.equal(plan.ok,true);
  if(!plan.ok)return;
  assert.deepEqual(plan.targetOrder,['C','A','D','B','E']);
  assert.deepEqual(plan.changes.map(x=>x.nextOrderKey),[2,5]);
});

test('one participant can keep original priority when transferred',()=>{
  const participants=[p('A','c1',2),p('B','c1',5),p('C','c2',1),p('D','c2',4)];
  const plan=planQueueTransfer({participants,sourceCommitteeId:'c1',targetCommitteeId:'c2',participantIds:['B'],mode:'PRESERVE_ORIGINAL_TURN'});
  assert.equal(plan.ok,true);
  if(!plan.ok)return;
  assert.deepEqual(plan.targetOrder,['C','D','B']);
  assert.equal(plan.changes[0].nextOrderKey,5);
});

test('one participant can deliberately move to the end without changing original arrival number',()=>{
  const participants=[p('A','c1',2),p('B','c1',5),p('C','c2',1),p('D','c2',4)];
  const plan=planQueueTransfer({participants,sourceCommitteeId:'c1',targetCommitteeId:'c2',participantIds:['A'],mode:'MOVE_TO_END'});
  assert.equal(plan.ok,true);
  if(!plan.ok)return;
  assert.deepEqual(plan.targetOrder,['C','D','A']);
  assert.equal(plan.changes[0].originalQueueNumber,2);
  assert.ok(plan.changes[0].nextOrderKey>5);
});

test('queue transfer refuses a no-op to the same committee',()=>{
  const plan=planQueueTransfer({participants:[p('A','c1',1)],sourceCommitteeId:'c1',targetCommitteeId:'c1',mode:'PRESERVE_ORIGINAL_TURN'});
  assert.deepEqual(plan,{ok:false,reason:'SAME_COMMITTEE'});
});


test('queue fairness preview reports zero priority inversions when original turn is preserved',()=>{
  const participants=[p('A','c1',2),p('B','c1',5),p('C','c2',1),p('D','c2',4),p('E','c2',8)];
  const impact=queueTransferImpact({participants,sourceCommitteeId:'c1',targetCommitteeId:'c2',participantIds:['A','B'],mode:'PRESERVE_ORIGINAL_TURN'});
  assert.equal(impact.ok,true);if(!impact.ok)return;assert.equal(impact.priorityInversions,0);assert.equal(impact.totalLostPriorityPositions,0);
});

test('queue fairness preview makes deliberate move-to-end displacement visible',()=>{
  const participants=[p('A','c1',2),p('B','c1',5),p('C','c2',1),p('D','c2',4),p('E','c2',8)];
  const impact=queueTransferImpact({participants,sourceCommitteeId:'c1',targetCommitteeId:'c2',participantIds:['A'],mode:'MOVE_TO_END'});
  assert.equal(impact.ok,true);if(!impact.ok)return;assert.equal(impact.totalLostPriorityPositions,2);assert.ok(impact.priorityInversions>0);
});

test('balanced queue recommendation chooses the smallest move that reduces workload gap',()=>{
  const participants=[p('A','c1',1),p('B','c1',2),p('C','c1',3),p('D','c1',4),p('E','c1',5),p('F','c2',6)];
  const source={id:'c1',competitionId:'c',name:'1',nameArabic:'1',code:'1',room:'',judgeIds:[],assignedCategories:['cat'],status:'ready',currentParticipantId:null,averageSessionMinutes:10,audioInputOk:true} as any;
  const target={...source,id:'c2',code:'2'};
  const rec=recommendBalancedQueueMove({participants,sourceCommittee:source,targetCommittee:target,isCompatible:()=>true});
  assert.deepEqual(rec.participantIds,['A','B']);
  assert.ok(rec.after.gapMinutes<rec.before.gapMinutes);
});


test('participant fairness receipt carries queue and question integrity without exposing scores or judge identities',()=>{
  const participant=p('A','c1',7);
  const receipt=buildParticipantFairnessEvidence({
    participant,
    policyVersion:'policy-v3',
    ruleSetVersion:'rules-v9',
    queueTransfers:[{id:'qt-1',mode:'PRESERVE_ORIGINAL_TURN',sourceCommitteeId:'c1',targetCommitteeId:'c2',requestedAt:'2026-09-02T01:00:00.000Z',changes:[{participantId:'A',previousOrderKey:7,nextOrderKey:7,originalQueueNumber:7}]}],
    revealGates:[{questionIndex:0,participantPresence:{verified:true},approvals:[{judgeId:'judge-secret-1'},{judgeId:'judge-secret-2'}],requiredJudgeIds:['judge-secret-1','judge-secret-2'],status:'REVEALED',revealedAt:'2026-09-02T01:05:00.000Z',questionCommitmentHash:'commitment-hash',quranSourcePackageHash:'source-hash',revealAssurance:'production_server_escrow'}],
    independentJudgeSubmissions:[{locked:true,submittedAt:'2026-09-02T01:15:00.000Z'},{locked:true,submittedAt:'2026-09-02T01:16:00.000Z'}],
    result:{status:'sealed',sealMetadata:{cryptographicChecksum:'result-seal'}},
    certificate:{id:'cert-1'},
  });
  assert.equal(receipt.receiptVersion,2);
  assert.equal(receipt.queue.originalQueueNumber,7);
  assert.equal(receipt.queue.transfers[0].priorityPreserved,true);
  assert.equal(receipt.questionIntegrity.allRevealedAfterPresence,true);
  assert.equal(receipt.questionIntegrity.gates[0].judgeApprovals,2);
  assert.equal(receipt.judging.independentLockedSubmissions,2);
  const serialized=JSON.stringify(receipt);
  assert.equal(serialized.includes('judge-secret-1'),false);
  assert.equal(serialized.includes('totalScore'),false);
  assert.equal(serialized.includes('averageScore'),false);
  assert.equal(serialized.includes('judgeName'),false);
});

test('participant fairness receipt records deliberate queue-priority surrender explicitly',()=>{
  const participant=p('A','c1',2);
  const receipt=buildParticipantFairnessEvidence({
    participant,
    policyVersion:'p',ruleSetVersion:'r',
    queueTransfers:[{id:'qt-last',mode:'MOVE_TO_END',sourceCommitteeId:'c1',targetCommitteeId:'c2',requestedAt:'2026-09-02T02:00:00.000Z',changes:[{participantId:'A',previousOrderKey:2,nextOrderKey:12,originalQueueNumber:2}]}],
    revealGates:[],independentJudgeSubmissions:[],
  });
  assert.equal(receipt.queue.transfers[0].priorityPreserved,false);
  assert.equal(receipt.queue.transfers[0].previousOrderKey,2);
  assert.equal(receipt.queue.transfers[0].nextOrderKey,12);
});


test('judge independence commitment binds the locked score snapshot without exposing it in the public receipt',async()=>{
  const base={competitionId:'c',participantId:'p1',sessionId:'s1',judgeId:'j1',ruleSetVersion:'rules-v1',policyVersion:'policy-v1',submittedAt:'2026-09-02T03:00:00.000Z',criterionScores:{memorization:98,tajweed:19},totalScore:97};
  const first=await buildJudgeIndependenceCommitment(base);
  const same=await buildJudgeIndependenceCommitment(base);
  const altered=await buildJudgeIndependenceCommitment({...base,totalScore:96});
  assert.equal(first.commitmentHash,same.commitmentHash);
  assert.notEqual(first.commitmentHash,altered.commitmentHash);
  assert.equal(first.version,'MIZAN-JUDGE-INDEPENDENCE-v1');
});
