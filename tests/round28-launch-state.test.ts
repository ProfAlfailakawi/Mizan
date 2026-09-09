import test from 'node:test';
import assert from 'node:assert/strict';
import {isDemoResidue,isLaunchDeployment,launchCompetition,launchOrganization,launchPlaceholderUser,toLaunchState} from '../src/lib/launch-state';
import {SEED_ORGANIZATION,SEED_COMPETITION,SEED_PARTICIPANTS,SEED_RESULTS,SEED_CERTIFICATE,SEED_JUDGES,SEED_COMMITTEES,SEED_AUDIT_LOGS} from '../src/lib/seed-data';

/*
 * الحالة الابتدائية كانت تُزرع ببيانات عرض دائمًا: متسابقون مخترعون، ونتائج، وشهادة صادرة.
 * هذه الاختبارات هي الحارس — إن عاد أي منها إلى نشرٍ حقيقي فشلت البناية قبل أن يفشل يوم مسابقة.
 */

const seededLike=()=>({
  currentUser:{id:'u1',name:'Demo Admin',email:'a@b.c',role:'comp_admin',organizationId:SEED_ORGANIZATION.id},
  organization:SEED_ORGANIZATION,organizations:[SEED_ORGANIZATION],
  competition:SEED_COMPETITION,competitions:[SEED_COMPETITION],
  participants:SEED_PARTICIPANTS,committees:SEED_COMMITTEES,judges:SEED_JUDGES,
  results:SEED_RESULTS,certificates:[SEED_CERTIFICATE],auditLogs:SEED_AUDIT_LOGS,
  reviewCases:[{id:'r1'}],incidents:[{id:'i1'}],appeals:[{id:'a1'}],judgeSubmissions:[{id:'j1'}],
  aiObservations:[{id:'o1'}],audioRecordings:[{id:'rec1'}],notifications:[{id:'n1'}],sealApprovals:[{id:'s1'}],
  identityAccounts:[{id:'acct'}],roleGrants:[{id:'grant'}],identityInvitations:[{id:'inv'}],authSessions:[{id:'sess'}],
  questionRevealGates:[{id:'g1'}],activeSession:{sessionId:'sess-active-001',participant:SEED_PARTICIPANTS[0],committee:SEED_COMMITTEES[0]},
  webhooks:[{id:'wh'}],integrations:[{id:'intg'}],supportSessions:[{id:'sup'}],travelRecords:[{id:'trv'}],federationAttestations:[{id:'fed'}],participantPassport:[{id:'pass'}],consents:[{id:'con'}],quorumActions:[{id:'q'}],featureFlags:[{id:'flag'}],sessionCheckpoints:[{id:'ck'}],continuityIncidents:[{id:'ci'}],sessionRecoveries:[{id:'sr'}],passReissues:[{id:'pr'}],auditLedgerSeals:[{id:'seal'}],
  language:'ar',
}) as any;

test('a real deployment is recognised only by mandatory authentication',()=>{
  assert.equal(isLaunchDeployment({VITE_REQUIRE_AUTH:'true'}),true);
  assert.equal(isLaunchDeployment({VITE_REQUIRE_AUTH:'false'}),false);
  assert.equal(isLaunchDeployment({}),false,'absent means product review, not launch');
});

test('launch state carries no invented person and no issued record',()=>{
  const launch=toLaunchState(seededLike());
  for(const key of ['participants','committees','judges','results','certificates','reviewCases','auditLogs','incidents','appeals','judgeSubmissions','aiObservations','audioRecordings','notifications','sealApprovals','identityAccounts','roleGrants','identityInvitations','authSessions','questionRevealGates','webhooks','integrations','supportSessions','travelRecords','federationAttestations','participantPassport','consents','quorumActions','featureFlags','sessionCheckpoints','continuityIncidents','sessionRecoveries','passReissues','auditLedgerSeals'] as const){
    assert.deepEqual((launch as any)[key],[],`${key} must start empty in a real deployment`);
  }
  // جلسة العرض لا تُورَّث لمحكم حقيقي: بلا متسابق ولا لجنة مخترعَين.
  assert.equal(launch.activeSession.participant,null,'no seeded participant survives into a real deployment');
  assert.equal(launch.activeSession.committee,null,'no seeded committee survives into a real deployment');
});

test('launch state preserves every supplied field while adding safe runtime defaults',()=>{
  const seeded=seededLike();const launch=toLaunchState(seeded);
  // كل حقل يصل من الحالة المصدرية يجب أن يبقى موجودًا. يسمح الإطلاق بإضافة حقول أمان
  // افتراضية للحالات القديمة/الناقصة بدل كسر البناء لمجرد أن المهيّئ أصلح شكلاً ناقصًا.
  for(const key of Object.keys(seeded)){
    assert.ok(Object.prototype.hasOwnProperty.call(launch,key),`${key} must survive launch-state normalization`);
  }
  assert.equal(launch.language,'ar','untouched fields survive');
  assert.equal(launch.isOffline,false,'launch starts online unless runtime detection says otherwise');
  assert.equal(launch.emergencyFrozen,false,'demo emergency state must not leak into launch');
  assert.equal(launch.persistenceError,null,'stale persistence failures must not leak into launch');
  assert.deepEqual(launch.operatingCostModel,{baselineStaff:0,mizanStaff:0,hoursPerDay:0,days:0},'launch cost model starts neutral, never with demo metrics');
});

test('the pending organisation and competition impersonate nobody',()=>{
  const org=launchOrganization(SEED_ORGANIZATION);
  assert.notEqual(org.id,SEED_ORGANIZATION.id);
  assert.doesNotMatch(org.name,/Demo/i);
  assert.doesNotMatch(org.nameArabic,/تجريب/);
  const comp=launchCompetition(SEED_COMPETITION,org.id);
  assert.equal(comp.status,'draft','a real deployment does not open already live');
  assert.equal(comp.totalRegistered,0);
  assert.equal(comp.totalApproved,0);
  assert.equal(comp.totalAttended,0);
  assert.equal(comp.organizationId,org.id);
  assert.ok(comp.ruleSet,'the rubric template survives as a starting point');
});

test('the placeholder identity holds no authority',()=>{
  const u=launchPlaceholderUser('org-x');
  assert.equal(u.id,'unauthenticated');
  assert.notEqual(u.role,'comp_admin','never starts as an administrator');
  assert.equal(u.email,'');
});

test('demo residue in a browser is detected so it is not revived',()=>{
  assert.equal(isDemoResidue(SEED_ORGANIZATION.id,SEED_ORGANIZATION.id),true);
  assert.equal(isDemoResidue('org-real-authority',SEED_ORGANIZATION.id),false);
  assert.equal(isDemoResidue(undefined,SEED_ORGANIZATION.id),false);
});

test('the demo seed itself still has the data product review needs',()=>{
  // الحارس يمنع تسرّبها للإنتاج، ولا يُفرّغ وضع استعراض المنتج.
  assert.ok(SEED_PARTICIPANTS.length>0);
  assert.ok(SEED_RESULTS.length>0);
});
