import fs from 'node:fs';
import path from 'node:path';

/*
 * Production runtime gate.
 *
 * This gate is intentionally narrower than the general source audit: tests, research fixtures and
 * historical compatibility types may exist in the repository, but no demo surface, seeded runtime
 * data or unauthenticated preview path may be reachable from the shipped application.
 */
const retiredRuntimeFiles=[
  'src/components/public/DemoReturn.tsx',
  'src/components/public/ExperienceHub.tsx',
  'src/lib/seed-data.ts',
];

const failures=[];
for(const file of retiredRuntimeFiles){
  if(fs.existsSync(file))failures.push(`retired runtime file still exists: ${file}`);
}

const read=(file)=>fs.readFileSync(file,'utf8');
const app=read('src/App.tsx');
const store=read('src/lib/store.ts');
const portals=read('src/components/admin/RolePortals.tsx');
const server=read('server.ts');

const assert=(condition,message)=>{if(!condition)failures.push(message)};
assert(/const requireAuth=true/.test(app),'staff runtime must require authentication unconditionally');
assert(!/DemoReturn|ExperienceHub|demoMode/.test(app),'App.tsx still references a demo/preview surface');
assert(!/from ['"]\.\/seed-data['"]/.test(store),'store imports development seed data');
assert(!/DEVELOPMENT_QUESTION_BANK|QURAN_SOURCE_FIXTURES/.test(read('src/lib/quran-vault.ts')),'Quran vault contains development/demo fixtures');

const sessionStart=store.indexOf('const startSessionForParticipant');
const productionGuard=store.indexOf('if(productionMode){',sessionStart);
/* حزمة الخادم تُجرَّب أولًا دائمًا، ومصحف التسليم بعدها — لا قبلها ولا بدلًا منها. */
const deliveryFallback=store.indexOf("sourceMode:'CERTIFIED_SOURCE'|'DELIVERY_MUSHAF'",sessionStart);
assert(sessionStart>=0&&productionGuard>sessionStart&&deliveryFallback>productionGuard,'official judging must attempt the server-held question path before falling back to the delivery Mushaf');

const checkStart=store.indexOf('const checkPublicCompetitionPublished');
const checkEnd=store.indexOf('const republishPublicCompetition',checkStart);
const checkBlock=checkStart>=0&&checkEnd>checkStart?store.slice(checkStart,checkEnd):'';
assert(checkBlock.length>0,'public publication check function is missing');
assert(!/publishPublicCompetitionRecord\s*\(/.test(checkBlock),'a status check must not mutate state by auto-publishing');
assert(/materializePendingCompetitionForPublish/.test(store),'legacy pending competition migration is missing');
assert(/verification=await getDoc\(publicRef\)/.test(store),'public publish must verify the authoritative record after writing');
assert(/const issueFederationAttestation=async[\s\S]{0,500}?if\(productionMode\)return null/.test(store),'browser-signed federation claims must fail closed in production');
assert(/const exportEmergencyPack=async\(\)=>\{if\(productionMode\)return null/.test(store),'browser-held emergency-pack keys must fail closed in production');
assert(/const sealCeremonyVault=async\(\)=>\{if\(productionMode\)return null/.test(store),'browser-held ceremony-vault keys must fail closed in production');
assert(/const buildFairDrawPublicProof=async\(\)=>\{if\(productionMode\)return null/.test(store),'browser FairDraw proof generation must be disabled in production; production proof authority is server-side');
assert(/if\(productionMode\)return \{valid:false,reason:'PRODUCTION_SERVER_PROOF_REQUIRED'\}/.test(store),'browser FairDraw verification must require a server-produced proof in production');

const publishRouteStart=server.indexOf("app.post('/api/public/competitions/:competitionId/publish'");
const publishRouteEnd=server.indexOf("app.post('/api/public/competitions/:competitionId/register'",publishRouteStart);
const publishRoute=publishRouteStart>=0&&publishRouteEnd>publishRouteStart?server.slice(publishRouteStart,publishRouteEnd):'';
assert(/ORGANIZATION_SCOPE_MISMATCH/.test(publishRoute),'server publish route does not enforce tenant scope');
assert(/COMPETITION_SCOPE_MISMATCH/.test(publishRoute),'server publish route does not enforce competition-admin scope');
assert(/org-pending-setup/.test(publishRoute)&&/comp-pending-setup/.test(publishRoute),'server publish route does not reject launch placeholders');
assert(/if\(cleanId==='comp-pending-setup'\|\|RETIRED_SEED_COMPETITION_IDS\.has\(cleanId\)\)return null/.test(server),'public placeholder id must not alias to another competition');
const rules=read('firestore.rules');
const publicRules=rules.slice(rules.indexOf('match /public_competitions/{competitionId}'),rules.indexOf('match /public_boards/{competitionId}'));
assert((publicRules.match(/compScope\(competitionId\)/g)||[]).length>=2,'public Firestore projection writes must enforce exact competition scope');
assert(!/\.\.\/src\/lib\/seed-data/.test(read('scripts/live-day.ts')),'live-day QA still imports retired runtime seed data');

/* Scan executable source imports/references, but intentionally exclude compatibility type unions. */
const runtimeRoots=['src/components','src/lib','server'];
const allowedFiles=new Set([
  'src/lib/nextgen-integrity.ts',        // explicitly typed adapters; no seed/demo surface
]);
const walk=(dir)=>{
  for(const name of fs.readdirSync(dir)){
    const file=path.join(dir,name);const st=fs.statSync(file);
    if(st.isDirectory())walk(file);
    else if(/\.(ts|tsx)$/.test(file)&&!allowedFiles.has(file)){
      const text=read(file);
      if(/MIZAN_ENABLE_DEMO_SEED|\bSEED_COMPETITION\b|\bSEED_PARTICIPANTS\b|\bSEED_RESULTS\b/.test(text))failures.push(`seed runtime reference: ${file}`);
      if(/from ['"][^'"]*seed-data['"]|DemoReturn|ExperienceHub/.test(text))failures.push(`retired demo runtime reference: ${file}`);
      if(/DEVELOPMENT_QUESTION_BANK|QURAN_SOURCE_FIXTURES/.test(text))failures.push(`development Quran fixture in runtime source: ${file}`);
    }
  }
};
for(const root of runtimeRoots)if(fs.existsSync(root))walk(root);

if(failures.length){
  console.error('Production runtime audit failed:\n'+[...new Set(failures)].map(x=>` - ${x}`).join('\n'));
  process.exit(1);
}
console.log('Production runtime audit passed: no demo surfaces/seeds are reachable, public publishing is verified, browser-only crypto fallbacks fail closed, and server scope guards are present.');
