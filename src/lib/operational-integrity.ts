import type { AuditEvent, AuthSessionRecord, IdentityInvitationRecord, JourneyPassRecord, Role, SessionCheckpointRecord, SessionContinuityPhase, SessionRecoveryRecord } from '../types';
import { hashCanonical } from './trust-protocol';
import { newId, sha256 } from './crypto';

const SENSITIVE_ROLES=new Set<Role>(['org_admin','comp_admin','scientific_admin','head_judge','judge','auditor']);
const GRANT_MATRIX:Partial<Record<Role,Role[]>>={
  super_admin:['org_admin','support_agent'],
  org_admin:['comp_admin','scientific_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','guardian','support_agent'],
  comp_admin:['head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','guardian'],
};
export function canGrantRole(actorRole:Role,targetRole:Role){return GRANT_MATRIX[actorRole]?.includes(targetRole)??false}
export function roleGrantRequiresDualApproval(role:Role){return SENSITIVE_ROLES.has(role)}
export function validateRoleGrant(input:{actorRole:Role;targetRole:Role;actorId:string;approverId?:string;organizationId:string;targetOrganizationId:string}){
 if(input.organizationId!==input.targetOrganizationId)return {ok:false,reason:'CROSS_TENANT_GRANT_BLOCKED'} as const;
 if(!canGrantRole(input.actorRole,input.targetRole))return {ok:false,reason:'ROLE_GRANT_NOT_ALLOWED'} as const;
 if(roleGrantRequiresDualApproval(input.targetRole)&&input.approverId===input.actorId)return {ok:false,reason:'SELF_APPROVAL_BLOCKED'} as const;
 return {ok:true,dualApprovalRequired:roleGrantRequiresDualApproval(input.targetRole)} as const;
}
export async function invitationTokenHash(token:string){return sha256(`MIZAN-IDENTITY-INVITE-v1:${token.trim()}`)}
export function normalizedIdentityEmail(email:string){return email.trim().toLowerCase()}
export function invitationUsable(invite:IdentityInvitationRecord,now=new Date()){
 if(invite.status!=='READY')return {ok:false,reason:`INVITATION_${invite.status}`} as const;
 if(Date.parse(invite.expiresAt)<=now.getTime())return {ok:false,reason:'INVITATION_EXPIRED'} as const;
 if(!invite.activationTokenHash)return {ok:false,reason:'INVITATION_TOKEN_NOT_ISSUED'} as const;
 return {ok:true} as const;
}
export function detectConcurrentPrivilegedSession(input:{role:Role;newDeviceId:string;sessions:AuthSessionRecord[];now?:Date}){
 if(!['judge','head_judge','scientific_admin','comp_admin','org_admin'].includes(input.role))return {blocked:false} as const;
 const now=(input.now||new Date()).getTime();const active=input.sessions.find(s=>s.status==='ACTIVE'&&s.role===input.role&&s.deviceId!==input.newDeviceId&&Date.parse(s.expiresAt)>now);
 return active?{blocked:true,reason:'CONCURRENT_PRIVILEGED_SESSION',conflictingSessionId:active.id} as const:{blocked:false} as const;
}

export function nextCredentialGeneration(passes:JourneyPassRecord[],participantId:string){return Math.max(0,...passes.filter(p=>p.participantId===participantId).map(p=>p.generation||1))+1}
export function credentialLineageFor(passes:JourneyPassRecord[],participantId:string){return passes.find(p=>p.participantId===participantId&&p.lineageId)?.lineageId||`lineage:${participantId}`}
export function passReissueAllowed(input:{actorRole:Role;identityVerification:string;reason:string}){
 if(!['comp_admin','ops_manager','exception_host','org_admin'].includes(input.actorRole))return {ok:false,reason:'PASS_REISSUE_NOT_AUTHORIZED'} as const;
 if(!['PHOTO_ID','PASSPORT','PARTICIPANT_PROFILE','DELEGATION_CONFIRMATION','MANUAL_EXCEPTION'].includes(input.identityVerification))return {ok:false,reason:'IDENTITY_VERIFICATION_REQUIRED'} as const;
 if(input.reason.trim().length<3)return {ok:false,reason:'REISSUE_REASON_REQUIRED'} as const;
 return {ok:true} as const;
}


