import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {SaaSPlatformRepository,SecretVault} from '../server/saas-platform';

const owner={uid:'owner',role:'super_admin',organizationId:'__platform__'};
const withRepo=(run:(repo:SaaSPlatformRepository,dir:string)=>void|Promise<void>)=>async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-saas-'));try{await run(new SaaSPlatformRepository(path.join(dir,'state.json')),dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}};
const dates={startsAt:'2026-01-01',expiresAt:'2027-01-01'};

test('operator organization creation atomically consumes one license credit',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner);
 const op=repo.createOperator(owner,{name:'Trusted Operator'});
 assert.throws(()=>repo.createOrganization({...owner,role:'operator_owner',operatorId:op.id},{officialName:'Org A',shortName:'A',organizationType:'charity',country:'KW',planId:plan.id,...dates}),/INSUFFICIENT_LICENSE_CREDITS/);
 repo.adjustCredits(owner,op.id,2,'paid package');
 const created=repo.createOrganization({...owner,role:'operator_owner',operatorId:op.id},{officialName:'Org A',shortName:'A',organizationType:'charity',country:'KW',planId:plan.id,...dates});
 assert.equal(created.creditBalance,1);
 assert.match(created.organization.id,/^MZ-ORG-/);
 assert.match(created.organization.tenantId,/^MZ-TEN-/);
 assert.match(created.license.id,/^MZ-LIC-/);
 assert.equal(repo.operatorDashboard({...owner,role:'operator_owner',operatorId:op.id}).organizations.length,1);
}));

test('owner can edit an unused plan and delete it, while licensed plans are protected',withRepo((repo)=>{
 const editable=repo.upsertPlan(owner,{name:'Draft',currency:'KWD',priceMinor:100});
 assert.equal(repo.upsertPlan(owner,{id:editable.id,name:'Updated',priceMinor:250}).name,'Updated');
 assert.equal(repo.deletePlan(owner,editable.id).id,editable.id);
 const used=repo.seedInitialPlan(owner);
 repo.createOrganization(owner,{officialName:'Licensed',shortName:'L',organizationType:'charity',country:'KW',planId:used.id,...dates});
 assert.throws(()=>repo.deletePlan(owner,used.id),/PLAN_IN_USE/);
	}));

test('owner can edit and safely delete organizations',withRepo((repo)=>{
 const basic=repo.seedInitialPlan(owner);
 const premium=repo.upsertPlan(owner,{name:'Premium',currency:'KWD',priceMinor:500,limits:{licensedOrganizations:1,activeCompetitions:5,annualParticipants:5000,storageBytes:20*1024**3,branches:5}});
 const cleanOrg=repo.createOrganization(owner,{officialName:'Clean Org',shortName:'Clean',organizationType:'charity',country:'KW',planId:basic.id,...dates}).organization;
 const updated=repo.updateOrganization(owner,cleanOrg.id,{officialName:'Updated Org',shortName:'Updated',country:'SA',planId:premium.id,status:'suspended',licenseStatus:'grace_period',startsAt:'2026-02-01',expiresAt:'2027-02-01'});
 assert.equal(updated.organization.officialName,'Updated Org');
 assert.equal(updated.organization.status,'suspended');
 assert.equal(updated.license.planId,premium.id);
 assert.equal(updated.license.status,'grace_period');
 assert.equal(repo.deleteOrganization(owner,cleanOrg.id).id,cleanOrg.id);
 const usedOrg=repo.createOrganization(owner,{officialName:'Used Org',shortName:'Used',organizationType:'charity',country:'KW',planId:basic.id,...dates}).organization;
 repo.setCompetitionState(owner,{organizationId:usedOrg.id,competitionId:'live',state:'registration_open'});
 assert.throws(()=>repo.deleteOrganization(owner,usedOrg.id),/ORGANIZATION_HAS_RECORDS/);
	}));

