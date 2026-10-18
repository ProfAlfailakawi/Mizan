import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOperatorStaffRole } from '../src/lib/permissions';

/*
 * الخادم يُلحق `operatorId` بكل هويةٍ داخل جهةٍ يملكها مشغّل (`/api/identity/me`). كان العميل يعدّ
 * وجودَ `operatorId` علامةً على أن صاحبه موظّف مشغّل، فلا يكتشف مسابقات الجهة ولا يُهيّئ الجهة:
 * مدير جهةٍ أعاد مشغّلٌ بيعها يرى «مسابقة قيد الإعداد» وهو يملك مسابقتين في السحابة.
 */
const rehydrate = fs.readFileSync('src/lib/auth-cloud-rehydration.ts', 'utf8');
const store = fs.readFileSync('src/lib/store.ts', 'utf8');
const auth = fs.readFileSync('src/lib/useMizanAuth.ts', 'utf8');

test('only operator roles are operator staff', () => {
  assert.equal(isOperatorStaffRole('operator_owner'), true);
  assert.equal(isOperatorStaffRole('operator_admin'), true);
  for (const r of ['org_admin', 'comp_admin', 'judge', 'head_judge', 'billing_admin', 'storage_admin', 'branch_admin', 'super_admin', 'participant', undefined, ''])
    assert.equal(isOperatorStaffRole(r as string | undefined), false, String(r));
});

test('cloud scope discovery is keyed on the role, not on the presence of an operatorId', () => {
  assert.match(rehydrate, /isOperatorStaffRole\(identity\.role\)/);
  assert.doesNotMatch(rehydrate, /!auth\.currentUser \|\| identity\.operatorId/);
});

test('organisation set-up for tenant staff does not depend on operatorId', () => {
  assert.match(store, /if\(!isOperatorStaffRole\(identity\.role\)&&identity\.role!=='super_admin'\)/);
  assert.doesNotMatch(store, /if\(!identity\.operatorId&&identity\.role!=='super_admin'\)/);
});

test('discovered competitions are applied by the store action, never spliced into a stale closure array', () => {
  assert.match(store, /cloudCompetitions\?:Competition\[\]/);
  assert.match(auth, /scopePreparation\?\.competitions\)/);
  assert.doesNotMatch(auth, /appStore\.competitions\.splice\(/);
});

test('no cloud listener is attached before an identity and a real competition exist', () => {
  assert.match(store, /syncUserId === 'unauthenticated' \|\| syncCompetitionId === 'comp-pending-setup'/);
});

test('an ordinary route hash is never mistaken for an activation token', () => {
  assert.match(auth, /hash\.startsWith\('#a='\) \? normalizeMizanActivationToken\(hash\) : ''/);
});

test('an activation refusal reaches the person as its Arabic sentence, not as a generic sign-in failure', () => {
  const portal = fs.readFileSync('src/components/auth/AuthPortal.tsx', 'utf8');
  assert.equal((portal.match(/\(\/\^\[A-Z\]\[A-Z0-9_\]\{3,\}\$\/\.test\(raw\)\?raw:''\)/g) || []).length, 2, 'both the sign-in and the create-account paths map bare server codes');
  const ui = fs.readFileSync('src/lib/ui-language.ts', 'utf8');
  for (const code of ['ACTIVATION_TOKEN_INVALID', 'ACTIVATION_EMAIL_MISMATCH', 'ACTIVATION_FAILED']) assert.match(ui, new RegExp(`${code}: '`));
});
