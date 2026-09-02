import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type EscrowApprovalMode='all_assigned'|'minimum';
export type EscrowState='ACTIVE'|'REVOKED'|'EXPIRED';

export interface EscrowQuestionInput { index:number; questionId:string; payload:Record<string,unknown>; }
export interface EscrowSessionInput {
  organizationId:string;
  competitionId:string;
  sessionId:string;
  participantId:string;
  committeeId:string;
  requiredJudgeIds:string[];
  approvalMode:EscrowApprovalMode;
  minimumApprovals?:number;
  expiresAt:string;
  questions:EscrowQuestionInput[];
}
interface EncryptedPayload { iv:string; tag:string; ciphertext:string; aadHash:string; }
interface EscrowApproval { judgeId:string; approvedAt:string; }
interface EscrowQuestionRecord {
  index:number;
  questionId:string;
  commitmentHash:string;
  encrypted:EncryptedPayload;
  approvals:EscrowApproval[];
  releasedAt?:string;
  exposureReceipts:{judgeId:string;exposedAt:string;canaryId:string;canaryTokenHash:string}[];
}
export interface EscrowSessionRecord {
  version:1|2;
  organizationId:string;
  competitionId:string;
  sessionId:string;
  participantId:string;
  committeeId:string;
  requiredJudgeIds:string[];
  approvalMode:EscrowApprovalMode;
  minimumApprovals?:number;
  expiresAt:string;
  state:EscrowState;
  createdAt:string;
  participantPresence?:{verifiedAt:string;verifiedByJudgeId:string;participantPassId?:string};
  questions:EscrowQuestionRecord[];
  replacementHistory?:{questionIndex:number;replacedAt:string;reason:string;authorizedBy:string;retiredQuestion:EscrowQuestionRecord;newQuestionId:string;newCommitmentHash:string}[];
  revokedAt?:string;
  revocationReason?:string;
}

export interface EscrowActor { uid:string; role:string; organizationId:string; competitionId?:string; }

