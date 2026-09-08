import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityGovernanceRepository, type GovernanceRole } from '../server/identity-governance';
import { fullRetestApprovalAllowed } from '../src/lib/operational-integrity';

const orgAdmin=(uid:string,organizationId='org-1',competitionId='comp-1')=>({uid,email:`${uid}@example.org`,role:'org_admin' as const,organizationId,competitionId});
const compAdmin=(uid:string,organizationId='org-1',competitionId='comp-1')=>({uid,email:`${uid}@example.org`,role:'comp_admin' as const,organizationId,competitionId});

function withRepo(fn:(repo:IdentityGovernanceRepository,dir:string)=>void){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-notes-'));
 try{fn(new IdentityGovernanceRepository(dir),dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}
}

test('organization admin provisions competition manager and judge without a second person',()=>withRepo(repo=>{
 const manager=repo.createInvitation(orgAdmin('owner-delegate'),{email:'manager@example.org',displayName:'Competition Manager',requestedRole:'comp_admin',competitionId:'comp-1',reason:'Authorized competition manager'});
 assert.equal(manager.invitation.status,'READY');assert.ok(manager.activationToken);
 const judge=repo.createInvitation(orgAdmin('owner-delegate'),{email:'judge@example.org',displayName:'Judge',requestedRole:'judge',competitionId:'comp-1',reason:'Authorized judging panel'});
 assert.equal(judge.invitation.status,'READY');assert.ok(judge.activationToken);
}));


test('platform owner can provision the selected tenant while tenant admins cannot cross that boundary',()=>withRepo(repo=>{
 const owner={uid:'platform-owner',email:'owner@example.org',role:'super_admin' as const,organizationId:'platform'};
 const inv=repo.createInvitation(owner,{organizationId:'org-2',email:'orgadmin@example.org',displayName:'Org 2 Admin',requestedRole:'org_admin',reason:'Owner delegated tenant administration'});
 assert.equal(inv.invitation.organizationId,'org-2');assert.equal(inv.invitation.status,'READY');
 const account=repo.activate({uid:'org2-admin',email:'orgadmin@example.org'},inv.activationToken!);
 assert.equal(repo.list(owner,'org-2').accounts.some(x=>x.id===account.account.id),true);
 assert.throws(()=>repo.createInvitation(orgAdmin('admin-1','org-1'),{organizationId:'org-2',email:'x@example.org',displayName:'X',requestedRole:'judge',competitionId:'comp-1',reason:'Cross tenant attempt'}),/CROSS_TENANT_GRANT_BLOCKED/);
}));

test('competition manager provisions only within the delegated competition scope',()=>withRepo(repo=>{
 const ok=repo.createInvitation(compAdmin('manager'),{email:'judge@example.org',displayName:'Judge',requestedRole:'judge',competitionId:'comp-1',reason:'Panel assignment'});
 assert.equal(ok.invitation.status,'READY');
 assert.throws(()=>repo.createInvitation(compAdmin('manager'),{email:'other@example.org',displayName:'Other Judge',requestedRole:'judge',competitionId:'comp-2',reason:'Wrong competition'}),/COMPETITION_SCOPE_MISMATCH/);
}));

test('tenant list is isolated and a tenant admin never sees the platform super admin',()=>withRepo((repo,dir)=>{
 const a=repo.createInvitation(orgAdmin('admin-1','org-1'),{email:'a@example.org',displayName:'A',requestedRole:'judge',competitionId:'comp-1',reason:'Tenant one judge'});
 repo.activate({uid:'judge-a',email:'a@example.org'},a.activationToken!);
 const b=repo.createInvitation(orgAdmin('admin-2','org-2','comp-2'),{email:'b@example.org',displayName:'B',requestedRole:'judge',competitionId:'comp-2',reason:'Tenant two judge'});
 repo.activate({uid:'judge-b',email:'b@example.org'},b.activationToken!);

 // Seed a legacy/platform owner record only to prove it is invisible/protected to tenant admins.
 const file=path.join(dir,'identity-governance.json');
 const state=JSON.parse(fs.readFileSync(file,'utf8'));
 state.accounts.unshift({id:'acct-super',uid:'platform-owner',organizationId:'org-1',email:'owner@example.org',displayName:'Platform Owner',status:'ACTIVE',createdAt:new Date().toISOString(),activatedFromInvitationId:'platform-bootstrap'});
 state.grants.unshift({id:'grant-super',accountId:'acct-super',organizationId:'org-1',role:'super_admin',status:'ACTIVE',createdAt:new Date().toISOString(),createdBy:'bootstrap'});
 fs.writeFileSync(file,JSON.stringify(state,null,2));

 const visible=repo.list(orgAdmin('admin-1','org-1'));
 assert.deepEqual(visible.accounts.map(x=>x.uid),['judge-a']);
 assert.equal(visible.accounts.some(x=>x.uid==='judge-b'),false);
 assert.equal(visible.accounts.some(x=>x.uid==='platform-owner'),false);
 assert.throws(()=>repo.suspend(orgAdmin('admin-1','org-1'),'acct-super','Attempt platform owner suspension'),/SUPER_ADMIN_PROTECTED/);
 assert.throws(()=>repo.remove(orgAdmin('admin-1','org-1'),'acct-super','Attempt platform owner removal'),/SUPER_ADMIN_PROTECTED/);
}));

test('remove user is audit-preserving soft deletion and revokes access',()=>withRepo(repo=>{
 const inv=repo.createInvitation(orgAdmin('admin'),{email:'judge@example.org',displayName:'Judge',requestedRole:'judge',competitionId:'comp-1',reason:'Official judging assignment'});
 const active=repo.activate({uid:'judge-uid',email:'judge@example.org'},inv.activationToken!);
 repo.openSession({uid:'judge-uid',email:'judge@example.org',role:'judge',organizationId:'org-1',competitionId:'comp-1'},'tablet-1','Judge tablet','SINGLE_FACTOR');
 const out=repo.remove(orgAdmin('admin'),active.account.id,'No longer part of the competition team');
 assert.equal(out.removed,true);assert.equal(repo.identityForUid('judge-uid'),null);
 assert.equal(repo.list(orgAdmin('admin')).accounts.some(x=>x.id===active.account.id),false);
 assert.ok(repo.audit(orgAdmin('admin')).some(x=>x.action==='IDENTITY_ACCOUNT_REMOVED'&&x.entityId===active.account.id));
}));

test('retired scientific admin cannot be provisioned as a new role',()=>withRepo(repo=>{
 const retiredRole='scientific_admin' as unknown as GovernanceRole; // intentional pre-upgrade/forged legacy input
 assert.throws(()=>repo.createInvitation(orgAdmin('admin'),{email:'legacy@example.org',displayName:'Legacy role',requestedRole:retiredRole,competitionId:'comp-1',reason:'Legacy role attempt'}),/ROLE_RETIRED/);
}));

test('routine provisioning is direct while exceptional full retest still requires independent authority',()=>{
 assert.equal(fullRetestApprovalAllowed({actorRole:'head_judge',actorId:'h',proposedBy:'h',headJudgeId:'h',reason:'Independent review completed'}).reason,'INDEPENDENT_APPROVAL_REQUIRED');
 assert.equal(fullRetestApprovalAllowed({actorRole:'comp_admin',actorId:'other-admin',proposedBy:'h',headJudgeId:'h',reason:'Independent evidence review completed'}).ok,true);
});

test('all three global header overlays use document-body portals',()=>{
 for(const rel of ['src/components/design-system/Modal.tsx','src/components/design-system/ClarityGuide.tsx','src/components/design-system/CommandPalette.tsx']){
  const source=fs.readFileSync(rel,'utf8');assert.match(source,/createPortal/);assert.match(source,/document\.body/);
 }
});

test('user-facing role and identity screens contain no scientific-admin choice or preset role selection',()=>{
 const roles=fs.readFileSync('src/components/design-system/RoleSwitcher.tsx','utf8');
 const identity=fs.readFileSync('src/components/admin/IdentityGovernance.tsx','utf8');
 assert.doesNotMatch(roles,/scientific_admin\s*:/);
 assert.doesNotMatch(identity,/scientific_admin:'|value="scientific_admin"/);
 assert.match(identity,/useState<Role\|''>\(''\)/);
 assert.match(identity,/اختر الدور/);
});

test('activation token is presented as QR and not rendered as a raw long token',()=>{
 const identity=fs.readFileSync('src/components/admin/IdentityGovernance.tsx','utf8');
 const auth=fs.readFileSync('src/lib/useMizanAuth.ts','utf8');
 assert.match(identity,/<RealQRCode value=\{qrValue\}/);assert.match(identity,/#a=/);
 assert.doesNotMatch(identity,/font-mono text-\[10px\] break-all mt-2 select-all/);
 assert.match(auth,/activationTokenFromLocation/);assert.match(auth,/MZI1\|/);assert.match(auth,/ACCOUNT_NOT_PROVISIONED/);
});

test('large-file notes were applied: labels, no presets, full domains, delete API and staff MFA opt-in',()=>{
 const overview=fs.readFileSync('src/components/admin/CompetitionOverview.tsx','utf8');
 const brand=fs.readFileSync('src/components/admin/TenantBrandStudio.tsx','utf8');
 const tenants=fs.readFileSync('src/components/admin/TenantConsole.tsx','utf8');
 const rolePortals=fs.readFileSync('src/components/admin/RolePortals.tsx','utf8');
 const server=fs.readFileSync('server.ts','utf8');
 const store=fs.readFileSync('src/lib/store.ts','utf8');
 assert.match(overview,/w-14 text-center/);assert.doesNotMatch(overview,/COMPETITION_TEMPLATES\.map/);
 assert.doesNotMatch(brand,/PRESET_LOGOS\.map/);
 assert.match(tenants,/overflow-wrap:anywhere/);assert.match(rolePortals,/overflow-wrap:anywhere/);
 assert.match(server,/app\.delete\('\/api\/identity\/accounts\/:id'/);assert.match(server,/MIZAN_REQUIRE_MFA_FOR_SENSITIVE==='true'/);
 assert.doesNotMatch(store,/templateId = 'international-hifz'/);assert.doesNotMatch(store,/applyCompetitionTemplate\(base, templateId\)/);
});
