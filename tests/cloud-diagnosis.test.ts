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
  assert.equal(diagnoseCloud({ ...healthy, tokenClaims: {}, serverClaimsWritable: undefined }).checks.some(x => x.repairable), true,
    'an inconclusive probe is not a denial: a repair that might work is still offered');
});

test('claim writability is proven by exercising the very permission it reports on', () => {
  const claims = fs.readFileSync('server/firebase-claims.ts', 'utf8');
  /* القراءة والكتابة صلاحيتان مختلفتان في IAM: اعتمادٌ للقراءة فقط ينجح في listUsers ويفشل
     في كل كتابة. فتُجرَّب العملية نفسها على معرّفٍ محجوز لا وجود له. */
  assert.doesNotMatch(claims, /listUsers/, 'listing is a different IAM permission from updating');
  assert.match(claims, /await auth\.setCustomUserClaims\(PROBE_UID, \{\}\)/);
  assert.match(claims, /const PROBE_UID = 'mizan-claims-permission-probe/,
    'and it is a reserved id, so no real account is ever touched');
  assert.match(claims, /USER_ABSENT.test\(text\)\) return 'WRITABLE'/,
    '“no such user” means the call was authorized and executed — that is the passing case');
});

test('a transient probe failure is never cached as misconfiguration', () => {
  const claims = fs.readFileSync('server/firebase-claims.ts', 'utf8');
  assert.match(claims, /export type ClaimsWritability = 'WRITABLE' \| 'DENIED' \| 'NOT_CONFIGURED' \| 'UNKNOWN'/,
    'a network blip is not a permission denial and must not read as one');
  assert.match(claims, /if \(writability !== 'UNKNOWN'\) claimsProbe =/,
    'only a definitive answer is cached; an inconclusive one is re-probed next request');
  /* «غير معلوم» يُقرأ قدرةً: حبس المالك عن تعبئةٍ يملكها لأن الشبكة تعثّرت أسوأ من محاولةٍ تُقال بسببها. */
  assert.match(claims, /!== 'DENIED' &&.*!== 'NOT_CONFIGURED'/s);

  const server = fs.readFileSync('server.ts', 'utf8');
  assert.match(server, /claimsState==='UNKNOWN'\?null:claimsState==='WRITABLE'/,
    'health reports unknown as null rather than flattening it to false');
  const runtime = fs.readFileSync('src/lib/runtime-capabilities.ts', 'utf8');
  assert.match(runtime, /typeof x\.identityClaimsWritable==='boolean'\?x\.identityClaimsWritable:undefined/);
});

test('concurrent health requests share one probe instead of each billing an admin call', () => {
  const claims = fs.readFileSync('server/firebase-claims.ts', 'utf8');
  assert.match(claims, /let claimsProbeInFlight: Promise<ClaimsWritability> \| null/);
  assert.match(claims, /if \(claimsProbeInFlight\) return claimsProbeInFlight;/,
    'venue devices load together, so the very first burst is exactly when dedupe matters');
  assert.match(claims, /\.finally\(\(\) => \{ claimsProbeInFlight = null; \}\)/);
  assert.match(claims, /CLAIMS_PROBE_TTL_MS/);
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
  assert.match(server, /await claimsWritability\(\)\.catch\(\(\)=>'UNKNOWN' as const\)/,
    'and a probe failure never crashes the health endpoint, nor reads as a denial');
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
