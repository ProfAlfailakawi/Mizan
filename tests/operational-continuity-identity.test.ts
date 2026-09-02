import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityGovernanceRepository } from '../server/identity-governance';
import { buildSessionCheckpoint, canGrantRole, detectConcurrentPrivilegedSession, passReissueAllowed, passReissueJourneyStateAllowed, recoveryDecisionFromCheckpoint, roleGrantRequiresDualApproval, validateRoleGrant, verifyCheckpointChain, fullRetestProposalAllowed, fullRetestApprovalAllowed } from '../src/lib/operational-integrity';
import { generateSigningKeyPair, issueSignedPass, verifySignedPass } from '../src/lib/nextgen-integrity';
import type { AuthSessionRecord } from '../src/types';

const orgAdmin=(uid:string)=>({uid,email:`${uid}@example.org`,role:'org_admin' as const,organizationId:'org-1'});

test('sensitive competition roles require independent approval and stay tenant-scoped',()=>{
 assert.equal(canGrantRole('org_admin','judge'),true);assert.equal(roleGrantRequiresDualApproval('judge'),true);
 assert.equal(validateRoleGrant({actorRole:'org_admin',targetRole:'judge',actorId:'a',approverId:'a',organizationId:'o1',targetOrganizationId:'o1'}).reason,'SELF_APPROVAL_BLOCKED');
 assert.equal(validateRoleGrant({actorRole:'org_admin',targetRole:'judge',actorId:'a',approverId:'b',organizationId:'o1',targetOrganizationId:'o2'}).reason,'CROSS_TENANT_GRANT_BLOCKED');
});

test('server identity invitation is one-time, second-person approved, and creates scoped named account',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-id-'));try{const repo=new IdentityGovernanceRepository(dir);const created=repo.createInvitation(orgAdmin('admin-a'),{email:'judge@example.org',displayName:'Judge A',requestedRole:'judge',competitionId:'comp-1',committeeId:'committee-1',reason:'Official judging assignment'});assert.equal(created.invitation.status,'PENDING_APPROVAL');assert.equal(created.activationToken,undefined);assert.throws(()=>repo.approveInvitation(orgAdmin('admin-a'),created.invitation.id),/SECOND_PERSON_REQUIRED/);const approved=repo.approveInvitation(orgAdmin('admin-b'),created.invitation.id);assert.ok(approved.activationToken);const activated=repo.activate({uid:'firebase-judge',email:'judge@example.org'},approved.activationToken!);assert.equal(activated.grant.role,'judge');assert.equal(activated.grant.committeeId,'committee-1');assert.throws(()=>repo.activate({uid:'firebase-judge-2',email:'judge@example.org'},approved.activationToken!),/ACTIVATION_TOKEN_INVALID|IDENTITY_ALREADY_BOUND/);const audit=repo.audit(orgAdmin('admin-a'));assert.ok(audit.some(x=>x.action==='IDENTITY_ACTIVATED'));assert.equal(repo.verifyAudit('org-1').valid,true);}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('privileged identity cannot silently open on two different devices and admin can revoke the old session',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-id-'));try{const repo=new IdentityGovernanceRepository(dir);const inv=repo.createInvitation(orgAdmin('a'),{email:'judge@example.org',displayName:'Judge',requestedRole:'judge',competitionId:'comp-1',reason:'Official panel assignment'});const approved=repo.approveInvitation(orgAdmin('b'),inv.invitation.id);repo.activate({uid:'judge-uid',email:'judge@example.org'},approved.activationToken!);const identity={uid:'judge-uid',email:'judge@example.org',role:'judge' as const,organizationId:'org-1',competitionId:'comp-1'};const first=repo.openSession(identity,'tablet-1','Judge tablet','MFA');assert.equal(first.status,'ACTIVE');assert.equal(first.authenticationAssurance,'MFA');assert.throws(()=>repo.openSession(identity,'tablet-2','Replacement'),/PRIVILEGED_SESSION_CONFLICT/);const account=repo.identityForUid('judge-uid')!.account;assert.equal(repo.revokeSessions(orgAdmin('a'),account.id,'Secure replacement device handover').count,1);assert.equal(repo.openSession(identity,'tablet-2','Replacement').status,'ACTIVE');}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('client privileged-session detector blocks another device but not same device',()=>{
 const sessions:AuthSessionRecord[]=[{id:'s1',accountId:'a',firebaseUid:'u',organizationId:'o',role:'judge',deviceId:'d1',openedAt:'2026-09-02T00:00:00Z',lastSeenAt:'2026-09-02T00:00:00Z',expiresAt:'2026-09-03T00:00:00Z',status:'ACTIVE',authenticationAssurance:'MFA'}];
 assert.equal(detectConcurrentPrivilegedSession({role:'judge',newDeviceId:'d2',sessions,now:new Date('2026-09-02T01:00:00Z')}).blocked,true);assert.equal(detectConcurrentPrivilegedSession({role:'judge',newDeviceId:'d1',sessions,now:new Date('2026-09-02T01:00:00Z')}).blocked,false);
});

test('lost QR reissue is restricted and identity verification is mandatory',()=>{
 assert.equal(passReissueAllowed({actorRole:'judge',identityVerification:'PHOTO_ID',reason:'Lost'}).ok,false);assert.equal(passReissueAllowed({actorRole:'exception_host',identityVerification:'PHOTO_ID',reason:'Lost'}).ok,true);assert.equal(passReissueAllowed({actorRole:'exception_host',identityVerification:'none',reason:'Lost'}).ok,false);
});

