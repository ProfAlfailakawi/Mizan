import test from 'node:test';
import assert from 'node:assert/strict';
import {MIN_RELIABLE_PAIRS,blindWorkItem,measureAgreement,planBlindRescoring,type ScoredSession} from '../server/blind-rescoring';

/*
 * «محكمونا عدول» قولٌ بلا رقم. هذه الطبقة تحوّله إلى قياس — وشرطُه الإعماء: مراجعٌ يعلم أنه
 * يراجع زميلًا يقيس مجاملته لا موثوقيته.
 */

const CRITERIA=[{id:'memorization',maxScore:60},{id:'tajweed',maxScore:30},{id:'voice',maxScore:10}];
const session=(i:number,judge:string,score:number,extra:Partial<ScoredSession>={}):ScoredSession=>({
  sessionId:`s${i}`,participantId:`p${i}`,judgeId:judge,submittedAt:'2027-02-11T09:00:00Z',
  totalScore:score,criterionScores:{memorization:score-38,tajweed:28,voice:10},hasRecording:true,...extra});

test('a reviewer is never handed a session they judged themselves',()=>{
  const sessions=Array.from({length:12},(_,i)=>session(i,i%2?'j1':'j2',90));
  const plan=planBlindRescoring({sessions,reviewers:['j1','j2','j3'],targetPairs:12,seed:'s1'});
  assert.ok(plan.length>0);
  for(const a of plan) assert.notEqual(a.reviewerId,a.originalJudgeId,'that would measure a judge against themselves');
});

test('the work item handed to a reviewer carries no trace of the first verdict',()=>{
  const plan=planBlindRescoring({sessions:[session(1,'j1',88)],reviewers:['j2'],targetPairs:1,seed:'s2'});
  const item=blindWorkItem(plan[0]);
  const serialized=JSON.stringify(item);
  assert.ok(!serialized.includes('j1'),'the original judge must not be visible');
  assert.ok(!/originalJudgeId|score|Score/.test(serialized),'no score and no hint that this is a re-score');
  assert.deepEqual(Object.keys(item).sort(),['participantId','reviewerId','sessionId']);
});

test('sessions without a recording are not re-scored',()=>{
  const sessions=[session(1,'j1',90,{hasRecording:false}),session(2,'j1',90,{hasRecording:true})];
  const plan=planBlindRescoring({sessions,reviewers:['j2'],targetPairs:5,seed:'s3'});
  assert.equal(plan.length,1);
  assert.equal(plan[0].sessionId,'s2','a recitation nobody can hear again cannot be re-judged');
});

test('the load is spread so the sample is not one reviewer',()=>{
  const sessions=Array.from({length:20},(_,i)=>session(i,'j0',90));
  const plan=planBlindRescoring({sessions,reviewers:['a','b','c','d'],targetPairs:16,seed:'s4'});
  const counts=new Map<string,number>();
  for(const a of plan)counts.set(a.reviewerId,(counts.get(a.reviewerId)||0)+1);
  assert.equal(counts.size,4,'every reviewer takes part');
  assert.ok(Math.max(...counts.values())-Math.min(...counts.values())<=1,'evenly spread');
});

test('the same seed plans the same sample',()=>{
  const sessions=Array.from({length:15},(_,i)=>session(i,'j0',90));
  const key=(p:ReturnType<typeof planBlindRescoring>)=>p.map(a=>`${a.sessionId}:${a.reviewerId}`).join('|');
  assert.equal(key(planBlindRescoring({sessions,reviewers:['a','b'],targetPairs:6,seed:'fixed'})),
               key(planBlindRescoring({sessions,reviewers:['a','b'],targetPairs:6,seed:'fixed'})));
  assert.notEqual(key(planBlindRescoring({sessions,reviewers:['a','b'],targetPairs:6,seed:'fixed'})),
                  key(planBlindRescoring({sessions,reviewers:['a','b'],targetPairs:6,seed:'other'})));
});

test('agreement is measured from the two independent verdicts',()=>{
  const originals=Array.from({length:10},(_,i)=>session(i,'j1',90));
  const plan=planBlindRescoring({sessions:originals,reviewers:['j2'],targetPairs:10,seed:'s5',maxPerReviewer:10});
  // مراجعٌ يوافق تمامًا في ثمانٍ ويختلف بأربع درجات في اثنتين.
  const reviews=plan.map((a,i)=>({...session(Number(a.sessionId.slice(1)),'j2',i<8?90:94),sessionId:a.sessionId}));
  const r=measureAgreement({assignments:plan,originals,reviews,criteria:CRITERIA,tolerance:2});
  assert.equal(r.pairs,10);
  assert.equal(r.agreementRate,0.8);
  assert.equal(r.maxAbsoluteDifference,4);
  assert.equal(r.outliers.length,2);
  assert.equal(r.sufficientSample,true);
});

test('a small sample is reported as a count, never as a trustworthy rate',()=>{
  const originals=[session(1,'j1',90),session(2,'j1',90)];
  const plan=planBlindRescoring({sessions:originals,reviewers:['j2'],targetPairs:2,seed:'s6',maxPerReviewer:2});
  const reviews=plan.map(a=>({...session(Number(a.sessionId.slice(1)),'j2',90),sessionId:a.sessionId}));
  const r=measureAgreement({assignments:plan,originals,reviews,criteria:CRITERIA});
  assert.ok(r.pairs<MIN_RELIABLE_PAIRS);
  assert.equal(r.sufficientSample,false);
  assert.match(r.note,/أصغر من/,'the report says plainly that it cannot carry a conclusion');
});

test('the widest criterion points at training, and is absent when nothing was measured',()=>{
  const originals=Array.from({length:8},(_,i)=>session(i,'j1',90));
  const plan=planBlindRescoring({sessions:originals,reviewers:['j2'],targetPairs:8,seed:'s7',maxPerReviewer:8});
  const reviews=plan.map(a=>({sessionId:a.sessionId,participantId:a.participantId,judgeId:'j2',submittedAt:'',totalScore:90,
    criterionScores:{memorization:52,tajweed:22,voice:10}}));
  const r=measureAgreement({assignments:plan,originals,reviews,criteria:CRITERIA});
  assert.equal(r.widestCriterion?.criterionId,'tajweed','tajweed diverged by 6, memorization by 0');
  const none=measureAgreement({assignments:[],originals:[],reviews:[],criteria:CRITERIA});
  assert.equal(none.widestCriterion,undefined,'nothing measured, nothing claimed');
  assert.equal(none.pairs,0);
});

test('a re-score changes no sealed result',()=>{
  // القياس يصف النظام ولا يمسّ درجة متسابق؛ المخرج تقرير لا تعديل.
  const originals=[session(1,'j1',90)];
  const plan=planBlindRescoring({sessions:originals,reviewers:['j2'],targetPairs:1,seed:'s8'});
  const reviews=[{...session(1,'j2',70),sessionId:plan[0].sessionId}];
  const r=measureAgreement({assignments:plan,originals,reviews,criteria:CRITERIA});
  assert.equal(originals[0].totalScore,90,'the original verdict is untouched');
  assert.equal(r.outliers[0].originalScore,90);
  assert.equal(r.outliers[0].reviewScore,70);
});
