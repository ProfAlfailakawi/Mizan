import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const text=(path:string)=>fs.readFileSync(path,'utf8');

test('public server has no seeded competition fallback and registration loader is strongly typed',()=>{
  const server=text('server.ts');
  assert.doesNotMatch(server,/\bSEED_COMPETITION\b|MIZAN_ENABLE_DEMO_SEED|demoSeedEnabled/);
  assert.match(server,/getCompetition:async\(id\):Promise<Competition\|null>/);
  assert.match(server,/const competition=asCompetition\(row\?\.competition\)/);
  assert.match(server,/RETIRED_SEED_COMPETITION_IDS/);
  assert.match(server,/fs\.rmSync\(stale,\{force:true\}\)/);
});

test('staff runtime has no unauthenticated preview path or role switcher',()=>{
  const app=text('src/App.tsx');
  const firebase=text('src/lib/firebase.ts');
  const header=text('src/components/layout/Header.tsx');
  const judge=text('src/components/judge/JudgeOS.tsx');
  assert.match(app,/const requireAuth=true/);
  assert.doesNotMatch(app,/DemoReturn|ExperienceHub|demoMode/);
  assert.doesNotMatch(header,/RoleSwitcher|All experiences|كل التجارب/);
  assert.doesNotMatch(judge,/demoMode|VITE_REQUIRE_AUTH/);
  assert.match(firebase,/if\(!apiKey\) throw new Error/);
  assert.doesNotMatch(firebase,/development-only-no-real-key|development-app/);
});

test('application state starts empty and never imports development seed records',()=>{
  const store=text('src/lib/store.ts');
  assert.doesNotMatch(store,/from ['"]\.\/seed-data['"]/);
  assert.match(store,/participants:\[\],committees:\[\],judges:\[\],results:\[\]/);
  assert.match(store,/categories:\[\]/);
  assert.doesNotMatch(store,/SEED_PARTICIPANTS|SEED_USERS|SEED_RESULTS|SEED_COMPETITION/);
});
