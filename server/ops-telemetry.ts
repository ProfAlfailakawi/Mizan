import fs from 'fs';
import path from 'path';

export type TelemetrySubject='user'|'device'|'display'|'judge_client'|'kiosk'|'broadcast'|'edge'|'service';
export type JobStatus='QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'STUCK'|'CANCELLED';
export type CompetitionState='SCHEDULED'|'CHECKIN'|'LIVE'|'PAUSED'|'ENDED'|'UNKNOWN';

export interface HeartbeatRecord{
  id:string; tenantId:string; competitionId?:string; subjectType:TelemetrySubject; subjectId:string; role?:string; name?:string; version?:string; buildId?:string; status:'ONLINE'|'DEGRADED'|'OFFLINE'; lastSeenAt:string; firstSeenAt:string; sequence:number; meta:Record<string,unknown>;
}
export interface BackgroundJobRecord{
  id:string; tenantId?:string; competitionId?:string; jobType:string; status:JobStatus; queue?:string; workerId?:string; leaseExpiresAt?:string; attempts:number; idempotencyKey?:string; errorCode?:string; lastRunAt:string; updatedAt:string; meta:Record<string,unknown>;
}
export interface LiveCompetitionRecord{
  tenantId:string; competitionId:string; state:CompetitionState; phase?:string; participantsPresent?:number; participantsTotal?:number; activeJudgingSessions?:number; queueDepth?:number; committeesOnline?:number; lastScoreReceivedAt?:string; lastEventAt:string; updatedAt:string; meta:Record<string,unknown>;
}
export interface NotificationDeliveryRecord{
  id:string; tenantId?:string; competitionId?:string; channel:string; provider:string; status:'ACCEPTED'|'DELIVERED'|'FAILED'|'RETRYING'; statusCode?:number; retryable?:boolean; idempotencyKey?:string; recordedAt:string; latencyMs?:number; errorCode?:string;
}
export interface TelemetrySummary{
  configured:boolean; generatedAt:string; windows:{heartbeatOnlineMs:number; staleJobGraceMs:number; notificationWindowMs:number}; connectedUsers:number|null; connectedDevices:number|null; liveCompetitions:number|null; backgroundJobs:{configured:boolean; running:number; stuck:number; failed:number; lastUpdatedAt:string|null}; notifications:{configured:boolean; providers:string[]; attempts:number; failures:number; failureRate:number|null; lastRecordedAt:string|null}; tenants:Record<string,{connectedUsers:number;connectedDevices:number;liveCompetitions:number;stuckJobs:number;failedNotifications:number}>;
  staleHeartbeats:HeartbeatRecord[]; live:LiveCompetitionRecord[]; jobs:BackgroundJobRecord[];
}

const now=()=>new Date().toISOString();
const safe=(x:string)=>x.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120)||'unknown';
function strip(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const out:Record<string,unknown>={};
  for(const [k,v] of Object.entries(value as Record<string,unknown>)){
    if(/password|totp|secret|token|private.*key|signing.*key|api.*key/i.test(k))out[k]='[REDACTED]';
    else if(v&&typeof v==='object')out[k]=Array.isArray(v)?v.slice(0,20):strip(v);
    else out[k]=v;
  }
  return out;
}
function readJson<T>(file:string,fallback:T):T{try{return JSON.parse(fs.readFileSync(file,'utf8')) as T}catch{return fallback}}
function writeJson(file:string,value:unknown){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file)}

