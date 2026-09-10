import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { claimsFromGrant } from '../server/firebase-claims';

/*
 * سلطتان كانتا تحكمان الشيء نفسه ولا تتحدثان.
 *
 * لميزان سجلّ هويات على الخادم يُفحص به كل نداء، وقواعد Firestore تقرأ مطالبات رمز Firebase
 * وحدها: role وorg_id وcompetition_id. ولم يكن في المستودع سطر واحد يكتبها — لا
 * setCustomUserClaims ولا حزمة إدارة. فكل حساب يُنشأ من داخل ميزان يُولد بلا مطالبات، فتُرفض
 * كتاباته المباشرة إلى Firestore ويرى صاحبه «الصلاحية لا تسمح» وهو مخوَّل فعلًا.
 */

const server = fs.readFileSync('server.ts', 'utf8');
const bridge = fs.readFileSync('server/firebase-claims.ts', 'utf8');
const governance = fs.readFileSync('server/identity-governance.ts', 'utf8');
const auth = fs.readFileSync('src/lib/useMizanAuth.ts', 'utf8');

test('claims are derived from the grant, and the competition scope is written only when it exists', () => {
  assert.deepEqual(claimsFromGrant({ role: 'org_admin', organizationId: 'org-1' }),
    { role: 'org_admin', org_id: 'org-1' });
  /* كتابة نطاق مسابقة فارغ تُقيّد دورًا لا يُقصد تقييده: مالك الجهة يتحرك بين مسابقات جهته. */
  assert.equal('competition_id' in claimsFromGrant({ role: 'org_admin', organizationId: 'org-1' }), false);
  assert.deepEqual(claimsFromGrant({ role: 'comp_admin', organizationId: 'org-1', competitionId: 'comp-9' }),
    { role: 'comp_admin', org_id: 'org-1', competition_id: 'comp-9' });
});

test('the rules read exactly the claims the bridge writes', () => {
  // مطالبةٌ تُكتب باسم لا تقرؤه القاعدة لا تفعل شيئًا، ولا يكشف ذلك أي اختبار وحدة.
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  for (const claim of ['role', 'org_id', 'competition_id']) {
    assert.match(rules, new RegExp(`request\\.auth\\.token\\.${claim}`), `firestore.rules never reads ${claim}`);
    assert.match(bridge, new RegExp(`\\b${claim}\\b`), `the bridge never writes ${claim}`);
  }
});

test('withdrawing a grant clears the claims instead of leaving the door open', () => {
  assert.match(bridge, /claims === null/, 'a withdrawal must be expressible');
  assert.match(bridge, /role: null, org_id: null, competition_id: null/,
    'cleared claims must be written as null, not left behind');
  assert.match(governance, /claimsForUid\(uid:string\)/, 'the store must be able to say "no active grant"');
});

test('every change to a grant re-writes the claims, and after the change not before', () => {
  /* المزامنة قبل التعديل تقرأ الحالة القديمة فتكتب مطالبات عفا عليها الأمر. */
  for (const method of ['updateGrant', 'suspendGrant', 'resumeGrant', 'removeGrant']) {
    const call = new RegExp(`identityGovernance\\.${method}\\([\\s\\S]{0,240}?\\)\\);syncClaimsForGrant`);
    assert.match(server, call, `${method} must sync claims immediately after it runs`);
  }
  assert.match(server, /activate\(base,String\(req\.body\?\.activationToken\|\|''\)\);[\s\S]{0,400}?await syncIdentityClaims\(base\.uid\)/,
    'activation must write the first claims, and await them');
});

test('the client refreshes its token so the new claims are actually in it', () => {
  /* Firebase يخزّن الرمز قرابة ساعة: إعادة التحميل وحدها تعود بالرمز القديم بلا مطالبات. */
  assert.match(auth, /await user\.getIdToken\(true\)/, 'activation must force a token refresh');
  const activated = auth.indexOf("setActivationMessage('ACTIVATED')");
  const refresh = auth.indexOf('await user.getIdToken(true)', activated);
  const reload = auth.indexOf('window.location.reload()', activated);
  assert.ok(refresh > 0 && refresh < reload, 'the refresh must happen before the reload, or it is pointless');
});

test('no service-account key is introduced anywhere', () => {
  // اعتماد بيئة التشغيل يكفي على Cloud Run؛ ومفتاح خدمة في المستودع سرٌّ جديد بلا داعٍ.
  assert.match(bridge, /applicationDefault\(\)/, 'the bridge must use ambient credentials');
  assert.doesNotMatch(bridge, /private_key|serviceAccountKey|cert\(/, 'no key material may appear here');
});

test('a failed claim write never fails the call that triggered it', () => {
  /* حسابٌ فُعِّل ولم تُكتب مطالباته أفضل من حسابٍ لم يُفعَّل — والإخفاق يُسجَّل لا يُبتلع. */
  const sync = /const syncIdentityClaims=[\s\S]*?\n  \};/.exec(server)?.[0] || '';
  assert.ok(sync, 'the sync helper must exist');
  assert.match(sync, /catch\(err\)/, 'it must swallow its own failure');
  assert.match(sync, /console\.error/, 'but record it');
});

test('existing accounts have a way back in', () => {
  /* الحسابات التي أُنشئت قبل هذا الجسر لا تُصلَح بتفعيلٍ جديد — فقد فُعِّلت فعلًا. */
  assert.match(server, /\/api\/owner\/identity\/sync-claims/, 'a one-time backfill must exist');
  assert.match(server, /activeAccountUids\(\)/, 'and it must cover every active account');
  assert.match(server, /failures/, 'and report which ones failed rather than claiming success');
});

test('identity endpoints that change authorization are rate limited', () => {
  /*
   * نقطةٌ تفحص الصلاحية بلا سقف معدّل بابٌ للتخمين والإغراق: تفعيلٌ برمز يُخمَّن، أو إغراق
   * بتعديلات تخويل. وقد كشفها CodeQL على دفعتي حين عدّلتها فصارت «شيفرة متغيّرة» — وهي
   * ملاحظة صحيحة بذاتها لا مجرّد ضجيج فحص.
   */
  const routes = [
    "app.post('/api/identity/activate',sensitiveIdentityRateLimit",
    "app.patch('/api/identity/grants/:id',sensitiveIdentityRateLimit",
    "app.post('/api/identity/grants/:id/suspend',sensitiveIdentityRateLimit",
    "app.post('/api/identity/grants/:id/resume',sensitiveIdentityRateLimit",
    "app.delete('/api/identity/grants/:id',sensitiveIdentityRateLimit",
  ];
  for (const route of routes) {
    assert.ok(server.includes(route), `missing rate limit: ${route.split("'")[1]}`);
  }
  // والسقف يسبق فحص الصلاحية: خنقٌ بعد التحقق يكون قد أنفق العمل الذي جاء يمنعه.
  assert.match(server, /activate',sensitiveIdentityRateLimit,requireFirebaseBase/);
});

test('the one-time backfill is owner-only and throttled', () => {
  assert.match(server, /sync-claims',ownerRateLimit,ownerOnly/,
    'a route that rewrites every account’s claims must be the narrowest door in the app');
});