const canonical=(value:unknown):string=>{
  if(value===undefined)return 'null';
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(v=>v===undefined?'null':canonical(v)).join(',')}]`;
  const obj=value as Record<string,unknown>;
  return `{${Object.keys(obj).filter(k=>obj[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
};
const sha256=(v:string|Buffer)=>crypto.createHash('sha256').update(v).digest('hex');
const safeSegment=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);

export function parseEscrowMasterKey(raw:string){
  const value=String(raw||'').trim();
  let key:Buffer;
  if(/^[0-9a-f]{64}$/i.test(value))key=Buffer.from(value,'hex');
  else { try{key=Buffer.from(value,'base64url')}catch{throw new Error('ESCROW_MASTER_KEY_INVALID')} }
  if(key.length!==32)throw new Error('ESCROW_MASTER_KEY_MUST_BE_32_BYTES');
  return key;
}

function quorumRequired(record:EscrowSessionRecord){
  const count=record.requiredJudgeIds.length;
  if(record.approvalMode==='all_assigned')return count;
  return Math.min(count,Math.max(1,record.minimumApprovals||1));
}

export function escrowQuestionReady(record:EscrowSessionRecord,questionIndex:number){
  const q=record.questions.find(x=>x.index===questionIndex);
  if(!q)return {ready:false,reason:'QUESTION_NOT_FOUND' as const,approved:0,required:quorumRequired(record)};
  if(record.state!=='ACTIVE')return {ready:false,reason:record.state as 'REVOKED'|'EXPIRED',approved:q.approvals.length,required:quorumRequired(record)};
  if(Date.parse(record.expiresAt)<=Date.now())return {ready:false,reason:'EXPIRED' as const,approved:q.approvals.length,required:quorumRequired(record)};
  if(!record.participantPresence)return {ready:false,reason:'PARTICIPANT_NOT_PRESENT' as const,approved:q.approvals.length,required:quorumRequired(record)};
  const approved=new Set(q.approvals.map(a=>a.judgeId));
  const count=record.requiredJudgeIds.filter(id=>approved.has(id)).length;
  const required=quorumRequired(record);
  return count>=required?{ready:true,reason:'READY' as const,approved:count,required}:{ready:false,reason:'JUDGE_APPROVALS_REQUIRED' as const,approved:count,required};
}

export class QuestionEscrowRepository {
  private key:Buffer;
  constructor(private dir:string, masterKey:string){this.key=parseEscrowMasterKey(masterKey);fs.mkdirSync(dir,{recursive:true,mode:0o700});}
  private file(sessionId:string){return path.join(this.dir,`question-escrow-${safeSegment(sessionId)}.json`)}
  private read(sessionId:string):EscrowSessionRecord{
    const file=this.file(sessionId);if(!fs.existsSync(file))throw new Error('ESCROW_SESSION_NOT_FOUND');
    const record=JSON.parse(fs.readFileSync(file,'utf8')) as EscrowSessionRecord;
    if(record.state==='ACTIVE'&&Date.parse(record.expiresAt)<=Date.now()){record.state='EXPIRED';this.write(record);}
    return record;
  }
  private write(record:EscrowSessionRecord){const file=this.file(record.sessionId),tmp=`${file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(record),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file);}
  private aad(input:{organizationId:string;competitionId:string;sessionId:string;participantId:string;questionIndex:number;questionId:string;commitmentHash:string}){return canonical(input)}
  private encrypt(payload:Record<string,unknown>,meta:{organizationId:string;competitionId:string;sessionId:string;participantId:string;questionIndex:number;questionId:string;commitmentHash:string}):EncryptedPayload{
    const iv=crypto.randomBytes(12),aad=this.aad(meta);const cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(aad));const ciphertext=Buffer.concat([cipher.update(Buffer.from(canonical(payload))),cipher.final()]);return {iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url'),aadHash:sha256(aad)};
  }
  private decrypt(q:EscrowQuestionRecord,record:EscrowSessionRecord){
    const aad=this.aad({organizationId:record.organizationId,competitionId:record.competitionId,sessionId:record.sessionId,participantId:record.participantId,questionIndex:q.index,questionId:q.questionId,commitmentHash:q.commitmentHash});
    if(sha256(aad)!==q.encrypted.aadHash)throw new Error('ESCROW_AAD_MISMATCH');const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(q.encrypted.iv,'base64url'));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(q.encrypted.tag,'base64url'));const plain=Buffer.concat([decipher.update(Buffer.from(q.encrypted.ciphertext,'base64url')),decipher.final()]).toString('utf8');const payload=JSON.parse(plain) as Record<string,unknown>;if(sha256(canonical(payload))!==q.commitmentHash)throw new Error('ESCROW_COMMITMENT_MISMATCH');return payload;
  }

  private createCanary(record:EscrowSessionRecord,q:EscrowQuestionRecord,judgeId:string,exposedAt:string){
    const canaryId=crypto.randomUUID();const body=Buffer.from(canonical({v:'MZC1',canaryId,sessionId:record.sessionId,questionIndex:q.index,judgeId,exposedAt})).toString('base64url');const sig=crypto.createHmac('sha256',this.key).update(body).digest('base64url');const token=`MZC1.${body}.${sig}`;return {canaryId,token,tokenHash:sha256(token)};
  }
  traceCanary(token:string){const [v,body,sig]=String(token||'').split('.');if(v!=='MZC1'||!body||!sig)throw new Error('ESCROW_CANARY_MALFORMED');const expected=crypto.createHmac('sha256',this.key).update(body).digest('base64url');if(expected.length!==sig.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))throw new Error('ESCROW_CANARY_INVALID');const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as {v:string;canaryId:string;sessionId:string;questionIndex:number;judgeId:string;exposedAt:string};const r=this.read(payload.sessionId),q=r.questions.find(x=>x.index===payload.questionIndex);const receipt=q?.exposureReceipts.find(x=>x.canaryId===payload.canaryId&&x.judgeId===payload.judgeId&&x.canaryTokenHash===sha256(token));if(!receipt)throw new Error('ESCROW_CANARY_NOT_FOUND');return {...payload,verified:true,competitionId:r.competitionId,committeeId:r.committeeId};
  }
  exposureRadius(sessionId:string){const r=this.read(sessionId);const exposed=[...new Set(r.questions.flatMap(q=>q.exposureReceipts.map(x=>x.judgeId)))];const unexpected=exposed.filter(id=>!r.requiredJudgeIds.includes(id));return {sessionId:r.sessionId,competitionId:r.competitionId,allowedRecipientCount:r.requiredJudgeIds.length,uniqueExposedRecipients:exposed.length,unexpectedRecipientCount:unexpected.length,unexpectedRecipientIds:unexpected.map(id=>sha256(`${r.sessionId}|${id}`).slice(0,16)),withinConfiguredRadius:unexpected.length===0&&exposed.length<=r.requiredJudgeIds.length,questionExposureCounts:r.questions.map(q=>({questionIndex:q.index,uniqueRecipients:new Set(q.exposureReceipts.map(x=>x.judgeId)).size,totalReveals:q.exposureReceipts.length}))};}
  custodyCorridor(sessionId:string){const r=this.read(sessionId);const qs=r.questions.map(q=>{const ready=escrowQuestionReady(r,q.index);return {questionIndex:q.index,commitmentHash:q.commitmentHash,state:q.releasedAt?'RELEASED':ready.reason==='JUDGE_APPROVALS_REQUIRED'?'QUORUM_PENDING':r.participantPresence?'PRESENCE_VERIFIED':'SEALED',approved:ready.approved,required:ready.required,exposureCount:q.exposureReceipts.length}});return {sessionId:r.sessionId,competitionId:r.competitionId,participantPresent:!!r.participantPresence,state:r.state,questions:qs,plaintextIncluded:false};}

  create(input:EscrowSessionInput){
    if(!input.sessionId||!input.participantId||!input.competitionId||!input.organizationId)throw new Error('ESCROW_SCOPE_REQUIRED');
    const judges=[...new Set(input.requiredJudgeIds.filter(Boolean))];if(!judges.length)throw new Error('ESCROW_JUDGES_REQUIRED');
    if(input.approvalMode==='minimum'&&(!input.minimumApprovals||input.minimumApprovals<1||input.minimumApprovals>judges.length))throw new Error('ESCROW_INVALID_QUORUM');
    if(!input.questions.length)throw new Error('ESCROW_QUESTIONS_REQUIRED');if(Date.parse(input.expiresAt)<=Date.now())throw new Error('ESCROW_EXPIRY_REQUIRED');
    if(fs.existsSync(this.file(input.sessionId)))throw new Error('ESCROW_SESSION_EXISTS');
    const base={organizationId:input.organizationId,competitionId:input.competitionId,sessionId:input.sessionId,participantId:input.participantId};
    const questions=input.questions.map(item=>{const commitmentHash=sha256(canonical(item.payload));return {index:item.index,questionId:item.questionId,commitmentHash,encrypted:this.encrypt(item.payload,{...base,questionIndex:item.index,questionId:item.questionId,commitmentHash}),approvals:[],exposureReceipts:[]} as EscrowQuestionRecord});
    const record:EscrowSessionRecord={version:2,...base,committeeId:input.committeeId,requiredJudgeIds:judges,approvalMode:input.approvalMode,minimumApprovals:input.minimumApprovals,expiresAt:input.expiresAt,state:'ACTIVE',createdAt:new Date().toISOString(),questions,replacementHistory:[]};this.write(record);return this.publicState(record);
  }
  publicState(recordOrId:EscrowSessionRecord|string){const r=typeof recordOrId==='string'?this.read(recordOrId):recordOrId;return {version:r.version,organizationId:r.organizationId,competitionId:r.competitionId,sessionId:r.sessionId,participantId:r.participantId,committeeId:r.committeeId,state:r.state,expiresAt:r.expiresAt,presenceVerified:!!r.participantPresence,questions:r.questions.map(q=>({index:q.index,commitmentHash:q.commitmentHash,approved:q.approvals.length,required:quorumRequired(r),released:!!q.releasedAt,releasedAt:q.releasedAt,exposureCount:q.exposureReceipts.length})),replacementCount:(r.replacementHistory||[]).length};}
  verifyActor(record:EscrowSessionRecord,actor:EscrowActor){if(actor.organizationId!==record.organizationId)throw new Error('ESCROW_ORGANIZATION_MISMATCH');if(actor.competitionId&&actor.competitionId!==record.competitionId)throw new Error('ESCROW_COMPETITION_MISMATCH');if(actor.role!=='judge'||!record.requiredJudgeIds.includes(actor.uid))throw new Error('ESCROW_ASSIGNED_JUDGE_REQUIRED');}
  confirmPresence(sessionId:string,actor:EscrowActor,participantId:string,participantPassId?:string){const r=this.read(sessionId);this.verifyActor(r,actor);if(r.state!=='ACTIVE')throw new Error(`ESCROW_${r.state}`);if(participantId!==r.participantId)throw new Error('ESCROW_PARTICIPANT_MISMATCH');r.participantPresence={verifiedAt:new Date().toISOString(),verifiedByJudgeId:actor.uid,participantPassId};this.write(r);return this.publicState(r);}
  approve(sessionId:string,questionIndex:number,actor:EscrowActor){const r=this.read(sessionId);this.verifyActor(r,actor);const q=r.questions.find(x=>x.index===questionIndex);if(!q)throw new Error('ESCROW_QUESTION_NOT_FOUND');if(!r.participantPresence)throw new Error('ESCROW_PARTICIPANT_NOT_PRESENT');if(!q.approvals.some(a=>a.judgeId===actor.uid))q.approvals.push({judgeId:actor.uid,approvedAt:new Date().toISOString()});const ready=escrowQuestionReady(r,questionIndex);if(ready.ready&&!q.releasedAt)q.releasedAt=new Date().toISOString();this.write(r);return {...this.publicState(r),ready};}
  reveal(sessionId:string,questionIndex:number,actor:EscrowActor){const r=this.read(sessionId);this.verifyActor(r,actor);const q=r.questions.find(x=>x.index===questionIndex);if(!q)throw new Error('ESCROW_QUESTION_NOT_FOUND');const ready=escrowQuestionReady(r,questionIndex);if(!ready.ready||!q.releasedAt)throw new Error(`ESCROW_NOT_RELEASED:${ready.reason}`);const payload=this.decrypt(q,r),exposedAt=new Date().toISOString(),canary=this.createCanary(r,q,actor.uid,exposedAt);q.exposureReceipts.push({judgeId:actor.uid,exposedAt,canaryId:canary.canaryId,canaryTokenHash:canary.tokenHash});this.write(r);return {payload,commitmentHash:q.commitmentHash,releasedAt:q.releasedAt,exposureReceipt:{judgeId:actor.uid,exposedAt,canaryId:canary.canaryId,canaryToken:canary.token}};}

  replaceQuestion(sessionId:string,input:{questionIndex:number;questionId:string;payload:Record<string,unknown>;reason:string;authorizedBy:string}){
    const r=this.read(sessionId);if(r.state!=='ACTIVE')throw new Error(`ESCROW_${r.state}`);if((r.replacementHistory||[]).length>=1)throw new Error('ESCROW_REPLACEMENT_LIMIT_REACHED');
    const position=r.questions.findIndex(x=>x.index===input.questionIndex);if(position<0)throw new Error('ESCROW_QUESTION_NOT_FOUND');const current=r.questions[position];
    if(!current.releasedAt)throw new Error('ESCROW_REPLACEMENT_REQUIRES_STARTED_QUESTION');
    const commitmentHash=sha256(canonical(input.payload));const meta={organizationId:r.organizationId,competitionId:r.competitionId,sessionId:r.sessionId,participantId:r.participantId,questionIndex:input.questionIndex,questionId:input.questionId,commitmentHash};
    const next:EscrowQuestionRecord={index:input.questionIndex,questionId:input.questionId,commitmentHash,encrypted:this.encrypt(input.payload,meta),approvals:[],exposureReceipts:[]};
    r.replacementHistory=r.replacementHistory||[];r.replacementHistory.push({questionIndex:input.questionIndex,replacedAt:new Date().toISOString(),reason:input.reason||'Emergency replacement',authorizedBy:input.authorizedBy,retiredQuestion:current,newQuestionId:input.questionId,newCommitmentHash:commitmentHash});r.questions[position]=next;this.write(r);return this.publicState(r);
  }
  internalRecord(sessionId:string){return this.read(sessionId)}
  status(sessionId:string,actor:EscrowActor){const r=this.read(sessionId);this.verifyActor(r,actor);return this.publicState(r);}
  revoke(sessionId:string,reason:string){const r=this.read(sessionId);if(r.state!=='ACTIVE')return this.publicState(r);r.state='REVOKED';r.revokedAt=new Date().toISOString();r.revocationReason=reason||'Administrative revocation';this.write(r);return this.publicState(r);}
}
