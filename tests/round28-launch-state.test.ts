import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLaunchDeployment,
  isRetiredSeedResidue,
  launchCompetition,
  launchOrganization,
  launchPlaceholderUser,
  toLaunchState,
} from '../src/lib/launch-state';

/*
 * حارس حالة الإطلاق لا يعتمد على أي بيانات مزروعة. نركّب هنا حالةً اصطناعية داخل الاختبار
 * فقط، ثم نتأكد أن طريق الإطلاق يفرغ كل سجل تشغيلي ويبقي الهيكل الذي تحتاجه الواجهات.
 */

const organizationFixture={
  id:'org-legacy-fixture',
  name:'Legacy organization fixture',
  nameArabic:'جهة اختبار قديمة',
  code:'OLD',
  brand:{name:'Legacy',nameArabic:'قديم',primaryColor:'#000000',accentColor:'#ffffff',subdomain:'legacy'},
  plan:'standard',
  dataResidency:'fixture',
  status:'active',
  createdAt:'2026-01-01T00:00:00.000Z',
} as any;

const ruleSetFixture={
  id:'rule-fixture',version:'1.0.0',name:'Fixture rules',judgesCountPerPanel:1,dropExtremes:false,
  criteria:[{id:'memorization',name:'Memorization',nameArabic:'الحفظ',maxScore:100,weight:1,assignedJudgeType:'memorization'}],
  penalties:{mistake:1,promptOpening:1,repetition:1,tajweedMinor:1,tajweedMajor:1,hesitationStop:1},
  questionsPerParticipant:3,questionDurationMinutes:8,minimumPassingScore:80,
  tieBreakRules:['memorization_priority'],appealsAllowed:true,appealWindowHours:12,silentAIGuardianEnabled:true,
} as any;

const competitionFixture={
  id:'comp-legacy-fixture',organizationId:organizationFixture.id,
  name:'Legacy competition fixture',nameArabic:'مسابقة اختبار قديمة',edition:'old',country:'',timezone:'UTC',
  status:'live',automationLevel:'assisted',startDate:'2026-01-01',endDate:'2026-01-02',
  registrationStartDate:'2025-12-01',registrationEndDate:'2025-12-31',categories:[{id:'cat-fixture'}],
  ruleSet:ruleSetFixture,ruleSets:[ruleSetFixture],venueName:'Fixture hall',venuesCount:1,
  totalRegistered:9,totalApproved:8,totalAttended:7,currentDay:1,totalDays:2,
  readinessChecklist:{datesConfigured:true,categoriesConfigured:true,ruleSetFrozen:true,judgesAssigned:true,quranSourceLocked:true,devicesRegistered:true,certificatesReady:true},
} as any;

const seededLike=()=>({
  currentUser:{id:'u1',name:'Legacy admin fixture',email:'fixture@example.test',role:'comp_admin',organizationId:organizationFixture.id},
  organization:organizationFixture,organizations:[organizationFixture],
  competition:competitionFixture,competitions:[competitionFixture],
  participants:[{id:'p1'}],committees:[{id:'c1'}],judges:[{id:'j1'}],
  results:[{id:'result1'}],certificates:[{id:'cert1'}],auditLogs:[{id:'audit1'}],
  reviewCases:[{id:'r1'}],incidents:[{id:'i1'}],appeals:[{id:'a1'}],judgeSubmissions:[{id:'js1'}],
  aiObservations:[{id:'o1'}],audioRecordings:[{id:'rec1'}],notifications:[{id:'n1'}],sealApprovals:[{id:'s1'}],
  identityAccounts:[{id:'acct'}],roleGrants:[{id:'grant'}],identityInvitations:[{id:'inv'}],authSessions:[{id:'sess'}],
  questionRevealGates:[{id:'g1'}],activeSession:{sessionId:'sess-active-001',participant:{id:'p1'},committee:{id:'c1'},events:[{id:'e1'}]},
  webhooks:[{id:'wh'}],integrations:[{id:'intg'}],supportSessions:[{id:'sup'}],travelRecords:[{id:'trv'}],federationAttestations:[{id:'fed'}],participantPassport:[{id:'pass'}],consents:[{id:'con'}],quorumActions:[{id:'q'}],featureFlags:[{id:'flag'}],sessionCheckpoints:[{id:'ck'}],continuityIncidents:[{id:'ci'}],sessionRecoveries:[{id:'sr'}],passReissues:[{id:'pr'}],auditLedgerSeals:[{id:'seal'}],
  operatingCostModel:{baselineStaff:24,mizanStaff:6,hoursPerDay:8,days:2},
  persistenceError:null,isOffline:false,emergencyFrozen:false,language:'ar',
}) as any;

test('a launch deployment is recognised only by mandatory authentication',()=>{
  assert.equal(isLaunchDeployment({VITE_REQUIRE_AUTH:'true'}),true);
  assert.equal(isLaunchDeployment({VITE_REQUIRE_AUTH:'false'}),false);
  assert.equal(isLaunchDeployment({}),false,'absence is not a declared launch deployment');
});

test('launch state carries no inherited person or issued record',()=>{
  const launch=toLaunchState(seededLike());
  for(const key of ['participants','committees','judges','results','certificates','reviewCases','auditLogs','incidents','appeals','judgeSubmissions','aiObservations','audioRecordings','notifications','sealApprovals','identityAccounts','roleGrants','identityInvitations','authSessions','questionRevealGates','webhooks','integrations','supportSessions','travelRecords','federationAttestations','participantPassport','consents','quorumActions','featureFlags','sessionCheckpoints','continuityIncidents','sessionRecoveries','passReissues','auditLedgerSeals'] as const){
    assert.deepEqual((launch as any)[key],[],`${key} must start empty in a launch deployment`);
  }
  assert.equal(launch.activeSession.participant,null,'no inherited participant survives launch');
  assert.equal(launch.activeSession.committee,null,'no inherited committee survives launch');
  assert.equal(launch.activeSession.sessionId,'','no inherited session survives launch');
});

test('launch state keeps every field the screens expect',()=>{
  const source=seededLike();
  const launch=toLaunchState(source);
  assert.deepEqual(Object.keys(source).sort(),Object.keys(launch).sort());
  assert.equal(launch.language,'ar','untouched fields survive');
});

test('the pending organisation and competition impersonate nobody',()=>{
  const org=launchOrganization(organizationFixture);
  assert.notEqual(org.id,organizationFixture.id);
  assert.equal(org.id,'org-pending-setup');
  const comp=launchCompetition(competitionFixture,org.id);
  assert.equal(comp.status,'draft','launch does not open a competition automatically');
  assert.equal(comp.totalRegistered,0);
  assert.equal(comp.totalApproved,0);
  assert.equal(comp.totalAttended,0);
  assert.equal(comp.organizationId,org.id);
  assert.deepEqual(comp.categories,[],'launch has no pre-created categories');
  assert.ok(comp.ruleSet,'the neutral rubric structure remains available');
});

test('the placeholder identity holds no authority',()=>{
  const user=launchPlaceholderUser('org-x');
  assert.equal(user.id,'unauthenticated');
  assert.notEqual(user.role,'comp_admin','never starts as an administrator');
  assert.equal(user.email,'');
});

test('retired seeded browser residue is detected without reviving its records',()=>{
  const retiredOrganizationId='org-gqa-global';
  assert.equal(isRetiredSeedResidue(retiredOrganizationId,retiredOrganizationId),true);
  assert.equal(isRetiredSeedResidue('org-real-authority',retiredOrganizationId),false);
  assert.equal(isRetiredSeedResidue(undefined,retiredOrganizationId),false);
});
