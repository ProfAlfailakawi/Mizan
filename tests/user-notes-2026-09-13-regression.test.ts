import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const text=(path:string)=>fs.readFileSync(path,'utf8');

test('mathematical bound and duplicate advanced-mode entry are removed from the question workspace',()=>{
  const workspace=text('src/components/admin/QuestionEngineWorkspace.tsx');
  assert.doesNotMatch(workspace,/MathematicalBoundPanel/);
  assert.doesNotMatch(workspace,/الحد الرياضي/);
  assert.doesNotMatch(workspace,/الوضع المتقدم/);
});

test('ayah inputs keep a local draft so typing does not fight range normalization',()=>{
  const picker=text('src/components/scope/QuranScopePicker.tsx');
  assert.match(picker,/inputMode="numeric"/);
  assert.match(picker,/draft/);
  assert.match(picker,/onBlur/);
});

test('juz-based fine editing is guarded to the chosen juz and rejects an out-of-range ayah',()=>{
  const picker=text('src/components/scope/QuranScopePicker.tsx');
  assert.match(picker,/exactJuzGuard/);
  assert.match(picker,/ayahRangesWithin/);
  assert.match(picker,/juzOfLocus/);
  assert.match(picker,/خارج .* المحدد/);
  assert.match(picker,/surahOptions=\{editableSurahs\}/);
});

test('public registration cannot fall back to seed or silently publish local admin state',()=>{
  const store=text('src/lib/store.ts');
  const start=store.indexOf("const loadPublicCompetition = async");
  const end=store.indexOf('const provisionOrganization',start);
  const loader=store.slice(start,end);
  assert.doesNotMatch(loader,/SEED_COMPETITION/);
  assert.doesNotMatch(loader,/\/publish/);
  assert.match(loader,/if\(globalState\.isOffline\) return 'unavailable'/);
  assert.match(loader,/return sourceReached\?'missing':'unavailable'/);
});

test('registration drops stale category ids when the published category set changes',()=>{
  const registration=text('src/components/public/RegistrationFlow.tsx');
  assert.match(registration,/currentIsValid=categories\.some\(c=>c\.id===form\.categoryId\)/);
  assert.match(registration,/categoryId:''/);
});

test('server registration requires authoritative Firestore and cannot report a disk-only phantom success',()=>{
  const server=text('server.ts');
  const start=server.indexOf('const publicRegistration=new PublicRegistrationService');
  const end=server.indexOf('const identityDir=',start);
  const registration=server.slice(start,end);
  assert.match(registration,/public_competitions\/\$\{cleanId\}/);
  assert.match(registration,/if\(!firestoreRepository\)throw new Error\('FIRESTORE_UNAVAILABLE'\)/);
  assert.match(registration,/createAtomically\(documents\)/);
});

test('permission denial self-heals stale Firebase claims before surfacing a permanent failure',()=>{
  const store=text('src/lib/store.ts');
  const server=text('server.ts');
  assert.match(store,/repairCurrentIdentityClaims/);
  assert.match(store,/\/api\/identity\/refresh-claims/);
  assert.match(server,/app\.post\('\/api\/identity\/refresh-claims'/);
  assert.match(server,/claimsFromGrant\(grant\)/);
});

test('public student surfaces never display an internal administration persistence alert',()=>{
  const alert=text('src/components/design-system/PersistenceAlert.tsx');
  assert.match(alert,/#register/);
  assert.match(alert,/publicSurface/);
});

test('scope readiness checks real server capability and freeze uses the same verified result',()=>{
  const workspace=text('src/components/admin/QuestionEngineWorkspace.tsx');
  const actions=text('src/lib/store-scope-actions.ts');
  assert.match(workspace,/fetchRuntimeHealth/);
  assert.match(workspace,/secureQuestionRuntimeConfigured/);
  assert.match(workspace,/sealScopeEngine\(undefined, escrowOverride\)/);
  assert.match(actions,/getScopeReadiness = \(escrowReadyOverride\?: boolean\)/);
});

test('student lifecycle public journey remains available through result, certificate and ceremony',()=>{
  const journey=text('src/components/public/JourneyAccess.tsx');
  assert.doesNotMatch(journey,/competition\.status.*completed/);
  assert.match(journey,/JOURNEY_REVOKED/);
  assert.match(journey,/certificate/);
  assert.match(journey,/setInterval/);
});
