import test from 'node:test';
import assert from 'node:assert/strict';
import {runLoadRehearsal} from '../server/load-rehearsal';

/*
 * البروفة القائمة قائمةُ تحقّق («هل الميزة موجودة؟»). هذه تسأل السؤال الآخر: هل تصمد النتائج
 * حين يدخل يومٌ كامل من المتسابقين؟ والمقياس ليس السرعة وحدها بل سلامة كل نتيجة على النطاق.
 */

test('a full competition day attests every result and ranks deterministically',()=>{
  const r=runLoadRehearsal({participants:200,committees:8,judgesPerCommittee:3,seed:'day-1'});
  assert.equal(r.verdict,'PASS',r.failures.join('; '));
  assert.equal(r.participantsScored,200);
  assert.equal(r.attestationsAgreed,200,'every result survives server recomputation');
  assert.equal(r.attestationsDisagreed,0);
  assert.equal(r.attestationsInsufficient,0);
  assert.ok(r.rankingStable);
});

test('specialised panels hold up at day scale too',()=>{
  const r=runLoadRehearsal({participants:200,committees:8,judgesPerCommittee:3,mode:'specialized_judges',seed:'day-2'});
  assert.equal(r.verdict,'PASS',r.failures.join('; '));
  assert.equal(r.attestationsAgreed,200);
});

test('the rehearsal is reproducible from its seed',()=>{
  const a=runLoadRehearsal({participants:40,committees:4,judgesPerCommittee:3,seed:'fixed'});
  const b=runLoadRehearsal({participants:40,committees:4,judgesPerCommittee:3,seed:'fixed'});
  const c=runLoadRehearsal({participants:40,committees:4,judgesPerCommittee:3,seed:'other'});
  assert.equal(a.attestationsAgreed,b.attestationsAgreed);
  assert.deepEqual(a.timings.map(t=>t.samples),b.timings.map(t=>t.samples));
  assert.equal(c.verdict,'PASS');
});

test('the rehearsal reports timings for every stage it ran',()=>{
  const r=runLoadRehearsal({participants:25,committees:3,judgesPerCommittee:3,seed:'timings'});
  const stages=r.timings.map(t=>t.stage);
  assert.deepEqual(stages,['panel-score','server-attestation','ranking']);
  const attest=r.timings.find(t=>t.stage==='server-attestation')!;
  assert.equal(attest.samples,25,'one attestation measured per participant');
  assert.ok(attest.p95Ms>=attest.p50Ms,'percentiles are ordered');
});

test('dropExtremes at scale still attests, and is recorded in the request',()=>{
  const r=runLoadRehearsal({participants:60,committees:4,judgesPerCommittee:5,dropExtremes:true,seed:'drop'});
  assert.equal(r.verdict,'PASS',r.failures.join('; '));
  assert.equal(r.request.dropExtremes,true);
  assert.equal(r.attestationsAgreed,60);
});