export class OpsTelemetryRepository{
  private heartbeatFile:string; private jobsFile:string; private liveFile:string; private notificationsFile:string;
  constructor(private dir:string){
    if(!dir)throw new Error('OPS_TELEMETRY_DIR_REQUIRED');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    this.heartbeatFile=path.join(dir,'heartbeats.json'); this.jobsFile=path.join(dir,'background-jobs.json'); this.liveFile=path.join(dir,'live-competitions.json'); this.notificationsFile=path.join(dir,'notification-deliveries.json');
    for(const file of [this.heartbeatFile,this.jobsFile,this.liveFile,this.notificationsFile])if(!fs.existsSync(file))writeJson(file,[]);
  }
  recordHeartbeat(input:{tenantId:string;competitionId?:string;subjectType:TelemetrySubject;subjectId:string;role?:string;name?:string;version?:string;buildId?:string;status?:'ONLINE'|'DEGRADED'|'OFFLINE';sequence?:number;meta?:Record<string,unknown>}){
    if(!input.tenantId||!input.subjectId)throw new Error('HEARTBEAT_SCOPE_REQUIRED');
    const rows=readJson<HeartbeatRecord[]>(this.heartbeatFile,[]); const id=`${safe(input.tenantId)}:${safe(input.competitionId||'platform')}:${safe(input.subjectType)}:${safe(input.subjectId)}`;
    const existing=rows.find(x=>x.id===id); const row:HeartbeatRecord={id,tenantId:input.tenantId,competitionId:input.competitionId,subjectType:input.subjectType,subjectId:input.subjectId,role:input.role,name:input.name,version:input.version,buildId:input.buildId,status:input.status||'ONLINE',firstSeenAt:existing?.firstSeenAt||now(),lastSeenAt:now(),sequence:Math.max(Number(existing?.sequence||0)+1,Number(input.sequence||0)),meta:strip(input.meta)};
    writeJson(this.heartbeatFile,[row,...rows.filter(x=>x.id!==id)].slice(0,5000)); return row;
  }
  recordJob(input:{id?:string;tenantId?:string;competitionId?:string;jobType:string;status:JobStatus;queue?:string;workerId?:string;leaseExpiresAt?:string;attempts?:number;idempotencyKey?:string;errorCode?:string;meta?:Record<string,unknown>}){
    if(!input.jobType)throw new Error('JOB_TYPE_REQUIRED'); const rows=readJson<BackgroundJobRecord[]>(this.jobsFile,[]); const id=input.id||input.idempotencyKey||`${safe(input.jobType)}:${Date.now()}`; const previous=rows.find(x=>x.id===id);
    const row:BackgroundJobRecord={id,tenantId:input.tenantId,competitionId:input.competitionId,jobType:input.jobType,status:input.status,queue:input.queue,workerId:input.workerId,leaseExpiresAt:input.leaseExpiresAt,attempts:input.attempts??previous?.attempts??0,idempotencyKey:input.idempotencyKey,errorCode:input.errorCode,lastRunAt:input.status==='RUNNING'||!previous?now():previous.lastRunAt,updatedAt:now(),meta:strip(input.meta)};
    writeJson(this.jobsFile,[row,...rows.filter(x=>x.id!==id)].slice(0,5000)); return row;
  }
  recordLive(input:{tenantId:string;competitionId:string;state:CompetitionState;phase?:string;participantsPresent?:number;participantsTotal?:number;activeJudgingSessions?:number;queueDepth?:number;committeesOnline?:number;lastScoreReceivedAt?:string;meta?:Record<string,unknown>}){
    if(!input.tenantId||!input.competitionId)throw new Error('LIVE_COMPETITION_SCOPE_REQUIRED'); const rows=readJson<LiveCompetitionRecord[]>(this.liveFile,[]);
    const row:LiveCompetitionRecord={tenantId:input.tenantId,competitionId:input.competitionId,state:input.state,phase:input.phase,participantsPresent:input.participantsPresent,participantsTotal:input.participantsTotal,activeJudgingSessions:input.activeJudgingSessions,queueDepth:input.queueDepth,committeesOnline:input.committeesOnline,lastScoreReceivedAt:input.lastScoreReceivedAt,lastEventAt:now(),updatedAt:now(),meta:strip(input.meta)};
    writeJson(this.liveFile,[row,...rows.filter(x=>!(x.tenantId===input.tenantId&&x.competitionId===input.competitionId))].slice(0,2000)); return row;
  }
  recordNotification(input:{tenantId?:string;competitionId?:string;channel:string;provider:string;status:'ACCEPTED'|'DELIVERED'|'FAILED'|'RETRYING';statusCode?:number;retryable?:boolean;idempotencyKey?:string;latencyMs?:number;errorCode?:string}){
    const row:NotificationDeliveryRecord={id:`ntf:${Date.now()}:${Math.random().toString(16).slice(2)}`,tenantId:input.tenantId,competitionId:input.competitionId,channel:input.channel,provider:input.provider,status:input.status,statusCode:input.statusCode,retryable:input.retryable,idempotencyKey:input.idempotencyKey,latencyMs:input.latencyMs,errorCode:input.errorCode,recordedAt:now()};
    const rows=readJson<NotificationDeliveryRecord[]>(this.notificationsFile,[]); writeJson(this.notificationsFile,[row,...rows].slice(0,10000)); return row;
  }
  summary(input?:{providerConfigured?:boolean;heartbeatOnlineMs?:number;staleJobGraceMs?:number;notificationWindowMs?:number}):TelemetrySummary{
    const heartbeatOnlineMs=input?.heartbeatOnlineMs||120_000, staleJobGraceMs=input?.staleJobGraceMs||180_000, notificationWindowMs=input?.notificationWindowMs||900_000, t=Date.now();
    const heartbeats=readJson<HeartbeatRecord[]>(this.heartbeatFile,[]), jobs=readJson<BackgroundJobRecord[]>(this.jobsFile,[]), live=readJson<LiveCompetitionRecord[]>(this.liveFile,[]), notifications=readJson<NotificationDeliveryRecord[]>(this.notificationsFile,[]);
    const online=heartbeats.filter(h=>h.status==='ONLINE'&&Date.parse(h.lastSeenAt)>t-heartbeatOnlineMs); const stale=heartbeats.filter(h=>h.status!=='OFFLINE'&&Date.parse(h.lastSeenAt)<=t-heartbeatOnlineMs);
    const liveNow=live.filter(x=>['CHECKIN','LIVE','PAUSED'].includes(x.state)&&Date.parse(x.updatedAt)>t-heartbeatOnlineMs*3); const stuckJobs=jobs.filter(j=>j.status==='STUCK'||(j.status==='RUNNING'&&j.leaseExpiresAt&&Date.parse(j.leaseExpiresAt)<t-staleJobGraceMs)); const failedJobs=jobs.filter(j=>j.status==='FAILED'&&Date.parse(j.updatedAt)>t-86400_000);
    const recentNotifications=notifications.filter(n=>Date.parse(n.recordedAt)>t-notificationWindowMs); const failures=recentNotifications.filter(n=>n.status==='FAILED').length; const tenants:TelemetrySummary['tenants']={};
    const touch=(tenantId:string)=>tenants[tenantId] ||= {connectedUsers:0,connectedDevices:0,liveCompetitions:0,stuckJobs:0,failedNotifications:0};
    for(const h of online){const x=touch(h.tenantId); if(h.subjectType==='user')x.connectedUsers++; else x.connectedDevices++;}
    for(const c of liveNow)touch(c.tenantId).liveCompetitions++;
    for(const j of stuckJobs)if(j.tenantId)touch(j.tenantId).stuckJobs++;
    for(const n of recentNotifications.filter(n=>n.status==='FAILED'&&n.tenantId))touch(n.tenantId!).failedNotifications++;
    return {configured:true,generatedAt:now(),windows:{heartbeatOnlineMs,staleJobGraceMs,notificationWindowMs},connectedUsers:heartbeats.length?online.filter(h=>h.subjectType==='user').length:null,connectedDevices:heartbeats.length?online.filter(h=>h.subjectType!=='user').length:null,liveCompetitions:live.length?liveNow.length:null,backgroundJobs:{configured:jobs.length>0,running:jobs.filter(j=>j.status==='RUNNING').length,stuck:stuckJobs.length,failed:failedJobs.length,lastUpdatedAt:jobs[0]?.updatedAt||null},notifications:{configured:!!input?.providerConfigured||recentNotifications.length>0,providers:[...new Set(notifications.map(n=>n.provider).filter(Boolean))],attempts:recentNotifications.length,failures,failureRate:recentNotifications.length?failures/recentNotifications.length:null,lastRecordedAt:notifications[0]?.recordedAt||null},tenants,staleHeartbeats:stale.slice(0,50),live:liveNow,jobs:jobs.slice(0,100)};
  }
}
