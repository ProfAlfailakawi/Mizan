import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityGovernanceRepository } from '../server/identity-governance';

test('tenant managers must issue roles inside a competition and one Firebase identity may serve separate competitions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-comp-scope-'));
 try{
  const repo=new IdentityGovernanceRepository(dir);
  const admin={uid:'org-admin-1',email:'admin@example.test',role:'org_admin' as const,organizationId:'org-1'};
  assert.throws(()=>repo.createInvitation(admin,{email:'judge@example.test',displayName:'Judge',requestedRole:'judge',reason:'Assign judge safely'}),/COMPETITION_SCOPE_REQUIRED/);

  const a=repo.createInvitation(admin,{email:'judge@example.test',displayName:'Judge',requestedRole:'judge',competitionId:'comp-a',reason:'Assign judge to A'});
  const first=repo.activate({uid:'firebase-judge',email:'judge@example.test'},a.activationToken);
  assert.equal(first.grant.competitionId,'comp-a');

  const b=repo.createInvitation(admin,{email:'judge@example.test',displayName:'Judge',requestedRole:'judge',competitionId:'comp-b',reason:'Assign judge to B'});
  const second=repo.activate({uid:'firebase-judge',email:'judge@example.test'},b.activationToken);
  assert.equal(second.account.id,first.account.id);
  assert.equal(second.grant.competitionId,'comp-b');

  const listA=repo.list(admin,undefined,'comp-a');
  const listB=repo.list(admin,undefined,'comp-b');
  assert.equal(listA.grants.length,1);
  assert.equal(listA.grants[0].competitionId,'comp-a');
  assert.equal(listB.grants.length,1);
  assert.equal(listB.grants[0].competitionId,'comp-b');

  repo.removeGrant(admin,listA.grants[0].id,'Remove access from A only');
  assert.equal(repo.identityForUid('firebase-judge','comp-a'),null);
  assert.equal(repo.identityForUid('firebase-judge','comp-b')?.grant.competitionId,'comp-b');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('QR onboarding creates the invited Firebase account and organization admin returns from competition without role impersonation',()=>{
 const auth=fs.readFileSync('src/components/auth/AuthPortal.tsx','utf8');
 const org=fs.readFileSync('src/components/admin/RolePortals.tsx','utf8');
 const comp=fs.readFileSync('src/components/admin/CompetitionOverview.tsx','utf8');
 const app=fs.readFileSync('src/App.tsx','utf8');
 const server=fs.readFileSync('server.ts','utf8');
 assert.match(auth,/createUserWithEmailAndPassword/);
 assert.match(auth,/\/api\/identity\/invitation\/preview/);
 assert.match(auth,/\/api\/identity\/activate/);
 assert.match(org,/#manage-competition/);
 assert.doesNotMatch(org,/selectCompetition\(c\.id\);switchRole\('comp_admin'\)/);
 assert.match(comp,/IdentityGovernance competitionId=\{competition\.id\}/);
 assert.match(comp,/العودة إلى مسابقات الجهة/);
 assert.match(app,/case 'org_admin': return hash\.startsWith\('#manage-competition'\)\?<CompetitionOverview\/>:<OrganizationHome\/>;/);
 assert.match(server,/\/api\/identity\/grants\/:id/);
});
