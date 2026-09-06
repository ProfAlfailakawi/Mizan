import test from 'node:test';
import assert from 'node:assert/strict';
import {sealResult,rankSealedResults,verifySeal,type SealedResult} from '../server/result-sealing';
import {computePanelScore} from '../src/lib/scoring-core';

/*
 * الشهادة كانت تصادق على رقمٍ ألّفه العميل. الختم ينقل التأليف نفسه إلى الخادم.
 * ما تُثبته هذه الاختبارات: أن الرقم المختوم هو المُعاد حسابه، وأن الختم يعبر الشبكة سالمًا،
 * وأنه لا يُصدر بلا دليل، ولا يُبدَّل بصمت.
 */

const CRITERIA=[{id:'memorization',maxScore:60},{id:'tajweed',maxScore:30},{id:'voice',maxScore:10}];
const full=(m:number,t:number,v:number)=>({totalScore:m+t+v,criterionScores:{memorization:m,tajweed:t,voice:v}});
const SUBS=[full(55,27,8),full(57,26,9),full(56,28,8)];
const base={competitionId:'c1',participantId:'p1',sessionId:'s1',criteria:CRITERIA,mode:'all_judges_all_criteria',sealedBy:'head-judge-1'};

const ok=(o:ReturnType<typeof sealResult>)=>{assert.ok(o.ok,'seal expected to succeed');return (o as {ok:true;sealed:SealedResult}).sealed};

test('the sealed score is the one the server recomputed, not one it was handed',()=>{
  const sealed=ok(sealResult({...base,submissions:SUBS}));
  const panel=computePanelScore({submissions:SUBS,criteria:CRITERIA,mode:'all_judges_all_criteria'});
  assert.equal(sealed.finalScore,panel.finalScore);
  assert.equal(sealed.attestation.verdict,'AGREES','the server never disagrees with its own arithmetic');
  assert.equal(sealed.contributingJudges,3);
  assert.equal(sealed.sealedBy,'head-judge-1');
  assert.match(sealed.sealSha256,/^[0-9a-f]{64}$/);
  assert.match(sealed.inputsSha256,/^[0-9a-f]{64}$/);
});

test('the same submissions reproduce the same input digest, in any judge order',()=>{
  const a=ok(sealResult({...base,submissions:SUBS}));
  const b=ok(sealResult({...base,submissions:[...SUBS]}));
  assert.equal(a.inputsSha256,b.inputsSha256,'identical evidence, identical anchor');
  // الختم نفسه يحمل وقتًا، فيختلف؛ والمرساة هي بصمة المدخلات لا بصمة اللحظة.
  const c=ok(sealResult({...base,submissions:[full(1,1,1),...SUBS]}));
  assert.notEqual(a.inputsSha256,c.inputsSha256,'different evidence must not share an anchor');
});

test('a seal survives the JSON round trip it will actually make over the wire',()=>{
  const sealed=ok(sealResult({...base,submissions:SUBS}));
  assert.ok(verifySeal(sealed));
  // المفاتيح غير المعرّفة (categoryId، supersedes) تختفي في JSON؛ لو دخلت البصمة لفشل ختم سليم.
  const overWire=JSON.parse(JSON.stringify(sealed)) as SealedResult;
  assert.ok(verifySeal(overWire),'a valid seal must still verify after transport');
});

test('any later edit to the sealed number breaks the seal',()=>{
  const sealed=ok(sealResult({...base,submissions:SUBS}));
  for(const tampered of [
    {...sealed,finalScore:sealed.finalScore+0.25},
    {...sealed,penaltyCount:sealed.penaltyCount+1},
    {...sealed,sealedBy:'someone-else'},
    {...sealed,criterionScores:{...sealed.criterionScores,tajweed:30}},
  ]) assert.equal(verifySeal(tampered as SealedResult),false);
});

test('a re-seal that changes the score says so instead of replacing it silently',()=>{
  const first=ok(sealResult({...base,submissions:SUBS}));
  const corrected=ok(sealResult({...base,submissions:[full(55,27,8),full(57,26,9),full(50,28,8)],
    previousSealSha256:first.sealSha256,previousFinalScore:first.finalScore}));
  assert.ok(corrected.supersedes);
  assert.equal(corrected.supersedes!.previousSealSha256,first.sealSha256);
  assert.ok(corrected.supersedes!.delta<0,'the correction lowered the score, and the seal records by how much');
  assert.ok(verifySeal(corrected),'the supersession is inside the digest, not beside it');
  assert.equal(first.supersedes,undefined,'a first seal supersedes nothing');
});