export function passReissueJourneyStateAllowed(status:string){
 if(status==='in_session')return {ok:false,reason:'ACTIVE_SESSION_SECURITY_HOLD'} as const;
 if(['tested','certified'].includes(status))return {ok:false,reason:'PARTICIPANT_JOURNEY_COMPLETED'} as const;
 return {ok:true} as const;
}

export function fullRetestProposalAllowed(input:{actorRole:Role;reason:string;hasOpenIncident:boolean;baseRecoveryDecision?:SessionRecoveryRecord['decision'];alreadyProposed?:boolean}){
 if(input.actorRole!=='head_judge')return {ok:false,reason:'HEAD_JUDGE_REQUIRED'} as const;
 if(input.reason.trim().length<10)return {ok:false,reason:'DETAILED_REASON_REQUIRED'} as const;
 if(!input.hasOpenIncident)return {ok:false,reason:'OPEN_INCIDENT_REQUIRED'} as const;
 if(input.baseRecoveryDecision!=='HEAD_JUDGE_ADJUDICATION')return {ok:false,reason:'TRUSTWORTHY_RECOVERY_PATH_EXISTS'} as const;
 if(input.alreadyProposed)return {ok:false,reason:'RETEST_ALREADY_PROPOSED'} as const;
 return {ok:true} as const;
}

export function fullRetestApprovalAllowed(input:{actorRole:Role;actorId:string;proposedBy:string;headJudgeId?:string;reason:string}){
 if(!['comp_admin','org_admin'].includes(input.actorRole))return {ok:false,reason:'INDEPENDENT_APPROVAL_REQUIRED'} as const;
 if(input.reason.trim().length<10)return {ok:false,reason:'INDEPENDENT_APPROVAL_REASON_REQUIRED'} as const;
 if(input.actorId===input.proposedBy||input.actorId===input.headJudgeId)return {ok:false,reason:'SECOND_PERSON_REQUIRED'} as const;
 return {ok:true} as const;
}

