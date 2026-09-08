import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ControlTowerRepository, buildHealthSignals, correlateDiagnostics, diagnoseSignals, safetyForAction, stripSecrets } from '../server/control-tower';
import { OpsTelemetryRepository } from '../server/ops-telemetry';

const tmp=()=>fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp','mizan-control-tower-'));
const actor={uid:'owner-1',email:'owner@example.com',role:'super_admin' as const,organizationId:'__platform__'};

test('platform health uses unknown when telemetry is unavailable instead of inventing numbers',()=>{
  const signals=buildHealthSignals({tenants:[],runtime:{backendAvailable:true},identityGovernanceConfigured:false,tenantStoreConfigured:false});
  assert.ok(signals.some(s=>s.key==='notifications'&&s.state==='UNKNOWN'));
  assert.ok(signals.some(s=>s.key==='live_competitions'&&s.state==='UNKNOWN'));
  const diagnostics=diagnoseSignals(signals);
  assert.ok(diagnostics.some(d=>d.classification==='MIZAN_ACTION_REQUIRED'));
});

test('root cause correlation collapses multi-tenant notification failures',()=>{
  const diagnostics=correlateDiagnostics([
    {id:'1',code:'NOTIFICATION_TRANSIENT_FAILURE',tenantId:'a',classification:'MIZAN_ACTION_REQUIRED',rootCause:'provider timeout',confidence:'MEDIUM',evidence:[],recommendedActions:[],safeActionCodes:[],doctorSummaryArabic:'',doctorSummaryEnglish:''},
    {id:'2',code:'NOTIFICATION_TRANSIENT_FAILURE',tenantId:'b',classification:'MIZAN_ACTION_REQUIRED',rootCause:'provider timeout',confidence:'MEDIUM',evidence:[],recommendedActions:[],safeActionCodes:[],doctorSummaryArabic:'',doctorSummaryEnglish:''},
    {id:'3',code:'NOTIFICATION_TRANSIENT_FAILURE',tenantId:'c',classification:'MIZAN_ACTION_REQUIRED',rootCause:'provider timeout',confidence:'MEDIUM',evidence:[],recommendedActions:[],safeActionCodes:[],doctorSummaryArabic:'',doctorSummaryEnglish:''},
  ]);
  assert.equal(diagnostics[0].rootCause,'Multiple tenants show notification failures in the same diagnostic window.');
  assert.equal(diagnostics[0].evidence.length,3);
});

