import test from 'node:test';
import assert from 'node:assert/strict';
import {runFailureDrill,type DrillSubmission} from '../server/failure-drill';

/*
 * ميزان يَعِد بالصمود بلا شبكة، والوعد لم يُختبر تحت فشل قط. هذه البروفة تُسقط الأشياء عمدًا
 * وتسأل: هل نجا كل حكم، ولم يُحتسب مرتين، وبقي الترتيب هو الترتيب؟
 */

const CRITERIA=[{id:'memorization',maxScore:60},{id:'tajweed',maxScore:30},{id:'voice',maxScore:10}];
const sub=(session:string,judge:string,device:string,score:number,synced=true):DrillSubmission=>({
  sessionId:session,judgeId:judge,deviceId:device,synced,totalScore:score,
  criterionScores:{memorization:score-38,tajweed:28,voice:10}});

const day=(n=12)=>Array.from({length:n},(_,i)=>sub(`s${i%4}`,`j${i%3}`,`d${i%3}`,85+(i%7),true));

test('a clean day loses nothing and ranks deterministically',()=>{
  const r=runFailureDrill({submissions:day(),events:[],criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(r.verdict,'PASS',r.failures.join('; '));
  assert.equal(r.submissionsLost,0);
  assert.equal(r.doubleCounted,0);
  assert.ok(r.rankingPreserved);
});

test('a network cut mid-session loses nothing: work is written locally and rises later',()=>{
  const r=runFailureDrill({submissions:day(),events:[{at:5,kind:'NETWORK_LOSS'}],criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(r.submissionsLost,0,'an offline hall must not cost a single assessment');
  assert.equal(r.verdict,'PASS',r.failures.join('; '));
});

test('a browser restart does not count an assessment twice',()=>{
  // الاستئناف يتّحد بالمعرّف؛ لولا ذلك لأُدرج التقييم مرة من السجل ومرة من الخادم.
  const rows=day();
  const r=runFailureDrill({submissions:[...rows,...rows],events:[{at:6,kind:'BROWSER_RESTART'}],criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.ok(r.duplicatesAbsorbed>0,'the replayed journal really did arrive twice');
  assert.equal(r.doubleCounted,0,'the union is by identity, so nothing is counted twice');
  assert.equal(r.submissionsLost,0,'absorbing a duplicate must not drop the original');
  assert.equal(r.verdict,'PASS',r.failures.join('; '));
});

test('losing a device after the network is already down is the real hazard, and the drill catches it',()=>{
  // انقطاع ثم فقد جهاز = فقدُ ما كتبه ذلك الجهاز ولم يُزامَن. هذا ما يجب أن يُرى لا أن يُخفى.
  const rows=[sub('s1','j1','d1',90,true),sub('s1','j2','d2',88,true),sub('s2','j1','d1',92,true)];
  const r=runFailureDrill({submissions:rows,events:[{at:0,kind:'NETWORK_LOSS'},{at:1,kind:'DEVICE_LOSS',deviceId:'d1'}],criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.ok(r.submissionsLost>0,'the loss is reported, not smoothed away');
  assert.equal(r.verdict,'FAIL');
  assert.match(r.failures.join(' '),/did not survive/);
  assert.match(r.note,/أسوأ من نظام يتوقّف/);
});

test('a device lost while the network was up costs nothing',()=>{
  const rows=[sub('s1','j1','d1',90,true),sub('s1','j2','d2',88,true)];
  const r=runFailureDrill({submissions:rows,events:[{at:2,kind:'DEVICE_LOSS',deviceId:'d1'}],criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(r.submissionsLost,0,'already on the server, so the device is replaceable');
  assert.equal(r.verdict,'PASS');
});

test('the drill records what it broke, so a run can be read back',()=>{
  const r=runFailureDrill({submissions:day(),events:[{at:2,kind:'NETWORK_LOSS'},{at:7,kind:'DEVICE_LOSS',deviceId:'d2'},{at:9,kind:'BROWSER_RESTART'}],criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(r.events.length,3);
  assert.deepEqual(r.events.map(e=>e.kind),['NETWORK_LOSS','DEVICE_LOSS','BROWSER_RESTART']);
  assert.equal(r.submissionsAuthored,12);
});

test('specialised panels survive the same drill',()=>{
  const rows=Array.from({length:9},(_,i)=>({...sub(`s${i%3}`,`j${i%3}`,`d${i%3}`,90),
    criterionScores:{[CRITERIA[i%3].id]:[52,28,10][i%3]},scoredCriterionIds:[CRITERIA[i%3].id]}));
  const r=runFailureDrill({submissions:rows,events:[{at:4,kind:'NETWORK_LOSS'}],criteria:CRITERIA,mode:'specialized_judges'});
  assert.equal(r.verdict,'PASS',r.failures.join('; '));
  assert.equal(r.submissionsLost,0);
});

test('the catch-up upload on reconnect is what saves the offline stretch',()=>{
  /*
   * كشفت البروفة هذا قبل تصحيح النموذج: عمل كُتب أثناء الانقطاع ثم فُقد جهازه = فقدٌ حقيقي.
   * ما ينقذه هو رفع المتأخّرات عند عودة الشبكة — فالاختبار يثبت أن هذا الرفع حاملٌ لا تجميل.
   */
  const rows=[sub('s1','j1','d1',90),sub('s1','j2','d2',88),sub('s2','j1','d1',92)];
  const withReconnect=runFailureDrill({submissions:rows,criteria:CRITERIA,mode:'all_judges_all_criteria',
    events:[{at:0,kind:'NETWORK_LOSS'},{at:3,kind:'NETWORK_RESTORED'},{at:3,kind:'DEVICE_LOSS',deviceId:'d1'}]});
  assert.equal(withReconnect.submissionsLost,0,'reconnect flushed the pending work before the device went');
  assert.equal(withReconnect.verdict,'PASS');

  const withoutReconnect=runFailureDrill({submissions:rows,criteria:CRITERIA,mode:'all_judges_all_criteria',
    events:[{at:0,kind:'NETWORK_LOSS'},{at:3,kind:'DEVICE_LOSS',deviceId:'d1'}]});
  assert.ok(withoutReconnect.submissionsLost>0,'without the flush the same day loses work');
  assert.equal(withoutReconnect.verdict,'FAIL');
});

test('a device lost before the network returns still loses its unsynced work, and says so',()=>{
  const rows=[sub('s1','j1','d1',90),sub('s1','j2','d2',88)];
  const r=runFailureDrill({submissions:rows,criteria:CRITERIA,mode:'all_judges_all_criteria',
    events:[{at:0,kind:'NETWORK_LOSS'},{at:1,kind:'DEVICE_LOSS',deviceId:'d1'},{at:2,kind:'NETWORK_RESTORED'}]});
  assert.ok(r.submissionsLost>0,'a device that never reconnected cannot hand anything back');
  assert.equal(r.verdict,'FAIL','the drill must not smooth this away');
});
