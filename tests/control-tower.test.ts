import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ControlTowerRepository, buildHealthSignals, correlateDiagnostics, diagnoseSignals, safetyForAction, stripSecrets } from '../server/control-tower';

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
