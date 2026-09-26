import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { delegationScopeFor, allowedReadingsFor } from '../src/lib/delegation-scope';

const read=(p:string)=>fs.readFileSync(p,'utf8');

test('each delegation manager account owns its own delegation scope',()=>{
  assert.equal(delegationScopeFor({id:'uid-1'}),'delegation-uid-1');
  assert.equal(delegationScopeFor({id:'uid-1',delegationId:'delegation-current'}),'delegation-current');
  assert.deepEqual(allowedReadingsFor({riwaya:'Hafs',allowedRiwayat:['Warsh','Hafs']} as any),['Hafs','Warsh']);
});

test('delegation portal registers students with the registration fields; enterprise no longer hosts the picker',()=>{
  const portal=read('src/components/admin/RolePortals.tsx'); const enterprise=read('src/components/admin/EnterpriseWorkspace.tsx');
  assert.doesNotMatch(portal,/const delegationId='delegation-current'/,'no demo-only hard-coded scope');
  assert.match(portal,/delegationScopeFor\(currentUser\)/);
  for(const f of ['fullNameArabic','country','nationality','dateOfBirth','categoryId','riwaya']) assert.match(portal,new RegExp(`field\\('${f}'|set\\('${f}'`),f);
  assert.match(portal,/makeMizanPassPayload\(selected\.code\)/,'credentials are shown');
  assert.doesNotMatch(enterprise,/اختر مشاركًا/);
  assert.doesNotMatch(enterprise,/الجهات المشاركة والوفود'/);
  assert.ok(fs.existsSync('src/components/public/RegistrationFlow.tsx'),'individual self-registration stays');
});

test('demo role switcher uses the same role labels as the real product',()=>{
  const bar=read('src/components/layout/DemoBar.tsx');
  assert.match(bar,/roleLabel\(role, ar\)/);
  assert.doesNotMatch(bar,/ROLE_LABELS/);
  assert.match(read('src/lib/store.ts'),/'delegation_manager', 'participant'/,'delegation manager is selectable in the demo');
});
