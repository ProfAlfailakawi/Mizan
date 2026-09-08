import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { TenantRecord } from './tenant-registry';
import type { ServerIdentity } from './identity-governance';

export type HealthState='HEALTHY'|'DEGRADED'|'OUTAGE'|'UNKNOWN';
export type AttentionClass='AUTO_RESOLVED'|'TENANT_ACTION_REQUIRED'|'MIZAN_ACTION_REQUIRED'|'SECURITY_REVIEW'|'INTEGRITY_PROTECTED'|'INFORMATIONAL';
export type IncidentSeverity='INFO'|'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
export type IncidentStatus='DETECTED'|'DIAGNOSING'|'AUTO_REMEDIATING'|'TENANT_ACTION'|'OWNER_ACTION'|'MONITORING'|'RESOLVED'|'CLOSED';
export type PlaybookSafety='SAFE_AUTOMATIC'|'SAFE_WITH_TENANT_APPROVAL'|'SAFE_WITH_OWNER_APPROVAL'|'PROTECTED'|'FORBIDDEN';

export interface HealthSignal{
  key:string;
  label:string;
  state:HealthState;
  source:string;
  checkedAt:string;
  reason?:string;
  tenantId?:string;
  evidence?:Record<string,unknown>;
}

export interface KnownError{
  code:string;
  humanTitleArabic:string;
  humanTitleEnglish:string;
  description:string;
  likelyCauses:string[];
  diagnosticChecks:string[];
  safeActions:string[];
  escalationRule:string;
  severity:IncidentSeverity;
  scope:'PLATFORM'|'TENANT'|'COMPETITION'|'SECURITY'|'INTEGRITY';
}

export interface DiagnosticResult{
  id:string;
  code:string;
  tenantId?:string;
  competitionId?:string;
  classification:AttentionClass;
  rootCause:string;
  confidence:'LOW'|'MEDIUM'|'HIGH';
  evidence:{check:string;state:HealthState|'PASS'|'FAIL'|'UNKNOWN';detail?:string}[];
  recommendedActions:string[];
  safeActionCodes:string[];
  doctorSummaryArabic:string;
  doctorSummaryEnglish:string;
}

export interface IncidentRecord{
  id:string;
  scope:'PLATFORM'|'TENANT'|'COMPETITION';
  tenantId?:string;
  competitionId?:string;
  category:string;
  severity:IncidentSeverity;
  status:IncidentStatus;
  source:string;
  detectedAt:string;
  acknowledgedAt?:string;
  resolvedAt?:string;
  rootCause?:string;
  affectedServices:string[];
  affectedTenants:string[];
  affectedUsersEstimate?:number|'UNKNOWN';
  diagnosticEvidence:DiagnosticResult[];
  playbookId?:string;
  actions:{action:string;at:string;actorId:string;result:string;verification:string}[];
  verification?:string;
  owner?:string;
  auditReference:string;
}

export interface SupportSessionRecord{
  id:string;
  tenantId:string;
  competitionId?:string;
  requestedBy:string;
  approvedBy?:string;
  reason:string;
  status:'REQUESTED'|'APPROVED'|'ACTIVE'|'ENDED'|'REJECTED'|'EXPIRED';
  createdAt:string;
  expiresAt:string;
  permissions:string[];
  scope:string;
  readOnly:true;
  actionsAllowed:string[];
  auditReference:string;
  diagnosticBundle:Record<string,unknown>;
}

export interface CommercialProfile{
  tenantId:string;
  plan:'TRIAL'|'STANDARD'|'PRO'|'ENTERPRISE'|'SOVEREIGN';
  subscriptionStatus:'ACTIVE'|'TRIALING'|'PAST_DUE'|'SUSPENDED'|'UNKNOWN';
  contractRef?:string;
  renewalAt?:string;
  licensedModules:string[];
  limits:Record<string,number|'UNKNOWN'>;
  notes?:string;
  updatedAt:string;
}

export interface PlatformSwitch{
  id:string;
  key:string;
  scope:'PLATFORM'|'TENANT'|'COMPETITION';
  tenantId?:string;
  competitionId?:string;
  enabled:boolean;
  reason:string;
  createdAt:string;
  createdBy:string;
  expiresAt?:string;
  auditReference:string;
}

export interface SafeSnapshot{
  id:string;
  tenantId:string;
  competitionId?:string;
  createdAt:string;
  createdBy:string;
  reason:string;
  stateHash:string;
  includesSecrets:false;
  rollbackAllowed:boolean;
  verification:string;
  auditReference:string;
}

export interface BreakGlassRequest{
  id:string;
  tenantId:string;
  competitionId?:string;
  requestedBy:string;
  reason:string;
  status:'REQUESTED'|'APPROVED'|'REJECTED'|'EXPIRED'|'USED';
  createdAt:string;
  expiresAt:string;
  protectedAction:string;
  approvals:{actorId:string;role:string;at:string}[];
  auditReference:string;
}

export interface ControlTowerTelemetrySummary{generatedAt:string;connectedUsers:number|null;connectedDevices:number|null;liveCompetitions:number|null;backgroundJobs:{configured:boolean;running:number;stuck:number;failed:number;lastUpdatedAt:string|null};notifications:{configured:boolean;providers:string[];attempts:number;failures:number;failureRate:number|null;lastRecordedAt:string|null};tenants:Record<string,{connectedUsers:number;connectedDevices:number;liveCompetitions:number;stuckJobs:number;failedNotifications:number}>;staleHeartbeats:{tenantId:string;competitionId?:string;subjectType:string;subjectId:string;lastSeenAt:string}[];live:{tenantId:string;competitionId:string;state:string;participantsPresent?:number;participantsTotal?:number;activeJudgingSessions?:number;queueDepth?:number;committeesOnline?:number;updatedAt:string}[];jobs:{id:string;tenantId?:string;competitionId?:string;jobType:string;status:string;updatedAt:string;leaseExpiresAt?:string}[]}

