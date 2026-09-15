/*
 * تشخيص الوضع السحابي.
 *
 * كل اختبار هنا يقابل طريقةً واحدة ينقطع بها الخيط، ويثبت أن الشاشة تسمّيها بعينها بدل
 * أن تقول «تعذّرت المزامنة» لجميعها.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { diagnoseCloud, summariseCloud, type CloudDiagnosisInput } from '../src/lib/cloud-diagnosis';

const healthy: CloudDiagnosisInput = {
  clientConfigured: true,
  clientProjectId: 'mizan-prod',
  offlineMode: false,
  browserOnline: true,
  signedIn: true,
  tokenClaims: { role: 'comp_admin', org_id: 'org-1', competition_id: 'comp-1' },
  serverReachable: true,
  serverClaimsWritable: true,
  organizationId: 'org-1',
  competitionId: 'comp-1',
};

const stateOf = (input: CloudDiagnosisInput, id: string) =>
  diagnoseCloud(input).checks.find(x => x.id === id)?.state;

test('a fully wired deployment reports every link connected', () => {
  const result = diagnoseCloud(healthy);
  assert.equal(result.blocked, 0);
  assert.equal(result.ready, true);
  assert.match(summariseCloud(result, true), /سليم/);
});

test('a build without Firebase keys is named as a build problem, not a sync problem', () => {
  const result = diagnoseCloud({ ...healthy, clientConfigured: false, clientProjectId: undefined });
  const check = result.checks.find(x => x.id === 'client_config')!;
  assert.equal(check.state, 'blocked');
  assert.match(check.detailAr, /VITE_FIREBASE_API_KEY/);
  assert.match(check.ownerAr, /الخادم/, 'and it is the deployer’s to fix, not the operator’s');
});

test('a key without a project id is a broken build, even though the app boots', () => {
  /* firebase.ts يرفض غياب المفتاح ويسكت عن غياب المعرّف، فالبناء يُقلع ولا يكتب. */
  const result = diagnoseCloud({ ...healthy, clientConfigured: true, clientProjectId: undefined });
  const check = result.checks.find(x => x.id === 'client_config')!;
  assert.equal(check.state, 'blocked', 'a half-configured build must not read as healthy');
  assert.match(check.detailAr, /VITE_FIREBASE_PROJECT_ID/);
  assert.match(check.detailEn, /still boots/);
  const panel = fs.readFileSync('src/components/admin/CloudDiagnostics.tsx', 'utf8');
  assert.match(panel, /clientConfigured: !!env\.VITE_FIREBASE_API_KEY/,
    'and the screen reads the real build values rather than hard-coding “configured”');
});

test('a token without claims is the diagnosis, and it is repairable from the screen', () => {
  const result = diagnoseCloud({ ...healthy, tokenClaims: {} });
  const check = result.checks.find(x => x.id === 'token_claims')!;
  assert.equal(check.state, 'blocked');
  assert.equal(check.repairable, true);
  assert.match(check.detailAr, /مخوَّل في سجلّ ميزان ومرفوضٌ عند السحابة/);
  assert.match(summariseCloud(result, true), /مطالبات الصلاحية/);
});

test('a server that cannot write claims says so, so the repair button is not pressed in vain', () => {
  const result = diagnoseCloud({ ...healthy, tokenClaims: {}, serverClaimsWritable: false });
  const check = result.checks.find(x => x.id === 'server_claims_writable')!;
  assert.equal(check.state, 'blocked');
  assert.match(check.detailAr, /FIREBASE_PROJECT_ID/);
  assert.match(check.detailAr, /لن يُصلح زرُّ الإصلاح شيئًا/);
});

test('no repair is offered while the server cannot write claims at all', () => {
  /* زرٌّ يُعرض ليُضغط ثم يفشل حتمًا يُشغل المشغّل عن العلّة الحقيقية ويوهمه أنها في حسابه. */
  const stuck = diagnoseCloud({ ...healthy, tokenClaims: {}, serverClaimsWritable: false });
  assert.equal(stuck.checks.some(x => x.state === 'blocked' && x.repairable), false);
  const claimCheck = stuck.checks.find(x => x.id === 'token_claims')!;
  assert.match(claimCheck.detailAr, /عالِج النشر أولًا/);
  assert.match(claimCheck.ownerAr, /الخادم/, 'and it is handed to the deployer, not left with the operator');

  const scoped = diagnoseCloud({
    ...healthy, serverClaimsWritable: false,
    tokenClaims: { role: 'judge', org_id: 'org-1', competition_id: 'comp-9' },
  });
  assert.equal(scoped.checks.find(x => x.id === 'competition_scope')!.repairable, false);

  const denied = diagnoseCloud({
    ...healthy, serverClaimsWritable: false,
    lastError: { code: 'CLOUD_PERMISSION_DENIED', message: 'رُفضت الكتابة.' },
  });
  assert.equal(denied.checks.find(x => x.id === 'last_write')!.repairable, false);

  /* وما دام الخادم قادرًا (أو لم يُسأل بعد) يبقى الإصلاح معروضًا. */
  assert.equal(diagnoseCloud({ ...healthy, tokenClaims: {} }).checks.some(x => x.repairable), true);
  assert.equal(diagnoseCloud({ ...healthy, tokenClaims: {}, serverClaimsWritable: undefined }).checks.some(x => x.repairable), true);
});