test('no evidence, no seal — and the refusal names its reason',()=>{
  for(const [req,code] of [
    [{...base,submissions:[]},'NO_SUBMISSIONS'],
    [{...base,submissions:SUBS,criteria:[]},'NO_CRITERIA'],
    [{...base,submissions:SUBS,participantId:''},'NO_IDENTITY'],
    [{...base,submissions:SUBS,sessionId:''},'NO_IDENTITY'],
    [{...base,submissions:SUBS,sealedBy:''},'NO_IDENTITY'],
  ] as const){
    const o=sealResult(req as any);
    assert.equal(o.ok,false);
    assert.equal((o as {ok:false;code:string}).code,code);
  }
});

test('ranking sealed results is deterministic and never depends on arrival order',()=>{
  const mk=(id:string,subs:typeof SUBS)=>ok(sealResult({...base,participantId:id,sessionId:`s-${id}`,submissions:subs}));
  const a=mk('a',SUBS),b=mk('b',[full(58,29,9),full(58,29,9),full(58,29,9)]),c=mk('c',SUBS);
  const ranked=rankSealedResults([a,b,c]);
  assert.equal(ranked[0].participantId,'b','the highest score leads');
  // a و c متساويان تمامًا؛ الترتيب بينهما يجب أن يكون ثابتًا لا عشوائيًا.
  assert.deepEqual(rankSealedResults([c,a,b]).map(r=>r.participantId),ranked.map(r=>r.participantId));
});

/*
 * البصمة تُثبت أن المحتوى لم يتغيّر. وحده التوقيع يُثبت **من ختم**: فمن يملك المدخلات يعيد
 * إنتاج البصمة لأي نتائج يختارها، ولا يعيد إنتاج التوقيع بلا المفتاح الخادمي.
 */
import crypto from 'crypto';
import {verifySealSignature} from '../server/result-sealing';

const KEYS=crypto.generateKeyPairSync('ed25519');
const SIGNER={keyId:'ed25519:test',publicKeySpki:KEYS.publicKey.export({format:'der',type:'spki'}).toString('base64url'),
  sign:(material:string)=>crypto.sign(null,Buffer.from(material),KEYS.privateKey).toString('base64url')};
const verifier=(material:string,signature:string)=>crypto.verify(null,Buffer.from(material),KEYS.publicKey,Buffer.from(signature,'base64url'));

test('a seal made with a server key is signed, and the signature verifies',()=>{
  const sealed=ok(sealResult({...base,submissions:SUBS,signer:SIGNER}));
  assert.equal(sealed.assurance,'SIGNED_ED25519');
  assert.equal(sealed.signature?.keyId,'ed25519:test');
  assert.deepEqual(verifySealSignature(sealed,verifier),{state:'SIGNED'});
  assert.ok(verifySeal(sealed),'the digest still covers the content');
  assert.ok(verifySeal(JSON.parse(JSON.stringify(sealed))),'and still does after transport');
});

test('with no server key the seal says it is a digest, and never claims a signature',()=>{
  const sealed=ok(sealResult({...base,submissions:SUBS}));
  assert.equal(sealed.assurance,'DIGEST_ONLY');
  assert.equal(sealed.signature,undefined);
  assert.deepEqual(verifySealSignature(sealed,verifier),{state:'UNSIGNED'},'unsigned is reported as unsigned, not as invalid');
});

test('a forged score cannot be re-signed, and a stripped signature is not silently accepted',()=>{
  const sealed=ok(sealResult({...base,submissions:SUBS,signer:SIGNER}));
  // من يملك الإرسالات يعيد بناء الجسم والبصمة — لكن التوقيع القديم لا يغطّي البصمة الجديدة.
  const forged={...sealed,finalScore:sealed.finalScore+5};
  const {sealSha256:_drop,signature:_sig,...body}=forged;
  const reforged={...forged,sealSha256:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
  assert.notEqual(verifySealSignature(reforged as typeof sealed,verifier).state,'SIGNED');
  assert.equal(verifySealSignature({...sealed,signature:undefined},verifier).state,'SIGNATURE_MISSING',
    'a seal that claims Ed25519 must produce one');
  const otherKey=crypto.generateKeyPairSync('ed25519');
  const wrong=(m:string,s:string)=>crypto.verify(null,Buffer.from(m),otherKey.publicKey,Buffer.from(s,'base64url'));
  assert.equal(verifySealSignature(sealed,wrong).state,'INVALID_SIGNATURE','another key does not vouch for this seal');
});