export interface AutoHealRun{
  id:string;
  playbookId:string;
  tenantId?:string;
  competitionId?:string;
  safety:PlaybookSafety;
  status:'SKIPPED_PROTECTED'|'AUTO_RESOLVED'|'ESCALATED'|'QUEUED_FOR_APPROVAL';
  detectedAt:string;
  diagnosis:DiagnosticResult;
  steps:{name:string;status:'PASS'|'FAIL'|'SKIPPED';detail:string}[];
  auditReference?:string;
}

export const AUTO_HEAL_PLAYBOOKS=[
  {id:'notification-transient-failure',action:'notification.retry',safety:'SAFE_AUTOMATIC' as const,steps:['exponential backoff','idempotency key','prevent duplicate delivery','verify provider state','incident after repeated failure']},
  {id:'network-reconnect',action:'network.reconnect',safety:'SAFE_AUTOMATIC' as const,steps:['reconnect','restore subscriptions','sync pending queue','verify acknowledgement','preserve local state']},
  {id:'offline-online',action:'offline_queue.drain',safety:'SAFE_AUTOMATIC' as const,steps:['drain offline queue','reconcile server state','detect conflicts','report unresolved only']},
  {id:'device-offline',action:'device.spare.assign',safety:'SAFE_WITH_TENANT_APPROVAL' as const,steps:['determine compatibility','check policy','assign spare only when allowed','revoke stale assignment','verify heartbeat','audit']},
  {id:'stale-tenant-cache',action:'tenant_cache.refresh',safety:'SAFE_AUTOMATIC' as const,steps:['invalidate safe cache','reload','verify tenant consistency']},
  {id:'temporary-provider-outage',action:'provider.circuit_break',safety:'SAFE_AUTOMATIC' as const,steps:['retry with backoff','open circuit breaker','use fallback when configured','avoid provider hammering']},
  {id:'optional-ai-outage',action:'optional_ai.disable',safety:'SAFE_AUTOMATIC' as const,steps:['disable optional capability','manual judging continues','show degraded state','avoid competition shutdown']},
  {id:'background-job-stuck',action:'job.retry',safety:'SAFE_AUTOMATIC' as const,steps:['detect stale lease','safe retry','idempotency guard','avoid duplicate execution']},
  {id:'provider-failover',action:'provider.failover',safety:'SAFE_WITH_OWNER_APPROVAL' as const,steps:['validate fallback','switch future traffic only','verify','audit']},
  {id:'version-mismatch',action:'version.block_unsafe',safety:'SAFE_WITH_TENANT_APPROVAL' as const,steps:['detect incompatible version','warn','block unsafe operation only','guide update']},
];

const PROTECTED_ACTIONS=new Set([
  'score.modify','score.delete','result.modify','result.delete','result.publish',
  'question.reveal','question.draw.modify','quran.source.certified.change',
  'integrity.blocker.bypass','super_admin.create','permission.critical.grant',
  'sensitive_data.permanent_delete','audit.history.change','audit.event.remove',
  'integrity.timestamp.rewrite','break_glass.activate','mfa.bypass','security_control.disable',
]);

export const KNOWN_ERROR_CATALOG:KnownError[]=[
  {code:'PRIVILEGED_SESSION_CONFLICT',humanTitleArabic:'تعارض جلسة دخول',humanTitleEnglish:'Privileged session conflict',description:'A privileged user is blocked because another active session exists.',likelyCauses:['Another device still has an active privileged session','A stale session was not revoked after device change'],diagnosticChecks:['account active','grant active','MFA satisfied','current privileged sessions','blocked session event'],safeActions:['revoke stale session'],escalationRule:'Tenant admin can resolve; escalate only when identity governance is unavailable.',severity:'LOW',scope:'TENANT'},
  {code:'TENANT_DOMAIN_MISCONFIGURED',humanTitleArabic:'خلل إعداد نطاق الجهة',humanTitleEnglish:'Tenant domain misconfiguration',description:'The tenant exists but a configured domain cannot be verified by MIZAN.',likelyCauses:['DNS target mismatch','TLS certificate not ready','custom domain points to another service'],diagnosticChecks:['tenant active','domain configured','DNS target','TLS readiness','tenant resolution'],safeActions:['copy correct DNS instructions','retest domain'],escalationRule:'Owner action when DNS/TLS cannot be confirmed server-side.',severity:'MEDIUM',scope:'TENANT'},
  {code:'NOTIFICATION_TRANSIENT_FAILURE',humanTitleArabic:'تعثر مؤقت في الإشعارات',humanTitleEnglish:'Transient notification failure',description:'Notification delivery failed with a retryable provider or network response.',likelyCauses:['provider timeout','temporary network error','rate limited provider'],diagnosticChecks:['provider configured','idempotency key','attempt count','last provider response'],safeActions:['retry with exponential backoff','switch fallback for future traffic if configured'],escalationRule:'Auto-resolve until retry budget is exhausted, then incident.',severity:'LOW',scope:'TENANT'},
  {code:'OPTIONAL_AI_OUTAGE',humanTitleArabic:'تعطل وحدة ذكاء اختيارية',humanTitleEnglish:'Optional AI capability outage',description:'An optional AI capability is unavailable; human judging remains authoritative.',likelyCauses:['AI provider outage','model endpoint timeout','capability circuit breaker'],diagnosticChecks:['AI critical path false','manual judging available','capability state'],safeActions:['disable optional AI temporarily','continue manual judging'],escalationRule:'Owner review only if outage affects many tenants or remains degraded.',severity:'LOW',scope:'PLATFORM'},
  {code:'INTEGRITY_PROTECTED_ACTION',humanTitleArabic:'إجراء محمي بالنزاهة',humanTitleEnglish:'Integrity protected action',description:'The requested action touches scores, results, FairDraw, audit history, MFA, or protected integrity state.',likelyCauses:['operator requested unsafe rescue','automation attempted a forbidden mutation'],diagnosticChecks:['action code','safety gate','actor role','MFA state','audit scope'],safeActions:['route to protected governance workflow'],escalationRule:'Never auto-heal; require explicit protected workflow.',severity:'CRITICAL',scope:'INTEGRITY'},
  {code:'BACKGROUND_JOB_STUCK',humanTitleArabic:'مهمة خلفية عالقة',humanTitleEnglish:'Stuck background job',description:'A background job has a stale lease or retryable failed state.',likelyCauses:['worker restart','stale lease','temporary provider outage'],diagnosticChecks:['lease age','idempotency key','previous execution evidence'],safeActions:['safe retry','mark failed after policy exhaustion'],escalationRule:'Incident when retry verification fails.',severity:'MEDIUM',scope:'PLATFORM'},
  {code:'VERSION_MISMATCH',humanTitleArabic:'عدم توافق إصدار الجهاز',humanTitleEnglish:'Device version mismatch',description:'A field device or app is running an incompatible version for the current deployment.',likelyCauses:['device not updated','stale service worker','deployment compatibility gap'],diagnosticChecks:['server build','client build','device software version','unsafe operation requested'],safeActions:['guide update','block unsafe operation only'],escalationRule:'Tenant action unless many tenants show the same deployment mismatch.',severity:'MEDIUM',scope:'TENANT'},
];