test('credential generation rejects the lost superseded QR and detects stale gate cache',async()=>{
 const keys=await generateSigningKeyPair();const common={v:'MZP1' as const,competition:'c',participantToken:'p',categoryEntitlement:'cat',validFrom:'2026-09-01T00:00:00Z',expiry:'2026-09-04T00:00:00Z',issuer:'MIZAN',lineageId:'lineage-p'};
 const old=await issueSignedPass({...common,credentialId:'cred-old',generation:1},keys.privateKey);const replacement=await issueSignedPass({...common,credentialId:'cred-new',generation:2},keys.privateKey);const now=new Date('2026-09-02T00:00:00Z');assert.equal((await verifySignedPass(old,keys.publicKey,{competition:'c',now,latestGenerationByLineage:new Map([['lineage-p',2]])})).reason,'SUPERSEDED');assert.equal((await verifySignedPass(replacement,keys.publicKey,{competition:'c',now,latestGenerationByLineage:new Map([['lineage-p',1]])})).reason,'REVOCATION_CACHE_STALE');
});

test('checkpoint chain detects tampering and continuity never redraws a revealed question',async()=>{
 const a=await buildSessionCheckpoint({competitionId:'c',sessionId:'s',participantId:'p',committeeId:'k',phase:'BEFORE_REVEAL',questionIndex:0,questionCommitmentHash:'qhash',questionRevealed:false,durationSeconds:0,eventIds:[],lockedJudgeIds:[],sequence:1,createdBy:'judge',assurance:'client_hash_chain'});const b=await buildSessionCheckpoint({competitionId:'c',sessionId:'s',participantId:'p',committeeId:'k',phase:'RECITING',questionIndex:0,questionCommitmentHash:'qhash',questionRevealed:true,durationSeconds:42,eventIds:['e1'],lockedJudgeIds:[],sequence:2,createdBy:'judge',previousCheckpointHash:a.checkpointHash,assurance:'client_hash_chain'});assert.equal((await verifyCheckpointChain([a,b])).valid,true);assert.equal(recoveryDecisionFromCheckpoint({checkpoint:b,checkpointVerified:true}).decision,'RESUME_SAME_SESSION_SAME_QUESTION');assert.equal(recoveryDecisionFromCheckpoint({checkpoint:b,checkpointVerified:true}).preserveRevealedQuestion,true);assert.equal((await verifyCheckpointChain([a,{...b,durationSeconds:999}])).valid,false);
});

test('locked panel is restored and no trusted checkpoint requires Head Judge adjudication',async()=>{
 const cp=await buildSessionCheckpoint({competitionId:'c',sessionId:'s',participantId:'p',committeeId:'k',phase:'PANEL_LOCKED',questionIndex:2,questionRevealed:true,durationSeconds:90,eventIds:['e'],lockedJudgeIds:['j1','j2'],sequence:1,createdBy:'h',assurance:'server_persisted'});assert.equal(recoveryDecisionFromCheckpoint({checkpoint:cp,checkpointVerified:true,lockedPanelComplete:true}).decision,'RESTORE_LOCKED_PANEL');assert.equal(recoveryDecisionFromCheckpoint({checkpoint:undefined,checkpointVerified:false}).decision,'HEAD_JUDGE_ADJUDICATION');
});

test('QR reissue is never allowed during an active judging session and completed journeys remain closed',()=>{
 assert.equal(passReissueJourneyStateAllowed('in_session').reason,'ACTIVE_SESSION_SECURITY_HOLD');
 assert.equal(passReissueJourneyStateAllowed('tested').reason,'PARTICIPANT_JOURNEY_COMPLETED');
 assert.equal(passReissueJourneyStateAllowed('in_queue').ok,true);
});

test('full retest opens only after recovery is unprovable and requires a different authority',()=>{
 assert.equal(fullRetestProposalAllowed({actorRole:'head_judge',reason:'Power loss but checkpoint is intact',hasOpenIncident:true,baseRecoveryDecision:'RESUME_SAME_SESSION_SAME_QUESTION'}).reason,'TRUSTWORTHY_RECOVERY_PATH_EXISTS');
 assert.equal(fullRetestProposalAllowed({actorRole:'head_judge',reason:'No trustworthy checkpoint survives the incident',hasOpenIncident:true,baseRecoveryDecision:'HEAD_JUDGE_ADJUDICATION'}).ok,true);
 assert.equal(fullRetestApprovalAllowed({actorRole:'head_judge',actorId:'h',proposedBy:'h',headJudgeId:'h',reason:'Independent review completed'}).reason,'INDEPENDENT_APPROVAL_REQUIRED');
 assert.equal(fullRetestApprovalAllowed({actorRole:'comp_admin',actorId:'h',proposedBy:'h',headJudgeId:'h',reason:'Independent review completed'}).reason,'SECOND_PERSON_REQUIRED');
 assert.equal(fullRetestApprovalAllowed({actorRole:'comp_admin',actorId:'admin-2',proposedBy:'h',headJudgeId:'h',reason:'Independent evidence review completed'}).ok,true);
});
