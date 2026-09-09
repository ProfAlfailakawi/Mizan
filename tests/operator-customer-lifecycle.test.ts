import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {IdentityGovernanceRepository,operatorIdentityOrganizationId,type ServerIdentity} from '../server/identity-governance';
import {SaaSPlatformRepository} from '../server/saas-platform';

const owner:ServerIdentity={uid:'platform-owner',email:'owner@mizan.test',role:'super_admin',organizationId:'__platform__'};
const commercialOwner={uid:'platform-owner',role:'super_admin',organizationId:'__platform__'};
const dates={startsAt:'2026-01-01',expiresAt:'2027-01-01'};

test('full operator customer lifecycle is server-scoped from invitation to organization admin workspace',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-operator-customer-'));
  try{
    const identity=new IdentityGovernanceRepository(path.join(dir,'identity'));
    const saas=new SaaSPlatformRepository(path.join(dir,'saas','state.json'));
    const plan=saas.seedInitialPlan(commercialOwner);
    const opX=saas.createOperator(commercialOwner,{name:'شركة X'});
    const opY=saas.createOperator(commercialOwner,{name:'شركة Y'});
    saas.adjustCredits(commercialOwner,opX.id,2,'bootstrap شركة X');
    saas.adjustCredits(commercialOwner,opY.id,1,'bootstrap شركة Y');

    const ownerInvite=identity.createInvitation(owner,{email:'owner@x.test',displayName:'مالك شركة X',requestedRole:'operator_owner',operatorId:opX.id,reason:'Provision first operator owner'});
    const ownerActivation=identity.activate({uid:'uid-owner-x',email:'owner@x.test'},ownerInvite.activationToken);
    assert.equal(ownerActivation.grant.role,'operator_owner');
    assert.equal(ownerActivation.grant.operatorId,opX.id);
    assert.equal(ownerActivation.grant.organizationId,operatorIdentityOrganizationId(opX.id));

    let operatorOwner:ServerIdentity={uid:'uid-owner-x',email:'owner@x.test',role:'operator_owner',organizationId:operatorIdentityOrganizationId(opX.id),operatorId:opX.id};
    const adminInvite=identity.createInvitation(operatorOwner,{email:'admin@x.test',displayName:'مدير شركة X',requestedRole:'operator_admin',operatorId:opX.id,reason:'Add delegated operator admin'});
    const adminActivation=identity.activate({uid:'uid-admin-x',email:'admin@x.test'},adminInvite.activationToken);
    assert.equal(adminActivation.grant.operatorId,opX.id);
    assert.throws(()=>identity.list(operatorOwner,undefined,undefined,opY.id),/CROSS_OPERATOR_ACCESS_BLOCKED/);

    const org1=saas.createOrganization({uid:operatorOwner.uid,role:'operator_owner',organizationId:operatorOwner.organizationId,operatorId:opX.id},{officialName:'جهة X الأولى',shortName:'X1',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
    const org2=saas.createOrganization({uid:operatorOwner.uid,role:'operator_owner',organizationId:operatorOwner.organizationId,operatorId:opX.id},{officialName:'جهة X الثانية',shortName:'X2',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
    const orgY=saas.createOrganization({uid:commercialOwner.uid,role:'operator_owner',organizationId:operatorIdentityOrganizationId(opY.id),operatorId:opY.id},{officialName:'جهة Y',shortName:'Y',organizationType:'charity',country:'KW',planId:plan.id,...dates}).organization;
    operatorOwner={...operatorOwner,operatorOrganizationIds:saas.operatorOrganizationIds(opX.id)};

    const orgAdminInvite=identity.createInvitation(operatorOwner,{email:'admin@org-x1.test',displayName:'مدير جهة X الأولى',requestedRole:'org_admin',organizationId:org1.id,reason:'Provision first customer organization admin'});
    const orgAdminActivation=identity.activate({uid:'uid-org-x1',email:'admin@org-x1.test'},orgAdminInvite.activationToken);
    assert.equal(orgAdminActivation.grant.role,'org_admin');
    assert.equal(orgAdminActivation.grant.organizationId,org1.id);
    assert.equal(orgAdminActivation.grant.operatorId,undefined);

    const orgAdmin:ServerIdentity={uid:'uid-org-x1',email:'admin@org-x1.test',role:'org_admin',organizationId:org1.id,operatorId:saas.operatorIdForOrganization(org1.id)};
    assert.equal(identity.identityForUid('uid-org-x1')?.grant.organizationId,org1.id);
    assert.equal(saas.usage(orgAdmin,org1.id).organization.id,org1.id);
    assert.throws(()=>saas.usage(orgAdmin,org2.id),/CROSS_TENANT_ACCESS_BLOCKED/);
    assert.throws(()=>saas.usage(orgAdmin,orgY.id),/CROSS_TENANT_ACCESS_BLOCKED/);

    const org1Visible=identity.list(operatorOwner,org1.id);
    assert.equal(org1Visible.accounts.length,1);
    assert.equal(org1Visible.accounts[0].uid,'uid-org-x1');
    assert.throws(()=>identity.list(operatorOwner,orgY.id),/CROSS_OPERATOR_ORGANIZATION_BLOCKED/);
    assert.throws(()=>identity.createInvitation(operatorOwner,{email:'hack@y.test',displayName:'Cross Org',requestedRole:'org_admin',organizationId:orgY.id,reason:'Cross operator attempt'}),/CROSS_OPERATOR_ORGANIZATION_BLOCKED/);
    assert.throws(()=>identity.createInvitation(operatorOwner,{email:'judge@x1.test',displayName:'Judge',requestedRole:'judge',organizationId:org1.id,competitionId:'c1',reason:'Operator cannot staff competitions'}),/ROLE_GRANT_NOT_ALLOWED/);

    const operatorAdmin:ServerIdentity={uid:'uid-admin-x',email:'admin@x.test',role:'operator_admin',organizationId:operatorIdentityOrganizationId(opX.id),operatorId:opX.id,operatorOrganizationIds:saas.operatorOrganizationIds(opX.id)};
    assert.equal(identity.list(operatorAdmin,org1.id).accounts.length,1);
    assert.throws(()=>identity.list(operatorAdmin,orgY.id),/CROSS_OPERATOR_ORGANIZATION_BLOCKED/);
    assert.throws(()=>identity.createInvitation(operatorAdmin,{email:'admin@y.test',displayName:'Cross Admin',requestedRole:'org_admin',organizationId:orgY.id,reason:'Cross operator admin attempt'}),/CROSS_OPERATOR_ORGANIZATION_BLOCKED/);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
