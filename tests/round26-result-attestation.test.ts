import test from 'node:test';
import assert from 'node:assert/strict';
import {attestResult} from '../server/result-attestation';
import {computePanelScore,breakTie,panelPenaltyCount} from '../src/lib/scoring-core';

/*
 * الدرجة تُحسب في المتصفّح. هذه الاختبارات تثبت أن الخادم يعيد احتسابها من الإرسالات الخام،
 * ويكشف الاختلاف، ويرفض الشهادة عند غياب الدليل بدل أن يوافق صامتًا.
 */

const CRITERIA=[{id:'memorization',maxScore:60},{id:'tajweed',maxScore:30},{id:'voice',maxScore:10}];
const full=(m:number,t:number,v:number)=>({totalScore:m+t+v,criterionScores:{memorization:m,tajweed:t,voice:v}});

test('server agrees with an honestly computed panel score',()=>{
  const submissions=[full(55,27,8),full(57,26,9),full(56,28,8)];
  const panel=computePanelScore({submissions,criteria:CRITERIA,mode:'all_judges_all_criteria'});
  const a=attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:panel.finalScore,criterionScores:panel.criterionScores,penaltyCount:0},submissions,criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(a.verdict,'AGREES');
  assert.deepEqual(a.discrepancies,[]);
  assert.equal(a.evidence.submissionCount,3);
  assert.match(a.attestationSha256,/^[0-9a-f]{64}$/);
});

test('a tampered final score is caught with the exact delta',()=>{
  const submissions=[full(55,27,8),full(57,26,9),full(56,28,8)];
  const panel=computePanelScore({submissions,criteria:CRITERIA,mode:'all_judges_all_criteria'});
  const a=attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:panel.finalScore+3.5,criterionScores:panel.criterionScores,penaltyCount:0},submissions,criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(a.verdict,'DISAGREES');
  const d=a.discrepancies.find(x=>x.field==='finalScore');
  assert.ok(d);assert.ok(Math.abs(d!.delta+3.5)<1e-6);
});

test('specialised panels are summed per responsible judge, and the old averaging bug is rejected',()=>{
  // كل محكّم يُقيّم معياره وحده. الصواب جمع المعايير = 90.
  const submissions=[
    {totalScore:100,criterionScores:{memorization:55},scoredCriterionIds:['memorization']},
    {totalScore:100,criterionScores:{tajweed:27},scoredCriterionIds:['tajweed']},
    {totalScore:100,criterionScores:{voice:8},scoredCriterionIds:['voice']},
  ];
  const panel=computePanelScore({submissions,criteria:CRITERIA,mode:'specialized_judges'});
  assert.equal(panel.finalScore,90);
  // متوسط الدرجات الكلية المُسقَطة (100) هو الخطأ القديم — الخادم يرفضه.
  const a=attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:100,penaltyCount:0},submissions,criteria:CRITERIA,mode:'specialized_judges'});
  assert.equal(a.verdict,'DISAGREES');
  assert.equal(a.recomputed.finalScore,90);
});

test('missing evidence is never attested as agreement',()=>{
  const noSubs=attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:90},submissions:[],criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(noSubs.verdict,'INSUFFICIENT_EVIDENCE');
  assert.equal(noSubs.reason,'NO_JUDGE_SUBMISSIONS');
  const noCriteria=attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:90},submissions:[full(55,27,8)],criteria:[],mode:'all_judges_all_criteria'});
  assert.equal(noCriteria.verdict,'INSUFFICIENT_EVIDENCE');
  assert.equal(noCriteria.reason,'NO_RUBRIC_CRITERIA');
  // ولا يُدّعى تطابق بمجرد أن المطالبة غائبة.
  const noClaim=attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:NaN},submissions:[full(55,27,8)],criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(noClaim.verdict,'DISAGREES');
});

test('dropExtremes is honoured and changes the attested score',()=>{
  const submissions=[full(40,20,5),full(55,27,8),full(60,30,10)];
  const plain=attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:0},submissions,criteria:CRITERIA,mode:'all_judges_all_criteria'});
  const dropped=attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:0},submissions,criteria:CRITERIA,mode:'all_judges_all_criteria',dropExtremes:true});
  assert.equal(dropped.recomputed.finalScore,90,'middle submission only');
  assert.notEqual(plain.recomputed.finalScore,dropped.recomputed.finalScore);
  assert.equal(dropped.evidence.dropExtremes,true);
});

test('the attestation digest is stable for the same facts and moves when they change',()=>{
  const submissions=[full(55,27,8)];
  const mk=(score:number)=>attestResult({competitionId:'c1',participantId:'p1',claim:{finalScore:score,criterionScores:{memorization:55,tajweed:27,voice:8},penaltyCount:0},submissions,criteria:CRITERIA,mode:'all_judges_all_criteria'});
  const a=mk(90),b=mk(90);
  assert.equal(a.inputsSha256,b.inputsSha256,'same inputs hash the same');
  assert.notEqual(a.attestationSha256,mk(91).attestationSha256,'a different claim yields a different attestation');
});

test('penalties take the highest evidence, and ties break by the rubric order',()=>{
  assert.equal(panelPenaltyCount([{totalScore:0,sessionPenaltyCount:1},{totalScore:0,sessionPenaltyCount:3}],2),3);
  const a={finalScore:90,criterionScores:{memorization:56,tajweed:26},penaltyCount:1};
  const b={finalScore:90,criterionScores:{memorization:54,tajweed:28},penaltyCount:0};
  assert.ok(breakTie(a,b,['memorization_priority'])<0,'stronger memorization ranks ahead');
  assert.ok(breakTie(a,b,['tajweed_priority'])>0,'stronger tajweed ranks ahead');
  assert.ok(breakTie(a,b,['fewest_penalties'])>0,'fewer penalties rank ahead');
  assert.equal(breakTie(a,b,['additional_question']),0,'unresolvable rule stays neutral');
});