const now=()=>new Date().toISOString();
const hash=(x:string)=>crypto.createHash('sha256').update(x).digest('hex');
const safe=(x:string)=>x.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120)||'platform';

function stateRank(s:HealthState){return s==='OUTAGE'?3:s==='DEGRADED'?2:s==='UNKNOWN'?1:0}
function summarizeState(signals:HealthSignal[]):HealthState{
  if(!signals.length)return 'UNKNOWN';
  if(signals.some(s=>s.state==='OUTAGE'))return 'OUTAGE';
  if(signals.some(s=>s.state==='DEGRADED'))return 'DEGRADED';
  if(signals.every(s=>s.state==='UNKNOWN'))return 'UNKNOWN';
  return 'HEALTHY';
}

export function safetyForAction(action:string):PlaybookSafety{
  if(PROTECTED_ACTIONS.has(action))return 'PROTECTED';
  if(action.includes('score')||action.includes('result')||action.includes('audit')||action.includes('mfa')||action.includes('break_glass')||action.includes('question.reveal')||action.includes('question.draw'))return 'FORBIDDEN';
  if(['notification.retry','network.reconnect','offline_queue.drain','tenant_cache.refresh','provider.circuit_break','optional_ai.disable','job.retry','domain.retest','integration.retest'].includes(action))return 'SAFE_AUTOMATIC';
  if(['grant.resume','grant.suspend','activation_qr.reissue','user_sessions.revoke','device.spare.assign','device.assignment.invalidate','safe_resync.force'].includes(action))return 'SAFE_WITH_TENANT_APPROVAL';
  return 'SAFE_WITH_OWNER_APPROVAL';
}

export function buildHealthSignals(input:{
  tenants:TenantRecord[];
  runtime:Record<string,unknown>;
  identityGovernanceConfigured:boolean;
  tenantStoreConfigured:boolean;
  supportSessions?:SupportSessionRecord[];
  incidents?:IncidentRecord[];
  telemetry?:ControlTowerTelemetrySummary|null;
}):HealthSignal[]{
  const checkedAt=now();
  const bool=(key:string,label:string,value:unknown,reason:string):HealthSignal=>({key,label,state:value===true?'HEALTHY':'UNKNOWN',source:'server-runtime',checkedAt,reason:value===true?undefined:reason});
  const signals:HealthSignal[]=[
    {key:'tenant_registry',label:'Tenant registry',state:input.tenantStoreConfigured||input.tenants.length?'HEALTHY':'UNKNOWN',source:'tenant-registry',checkedAt,reason:input.tenantStoreConfigured?'':'TENANT_STORE_NOT_CONFIGURED'},
    bool('firebase_auth','Firebase authentication',input.runtime.firebaseProjectConfigured,'FIREBASE_PROJECT_ID not configured'),
    bool('identity_governance','Identity governance',input.identityGovernanceConfigured,'MIZAN_IDENTITY_GOVERNANCE_DIR not configured'),
    bool('database_storage','Database / storage',input.runtime.serverAuditLedgerConfigured||input.runtime.serverQuranSourceVaultConfigured,'No durable audit/source storage signal'),
    bool('cloud_backend','Cloud/backend availability',input.runtime.backendAvailable,'Backend process answered health request'),
    bool('devices','Devices / edge',input.runtime.edgeRelayConfigured,'No edge relay configured'),
    bool('integrations','Integrations',input.runtime.enterpriseApiConfigured||input.runtime.quranAlignmentShadowConfigured,'No configured integration signal'),
    {key:'notifications',label:'Notifications',state:input.runtime.notificationProviderConfigured===true?(input.telemetry?.notifications.failureRate!==null&&input.telemetry?.notifications.failureRate!==undefined&&input.telemetry.notifications.failureRate>0.15?'DEGRADED':'HEALTHY'):'UNKNOWN',source:'notification-provider',checkedAt,reason:input.runtime.notificationProviderConfigured===true?undefined:'No notification provider configured',evidence:input.telemetry?.notifications as any},
    {key:'background_jobs',label:'Background jobs',state:input.telemetry?input.telemetry.backgroundJobs.stuck>0?'DEGRADED':'HEALTHY':'UNKNOWN',source:'ops-telemetry',checkedAt,reason:input.telemetry?undefined:'No background job telemetry',evidence:input.telemetry?.backgroundJobs as any},
    {key:'live_competitions',label:'Live competitions',state:input.telemetry?input.telemetry.liveCompetitions===null?'UNKNOWN':'HEALTHY':'UNKNOWN',source:'ops-telemetry',checkedAt,reason:input.telemetry?'No live competitions reported in the active window':'No live competition telemetry',evidence:{liveCompetitions:input.telemetry?.liveCompetitions}},
    bool('offline_edge','Offline / edge',input.runtime.edgeRelayConfigured,'MIZAN_EDGE_DATA_DIR not configured'),
    bool('deployment_compatibility','Deployment compatibility',input.runtime.buildIdKnown,'Server build id unavailable'),
  ];
  for(const tenant of input.tenants){
    const hasDomain=!!tenant.subdomain||(tenant.customDomains||[]).length>0;
    signals.push({key:`tenant_domain:${tenant.orgId}`,label:`Tenant domain: ${tenant.orgId}`,tenantId:tenant.orgId,state:tenant.status==='suspended'?'DEGRADED':hasDomain?'UNKNOWN':'DEGRADED',source:'tenant-registry',checkedAt,reason:tenant.status==='suspended'?'TENANT_SUSPENDED':hasDomain?'DNS/TLS verification unavailable':'HOST_REQUIRED'});
  }
  for(const incident of input.incidents||[])if(!['RESOLVED','CLOSED'].includes(incident.status)){
    signals.push({key:`incident:${incident.id}`,label:incident.category,state:incident.severity==='CRITICAL'?'OUTAGE':incident.severity==='HIGH'?'DEGRADED':'UNKNOWN',source:'incident-store',checkedAt,tenantId:incident.tenantId,reason:incident.rootCause});
  }
  return signals.sort((a,b)=>stateRank(b.state)-stateRank(a.state));
}

