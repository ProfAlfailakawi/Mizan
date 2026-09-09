import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {IdentityGovernanceRepository,type ServerIdentity} from '../server/identity-governance';
import {NotificationCenterRepository} from '../server/notification-center';

const temp=(name:string)=>fs.mkdtempSync(path.join(os.tmpdir(),`${name}-`));
const read=(p:string)=>fs.readFileSync(p,'utf8');

test('notification inboxes keep read state isolated by organization context',()=>{
  const dir=temp('mizan-notification-context');
  try{
    const repo=new NotificationCenterRepository(dir);
    const owner:ServerIdentity={uid:'owner',role:'super_admin',organizationId:'__platform__'};
    repo.publish(owner,{title:'جهة أ',body:'رسالة أ',target:{type:'all'},context:{organizationId:'ORG-A'}});
    repo.publish(owner,{title:'جهة ب',body:'رسالة ب',target:{type:'all'},context:{organizationId:'ORG-B'}});
    const before=repo.list(owner);
    assert.deepEqual(new Set(before.notifications.map(x=>x.contextKey)),new Set(['organization:ORG-A','organization:ORG-B']));
    assert.equal(before.unread,2);
    repo.markAllRead(owner,'organization:ORG-A');
    const after=repo.list(owner);
    assert.equal(after.notifications.find(x=>x.contextKey==='organization:ORG-A')?.readAt!==undefined,true);
    assert.equal(after.notifications.find(x=>x.contextKey==='organization:ORG-B')?.readAt,undefined);
    assert.equal(after.unread,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('identity governance supports edit, reissue, account lifecycle, grant edit and reset cancellation',()=>{
  const dir=temp('mizan-identity-management');
  try{
    const repo=new IdentityGovernanceRepository(dir);
    const admin:ServerIdentity={uid:'org-admin',email:'admin@org.test',role:'org_admin',organizationId:'ORG-1'};
    const created=repo.createInvitation(admin,{email:'judge@org.test',displayName:'اسم قديم',requestedRole:'judge',competitionId:'COMP-1',reason:'إضافة عضو فريق للمسابقة'});
    const edited=repo.updateInvitation(admin,created.invitation.id,{displayName:'أحمد المحكم',email:'ahmad@org.test',requestedRole:'head_judge'});
    assert.equal(edited.invitation.displayName,'أحمد المحكم');
    assert.equal(edited.invitation.requestedRole,'head_judge');
    const reissued=repo.reissueInvitation(admin,created.invitation.id);
    const activated=repo.activate({uid:'judge-uid',email:'ahmad@org.test'},reissued.activationToken);
    repo.updateAccount(admin,activated.account.id,{displayName:'أحمد الفيلكاوي'});
    assert.equal(repo.updateGrant(admin,activated.grant.id,{role:'judge',reason:'تحديث المهمة الرسمية'}).grant.role,'judge');
    assert.equal(repo.suspend(admin,activated.account.id,'إيقاف مؤقت معتمد').status,'SUSPENDED');
    assert.equal(repo.resumeAccount(admin,activated.account.id,'إعادة التفعيل المعتمدة').account.status,'ACTIVE');
    const recipients=repo.notificationRecipients(admin);
    assert.equal(recipients.find(x=>x.userId==='judge-uid')?.displayName,'أحمد الفيلكاوي');
    const reset=repo.requestPasswordReset('ahmad@org.test');
    assert.ok(reset);
    assert.equal(repo.revokePasswordReset(admin,reset!.id,'إلغاء الطلب بناء على قرار المسؤول').removed,true);
    const pending=repo.createInvitation(admin,{email:'second@org.test',displayName:'مستخدم ثان',requestedRole:'judge',competitionId:'COMP-1',reason:'دعوة أخرى للاختبار'});
    assert.equal(repo.revokeInvitation(admin,pending.invitation.id,'إلغاء الدعوة قبل التفعيل').removed,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('notification recipient directory cannot cross an operator organization boundary',()=>{
  const dir=temp('mizan-recipient-scope');
  try{
    const repo=new IdentityGovernanceRepository(dir);
    const orgA:ServerIdentity={uid:'admin-a',role:'org_admin',organizationId:'ORG-A'};
    const orgB:ServerIdentity={uid:'admin-b',role:'org_admin',organizationId:'ORG-B'};
    const a=repo.createInvitation(orgA,{email:'a@org.test',displayName:'مستخدم الجهة أ',requestedRole:'judge',competitionId:'C-A',reason:'عضو لجنة الجهة أ'});
    const b=repo.createInvitation(orgB,{email:'b@org.test',displayName:'مستخدم الجهة ب',requestedRole:'judge',competitionId:'C-B',reason:'عضو لجنة الجهة ب'});
    repo.activate({uid:'user-a',email:'a@org.test'},a.activationToken);
    repo.activate({uid:'user-b',email:'b@org.test'},b.activationToken);
    const operatorAdmin:ServerIdentity={uid:'op-admin',role:'operator_admin',organizationId:'__operator__:OP-1',operatorId:'OP-1',operatorOrganizationIds:['ORG-A']};
    const recipients=repo.notificationRecipients(operatorAdmin);
    assert.equal(recipients.some(x=>x.userId==='user-a'),true);
    assert.equal(recipients.some(x=>x.userId==='user-b'),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('notification composer uses a permission-scoped people directory instead of raw UIDs and deep-links exact identity work',()=>{
  const center=read('src/components/layout/NotificationCenter.tsx');
  const identity=read('src/components/admin/IdentityGovernance.tsx');
  const server=read('server.ts');
  const saas=read('src/components/admin/SaaSWorkspace.tsx');
  const portals=read('src/components/admin/RolePortals.tsx');
  assert.match(center,/\/api\/notifications\/recipients/);
  assert.match(center,/تحديد كل الظاهر/);
  assert.match(center,/displayName/);
  assert.match(center,/role/);
  assert.doesNotMatch(center,/uid-1, uid-2|معرّفات المستخدمين/);
  assert.match(server,/replyToNotificationId/);
  assert.match(server,/notificationRecipientDirectory/);
  assert.match(server,/new URLSearchParams\(\{tab:'passwords',requestId:request\.id/);
  assert.match(server,/actionHref:`#identity\?\$\{q\.toString\(\)\}`/);
  assert.match(identity,/focusedRequestId/);
  assert.match(identity,/password-reset-\$\{focusedRequestId\}/);
  assert.match(saas,/identityDeepLink/);
  assert.match(saas,/organizationId/);
  assert.match(saas,/operatorId/);
  assert.match(portals,/window\.location\.hash\.startsWith\('#identity'\)/);
  assert.match(portals,/setAccessCompetitionId\(target\.id\)/);
});

test('identity management UI exposes real backend actions for pending and active identities',()=>{
  const identity=read('src/components/admin/IdentityGovernance.tsx');
  const server=read('server.ts');
  for(const token of ['/api/identity/invitations/${encodeURIComponent(editInvitation.id)}','/reissue','/api/identity/accounts/${encodeURIComponent(editAccount.id)}','/resume','/api/identity/grants/${encodeURIComponent(editGrant.grant.id)}','revoke-sessions','/api/identity/password-reset/${encodeURIComponent(confirm.reset.id)}'])assert.match(identity,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(server,/app\.patch\('\/api\/identity\/invitations\/:id'/);
  assert.match(server,/app\.delete\('\/api\/identity\/invitations\/:id'/);
  assert.match(server,/app\.patch\('\/api\/identity\/accounts\/:id'/);
  assert.match(server,/app\.post\('\/api\/identity\/accounts\/:id\/resume'/);
  assert.match(server,/app\.patch\('\/api\/identity\/grants\/:id'/);
  assert.match(server,/app\.delete\('\/api\/identity\/password-reset\/:id'/);
});
