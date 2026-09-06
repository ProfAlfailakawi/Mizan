import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {IntegrityAuthorityRepository,verifyCommitRevealSeparation,MIN_REVEAL_GAP_MS} from '../server/integrity-authority';
import type {ServerIdentity} from '../server/identity-governance';

/*
 * ما تُثبته هذه الاختبارات ليس أن الدوال تعمل، بل أن **العبث لا يعمل**: موافقة مكرّرة باسمين،
 * تنفيذ بيد الطالب، وكشف بذرة في نفس لحظة الالتزام. كل واحدة منها كانت ممكنة حين كان الحارس
 * في المتصفح.
 */

const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'mizan-authority-'));
const who=(uid:string,role:string):ServerIdentity=>({uid,role:role as ServerIdentity['role'],organizationId:'org1',competitionId:'c1'});
const HEAD=who('u-head','head_judge'),ADMIN=who('u-admin','comp_admin'),ADMIN2=who('u-admin2','org_admin'),ROOT=who('u-root','super_admin');
const GROUPS=[['head_judge'],['comp_admin','org_admin']];
const request=(r:IntegrityAuthorityRepository,actor=HEAD)=>{
  const o=r.requestQuorum(actor,{competitionId:'c1',action:'results_seal',entityId:'c1',requiredRoleGroups:GROUPS});
  assert.ok(o.ok);return (o as {ok:true;record:{id:string;status:string}}).record;
};

test('a quorum needs one independent actor from every required group',()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const q=request(r);
  assert.equal(q.status,'pending');
  const first=r.approveQuorum(HEAD,q.id);
  assert.ok(first.ok);
  assert.equal((first as any).record.status,'pending','one group is not a quorum');
  const second=r.approveQuorum(ADMIN,q.id);
  assert.ok(second.ok);
  assert.equal((second as any).record.status,'ready');
});

test('the same person cannot supply both approvals',()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const q=request(r);
  assert.ok(r.approveQuorum(HEAD,q.id).ok);
  const again=r.approveQuorum(HEAD,q.id);
  assert.equal(again.ok,false);
  assert.equal((again as any).code,'ALREADY_APPROVED');
  assert.equal(r.listQuorum(HEAD,'c1')[0].status,'pending','a repeated signature does not complete a quorum');
});

test('a root account cannot stand in for an independent authority',()=>{
  // تجاوز الجذر يُبطل معنى النصاب، فلا يُحتسب حتى لو كانت صلاحيته أوسع.
  const r=new IntegrityAuthorityRepository(dir());
  const q=request(r);
  const out=r.approveQuorum(ROOT,q.id);
  assert.equal(out.ok,false);
  assert.equal((out as any).code,'ROLE_NOT_REQUIRED');
});

test('a role outside the required groups is refused',()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const q=request(r);
  const out=r.approveQuorum(who('u-j','judge'),q.id);
  assert.equal(out.ok,false);
  assert.equal((out as any).code,'ROLE_NOT_REQUIRED');
});

test('the requester cannot execute their own action, and an incomplete one cannot execute at all',()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const q=request(r,HEAD);
  assert.equal((r.executeQuorum(ADMIN,q.id) as any).code,'NOT_READY');
  r.approveQuorum(HEAD,q.id);r.approveQuorum(ADMIN,q.id);
  assert.equal((r.executeQuorum(HEAD,q.id) as any).code,'REQUESTER_CANNOT_EXECUTE');
  const done=r.executeQuorum(ADMIN2,q.id);
  assert.ok(done.ok);
  assert.equal((done as any).record.status,'executed');
  assert.equal((r.executeQuorum(ADMIN2,q.id) as any).code,'ALREADY_FINAL','no replay of an executed action');
});

test('a quorum from another organisation is invisible and untouchable',()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const q=request(r);
  const stranger:ServerIdentity={uid:'x',role:'comp_admin',organizationId:'org2'};
  assert.equal((r.approveQuorum(stranger,q.id) as any).code,'SCOPE_MISMATCH');
  assert.deepEqual(r.listQuorum(stranger,'c1'),[]);
});

test('requesting twice returns the open action instead of splitting the approvals',()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const a=request(r);r.approveQuorum(HEAD,a.id);
  const b=request(r,ADMIN);
  assert.equal(b.id,a.id);
  assert.equal(r.listQuorum(HEAD,'c1').length,1);
});

/* القرعة: الالتزام والكشف. */

test('committing a draw does not hand out the seed',()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const c=r.commitFairDraw(ADMIN,{competitionId:'c1',participantId:'p1',constraintHash:'ch1'});
  assert.equal(c.status,'COMMITTED');
  assert.match(c.seedCommitmentHash,/^SHA256:[0-9a-f]{64}$/);
  assert.equal((c as unknown as Record<string,unknown>).seed,undefined,'the seed is not in the commitment at all');
  // ولا تسرّبًا في التسلسل: بصمة الالتزام وحدها من طول 64، ولا بذرة سواها.
  const hexRuns=(JSON.stringify(c).match(/[0-9a-f]{64}/g)||[]);
  assert.deepEqual(hexRuns,[c.seedCommitmentHash.replace('SHA256:','')]);
});

