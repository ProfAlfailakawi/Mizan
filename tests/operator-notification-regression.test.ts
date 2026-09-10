import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {IdentityGovernanceRepository,operatorIdentityOrganizationId,type ServerIdentity} from '../server/identity-governance';
import {NotificationCenterRepository} from '../server/notification-center';

const temp=(name:string)=>fs.mkdtempSync(path.join(os.tmpdir(),`${name}-`));
const owner:ServerIdentity={uid:'platform-owner',email:'owner@mizan.test',role:'super_admin',organizationId:'__platform__'};

test('operator identity lifecycle binds directly to operatorId and isolates operator owners',()=>{
  const repo=new IdentityGovernanceRepository(temp('mizan-operator-identity'));
  const first=repo.createInvitation(owner,{email:'owner@x.test',displayName:'مالك شركة X',requestedRole:'operator_owner',operatorId:'OP-X',reason:'Provision first operator owner'});
  const preview=repo.previewInvitation(first.activationToken);
  assert.equal(preview.operatorId,'OP-X');
  assert.equal(preview.organizationId,operatorIdentityOrganizationId('OP-X'));
  const activatedOwner=repo.activate({uid:'uid-owner-x',email:'owner@x.test'},first.activationToken);
  assert.equal(activatedOwner.grant.operatorId,'OP-X');
  assert.equal(activatedOwner.account.operatorId,'OP-X');
  assert.equal(activatedOwner.grant.organizationId,operatorIdentityOrganizationId('OP-X'));

  const operatorOwner:ServerIdentity={uid:'uid-owner-x',email:'owner@x.test',role:'operator_owner',organizationId:operatorIdentityOrganizationId('OP-X'),operatorId:'OP-X'};
  const adminInvite=repo.createInvitation(operatorOwner,{email:'admin@x.test',displayName:'مدير شركة X',requestedRole:'operator_admin',operatorId:'OP-X',reason:'Add operator administrator'});
  const admin=repo.activate({uid:'uid-admin-x',email:'admin@x.test'},adminInvite.activationToken);
  assert.equal(admin.grant.role,'operator_admin');
  assert.equal(admin.grant.operatorId,'OP-X');

  assert.throws(()=>repo.createInvitation(operatorOwner,{email:'cross@test',displayName:'Cross',requestedRole:'operator_admin',operatorId:'OP-Y',reason:'Attempt cross operator grant'}),/CROSS_OPERATOR_GRANT_BLOCKED/);
  assert.throws(()=>repo.createInvitation(operatorOwner,{email:'org@test',displayName:'Org admin',requestedRole:'org_admin',organizationId:'ORG-1',competitionId:'C-1',reason:'Operator must not become organization'}),/CROSS_OPERATOR_ORGANIZATION_BLOCKED/);

  const visible=repo.list(operatorOwner,undefined,undefined,'OP-X');
  // The operator owner now sees their own account (protected, non-deletable) plus their operator_admin staff — never other operators.
  const visibleUids=visible.accounts.map(a=>a.uid).sort();
  assert.deepEqual(visibleUids,['uid-admin-x','uid-owner-x']);
  assert.ok(visible.grants.some(g=>g.role==='operator_admin'&&g.operatorId==='OP-X'));
  assert.ok(visible.grants.some(g=>g.role==='operator_owner'&&g.operatorId==='OP-X'));
  assert.throws(()=>repo.list(operatorOwner,undefined,undefined,'OP-Y'),/CROSS_OPERATOR_ACCESS_BLOCKED/);

  const resolved=repo.identityForUid('uid-admin-x');
  assert.equal(resolved?.grant.operatorId,'OP-X');
  assert.equal(resolved?.grant.organizationId,operatorIdentityOrganizationId('OP-X'));
});

test('notification center scopes recipients, deduplicates, marks read and archives independently',()=>{
  const repo=new NotificationCenterRepository(temp('mizan-notifications'));
  const opX:ServerIdentity={uid:'x-admin',role:'operator_admin',organizationId:operatorIdentityOrganizationId('OP-X'),operatorId:'OP-X'};
  const opY:ServerIdentity={uid:'y-admin',role:'operator_admin',organizationId:operatorIdentityOrganizationId('OP-Y'),operatorId:'OP-Y'};
  const judge:ServerIdentity={uid:'judge-1',role:'judge',organizationId:'ORG-1',competitionId:'COMP-1'};

  const first=repo.publish({uid:'platform-owner',role:'super_admin'},{title:'رسالة للمشغّل',body:'تظهر لشركة X فقط',category:'admin',priority:'important',target:{type:'operator',operatorId:'OP-X'},dedupeKey:'operator-x-message'});
  const duplicate=repo.publish({uid:'platform-owner',role:'super_admin'},{title:'رسالة للمشغّل',body:'تظهر لشركة X فقط',category:'admin',priority:'important',target:{type:'operator',operatorId:'OP-X'},dedupeKey:'operator-x-message'});
  assert.equal(duplicate.deduplicated,true);
  assert.equal(duplicate.notification.id,first.notification.id);
  assert.equal(repo.list(opX).notifications.length,1);
  assert.equal(repo.list(opY).notifications.length,0);

  repo.publish({uid:'system',role:'system'},{title:'لجنة جديدة',body:'تم تعيينك في اللجنة',category:'competition',target:{type:'role',role:'judge',organizationId:'ORG-1',competitionId:'COMP-1'}});
  assert.equal(repo.list(judge).unread,1);
  const id=repo.list(judge).notifications[0].id;
  repo.markRead(judge.uid,id);
  assert.equal(repo.list(judge).unread,0);
  repo.archive(judge.uid,id);
  assert.equal(repo.list(judge).notifications.length,0);
  assert.equal(repo.list(opX).unread,1);
});
