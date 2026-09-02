import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type ServerAuditInput={
  eventId:string;
  organizationId:string;
  competitionId:string;
  action:string;
  entityType:string;
  entityId:string;
  reason?:string;
  humanSummaryEnglish?:string;
  clientTimestamp?:string;
  sessionId?:string;
  authenticationAssurance?:string;
  deviceId?:string;
  requestId?:string;
};
export type ServerAuditActor={uid:string;role:string;organizationId:string;competitionId?:string};
export type ServerAuditRow=ServerAuditInput&{
  sequence:number;
  actorId:string;
  actorRole:string;
  serverTimestamp:string;
  previousHash:string;
  hash:string;
};
const canonical=(v:unknown):string=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`};
const digest=(x:string)=>crypto.createHash('sha256').update(x).digest('hex');
const safe=(x:string)=>x.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);

export class ServerAuditLedgerRepository{
  constructor(private dir:string){if(!dir)throw new Error('AUDIT_LEDGER_DIR_REQUIRED');fs.mkdirSync(dir,{recursive:true,mode:0o700});}
  private file(org:string,competition:string){return path.join(this.dir,`audit-${safe(org)}-${safe(competition)}.jsonl`)}
  private rows(org:string,competition:string){const file=this.file(org,competition);if(!fs.existsSync(file))return [] as ServerAuditRow[];try{return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x) as ServerAuditRow)}catch{throw new Error('AUDIT_LEDGER_CORRUPT')}}
  append(actor:ServerAuditActor,input:ServerAuditInput){
    if(!input.eventId||!input.competitionId||!input.action||!input.entityType||!input.entityId)throw new Error('AUDIT_EVENT_INVALID');
    if(actor.organizationId!==input.organizationId)throw new Error('AUDIT_TENANT_MISMATCH');
    if(actor.competitionId&&actor.competitionId!==input.competitionId)throw new Error('AUDIT_COMPETITION_MISMATCH');
    const rows=this.rows(input.organizationId,input.competitionId);const duplicate=rows.find(x=>x.eventId===input.eventId);if(duplicate)return {row:duplicate,idempotent:true};
    const previousHash=rows.at(-1)?.hash||'GENESIS';const sequence=rows.length+1;const serverTimestamp=new Date().toISOString();
    const base={...input,sequence,actorId:actor.uid,actorRole:actor.role,serverTimestamp,previousHash};const row:ServerAuditRow={...base,hash:digest(`${previousHash}|${canonical(base)}`)};
    fs.appendFileSync(this.file(input.organizationId,input.competitionId),JSON.stringify(row)+'\n',{encoding:'utf8',mode:0o600});return {row,idempotent:false};
  }
  list(actor:ServerAuditActor,competitionId:string,limit=500){if(actor.competitionId&&actor.competitionId!==competitionId)throw new Error('AUDIT_COMPETITION_MISMATCH');return this.rows(actor.organizationId,competitionId).slice(-Math.max(1,Math.min(5000,limit))).reverse()}
  verify(organizationId:string,competitionId:string){const rows=this.rows(organizationId,competitionId);let previous='GENESIS';for(let i=0;i<rows.length;i++){const r=rows[i];const {hash,...base}=r;const expected=digest(`${previous}|${canonical(base)}`);if(r.sequence!==i+1||r.previousHash!==previous||r.hash!==expected||r.organizationId!==organizationId||r.competitionId!==competitionId)return {valid:false,count:rows.length,failedSequence:r.sequence,lastHash:previous};previous=r.hash}return {valid:true,count:rows.length,lastHash:previous}}
}