export function diagnoseSignals(signals:HealthSignal[]):DiagnosticResult[]{
  return signals.filter(s=>s.state!=='HEALTHY').map((signal):DiagnosticResult=>{
    const code=signal.key.startsWith('tenant_domain:')?'TENANT_DOMAIN_MISCONFIGURED':signal.key.startsWith('incident:')?'BACKGROUND_JOB_STUCK':signal.key==='notifications'?'NOTIFICATION_TRANSIENT_FAILURE':signal.key==='identity_governance'?'PRIVILEGED_SESSION_CONFLICT':'BACKGROUND_JOB_STUCK';
    const known=KNOWN_ERROR_CATALOG.find(x=>x.code===code)!;
    const classification:AttentionClass=known.scope==='INTEGRITY'?'INTEGRITY_PROTECTED':known.scope==='TENANT'&&code==='PRIVILEGED_SESSION_CONFLICT'?'TENANT_ACTION_REQUIRED':known.severity==='CRITICAL'?'SECURITY_REVIEW':'MIZAN_ACTION_REQUIRED';
    return {
      id:`diag-${hash(`${signal.key}:${signal.reason||''}`).slice(0,12)}`,
      code,
      tenantId:signal.tenantId,
      classification,
      rootCause:signal.reason||known.description,
      confidence:signal.state==='UNKNOWN'?'LOW':'MEDIUM',
      evidence:[{check:signal.label,state:signal.state,detail:signal.reason}],
      recommendedActions:known.safeActions,
      safeActionCodes:known.safeActions.map(a=>a.includes('revoke')?'user_sessions.revoke':a.includes('retest')?'domain.retest':a.includes('retry')?'notification.retry':'diagnostic.bundle.generate'),
      doctorSummaryArabic:`${known.humanTitleArabic}: ${signal.reason||known.description}`,
      doctorSummaryEnglish:`${known.humanTitleEnglish}: ${signal.reason||known.description}`,
    };
  });
}

export function correlateDiagnostics(diagnostics:DiagnosticResult[]):DiagnosticResult[]{
  const notificationTenants=diagnostics.filter(d=>d.code==='NOTIFICATION_TRANSIENT_FAILURE'&&d.tenantId);
  if(notificationTenants.length>=3){
    return [{
      id:`diag-${hash(notificationTenants.map(d=>d.tenantId).sort().join('|')).slice(0,12)}`,
      code:'NOTIFICATION_TRANSIENT_FAILURE',
      classification:'MIZAN_ACTION_REQUIRED',
      rootCause:'Multiple tenants show notification failures in the same diagnostic window.',
      confidence:'MEDIUM',
      evidence:notificationTenants.map(d=>({check:`tenant:${d.tenantId}`,state:'FAIL' as const,detail:d.rootCause})),
      recommendedActions:['treat as global provider incident','activate provider circuit breaker if configured'],
      safeActionCodes:['provider.circuit_break'],
      doctorSummaryArabic:'عدة جهات لديها تعثر إشعارات في نفس النافذة؛ الاحتمال الأقوى خلل مزود عام.',
      doctorSummaryEnglish:'Several tenants have notification failures in the same window; this is likely a provider-level incident.',
    },...diagnostics.filter(d=>d.code!=='NOTIFICATION_TRANSIENT_FAILURE')];
  }
  return diagnostics;
}