test('claim writability is proven by an authorized call, not by an object being constructible', () => {
  const claims = fs.readFileSync('server/firebase-claims.ts', 'utf8');
  assert.match(claims, /await auth\.listUsers\(1\)/,
    'credentials without the Firebase Authentication Admin role build an Auth object and then fail every write');
  assert.match(claims, /CLAIMS_PROBE_TTL_MS/, 'and the probe is cached, so health polling does not bill an admin call per request');
  assert.match(claims, /export function resetClaimsProbe/);
});

test('an unreachable server is never judged from the device state alone', () => {
  assert.equal(stateOf({ ...healthy, serverReachable: false, serverClaimsWritable: undefined }, 'server_claims_writable'), 'warning');
  assert.equal(stateOf({ ...healthy, serverClaimsWritable: undefined }, 'server_claims_writable'), 'unknown');
});

test('a grant on another organization or another competition is named exactly', () => {
  const crossOrg = diagnoseCloud({ ...healthy, tokenClaims: { role: 'comp_admin', org_id: 'org-other' } });
  const orgCheck = crossOrg.checks.find(x => x.id === 'competition_scope')!;
  assert.equal(orgCheck.state, 'blocked');
  assert.match(orgCheck.detailAr, /org-other/);

  const wrongComp = diagnoseCloud({ ...healthy, tokenClaims: { role: 'judge', org_id: 'org-1', competition_id: 'comp-9' } });
  const compCheck = wrongComp.checks.find(x => x.id === 'competition_scope')!;
  assert.equal(compCheck.state, 'blocked');
  assert.equal(compCheck.repairable, true);

  const listed = diagnoseCloud({ ...healthy, tokenClaims: { role: 'judge', org_id: 'org-1', competition_ids: ['comp-1', 'comp-2'] } });
  assert.equal(listed.checks.find(x => x.id === 'competition_scope')!.state, 'ok',
    'the rules accept membership in the list exactly as they accept the singular claim');
});

test('the platform owner is global and is not asked for a competition claim', () => {
  assert.equal(stateOf({ ...healthy, tokenClaims: { role: 'super_admin', org_id: 'org-other' } }, 'competition_scope'), 'ok');
});

test('deliberate offline mode is a choice, not a fault', () => {
  const result = diagnoseCloud({ ...healthy, offlineMode: true });
  assert.equal(result.checks.find(x => x.id === 'connectivity')!.state, 'warning');
  assert.equal(result.blocked, 0, 'a paused upload never reads as a broken one');
});

test('signing out blocks the chain and leaves the claim checks unread rather than guessed', () => {
  const result = diagnoseCloud({ ...healthy, signedIn: false, tokenClaims: undefined });
  assert.equal(result.checks.find(x => x.id === 'signed_in')!.state, 'blocked');
  assert.equal(result.checks.find(x => x.id === 'token_claims')!.state, 'unknown');
});

test('an oversized payload is reported as a size problem with its own owner', () => {
  const result = diagnoseCloud({ ...healthy, lastError: { code: 'CLOUD_PAYLOAD_TOO_LARGE', message: 'حجم المسابقة تجاوز الحدّ المسموح.' } });
  const check = result.checks.find(x => x.id === 'last_write')!;
  assert.equal(check.state, 'blocked');
  assert.match(check.detailAr, /1 ميغابايت/);
  assert.equal(check.repairable, false);
});

test('the server reports whether it can write claims at all, and the client reads it', () => {
  const server = fs.readFileSync('server.ts', 'utf8');
  assert.match(server, /identityClaimsWritable/, 'health reports the one link no screen could see before');
  assert.match(server, /await claimsWritable\(\)\.catch\(\(\)=>false\)/, 'and a probe failure never crashes the health endpoint');
  const runtime = fs.readFileSync('src/lib/runtime-capabilities.ts', 'utf8');
  assert.match(runtime, /identityClaimsWritable:x\.identityClaimsWritable===true/);
});

test('the claim repair keeps the server’s reason instead of collapsing it to false', () => {
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  assert.match(store, /export async function repairIdentityClaimsNow/);
  assert.match(store, /lastClaimRepair=\{ok:false,code:body\.code\|\|`HTTP_\$\{response\.status\}`/,
    'the server names the cause; the client no longer throws it away');
  assert.match(store, /await user\.getIdToken\(true\)/, 'and forces a fresh token so the new claims reach the rules');
});

test('the diagnosis screen is reachable from Continuity, where the Cloud indicator lives', () => {
  const enterprise = fs.readFileSync('src/components/admin/EnterpriseWorkspace.tsx', 'utf8');
  assert.match(enterprise, /CloudDiagnostics/);
  assert.match(enterprise, /تشخيص السحابة/);
  const panel = fs.readFileSync('src/components/admin/CloudDiagnostics.tsx', 'utf8');
  assert.match(panel, /ACCOUNT_NOT_PROVISIONED/);
  assert.match(panel, /IDENTITY_CLAIMS_NOT_CONFIGURED/);
  assert.doesNotMatch(panel, /VITE_FIREBASE_API_KEY\s*\}/, 'no key value is ever rendered — names and state only');
});
