import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p:string)=>fs.readFileSync(p,'utf8');
const store=read('src/lib/store.ts');
const auth=read('src/lib/useMizanAuth.ts');
const rehydrate=read('src/lib/auth-cloud-rehydration.ts');
const durability=read('src/lib/cloud-session-durability.ts');
const header=read('src/components/layout/Header.tsx');
const idle=read('src/lib/useIdleSignOut.ts');
const registration=read('src/components/public/RegistrationFlow.tsx');


test('authenticated scope is discovered from Firestore instead of browser memory',()=>{
  assert.match(rehydrate,/await import\('firebase\/firestore'\)/,'collection discovery must load Firestore listing code only after authentication');
  assert.match(rehydrate,/getDoc\(doc\(db, 'organizations', identity\.organizationId, 'competitions', identity\.competitionId\)\)/,
    'competition-scoped accounts must read the exact competition named by the authenticated identity');
  assert.match(rehydrate,/getDocs\(collection\(db, 'organizations', identity\.organizationId, 'competitions'\)\)/,
    'organization admins must rediscover competitions from Firestore');
  assert.match(rehydrate,/selectedCompetitionId: selected\.competition\.id/,
    'the authoritative selected competition must be returned to auth bootstrap');
  assert.doesNotMatch(rehydrate,/localStorage\.setItem|sessionStorage\.setItem|writeDurableLocalSnapshot/,
    'cloud payloads must not create a second browser-storage writer during authentication');
});


test('auth applies cloud scope before rendering staff UI',()=>{
  const prepareAt=auth.indexOf('await prepareAuthenticatedCloudScope(');
  const spliceAt=auth.indexOf('appStore.competitions.splice(',prepareAt);
  const applyAt=auth.indexOf('applyAuthenticatedIdentity({',prepareAt);
  const signedInAt=auth.indexOf("setAccessError(''); setSignedIn(true);",applyAt);
  assert.ok(prepareAt>=0&&spliceAt>prepareAt&&applyAt>spliceAt&&signedInAt>applyAt,
    'cloud scope must be inserted before applying identity and marking the session signed in');
  assert.match(auth,/effectiveCompetitionId \|\|= scopePreparation\.selectedCompetitionId/,
    'an organization admin without a competition claim must select the discovered cloud competition');
});


test('sign-out is an explicit durability boundary for category/config edits',()=>{
  assert.match(durability,/readDurableLocalSnapshot\(\)/,'logout flush must use the snapshot synchronously written by notify()');
  assert.match(durability,/configWriteAllowed\(remoteUpdatedAt, localUpdatedAt\)/,'logout must not overwrite a newer cloud edit');
  assert.match(durability,/setDoc\(ref, configuration, \{ merge: true \}\)/,'competition config must be written before sign-out');
  assert.match(durability,/const verification = await getDoc\(ref\)/,'the authoritative root must be read back after writing');
  const flushAt=durability.indexOf('await persistDurableCompetitionSnapshot();');
  const signOutAt=durability.indexOf('await signOut(auth);',flushAt);
  assert.ok(flushAt>=0&&signOutAt>flushAt,'Firebase sign-out must happen after the awaited cloud flush');
  assert.doesNotMatch(durability,/localStorage\.setItem/,'durability helper must not add a clear-text browser storage sink');
});


test('the primary signed-in logout surface flushes before ending Firebase auth',()=>{
  assert.match(header,/durableSignOut\(\).*window\.location\.reload/,'header logout must use the durability path');
  assert.doesNotMatch(header,/signOut\(auth\)/,'header must not bypass the final cloud flush');
});

test('next login can repair a local edit left behind by an older logout race',()=>{
  assert.match(rehydrate,/base\.currentUser\?\.id === identity\.id/,'salvage is restricted to the same authenticated user');
  assert.match(rehydrate,/localTime > remoteTime/,'only a genuinely newer local configuration can be repaired to cloud');
  assert.match(rehydrate,/await persistDurableCompetitionSnapshot\(base, identity\.role\)/,
    'the previous browser snapshot is uploaded before an older cloud snapshot can replace it');
});


test('server-created student registrations reappear through the restored competition subscription',()=>{
  assert.match(registration,/\/api\/public\/competitions\/\$\{encodeURIComponent\(competition\.id\)\}\/register/,
    'public registration must use the server persistence endpoint');
  const subscription=store.slice(store.indexOf('export function useAppStore()'),store.indexOf('const setLanguage',store.indexOf('export function useAppStore()')));
  assert.match(subscription,/const orgId = syncOrganizationId, compId = syncCompetitionId/);
  assert.match(subscription,/watch\('participants'/,'the authenticated competition watches its participant collection');
  assert.match(subscription,/mergeById\(globalState\.participants, rows, 'participants'\)/,
    'server-created registration rows must be adopted from Firestore');
});


test('idle sign-out preserves the same final cloud write boundary',()=>{
  assert.match(idle,/durableSignOut\(\)/,
    'idle timeout must use the same durability boundary');
  assert.doesNotMatch(idle,/signOut\(auth\)/,
    'idle timeout must not bypass the final cloud flush');
});
