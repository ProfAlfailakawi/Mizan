import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const text=(p:string)=>fs.readFileSync(p,'utf8');

test('legacy pending competition work is promoted before public publishing instead of being discarded',()=>{
  const store=text('src/lib/store.ts');
  const start=store.indexOf('const materializePendingCompetitionForPublish');
  const end=store.indexOf('const createCompetition',start);
  const migration=store.slice(start,end);
  assert.match(migration,/newId\('comp'\)/);
  assert.match(migration,/row\.competitionId!==previousId/);
  assert.match(migration,/competitionId:nextId/);
  assert.match(migration,/globalState\.competitions=\[nextCompetition/);
  const publish=store.slice(store.indexOf('const publishPublicCompetitionRecord'),store.indexOf('const checkPublicCompetitionPublished'));
  assert.ok(publish.indexOf('materializePendingCompetitionForPublish()')<publish.indexOf('launchPlaceholderActive()'));
});

test('organization home hides only the empty launch placeholder and preserves recoverable legacy work',()=>{
  const portal=text('src/components/admin/RolePortals.tsx');
  assert.match(portal,/if\(c\.id!=='comp-pending-setup'\)return c\.organizationId!=='org-pending-setup'/);
  assert.match(portal,/const hasLegacyWork=/);
  assert.match(portal,/return organization\.id!=='org-pending-setup'&&hasLegacyWork/);
  assert.match(portal,/visibleCompetitions\.map\(c=>/);
  assert.match(portal,/!visibleCompetitions\.length&&<EmptyState/);
});

test('publication status check is read-only and publish verifies Firestore readback',()=>{
  const store=text('src/lib/store.ts');
  const start=store.indexOf('const checkPublicCompetitionPublished');
  const end=store.indexOf('const republishPublicCompetition',start);
  const check=store.slice(start,end);
  assert.doesNotMatch(check,/publishPublicCompetitionRecord\s*\(/);
  assert.match(check,/cache:'no-store'/);
  assert.match(check,/expectedRevision=globalState\.competitionConfigUpdatedAt\|\|globalState\.competition\.updatedAt/);
  assert.match(check,/data\.updatedAt===expectedRevision/);
  const publish=store.slice(store.indexOf('const publishPublicCompetitionRecord'),start);
  assert.match(publish,/verification=await getDoc\(publicRef\)/);
});

test('server-side public mirror refuses placeholder and cross-tenant publishes',()=>{
  const server=text('server.ts');
  const start=server.indexOf("app.post('/api/public/competitions/:competitionId/publish'");
  const end=server.indexOf("app.post('/api/public/competitions/:competitionId/register'",start);
  const route=server.slice(start,end);
  assert.match(route,/cleanId==='comp-pending-setup'/);
  assert.match(route,/bodyOrgId==='org-pending-setup'/);
  assert.match(route,/ORGANIZATION_SCOPE_MISMATCH/);
  assert.match(route,/COMPETITION_SCOPE_MISMATCH/);
  assert.match(route,/Cache-Control','no-store'/);
  const lookup=server.slice(server.indexOf('const getPublicCompetitionRecord'),start);
  assert.match(lookup,/if\(cleanId==='comp-pending-setup'\|\|RETIRED_SEED_COMPETITION_IDS\.has\(cleanId\)\)return null/);
});

test('public Firestore projection enforces exact competition scope for privileged competition staff',()=>{
  const rules=text('firestore.rules');
  const start=rules.indexOf('match /public_competitions/{competitionId}');
  const end=rules.indexOf('match /public_boards/{competitionId}',start);
  const block=rules.slice(start,end);
  assert.ok((block.match(/compScope\(competitionId\)/g)||[]).length>=2);
});

test('retired demo surfaces and seed data are absent from the production source tree',()=>{
  for(const p of ['src/components/public/DemoReturn.tsx','src/components/public/ExperienceHub.tsx','src/lib/seed-data.ts']){
    assert.equal(fs.existsSync(p),false,p);
  }
  const science=text('src/components/admin/ScientificGovernance.tsx');
  assert.doesNotMatch(science,/DEVELOPMENT_QUESTION_BANK|DEVELOPMENT QUESTION FIXTURES/);
  const pkg=JSON.parse(text('package.json'));
  assert.equal(pkg.scripts['production-audit'],'node scripts/production-runtime-audit.mjs');
  assert.match(pkg.scripts.check,/production-audit/);
});