test('legal identity is locked behind an audited change request',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner);
 const {organization}=repo.createOrganization(owner,{officialName:'Original Legal Name',shortName:'Original',organizationType:'charity',country:'KW',planId:plan.id,...dates});
 const admin={uid:'admin',role:'org_admin',organizationId:organization.id};
 repo.updateOperational(admin,organization.id,{notificationEmail:'ops@example.org',contactName:'Operations'});
 const request=repo.requestIdentityChange(admin,organization.id,{field:'officialName',requestedValue:'Approved New Name',reason:'Legal merger completed'});
 assert.equal(repo.usage(admin,organization.id).organization.officialName,'Original Legal Name');
 repo.decideChange(owner,request.id,'approved','documents verified');
 assert.equal(repo.usage(admin,organization.id).organization.officialName,'Approved New Name');
 assert.equal(repo.verifyAudit().valid,true);
}));

test('drafts stay free while active competitions enforce the configured limit',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner,{limits:{licensedOrganizations:1,activeCompetitions:1,annualParticipants:2,storageBytes:100,branches:1}} as any);
 const {organization}=repo.createOrganization(owner,{officialName:'Competition Org',shortName:'CO',organizationType:'charity',country:'KW',planId:plan.id,...dates});
 const admin={uid:'admin',role:'org_admin',organizationId:organization.id};
 repo.setCompetitionState(admin,{organizationId:organization.id,competitionId:'c1',state:'registration_open'});
 repo.setCompetitionState(admin,{organizationId:organization.id,competitionId:'c2',state:'draft'});
 assert.throws(()=>repo.setCompetitionState(admin,{organizationId:organization.id,competitionId:'c2',state:'judging'}),/ACTIVE_COMPETITION_LIMIT_REACHED/);
 repo.setCompetitionState(admin,{organizationId:organization.id,competitionId:'c1',state:'completed'});
 assert.equal(repo.setCompetitionState(admin,{organizationId:organization.id,competitionId:'c2',state:'judging'}).state,'judging');
}));

test('storage reservation counts used plus reserved bytes and never deletes old files at quota',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner,{limits:{licensedOrganizations:1,activeCompetitions:1,annualParticipants:2,storageBytes:100,branches:1}} as any);
 const {organization}=repo.createOrganization(owner,{officialName:'Storage Org',shortName:'SO',organizationType:'charity',country:'KW',planId:plan.id,...dates});
 const admin={uid:'admin',role:'org_admin',organizationId:organization.id};
 const first=repo.reserveUpload(admin,{organizationId:organization.id,fileType:'audio',mimeType:'audio/mpeg',sizeBytes:70});
 assert.throws(()=>repo.reserveUpload(admin,{organizationId:organization.id,fileType:'audio',mimeType:'audio/mpeg',sizeBytes:31}),/STORAGE_QUOTA_REACHED/);
 repo.finalizeUpload(admin,first.id,{organizationId:organization.id,checksum:'sha256:ok'});
 const usage=repo.usage(admin,organization.id);
 assert.equal(usage.usage.mizanStorageBytes,70);
 assert.equal(usage.usage.byCategory.audio,70);
}));

test('external credentials live only in the encrypted vault and activation needs upload/read/delete proof',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-vault-'));try{
 const vault=new SecretVault(path.join(dir,'vault.json'),'a sufficiently long production test master key');
 const probe=async()=>({upload:true,read:true,remove:true});
 const repo=new SaaSPlatformRepository(path.join(dir,'state.json'),vault,probe);
 const plan=repo.upsertPlan(owner,{name:'External',currency:'KWD',priceMinor:100,limits:{licensedOrganizations:1,activeCompetitions:1,annualParticipants:10,storageBytes:100,branches:1},features:{external_storage:true}});
 const {organization}=repo.createOrganization(owner,{officialName:'External Org',shortName:'EO',organizationType:'government',country:'KW',planId:plan.id,...dates});
 const admin={uid:'admin',role:'org_admin',organizationId:organization.id};
 const account=repo.configureStorage(admin,organization.id,{provider:'cloudflare_r2',container:'private',secret:{accessKey:'AK_TEST',secretKey:'VERY_SECRET'}});
 assert.equal(account.secretReference,'stored_securely');
 assert.doesNotMatch(fs.readFileSync(path.join(dir,'state.json'),'utf8'),/VERY_SECRET|AK_TEST/);
 assert.doesNotMatch(fs.readFileSync(path.join(dir,'vault.json'),'utf8'),/VERY_SECRET|AK_TEST/);
 const raw=JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));
 const tested=await repo.testStorage(admin,organization.id,raw.storageAccounts[0].id);
 assert.equal(tested.connectionStatus,'connected');
 assert.equal(tested.lastTestResult,'upload_read_delete_verified');
}finally{fs.rmSync(dir,{recursive:true,force:true})}});