test('auto-heal and rescue safety gates reject protected integrity actions',()=>{
  for(const action of ['score.modify','result.publish','question.reveal','question.draw.modify','quran.source.certified.change','audit.event.remove','break_glass.activate','mfa.bypass']){
    assert.equal(safetyForAction(action),'PROTECTED');
  }
  assert.equal(safetyForAction('notification.retry'),'SAFE_AUTOMATIC');
  const dir=tmp();
  try{
    const repo=new ControlTowerRepository(dir);
    assert.throws(()=>repo.rescue(actor,{tenantId:'org1',action:'result.publish',reason:'testing forbidden path'}),/INTEGRITY_PROTECTED_ACTION/);
    const ok=repo.rescue(actor,{tenantId:'org1',action:'notification.retry',reason:'retry failed SMS provider delivery'});
    assert.equal(ok.safety,'SAFE_AUTOMATIC');
    assert.equal(ok.after.mutated,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('support sessions are server-side, read-only, expiring, audited and secret-stripped',()=>{
  const dir=tmp();
  try{
    const repo=new ControlTowerRepository(dir);
    const session=repo.createSupportSession(actor,{tenantId:'org1',competitionId:'comp1',reason:'organization admin cannot diagnose judge login',minutes:15,diagnosticBundle:{token:'abc',nested:{totpSecret:'xyz'},browser:'Safari'}});
    assert.equal(session.readOnly,true);
    assert.equal(session.status,'REQUESTED');
    assert.equal(session.permissions.includes('mirror.read'),true);
    assert.equal((session.diagnosticBundle as any).token,'[REDACTED]');
    assert.equal((session.diagnosticBundle as any).nested.totpSecret,'[REDACTED]');
    assert.match(session.auditReference,/^[a-f0-9]{64}$/);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('diagnostic bundles redact security material recursively',()=>{
  assert.deepEqual(stripSecrets({accessToken:'x',publicValue:'ok',items:[{apiKey:'k'}]}),{accessToken:'[REDACTED]',publicValue:'ok',items:[{apiKey:'[REDACTED]'}]});
});

test('tenant 360, war room and live mirror are read-only projections',()=>{
  const dir=tmp();
  try{
    const repo=new ControlTowerRepository(dir);
    const tenants=[{orgId:'org1',displayNameArabic:'جمعية 1',subdomain:'org1',status:'active' as const}];
    const diag={id:'d',code:'TENANT_DOMAIN_MISCONFIGURED',tenantId:'org1',classification:'MIZAN_ACTION_REQUIRED' as const,rootCause:'DNS mismatch',confidence:'MEDIUM' as const,evidence:[],recommendedActions:[],safeActionCodes:['domain.retest'],doctorSummaryArabic:'',doctorSummaryEnglish:''};
    const t=repo.tenant360({tenantId:'org1',tenants,diagnostics:[diag],runtime:{backendAvailable:true,firebaseProjectConfigured:true}});
    assert.equal(t.tenant.id,'org1');
    assert.equal(t.health.state,'DEGRADED');
    assert.equal(t.support.readOnlyMirrorAvailable,true);
    const war=repo.warRoom({tenantId:'org1',competitionId:'c1',runtime:{backendAvailable:true}});
    assert.equal(war.readOnly,true);
    assert.ok(war.redactions.includes('unrevealed question secrets'));
    const mirror=repo.liveMirror(actor,{tenantId:'org1',competitionId:'c1',role:'org_admin',reason:'diagnose organization screen issue'});
    assert.equal(mirror.readOnly,true);
    assert.equal(mirror.impersonation,false);
    assert.equal(mirror.userTokenIssued,false);
    assert.equal(mirror.mutationsAllowed,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('support routing escalates only owner-class issues and keeps tenant-fix local',()=>{
  const dir=tmp();
  try{
    const repo=new ControlTowerRepository(dir);
    const tenantFix={id:'d1',code:'PRIVILEGED_SESSION_CONFLICT',tenantId:'org1',classification:'TENANT_ACTION_REQUIRED' as const,rootCause:'stale session',confidence:'HIGH' as const,evidence:[],recommendedActions:[],safeActionCodes:['user_sessions.revoke'],doctorSummaryArabic:'',doctorSummaryEnglish:''};
    assert.equal(repo.routeSupport(actor,{tenantId:'org1',reporterRole:'judge',reason:'judge cannot login',diagnostics:[tenantFix]}).route,'ORG_ADMIN');
    const ownerFix={...tenantFix,id:'d2',classification:'MIZAN_ACTION_REQUIRED' as const,code:'TENANT_DOMAIN_MISCONFIGURED'};
    const routed=repo.routeSupport(actor,{tenantId:'org1',reporterRole:'org_admin',reason:'domain still fails after tenant checks',diagnostics:[ownerFix]});
    assert.equal(routed.route,'MIZAN_SUPPORT');
    assert.equal(routed.ticketCreated,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('commercial, kill switches, snapshots, rollback preview and break glass are audited and bounded',()=>{
  const dir=tmp();
  try{
    const repo=new ControlTowerRepository(dir);
    const commercial=repo.upsertCommercial(actor,{tenantId:'org1',plan:'ENTERPRISE',subscriptionStatus:'ACTIVE',licensedModules:['broadcast'],limits:{competitions:12}});
    assert.equal(commercial.plan,'ENTERPRISE');
    const sw=repo.setKillSwitch(actor,{key:'optional_ai',scope:'TENANT',tenantId:'org1',enabled:false,reason:'provider degraded for this tenant'});
    assert.equal(sw.enabled,false);
    assert.throws(()=>repo.setKillSwitch(actor,{key:'result_publish',scope:'PLATFORM',enabled:false,reason:'try protected mutation'}),/INTEGRITY_PROTECTED_ACTION/);
    const snap=repo.createSnapshot(actor,{tenantId:'org1',reason:'before commercial plan migration',state:{token:'secret',users:3}});
    assert.equal(snap.includesSecrets,false);
    const preview=repo.rollbackPreview(actor,{snapshotId:snap.id,reason:'preview restore after bad migration'});
    assert.equal(preview.willMutate,false);
    assert.ok(preview.forbiddenChanges.includes('scores'));
    const bg=repo.requestBreakGlass(actor,{tenantId:'org1',protectedAction:'tenant emergency access',reason:'documented outage requires governed escalation'});
    assert.equal(bg.status,'REQUESTED');
    assert.equal(bg.approvals.length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('incident lifecycle merges duplicate active incidents and auto-heal records only safe runs',()=>{
  const dir=tmp();
  try{
    const repo=new ControlTowerRepository(dir);
    const one=repo.updateIncident(actor,{tenantId:'org1',category:'notifications',severity:'MEDIUM',rootCause:'provider timeout',reason:'detected provider issue'});
    const two=repo.updateIncident(actor,{tenantId:'org1',category:'notifications',severity:'HIGH',rootCause:'same provider timeout',reason:'duplicate signal from same window'});
    assert.equal(one.id,two.id);
    assert.equal(repo.listIncidents().length,1);
    const diag={id:'d',code:'NOTIFICATION_TRANSIENT_FAILURE',tenantId:'org1',classification:'MIZAN_ACTION_REQUIRED' as const,rootCause:'provider timeout',confidence:'MEDIUM' as const,evidence:[],recommendedActions:[],safeActionCodes:['notification.retry'],doctorSummaryArabic:'',doctorSummaryEnglish:''};
    const run=repo.runAutoHeal(actor,diag);
    assert.equal(run.status,'AUTO_RESOLVED');
    assert.equal(run.steps.every(s=>s.status==='PASS'),true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('ops telemetry turns live heartbeats and jobs into real control tower metrics',()=>{
  const dir=tmp();
  try{
    const telemetryRepo=new OpsTelemetryRepository(path.join(dir,'telemetry'));
    telemetryRepo.recordHeartbeat({tenantId:'org1',competitionId:'comp1',subjectType:'user',subjectId:'judge-1',role:'judge'});
    telemetryRepo.recordHeartbeat({tenantId:'org1',competitionId:'comp1',subjectType:'kiosk',subjectId:'kiosk-1',version:'1.2.3'});
    telemetryRepo.recordLive({tenantId:'org1',competitionId:'comp1',state:'LIVE',participantsPresent:12,participantsTotal:20,activeJudgingSessions:2,queueDepth:3,committeesOnline:1});
    telemetryRepo.recordJob({id:'job-1',tenantId:'org1',jobType:'certificates.generate',status:'RUNNING',leaseExpiresAt:new Date(Date.now()+60_000).toISOString()});
    telemetryRepo.recordNotification({tenantId:'org1',competitionId:'comp1',channel:'sms',provider:'provider-a',status:'ACCEPTED'});
    const telemetry=telemetryRepo.summary({providerConfigured:true});
    const repo=new ControlTowerRepository(dir);
    const snapshot=repo.buildSnapshot({actor,tenants:[{orgId:'org1',displayName:'Org 1',status:'active'} as any],runtime:{backendAvailable:true,buildIdKnown:true,firebaseProjectConfigured:true,serverAuditLedgerConfigured:true,serverQuranSourceVaultConfigured:true,enterpriseApiConfigured:true,edgeRelayConfigured:true,notificationProviderConfigured:true,backgroundJobsConfigured:true,liveCompetitionTelemetryConfigured:true,opsTelemetry:telemetry},identityGovernanceConfigured:true,tenantStoreConfigured:true});
    assert.equal(snapshot.metrics.connectedUsers,1);
    assert.equal(snapshot.metrics.connectedDevices,1);
    assert.equal(snapshot.metrics.liveCompetitions,1);
    assert.equal(snapshot.metrics.notificationFailureRate,0);
    assert.equal(snapshot.platform.signals.find(s=>s.key==='background_jobs')?.state,'HEALTHY');
    const tenant=repo.tenant360({tenantId:'org1',tenants:[{orgId:'org1',displayName:'Org 1',status:'active'} as any],diagnostics:snapshot.needsAttention,runtime:{serverQuranSourceVaultConfigured:true,firebaseProjectConfigured:true,buildIdKnown:true,opsTelemetry:telemetry}});
    assert.equal(tenant.devices.online,1);
    assert.equal(tenant.competitions.live,1);
    const room=repo.warRoom({tenantId:'org1',competitionId:'comp1',runtime:{backendAvailable:true,edgeRelayConfigured:true,serverQuranSourceVaultConfigured:true,notificationProviderConfigured:true,opsTelemetry:telemetry}});
    assert.equal(room.competitionStatus,'LIVE');
    assert.equal(room.participants,12);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('ops telemetry detects stale background jobs and notification failure rate',()=>{
  const dir=tmp();
  try{
    const telemetryRepo=new OpsTelemetryRepository(dir);
    telemetryRepo.recordJob({id:'stuck',tenantId:'org1',jobType:'notification.flush',status:'RUNNING',leaseExpiresAt:new Date(Date.now()-600_000).toISOString()});
    telemetryRepo.recordNotification({tenantId:'org1',channel:'sms',provider:'provider-a',status:'FAILED',retryable:true,errorCode:'TIMEOUT'});
    telemetryRepo.recordNotification({tenantId:'org1',channel:'sms',provider:'provider-a',status:'ACCEPTED'});
    const telemetry=telemetryRepo.summary({providerConfigured:true});
    assert.equal(telemetry.backgroundJobs.stuck,1);
    assert.equal(telemetry.notifications.failureRate,0.5);
    const signals=buildHealthSignals({tenants:[],runtime:{notificationProviderConfigured:true},identityGovernanceConfigured:true,tenantStoreConfigured:true,telemetry});
    assert.equal(signals.find(s=>s.key==='notifications')?.state,'DEGRADED');
    assert.equal(signals.find(s=>s.key==='background_jobs')?.state,'DEGRADED');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
