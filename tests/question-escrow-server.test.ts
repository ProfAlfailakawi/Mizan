import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QuestionEscrowRepository, escrowQuestionReady } from '../server/question-escrow';

const key=Buffer.alloc(32,7).toString('base64url');
const actor=(uid:string,role='judge')=>({uid,role,organizationId:'org',competitionId:'comp'});
const setup=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-escrow-'));const repo=new QuestionEscrowRepository(dir,key);repo.create({organizationId:'org',competitionId:'comp',sessionId:'s1',participantId:'p1',committeeId:'c1',requiredJudgeIds:['j1','j2','j3'],approvalMode:'all_assigned',expiresAt:new Date(Date.now()+60_000).toISOString(),questions:[{index:0,questionId:'q1',payload:{surah:2,startAyah:10,endAyah:12,expectedTextArabic:'SERVER_ONLY_FIXTURE'}}]});return {repo,dir}};

test('server escrow never reveals before participant presence and full judge quorum',()=>{const {repo,dir}=setup();try{assert.throws(()=>repo.approve('s1',0,actor('j1')),/PARTICIPANT_NOT_PRESENT/);repo.confirmPresence('s1',actor('j1'),'p1','pass-1');repo.approve('s1',0,actor('j1'));repo.approve('s1',0,actor('j2'));assert.throws(()=>repo.reveal('s1',0,actor('j1')),/NOT_RELEASED/);const final=repo.approve('s1',0,actor('j3'));assert.equal(final.ready.ready,true);assert.equal(repo.reveal('s1',0,actor('j2')).payload.surah,2);}finally{fs.rmSync(dir,{recursive:true,force:true})}});

test('server escrow rejects unassigned judge and wrong participant',()=>{const {repo,dir}=setup();try{assert.throws(()=>repo.confirmPresence('s1',actor('outsider'),'p1'),/ASSIGNED_JUDGE_REQUIRED/);assert.throws(()=>repo.confirmPresence('s1',actor('j1'),'p2'),/PARTICIPANT_MISMATCH/);}finally{fs.rmSync(dir,{recursive:true,force:true})}});

test('server escrow persists ciphertext without plaintext question payload',()=>{const {repo,dir}=setup();try{const raw=fs.readFileSync(path.join(dir,'question-escrow-s1.json'),'utf8');assert.equal(raw.includes('SERVER_ONLY_FIXTURE'),false);assert.equal(raw.includes('ciphertext'),true);}finally{fs.rmSync(dir,{recursive:true,force:true})}});

test('server escrow records exposure receipts and revocation blocks future reveal',()=>{const {repo,dir}=setup();try{repo.confirmPresence('s1',actor('j1'),'p1');for(const j of ['j1','j2','j3'])repo.approve('s1',0,actor(j));const one=repo.reveal('s1',0,actor('j1'));assert.equal(one.exposureReceipt.judgeId,'j1');repo.revoke('s1','incident');assert.throws(()=>repo.reveal('s1',0,actor('j2')),/NOT_RELEASED|REVOKED/);}finally{fs.rmSync(dir,{recursive:true,force:true})}});

test('minimum quorum cannot exceed assigned judges',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-escrow-'));try{const repo=new QuestionEscrowRepository(dir,key);assert.throws(()=>repo.create({organizationId:'org',competitionId:'comp',sessionId:'s2',participantId:'p1',committeeId:'c1',requiredJudgeIds:['j1','j2'],approvalMode:'minimum',minimumApprovals:3,expiresAt:new Date(Date.now()+60_000).toISOString(),questions:[{index:0,questionId:'q',payload:{x:1}}]}),/INVALID_QUORUM/);}finally{fs.rmSync(dir,{recursive:true,force:true})}});
