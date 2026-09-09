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