export interface CheckpointInput {competitionId:string;sessionId:string;participantId:string;committeeId:string;phase:SessionContinuityPhase;questionIndex:number;questionCommitmentHash?:string;questionRevealed:boolean;durationSeconds:number;eventIds:string[];lockedJudgeIds:string[];sequence:number;createdBy:string;previousCheckpointHash?:string;assurance:SessionCheckpointRecord['assurance'];}
export async function buildSessionCheckpoint(input:CheckpointInput):Promise<SessionCheckpointRecord>{
 const createdAt=new Date().toISOString();const core={competitionId:input.competitionId,sessionId:input.sessionId,participantId:input.participantId,committeeId:input.committeeId,phase:input.phase,questionIndex:input.questionIndex,questionCommitmentHash:input.questionCommitmentHash,questionRevealed:input.questionRevealed,durationSeconds:input.durationSeconds,eventIds:input.eventIds,lockedJudgeIds:input.lockedJudgeIds,sequence:input.sequence,createdBy:input.createdBy,previousCheckpointHash:input.previousCheckpointHash,assurance:input.assurance,createdAt};const checkpointHash=await hashCanonical(core);return {id:newId('checkpoint'),...core,checkpointHash};
}
export async function verifyCheckpointChain(checkpoints:SessionCheckpointRecord[]){
 const ordered=[...checkpoints].sort((a,b)=>a.sequence-b.sequence);let previous:SessionCheckpointRecord|undefined;
 for(const cp of ordered){const core={competitionId:cp.competitionId,sessionId:cp.sessionId,participantId:cp.participantId,committeeId:cp.committeeId,phase:cp.phase,questionIndex:cp.questionIndex,questionCommitmentHash:cp.questionCommitmentHash,questionRevealed:cp.questionRevealed,durationSeconds:cp.durationSeconds,eventIds:cp.eventIds,lockedJudgeIds:cp.lockedJudgeIds,sequence:cp.sequence,createdBy:cp.createdBy,previousCheckpointHash:cp.previousCheckpointHash,assurance:cp.assurance,createdAt:cp.createdAt};const hash=await hashCanonical(core);if(hash!==cp.checkpointHash)return {valid:false,reason:'CHECKPOINT_HASH_MISMATCH',checkpointId:cp.id} as const;if((cp.previousCheckpointHash||undefined)!==(previous?.checkpointHash||undefined))return {valid:false,reason:'CHECKPOINT_CHAIN_BROKEN',checkpointId:cp.id} as const;previous=cp;}
 return {valid:true,headHash:previous?.checkpointHash} as const;
}
export function recoveryDecisionFromCheckpoint(input:{checkpoint?:SessionCheckpointRecord;checkpointVerified:boolean;lockedPanelComplete?:boolean}):Pick<SessionRecoveryRecord,'decision'|'reason'|'preserveRevealedQuestion'|'preserveLockedJudgeSubmissions'>{
 const cp=input.checkpoint;if(!cp||!input.checkpointVerified)return {decision:'HEAD_JUDGE_ADJUDICATION',reason:'No trustworthy checkpoint is available; do not silently restart or redraw.',preserveRevealedQuestion:!!cp?.questionRevealed,preserveLockedJudgeSubmissions:!!cp?.lockedJudgeIds.length};
 if(input.lockedPanelComplete||cp.phase==='PANEL_LOCKED'||cp.phase==='COMPLETED')return {decision:'RESTORE_LOCKED_PANEL',reason:'Locked human submissions are authoritative and must not be repeated.',preserveRevealedQuestion:cp.questionRevealed,preserveLockedJudgeSubmissions:true};
 if(cp.phase==='BETWEEN_QUESTIONS')return {decision:'RESUME_SAME_SESSION_NEXT_QUESTION',reason:'Previous passage completed; continue to the next sealed passage.',preserveRevealedQuestion:false,preserveLockedJudgeSubmissions:true};
 if(cp.phase==='BEFORE_REVEAL')return {decision:'RESUME_SAME_SESSION_SAME_QUESTION',reason:'Question was never revealed; resume the same sealed session without a redraw.',preserveRevealedQuestion:false,preserveLockedJudgeSubmissions:true};
 return {decision:'RESUME_SAME_SESSION_SAME_QUESTION',reason:'The passage was already revealed or recitation started; fairness requires preserving the same question and prior evidence.',preserveRevealedQuestion:true,preserveLockedJudgeSubmissions:true};
}
export function dedupeRecoveredEvents<T extends {id:string}>(stored:T[],incoming:T[]){const seen=new Set(stored.map(x=>x.id));return [...stored,...incoming.filter(x=>!seen.has(x.id))]}

export async function appendAuditHash(previousHash:string,event:Pick<AuditEvent,'id'|'timestamp'|'organizationId'|'competitionId'|'actorId'|'actorRole'|'action'|'entityType'|'entityId'|'humanSummaryEnglish'|'reason'|'requestId'|'sessionId'|'sequence'>){return hashCanonical({previousHash,...event})}
export async function verifyAuditChain(events:AuditEvent[]){const chronological=[...events].reverse();let previous='GENESIS';for(const event of chronological){const expected=await appendAuditHash(previous,event);if(event.previousStateHash!==previous||event.currentStateHash!==expected)return {valid:false,eventId:event.id,expected,actual:event.currentStateHash} as const;previous=expected;}return {valid:true,headHash:previous,count:chronological.length} as const;}
export function separationOfDutiesViolation(input:{calculatedBy?:string;approvedBy?:string;sealedBy?:string;publishedBy?:string}){const critical=[input.calculatedBy,input.approvedBy,input.sealedBy,input.publishedBy].filter(Boolean) as string[];const unique=new Set(critical);return critical.length>=3&&unique.size===1?{violation:true,reason:'ONE_ACTOR_CONTROLS_RESULT_LIFECYCLE'}:{violation:false};}