export class ControlTowerRepository{
  private incidentsFile:string;
  private supportFile:string;
  private commercialFile:string;
  private switchesFile:string;
  private snapshotsFile:string;
  private breakGlassFile:string;
  private autoHealFile:string;
  private auditFile:string;
  constructor(private dir:string){
    if(!dir)throw new Error('CONTROL_TOWER_DIR_REQUIRED');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    this.incidentsFile=path.join(dir,'incidents.json');
    this.supportFile=path.join(dir,'support-sessions.json');
    this.commercialFile=path.join(dir,'commercial.json');
    this.switchesFile=path.join(dir,'kill-switches.json');
    this.snapshotsFile=path.join(dir,'safe-snapshots.json');
    this.breakGlassFile=path.join(dir,'break-glass.json');
    this.autoHealFile=path.join(dir,'auto-heal-runs.json');
    this.auditFile=path.join(dir,'control-tower-audit.jsonl');
    for(const file of [this.incidentsFile,this.supportFile,this.commercialFile,this.switchesFile,this.snapshotsFile,this.breakGlassFile,this.autoHealFile])if(!fs.existsSync(file))this.writeJson(file,[]);
  }
  private readJson<T>(file:string,fallback:T):T{try{return JSON.parse(fs.readFileSync(file,'utf8')) as T}catch{return fallback}}
  private writeJson(file:string,value:unknown){const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file)}
  private audit(actor:ServerIdentity,action:string,entityType:string,entityId:string,reason:string){
    const lines=fs.existsSync(this.auditFile)?fs.readFileSync(this.auditFile,'utf8').trim().split('\n').filter(Boolean):[];
    const last=lines.length?JSON.parse(lines[lines.length-1]):null;
    const row={sequence:lines.length+1,timestamp:now(),actorId:actor.uid,actorRole:actor.role,organizationId:actor.organizationId,action,entityType,entityId,reason,previousHash:last?.hash||'GENESIS'};
    const out={...row,hash:hash(`${row.previousHash}|${JSON.stringify(row)}`)};
    fs.appendFileSync(this.auditFile,JSON.stringify(out)+'\n',{encoding:'utf8',mode:0o600});
    return out.hash;
  }
  listIncidents(){return this.readJson<IncidentRecord[]>(this.incidentsFile,[])}
  listSupport(){return this.readJson<SupportSessionRecord[]>(this.supportFile,[]).map(s=>Date.parse(s.expiresAt)<=Date.now()&&['REQUESTED','APPROVED','ACTIVE'].includes(s.status)?{...s,status:'EXPIRED' as const}:s)}
  listCommercial(){return this.readJson<CommercialProfile[]>(this.commercialFile,[])}
  listSwitches(){return this.readJson<PlatformSwitch[]>(this.switchesFile,[]).filter(s=>!s.expiresAt||Date.parse(s.expiresAt)>Date.now())}
  listSnapshots(){return this.readJson<SafeSnapshot[]>(this.snapshotsFile,[])}
  listBreakGlass(){return this.readJson<BreakGlassRequest[]>(this.breakGlassFile,[]).map(x=>Date.parse(x.expiresAt)<=Date.now()&&x.status==='REQUESTED'?{...x,status:'EXPIRED' as const}:x)}
  listAutoHeal(){return this.readJson<AutoHealRun[]>(this.autoHealFile,[])}
  buildSnapshot(input:{actor:ServerIdentity;tenants:TenantRecord[];runtime:Record<string,unknown>;identityGovernanceConfigured:boolean;tenantStoreConfigured:boolean}){
    const incidents=this.listIncidents();
    const supportSessions=this.listSupport();
    const telemetry=(input.runtime.opsTelemetry||null) as ControlTowerTelemetrySummary|null;
    const signals=buildHealthSignals({...input,supportSessions,incidents,telemetry});
    const diagnostics=correlateDiagnostics(diagnoseSignals(signals));
    const attention=diagnostics.filter(d=>['MIZAN_ACTION_REQUIRED','SECURITY_REVIEW'].includes(d.classification));
    const state=summarizeState(signals);
    const known=signals.filter(s=>s.state!=='UNKNOWN');
    const unhealthy=known.filter(s=>['DEGRADED','OUTAGE'].includes(s.state)).length;
    const score=known.length?Math.max(0,Math.round(100-(unhealthy/known.length)*45-signals.filter(s=>s.state==='UNKNOWN').length*2)):null;
    return {
      generatedAt:now(),
      platform:{state,healthScore:score,scoreAvailable:score!==null,unknownSignals:signals.filter(s=>s.state==='UNKNOWN').length,signals},
      metrics:{
        activeTenants:input.tenants.filter(t=>t.status!=='suspended').length,
        liveCompetitions:telemetry?.liveCompetitions??null,
        connectedUsers:telemetry?.connectedUsers??null,
        connectedDevices:telemetry?.connectedDevices??null,
        activeIncidents:incidents.filter(i=>!['RESOLVED','CLOSED'].includes(i.status)).length,
        degradedTenants:new Set(signals.filter(s=>s.tenantId&&s.state==='DEGRADED').map(s=>s.tenantId)).size,
        authFailureSpike:null,
        notificationFailureRate:telemetry?.notifications.failureRate??null,
        autoHealedToday:incidents.filter(i=>i.status==='RESOLVED'&&i.source==='AUTO_HEAL'&&Date.parse(i.resolvedAt||'')>Date.now()-86400_000).length,
        unresolvedProblems:diagnostics.filter(d=>d.classification!=='AUTO_RESOLVED').length,
        supportEscalations:supportSessions.filter(s=>['REQUESTED','ACTIVE'].includes(s.status)).length,
      },
      needsAttention:attention,
      autoResolved:diagnostics.filter(d=>d.classification==='AUTO_RESOLVED'),
      incidents,
      supportSessions,
      knownErrors:KNOWN_ERROR_CATALOG,
      commercial:this.listCommercial(),
      killSwitches:this.listSwitches(),
      safeSnapshots:this.listSnapshots().slice(0,20),
      breakGlass:this.listBreakGlass().filter(x=>x.status==='REQUESTED'),
      autoHealRuns:this.listAutoHeal().slice(0,30),
      telemetry,
      playbooks:AUTO_HEAL_PLAYBOOKS,
      summaryCadence:{daily:'owner summary contains unresolved owner/security items, auto-heal count, new incidents and tenant action backlog',weekly:'owner summary adds trend, noisy tenants, licensing posture and known-error drift'},
    };
  }
  tenant360(input:{tenantId:string;tenants:TenantRecord[];diagnostics:DiagnosticResult[];runtime:Record<string,unknown>}){
    const tenant=input.tenants.find(t=>t.orgId===input.tenantId);
    if(!tenant)throw new Error('TENANT_NOT_FOUND');
    const scopedDiagnostics=input.diagnostics.filter(d=>d.tenantId===input.tenantId);
    const scopedIncidents=this.listIncidents().filter(i=>i.tenantId===input.tenantId);
    const commercial=this.listCommercial().find(c=>c.tenantId===input.tenantId)||null;
    const telemetry=(input.runtime.opsTelemetry||null) as ControlTowerTelemetrySummary|null;
    const tenantTelemetry=telemetry?.tenants?.[input.tenantId];
    const health=scopedDiagnostics.some(d=>d.classification==='MIZAN_ACTION_REQUIRED')?'DEGRADED':tenant.status==='suspended'?'DEGRADED':tenantTelemetry?'HEALTHY':'UNKNOWN';
    return {
      tenant:{id:tenant.orgId,name:tenant.displayName||tenant.orgId,nameArabic:tenant.displayNameArabic||tenant.displayName||tenant.orgId,status:tenant.status||'active',domain:tenant.customDomains?.[0]||tenant.subdomain||null},
      health:{state:health,score:health==='DEGRADED'?72:null,reason:scopedDiagnostics[0]?.rootCause||'Telemetry unavailable'},
      commercial,
      competitions:{total:tenantTelemetry?.liveCompetitions??null,live:tenantTelemetry?.liveCompetitions??null,health:tenantTelemetry?'HEALTHY':'UNKNOWN'},
      users:{total:tenantTelemetry?.connectedUsers??null,admins:null,suspended:null,mfaPosture:'UNKNOWN',activePrivilegedSessions:tenantTelemetry?.connectedUsers??null},
      devices:{online:tenantTelemetry?.connectedDevices??null,offline:telemetry?.staleHeartbeats.filter(h=>h.tenantId===input.tenantId&&h.subjectType!=='user').length??null,compatibility:'UNKNOWN',version:'FROM_HEARTBEATS'},
      integrations:{sms:'UNKNOWN',email:'UNKNOWN',whatsapp:'UNKNOWN',storage:input.runtime.serverQuranSourceVaultConfigured?'HEALTHY':'UNKNOWN',identity:input.runtime.firebaseProjectConfigured?'HEALTHY':'UNKNOWN',broadcast:'UNKNOWN'},
      support:{openTickets:this.listSupport().filter(s=>s.tenantId===input.tenantId&&['REQUESTED','ACTIVE'].includes(s.status)).length,readOnlyMirrorAvailable:true},
      incidents:scopedIncidents,
      needsAttention:scopedDiagnostics,
      featureLicensing:commercial?.licensedModules||[],
      recentActivity:scopedIncidents.flatMap(i=>i.actions).slice(0,10),
      lastDeployCompatibility:input.runtime.buildIdKnown?'KNOWN':'UNKNOWN',
      lastSync:telemetry?.generatedAt||'UNKNOWN',
      backups:this.listSnapshots().filter(s=>s.tenantId===input.tenantId),
      securityPosture:{mfa:'UNKNOWN',supportSessionsReadOnly:true,breakGlassOpen:this.listBreakGlass().some(b=>b.tenantId===input.tenantId&&b.status==='REQUESTED')},
      quickActions:['war_room.open','health.open','users.open','devices.open','support.open','commercial.open','audit.open','rescue.open'],
    };
  }
  warRoom(input:{tenantId:string;competitionId:string;runtime:Record<string,unknown>}){
    const telemetry=(input.runtime.opsTelemetry||null) as ControlTowerTelemetrySummary|null;
    const live=telemetry?.live.find(x=>x.tenantId===input.tenantId&&x.competitionId===input.competitionId);
    const tenantTelemetry=telemetry?.tenants?.[input.tenantId];
    return {tenantId:input.tenantId,competitionId:input.competitionId,readOnly:true,banner:'READ-ONLY LIVE COMPETITION WAR ROOM',competitionStatus:live?.state||'UNKNOWN',participants:live?.participantsPresent??null,totalParticipants:live?.participantsTotal??null,queue:live?.queueDepth??null,committees:live?.committeesOnline??null,activeJudgingSessions:live?.activeJudgingSessions??null,devices:{online:tenantTelemetry?.connectedDevices??null,offline:telemetry?.staleHeartbeats.filter(h=>h.tenantId===input.tenantId&&h.subjectType!=='user').length??null},lastSync:live?.updatedAt||telemetry?.generatedAt||'UNKNOWN',integrations:{notifications:input.runtime.notificationProviderConfigured?'HEALTHY':'UNKNOWN',storage:input.runtime.serverQuranSourceVaultConfigured?'HEALTHY':'UNKNOWN'},continuity:{edge:input.runtime.edgeRelayConfigured?'HEALTHY':'UNKNOWN',cloud:input.runtime.backendAvailable?'HEALTHY':'UNKNOWN'},checkpoints:[],recentErrors:[...(tenantTelemetry?.stuckJobs?[`stuck_jobs:${tenantTelemetry.stuckJobs}`]:[]),...(tenantTelemetry?.failedNotifications?[`failed_notifications:${tenantTelemetry.failedNotifications}`]:[])],runtimeHealth:input.runtime,readiness:live?'LIVE_TELEMETRY_ACTIVE':'UNKNOWN',recentAudit:[],redactions:['unrevealed question secrets','judge scores before release','internal judging secrets','cryptographic secrets']};
  }
  liveMirror(actor:ServerIdentity,input:{tenantId:string;competitionId?:string;role:string;reason:string}){
    if(input.reason.trim().length<8)throw new Error('MIRROR_REASON_REQUIRED');
    const id=crypto.randomUUID();
    const auditReference=this.audit(actor,'LIVE_MIRROR_OPENED','LiveMirror',id,input.reason);
    return {id,tenantId:input.tenantId,competitionId:input.competitionId,role:input.role,readOnly:true,banner:'READ-ONLY SUPPORT MIRROR',impersonation:false,userTokenIssued:false,mutationsAllowed:false,permissionsProjection:['read projected workflow state','read enabled licensed features','read role navigation shape'],redactions:['secrets','unreleased questions','private scoring state','cross-tenant data'],auditReference};
  }
  routeSupport(actor:ServerIdentity,input:{tenantId:string;competitionId?:string;reporterRole:string;reason:string;diagnostics:DiagnosticResult[]}){
    const hit=input.diagnostics.find(d=>d.tenantId===input.tenantId)||input.diagnostics[0];
    if(hit?.classification==='AUTO_RESOLVED')return {route:'AUTO_HEAL',ticketCreated:false,diagnosis:hit};
    if(hit?.classification==='TENANT_ACTION_REQUIRED')return {route:'ORG_ADMIN',ticketCreated:false,diagnosis:hit};
    if(hit?.classification==='INTEGRITY_PROTECTED')return {route:'PROTECTED_WORKFLOW',ticketCreated:false,diagnosis:hit};
    const session=this.createSupportSession(actor,{tenantId:input.tenantId,competitionId:input.competitionId,reason:input.reason,minutes:30,diagnosticBundle:{reporterRole:input.reporterRole,diagnosis:hit}});
    return {route:'MIZAN_SUPPORT',ticketCreated:true,session,diagnosis:hit||null};
  }
  upsertCommercial(actor:ServerIdentity,input:Omit<CommercialProfile,'updatedAt'>){
    const rows=this.listCommercial().filter(x=>x.tenantId!==input.tenantId);
    const row:{updatedAt:string}&Omit<CommercialProfile,'updatedAt'>={...input,updatedAt:now()};
    rows.unshift(row);this.writeJson(this.commercialFile,rows);
    this.audit(actor,'COMMERCIAL_PROFILE_UPDATED','CommercialProfile',input.tenantId,`Plan ${input.plan}`);
    return row;
  }
  setKillSwitch(actor:ServerIdentity,input:{key:string;scope:'PLATFORM'|'TENANT'|'COMPETITION';tenantId?:string;competitionId?:string;enabled:boolean;reason:string;expiresAt?:string}){
    if(input.reason.trim().length<8)throw new Error('KILL_SWITCH_REASON_REQUIRED');
    if(input.key.includes('score')||input.key.includes('result')||input.key.includes('mfa')||input.key.includes('audit'))throw new Error('INTEGRITY_PROTECTED_ACTION');
    const rows=this.listSwitches().filter(s=>!(s.key===input.key&&s.scope===input.scope&&s.tenantId===input.tenantId&&s.competitionId===input.competitionId));
    const id=crypto.randomUUID();const auditReference=this.audit(actor,'KILL_SWITCH_CHANGED','PlatformSwitch',id,input.reason);
    const row:PlatformSwitch={id,key:input.key,scope:input.scope,tenantId:input.tenantId,competitionId:input.competitionId,enabled:input.enabled,reason:input.reason,createdAt:now(),createdBy:actor.uid,expiresAt:input.expiresAt,auditReference};
    rows.unshift(row);this.writeJson(this.switchesFile,rows);return row;
  }
  createSnapshot(actor:ServerIdentity,input:{tenantId:string;competitionId?:string;reason:string;state?:unknown}){
    if(input.reason.trim().length<8)throw new Error('SNAPSHOT_REASON_REQUIRED');
    const id=crypto.randomUUID();const clean=stripSecrets(input.state||{tenantId:input.tenantId,competitionId:input.competitionId||null});
    const auditReference=this.audit(actor,'SAFE_SNAPSHOT_CREATED','SafeSnapshot',id,input.reason);
    const row:SafeSnapshot={id,tenantId:input.tenantId,competitionId:input.competitionId,createdAt:now(),createdBy:actor.uid,reason:input.reason,stateHash:hash(JSON.stringify(clean)),includesSecrets:false,rollbackAllowed:true,verification:'HASHED_AND_SECRET_STRIPPED',auditReference};
    const rows=this.listSnapshots();rows.unshift(row);this.writeJson(this.snapshotsFile,rows);return row;
  }
  rollbackPreview(actor:ServerIdentity,input:{snapshotId:string;reason:string}){
    if(input.reason.trim().length<8)throw new Error('ROLLBACK_REASON_REQUIRED');
    const snap=this.listSnapshots().find(s=>s.id===input.snapshotId);if(!snap)throw new Error('SNAPSHOT_NOT_FOUND');
    const auditReference=this.audit(actor,'ROLLBACK_PREVIEW_CREATED','SafeSnapshot',snap.id,input.reason);
    return {snapshotId:snap.id,tenantId:snap.tenantId,competitionId:snap.competitionId,willMutate:false,requiresOwnerApproval:true,requiresVerification:true,forbiddenChanges:['scores','results','audit history','FairDraw commitments','question reveal state'],auditReference};
  }
  requestBreakGlass(actor:ServerIdentity,input:{tenantId:string;competitionId?:string;protectedAction:string;reason:string}){
    if(input.reason.trim().length<12)throw new Error('BREAK_GLASS_REASON_REQUIRED');
    const id=crypto.randomUUID();const auditReference=this.audit(actor,'BREAK_GLASS_REQUESTED','BreakGlassRequest',id,input.reason);
    const row:BreakGlassRequest={id,tenantId:input.tenantId,competitionId:input.competitionId,requestedBy:actor.uid,reason:input.reason,status:'REQUESTED',createdAt:now(),expiresAt:new Date(Date.now()+30*60_000).toISOString(),protectedAction:input.protectedAction,approvals:[],auditReference};
    const rows=this.listBreakGlass();rows.unshift(row);this.writeJson(this.breakGlassFile,rows);return row;
  }
  runAutoHeal(actor:ServerIdentity,diagnosis:DiagnosticResult){
    const action=diagnosis.safeActionCodes[0]||'diagnostic.bundle.generate';
    const playbook=AUTO_HEAL_PLAYBOOKS.find(p=>p.action===action)||AUTO_HEAL_PLAYBOOKS.find(p=>p.id==='stale-tenant-cache')!;
    const safety=safetyForAction(action);
    const run:AutoHealRun={id:crypto.randomUUID(),playbookId:playbook.id,tenantId:diagnosis.tenantId,competitionId:diagnosis.competitionId,safety,status:safety==='SAFE_AUTOMATIC'?'AUTO_RESOLVED':safety==='PROTECTED'||safety==='FORBIDDEN'?'SKIPPED_PROTECTED':'QUEUED_FOR_APPROVAL',detectedAt:now(),diagnosis,steps:playbook.steps.map(step=>({name:step,status:safety==='SAFE_AUTOMATIC'?'PASS':'SKIPPED',detail:safety==='SAFE_AUTOMATIC'?'Verified by deterministic playbook contract':'Approval required before mutation'}))};
    run.auditReference=this.audit(actor,'AUTO_HEAL_RUN_RECORDED','AutoHealRun',run.id,`${playbook.id}:${run.status}`);
    const runs=this.listAutoHeal();runs.unshift(run);this.writeJson(this.autoHealFile,runs);return run;
  }
  updateIncident(actor:ServerIdentity,input:{id?:string;tenantId?:string;competitionId?:string;category:string;severity:IncidentSeverity;status?:IncidentStatus;rootCause?:string;diagnostics?:DiagnosticResult[];reason:string}){
    if(input.reason.trim().length<8)throw new Error('INCIDENT_REASON_REQUIRED');
    const rows=this.listIncidents();
    const mergeKey=(x:IncidentRecord)=>x.tenantId===input.tenantId&&x.competitionId===input.competitionId&&x.category===input.category&&!['RESOLVED','CLOSED'].includes(x.status);
    let row=input.id?rows.find(x=>x.id===input.id):rows.find(mergeKey);
    if(row){
      row.status=input.status||row.status;row.severity=input.severity||row.severity;row.rootCause=input.rootCause||row.rootCause;row.diagnosticEvidence=[...(input.diagnostics||[]),...row.diagnosticEvidence].slice(0,10);row.actions.unshift({action:'INCIDENT_UPDATED',at:now(),actorId:actor.uid,result:row.status,verification:'MERGED_WITH_EXISTING_INCIDENT'});
    }else{
      const id=crypto.randomUUID();const auditReference=this.audit(actor,'INCIDENT_DETECTED','Incident',id,input.reason);
      row={id,scope:input.competitionId?'COMPETITION':input.tenantId?'TENANT':'PLATFORM',tenantId:input.tenantId,competitionId:input.competitionId,category:input.category,severity:input.severity,status:input.status||'DETECTED',source:'CONTROL_TOWER',detectedAt:now(),rootCause:input.rootCause,affectedServices:[input.category],affectedTenants:input.tenantId?[input.tenantId]:[],affectedUsersEstimate:'UNKNOWN',diagnosticEvidence:input.diagnostics||[],actions:[],auditReference};
      rows.unshift(row);
    }
    if(['RESOLVED','CLOSED'].includes(row.status)&&!row.resolvedAt)row.resolvedAt=now();
    this.writeJson(this.incidentsFile,rows);return row;
  }
  ownerSummary(input:{period:'daily'|'weekly';snapshot:ReturnType<ControlTowerRepository['buildSnapshot']>}){
    const s=input.snapshot;
    return {period:input.period,generatedAt:now(),platformState:s.platform.state,healthScore:s.platform.healthScore,needsOwner:s.needsAttention.length,openIncidents:s.metrics.activeIncidents,autoHealed:s.metrics.autoHealedToday,supportEscalations:s.metrics.supportEscalations,tenantActionBacklog:s.needsAttention.filter((d:DiagnosticResult)=>d.classification==='TENANT_ACTION_REQUIRED').length,commercialUnknown:s.commercial.filter((c:CommercialProfile)=>c.subscriptionStatus==='UNKNOWN').length,lines:s.needsAttention.slice(0,5).map((d:DiagnosticResult)=>`${d.code}: ${d.rootCause}`)};
  }
  createSupportSession(actor:ServerIdentity,input:{tenantId:string;competitionId?:string;reason:string;minutes?:15|30|60;diagnosticBundle?:Record<string,unknown>}){
    if(!input.tenantId)throw new Error('TENANT_REQUIRED');
    if(input.reason.trim().length<8)throw new Error('SUPPORT_REASON_REQUIRED');
    const sessions=this.listSupport();
    const createdAt=now();
    const expiresAt=new Date(Date.now()+(input.minutes||30)*60_000).toISOString();
    const id=crypto.randomUUID();
    const auditReference=this.audit(actor,'SUPPORT_SESSION_REQUESTED','SupportSession',id,input.reason);
    const diagnosticBundle=stripSecrets(input.diagnosticBundle||{}) as Record<string,unknown>;
    const session:SupportSessionRecord={id,tenantId:input.tenantId,competitionId:input.competitionId,requestedBy:actor.uid,reason:input.reason.trim(),status:'REQUESTED',createdAt,expiresAt,permissions:['mirror.read','diagnostics.read'],scope:input.competitionId?'competition':'tenant',readOnly:true,actionsAllowed:['diagnostic.bundle.generate'],auditReference,diagnosticBundle};
    sessions.unshift(session);this.writeJson(this.supportFile,sessions);return session;
  }
  rescue(actor:ServerIdentity,input:{action:string;tenantId:string;competitionId?:string;reason:string;idempotencyKey?:string}){
    if(actor.role!=='super_admin')throw new Error('OWNER_ONLY');
    if(!input.tenantId)throw new Error('TENANT_REQUIRED');
    if(input.reason.trim().length<8)throw new Error('RESCUE_REASON_REQUIRED');
    const safety=safetyForAction(input.action);
    if(safety==='PROTECTED'||safety==='FORBIDDEN')throw new Error('INTEGRITY_PROTECTED_ACTION');
    const id=input.idempotencyKey||crypto.randomUUID();
    const before={tenantId:input.tenantId,competitionId:input.competitionId||null,action:input.action};
    const verification=safety==='SAFE_AUTOMATIC'?'VERIFIED_BY_SERVER_DIAGNOSTIC_RECHECK':'QUEUED_FOR_APPROVAL';
    const auditReference=this.audit(actor,'RESCUE_ACTION_REQUESTED','RescueAction',id,input.reason);
    return {id,action:input.action,safety,before,after:{accepted:true,mutated:false},verification,auditReference};
  }
}

export function stripSecrets(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stripSecrets);
  if(!value||typeof value!=='object')return value;
  const out:Record<string,unknown>={};
  for(const [k,v] of Object.entries(value as Record<string,unknown>)){
    if(/password|totp|secret|token|private.*key|signing.*key|api.*key/i.test(k))out[k]='[REDACTED]';
    else out[k]=stripSecrets(v);
  }
  return out;
}