test('cross-tenant reads and organizer impersonation fail on the server',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner);
 const a=repo.createOrganization(owner,{officialName:'A',shortName:'A',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
 const b=repo.createOrganization(owner,{officialName:'B',shortName:'B',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
 const admin={uid:'admin-a',role:'org_admin',organizationId:a.id};
 assert.throws(()=>repo.usage(admin,b.id),/CROSS_TENANT_ACCESS_BLOCKED/);
 assert.throws(()=>repo.setCompetitionState(admin,{organizationId:a.id,competitionId:'c1',organizerOrganizationId:b.id,state:'draft'}),/INDEPENDENT_ORGANIZER_REQUIRES_LICENSE/);
}));

test('listOwnerTenants surfaces every operator-owned and direct organization as a tenant row',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner);
 const op=repo.createOperator(owner,{name:'دار البيان'});
 repo.adjustCredits(owner,op.id,2,'bootstrap');
 const orgUnder=repo.createOrganization({...owner,role:'operator_owner',operatorId:op.id},{officialName:'جهة تحت مشغّل',shortName:'U1',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
 const orgDirect=repo.createOrganization(owner,{officialName:'جهة مباشرة',shortName:'D1',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
 const tenants=repo.listOwnerTenants();
 const under=tenants.find(t=>t.orgId===orgUnder.id);
 const direct=tenants.find(t=>t.orgId===orgDirect.id);
 // Both appear so Tenant 360 / mirror can diagnose them in one place.
 assert.ok(under,'operator-owned organization must appear as an owner tenant');
 assert.ok(direct,'direct organization must appear as an owner tenant');
 assert.equal(under?.operatorName,'دار البيان');
 assert.equal(direct?.operatorName,undefined);
 assert.equal(under?.source,'saas');
}));

test('operator packages stay scoped to their owner and cannot be used or edited across operators',withRepo((repo)=>{
 const platformPlan=repo.seedInitialPlan(owner);
 const opA=repo.createOperator(owner,{name:'Operator A'});
 const opB=repo.createOperator(owner,{name:'Operator B'});
 const actorA={uid:'a',role:'operator_owner',organizationId:'__op__',operatorId:opA.id};
 const actorB={uid:'b',role:'operator_owner',organizationId:'__op__',operatorId:opB.id};

 const planA=repo.operatorUpsertPlan(actorA,{name:'باقة أ',priceMinor:5000,currency:'KWD'});
 assert.equal(planA.ownerOperatorId,opA.id);
 // Another operator may neither edit nor delete it.
 assert.throws(()=>repo.operatorUpsertPlan(actorB,{id:planA.id,name:'hijack'}),/CROSS_OPERATOR_PLAN_BLOCKED/);
 assert.throws(()=>repo.operatorDeletePlan(actorB,planA.id),/PLAN_NOT_FOUND/);

 // Operator B cannot provision an organization on operator A's package.
 repo.adjustCredits(owner,opB.id,1,'seed credit');
 assert.throws(()=>repo.createOrganization(actorB,{officialName:'Org B',shortName:'B',organizationType:'charity',country:'KW',planId:planA.id,...dates}),/PLAN_NOT_FOUND/);
 // The platform package remains available to every operator.
 const orgB=repo.createOrganization(actorB,{officialName:'Org B',shortName:'B',organizationType:'charity',country:'KW',planId:platformPlan.id,...dates});
 assert.equal(orgB.organization.operatorId,opB.id);

 // The owner's plan list excludes operator-owned packages; the operator sees their own.
 assert.ok(!repo.dashboard(owner).plans.some((p:any)=>p.id===planA.id));
 assert.ok(repo.operatorDashboard(actorA).ownedPlans.some((p:any)=>p.id===planA.id));
}));

test('billing issues invoices, records payment, and blocks cross-operator billing',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner);
 const opA=repo.createOperator(owner,{name:'Operator A'});
 const opB=repo.createOperator(owner,{name:'Operator B'});
 const actorA={uid:'a',role:'operator_owner',organizationId:'__op__',operatorId:opA.id};
 const actorB={uid:'b',role:'operator_owner',organizationId:'__op__',operatorId:opB.id};
 repo.adjustCredits(owner,opA.id,1,'seed credit');
 const org=repo.createOrganization(actorA,{officialName:'Org A',shortName:'A',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;

 // The operator bills their own organization.
 const sub=repo.createSubscription(actorA,{subjectType:'organization',subjectId:org.id,planId:plan.id});
 assert.equal(sub.status,'active');
 assert.equal(sub.ownerOperatorId,opA.id);
 const inv=repo.issueInvoice(actorA,{subjectType:'organization',subjectId:org.id,subscriptionId:sub.id,amountMinor:5000,currency:'KWD'});
 assert.equal(inv.status,'open');
 assert.equal(inv.provider,'manual');

 // Outstanding before payment, collected after.
 let ownerView=repo.dashboard(owner);
 assert.equal(ownerView.billing.summary.openInvoices,1);
 assert.equal(ownerView.billing.summary.outstanding[0].amountMinor,5000);
 const paid=repo.markInvoicePaid(actorA,inv.id,{method:'bank_transfer',reference:'TRX-1'});
 assert.equal(paid.status,'paid');
 assert.equal(paid.externalRef,'TRX-1');
 ownerView=repo.dashboard(owner);
 assert.equal(ownerView.billing.summary.openInvoices,0);
 assert.equal(ownerView.billing.summary.paidInvoices,1);
 assert.equal(ownerView.billing.summary.collected[0].amountMinor,5000);

 // A different operator cannot bill this organization, and no operator may bill an operator.
 assert.throws(()=>repo.issueInvoice(actorB,{subjectType:'organization',subjectId:org.id,amountMinor:100}),/BILLING_NOT_ALLOWED/);
 assert.throws(()=>repo.createSubscription(actorA,{subjectType:'operator',subjectId:opA.id,planId:plan.id}),/BILLING_NOT_ALLOWED/);

 // The platform owner bills the operator directly.
 const opSub=repo.createSubscription(owner,{subjectType:'operator',subjectId:opA.id,planId:plan.id});
 assert.equal(opSub.subjectType,'operator');
 const opInv=repo.issueInvoice(owner,{subjectType:'operator',subjectId:opA.id,subscriptionId:opSub.id,amountMinor:20000});
 assert.equal(repo.operatorDashboard(actorA).billing.myInvoices[0].id,opInv.id);
 // A paid invoice cannot be voided.
 repo.markInvoicePaid(owner,opInv.id,{});
 assert.throws(()=>repo.voidInvoice(owner,opInv.id),/INVOICE_ALREADY_PAID/);
}));

test('storage quota trusts the measured size, releases abandoned reservations and honours an operator cap',withRepo((repo)=>{
 const plan=repo.upsertPlan(owner,{name:'Small',limits:{licensedOrganizations:1,activeCompetitions:3,annualParticipants:100,storageBytes:1000,branches:1}});
 const op=repo.createOperator(owner,{name:'Operator A'});
 repo.adjustCredits(owner,op.id,2,'seed credits');
 const actorA={uid:'a',role:'operator_owner',organizationId:'__op__',operatorId:op.id};
 const org=repo.createOrganization(actorA,{officialName:'Org A',shortName:'A',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
 const orgActor={uid:'admin',role:'org_admin',organizationId:org.id};

 // A client that under-reports its size cannot smuggle a file past the quota: the measured size wins.
 const sneaky=repo.reserveUpload(orgActor,{organizationId:org.id,fileType:'audio',mimeType:'audio/mpeg',sizeBytes:10});
 assert.throws(()=>repo.finalizeUpload(orgActor,sneaky.id,{organizationId:org.id,checksum:'abc',actualSizeBytes:5000}),/STORAGE_QUOTA_REACHED/);
 // The rejected reservation is released, so it does not keep consuming the quota.
 assert.equal(repo.usage(orgActor,org.id).usage.reservedBytes,0);

 // An honest upload records its real measured size.
 const good=repo.reserveUpload(orgActor,{organizationId:org.id,fileType:'audio',mimeType:'audio/mpeg',sizeBytes:100});
 const stored=repo.finalizeUpload(orgActor,good.id,{organizationId:org.id,checksum:'def',actualSizeBytes:400});
 assert.equal(stored.sizeBytes,400);
 assert.equal(repo.usage(orgActor,org.id).usage.mizanStorageBytes,400);

 // An operator-wide cap stops the total across all of that operator's organizations.
 repo.updateOperator(owner,op.id,{storageCapBytes:500});
 assert.throws(()=>repo.reserveUpload(orgActor,{organizationId:org.id,fileType:'audio',mimeType:'audio/mpeg',sizeBytes:200}),/OPERATOR_STORAGE_CAP_REACHED/);
 repo.updateOperator(owner,op.id,{storageCapBytes:0});
 const allowed=repo.reserveUpload(orgActor,{organizationId:org.id,fileType:'audio',mimeType:'audio/mpeg',sizeBytes:200});
 assert.equal(allowed.state,'reserved');
}));

test('gateway settlement is idempotent and refuses a mismatched amount',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner);
 const org=repo.createOrganization(owner,{officialName:'Direct Org',shortName:'D',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
 const sub=repo.createSubscription(owner,{subjectType:'organization',subjectId:org.id,planId:plan.id});
 const inv=repo.issueInvoice(owner,{subjectType:'organization',subjectId:org.id,subscriptionId:sub.id,amountMinor:5000,currency:'KWD'});
 repo.attachCheckout(owner,inv.id,{provider:'demo',externalRef:'ref-9'});

 // A payment for a different amount must not close the invoice; it is left for a human.
 assert.throws(()=>repo.settleInvoiceByReference('demo','ref-9',{amountMinor:100}),/PAYMENT_AMOUNT_MISMATCH/);
 assert.equal(repo.dashboard(owner).billing.invoices[0].status,'open');

 const first=repo.settleInvoiceByReference('demo','ref-9',{amountMinor:5000,method:'knet'});
 assert.equal(first.alreadySettled,false);
 assert.equal(first.invoice.status,'paid');
 assert.equal(first.invoice.method,'knet');

 // A replayed notification changes nothing.
 const replay=repo.settleInvoiceByReference('demo','ref-9',{amountMinor:5000});
 assert.equal(replay.alreadySettled,true);
 assert.equal(repo.dashboard(owner).billing.summary.paidInvoices,1);

 assert.throws(()=>repo.settleInvoiceByReference('demo','unknown-ref',{}),/INVOICE_NOT_FOUND/);
}));

test('settlement is scoped to its own gateway and refuses a foreign currency, auditing every rejection',withRepo((repo)=>{
 const plan=repo.seedInitialPlan(owner);
 const mk=(name:string)=>repo.createOrganization(owner,{officialName:name,shortName:name,organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
 const orgA=mk('Org A'),orgB=mk('Org B');
 const invA=repo.issueInvoice(owner,{subjectType:'organization',subjectId:orgA.id,amountMinor:5000,currency:'KWD'});
 const invB=repo.issueInvoice(owner,{subjectType:'organization',subjectId:orgB.id,amountMinor:5000,currency:'KWD'});
 // The same reference exists under two different providers.
 repo.attachCheckout(owner,invA.id,{provider:'gw-one',externalRef:'shared-ref'});
 repo.attachCheckout(owner,invB.id,{provider:'gw-two',externalRef:'shared-ref'});

 // Each gateway settles only its own invoice.
 repo.settleInvoiceByReference('gw-two','shared-ref',{amountMinor:5000,currency:'KWD'});
 const after=repo.dashboard(owner).billing.invoices;
 assert.equal(after.find((x:any)=>x.id===invB.id).status,'paid');
 assert.equal(after.find((x:any)=>x.id===invA.id).status,'open','the other gateway’s invoice must stay open');

 // A numerically equal amount in another currency is not payment.
 assert.throws(()=>repo.settleInvoiceByReference('gw-one','shared-ref',{amountMinor:5000,currency:'USD'}),/PAYMENT_CURRENCY_MISMATCH/);
 assert.equal(repo.dashboard(owner).billing.invoices.find((x:any)=>x.id===invA.id).status,'open');

 // Both rejections are durably audited for the promised human review.
 const actions=repo.dashboard(owner).audit.map((a:any)=>a.action);
 assert.ok(actions.includes('INVOICE_PAYMENT_CURRENCY_MISMATCH'),'currency mismatch must be recorded');
 assert.throws(()=>repo.settleInvoiceByReference('gw-one','shared-ref',{amountMinor:1}),/PAYMENT_AMOUNT_MISMATCH/);
 assert.ok(repo.dashboard(owner).audit.map((a:any)=>a.action).includes('INVOICE_PAYMENT_AMOUNT_MISMATCH'),'amount mismatch must be recorded');

 // An unknown provider for a known reference finds nothing.
 assert.throws(()=>repo.settleInvoiceByReference('gw-three','shared-ref',{}),/INVOICE_NOT_FOUND/);
}));

test('the billing cycle closes itself: it renews on time, bills real overage, and never double-invoices',withRepo((repo)=>{
 const plan=repo.upsertPlan(owner,{name:'Annual',currency:'KWD',priceMinor:10000,billingPeriod:'annual',
  limits:{licensedOrganizations:1,activeCompetitions:3,annualParticipants:1000,storageBytes:100*1024**3,branches:1},
  overage:{includedParticipants:2,perParticipantMinor:500,includedStorageGb:1000,perStorageGbMinor:100}});
 const org=repo.createOrganization(owner,{officialName:'Org A',shortName:'A',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
 const sub=repo.createSubscription(owner,{subjectType:'organization',subjectId:org.id,planId:plan.id,startsAt:'2026-01-01'});
 assert.equal(sub.autoRenew,true);
 assert.equal(sub.currentPeriodEnd.slice(0,10),'2027-01-01');

 // Before the period ends nothing is issued.
 assert.equal(repo.runBillingCycle(new Date('2026-06-01')).issued.length,0);

 // Three participants used against two included, at 5.00 each.
 repo.setCompetitionState(owner,{organizationId:org.id,competitionId:'C1',state:'registration_open'});
 for(const id of ['p1','p2','p3'])repo.recordParticipant(owner,{organizationId:org.id,competitionId:'C1',participantId:id,year:2027});

 const run=repo.runBillingCycle(new Date('2027-01-02'));
 assert.equal(run.issued.length,1);
 const inv=run.issued[0];
 assert.equal(inv.periodStart.slice(0,10),'2027-01-01');
 assert.equal(inv.amountMinor,10000+500,'subscription plus one participant of overage');
 assert.ok(inv.lines.some((l:any)=>/متسابقون فوق المشمول/.test(l.description)));
 assert.ok(inv.dueAt,'a renewal invoice carries a due date so it can become overdue');

 // The period advanced, and a second run in the same period issues nothing.
 assert.equal(repo.runBillingCycle(new Date('2027-01-03')).issued.length,0,'running twice must not double-invoice');
 assert.equal(repo.dashboard(owner).billing.invoices.filter((x:any)=>x.subscriptionId===sub.id).length,1);

 // A cancelled subscription stops renewing.
 repo.cancelSubscription(owner,sub.id);
 assert.equal(repo.runBillingCycle(new Date('2029-01-02')).issued.length,0);
}));