test('a reveal in the same instant as the commit is refused, and a later one succeeds',async()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const c=r.commitFairDraw(ADMIN,{competitionId:'c1',participantId:'p1',constraintHash:'ch1'});
  const tooSoon=r.revealFairDraw(ADMIN,c.id);
  assert.equal(tooSoon.ok,false);
  assert.equal((tooSoon as any).code,'TOO_SOON','a zero gap cannot be told apart from a commitment written after the fact');
  await new Promise(res=>setTimeout(res,MIN_REVEAL_GAP_MS+50));
  const out=r.revealFairDraw(ADMIN,c.id);
  assert.ok(out.ok);
  const {seed,commitment,separationMs}=out as any;
  assert.equal(`SHA256:${crypto.createHash('sha256').update(seed).digest('hex')}`,c.seedCommitmentHash,'the revealed seed is the one committed to');
  assert.equal(commitment.status,'REVEALED');
  assert.ok(separationMs>=MIN_REVEAL_GAP_MS);
  assert.equal((r.revealFairDraw(ADMIN,c.id) as any).code,'ALREADY_REVEALED','a seed is revealed once');
});

test('changing the constraints between commit and reveal voids the commitment',async()=>{
  const r=new IntegrityAuthorityRepository(dir());
  const c=r.commitFairDraw(ADMIN,{competitionId:'c1',participantId:'p1',constraintHash:'ch1'});
  await new Promise(res=>setTimeout(res,MIN_REVEAL_GAP_MS+50));
  assert.equal((r.revealFairDraw(ADMIN,c.id,'ch-different') as any).code,'CONSTRAINTS_CHANGED');
  assert.ok(r.revealFairDraw(ADMIN,c.id,'ch1').ok,'the unchanged constraints still reveal');
});

test('the portable verifier rejects a reveal that does not follow its commitment',()=>{
  const seed='a'.repeat(64);
  const commit=`SHA256:${crypto.createHash('sha256').update(seed).digest('hex')}`;
  const committedAt='2026-01-01T10:00:00.000Z';
  assert.equal(verifyCommitRevealSeparation({seedCommitmentHash:commit,seed,committedAt,revealedAt:'2026-01-01T10:05:00.000Z'}).valid,true);
  // كشف قبل الالتزام أو معه: الترتيب نفسه هو الدليل، وانعدامه يُبطله.
  assert.equal(verifyCommitRevealSeparation({seedCommitmentHash:commit,seed,committedAt,revealedAt:'2026-01-01T09:00:00.000Z'}).reason,'REVEAL_NOT_AFTER_COMMIT');
  assert.equal(verifyCommitRevealSeparation({seedCommitmentHash:commit,seed,committedAt,revealedAt:committedAt}).reason,'REVEAL_NOT_AFTER_COMMIT');
  assert.equal(verifyCommitRevealSeparation({seedCommitmentHash:commit,seed,committedAt,revealedAt:'2026-01-01T10:00:00.500Z'}).reason,'INSUFFICIENT_SEPARATION');
  assert.equal(verifyCommitRevealSeparation({seedCommitmentHash:commit,seed,committedAt}).reason,'NOT_REVEALED');
  assert.equal(verifyCommitRevealSeparation({seedCommitmentHash:commit,seed:'b'.repeat(64),committedAt,revealedAt:'2026-01-01T10:05:00.000Z'}).reason,'COMMITMENT_MISMATCH');
});

test('the audit chain records every act and breaks visibly when a line is edited',async()=>{
  const d=dir();
  const r=new IntegrityAuthorityRepository(d);
  const q=request(r);r.approveQuorum(HEAD,q.id);r.approveQuorum(ADMIN,q.id);r.executeQuorum(ADMIN2,q.id);
  const {rows,chainIntact}=r.readAudit('org1');
  assert.equal(chainIntact,true);
  assert.deepEqual(rows.map(x=>x.action),['QUORUM_REQUESTED','QUORUM_APPROVED','QUORUM_APPROVED','QUORUM_EXECUTED']);
  assert.deepEqual(rows.map(x=>x.sequence),[1,2,3,4]);

  const file=path.join(d,'integrity-audit-org1.jsonl');
  const lines=fs.readFileSync(file,'utf8').trim().split('\n');
  const forged=JSON.parse(lines[1]);forged.actorId='someone-else';
  lines[1]=JSON.stringify(forged);
  fs.writeFileSync(file,lines.join('\n')+'\n');
  assert.equal(new IntegrityAuthorityRepository(d).readAudit('org1').chainIntact,false,'rewriting who approved must not go unnoticed');
});

test('state survives a restart, so a quorum cannot be reset by reopening the app',()=>{
  const d=dir();
  const q=request(new IntegrityAuthorityRepository(d));
  const reopened=new IntegrityAuthorityRepository(d);
  reopened.approveQuorum(HEAD,q.id);
  assert.equal(new IntegrityAuthorityRepository(d).listQuorum(HEAD,'c1')[0].approvals.length,1);
});
