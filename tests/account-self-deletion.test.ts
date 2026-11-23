/*
 * حذف الحساب بطلب صاحبه (App Store 5.1.1(v)): الخادم يمحو البيانات الشخصية ويحفظ أدلة النزاهة
 * مُجهَّلة، والواجهة تطلب كلمة المرور حين يلزم دخولٌ حديث، والزر في متناول نقرتين.
 * كل شيء هنا في مجلدات مؤقتة وبدائل وهمية — لا Firebase حقيقي ولا بيانات إنتاج.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityGovernanceRepository } from '../server/identity-governance';
import { NotificationCenterRepository } from '../server/notification-center';
import { accountDeletionRecent } from '../server/firebase-auth';
import { deleteFirebaseAuthUser } from '../server/firebase-claims';
import { deleteOwnAccount, type AccountDeletionDeps } from '../src/lib/account-deletion';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const admin = { uid: 'org-admin-1', email: 'admin@example.test', role: 'org_admin' as const, organizationId: 'org-1' };

function withRepo(fn: (repo: IdentityGovernanceRepository, dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-self-delete-'));
  try { fn(new IdentityGovernanceRepository(dir), dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('self-deletion erases personal fields, revokes access, and keeps the audit chain without personal identifiers', () => withRepo((repo, dir) => {
  const inv = repo.createInvitation(admin, { email: 'judge@example.test', displayName: 'Judge Person', requestedRole: 'judge', competitionId: 'comp-a', reason: 'Assign judge to A' });
  repo.activate({ uid: 'fb-judge', email: 'judge@example.test' }, inv.activationToken);
  repo.openSession({ uid: 'fb-judge', role: 'judge', organizationId: 'org-1', competitionId: 'comp-a' }, 'device-1', 'Personal iPhone');
  assert.ok(repo.identityForUid('fb-judge', 'comp-a'));

  assert.deepEqual(repo.selfDelete('fb-judge'), { accounts: 1 });
  assert.equal(repo.identityForUid('fb-judge', 'comp-a'), null);

  const state = fs.readFileSync(path.join(dir, 'identity-governance.json'), 'utf8');
  assert.doesNotMatch(state, /judge@example\.test/);
  assert.doesNotMatch(state, /Judge Person/);
  assert.doesNotMatch(state, /Personal iPhone/);
  const parsed = JSON.parse(state);
  assert.equal(parsed.accounts[0].status, 'REVOKED');
  assert.ok(parsed.accounts[0].deletedAt);
  assert.ok(parsed.grants.every((g: { status: string }) => g.status === 'REVOKED'));
  assert.ok(parsed.sessions.every((x: { status: string }) => x.status !== 'ACTIVE'));

  const audit = fs.readFileSync(path.join(dir, 'identity-audit-org-1.jsonl'), 'utf8');
  assert.match(audit, /IDENTITY_ACCOUNT_SELF_DELETED/);
  assert.doesNotMatch(audit, /judge@example\.test/);

  /* إعادة الطلب آمنة: لا حساب يبقى، ولا خطأ. */
  assert.deepEqual(repo.selfDelete('fb-judge'), { accounts: 0 });
}));

test('self-deletion refuses to orphan a tenant: the last active org admin must hand over first', () => withRepo(repo => {
  const owner = { uid: 'owner', role: 'super_admin' as const, organizationId: '__platform__' };
  const inv = repo.createInvitation(owner, { email: 'orgadmin@example.test', displayName: 'Org Admin', requestedRole: 'org_admin', organizationId: 'org-9', reason: 'First tenant admin' });
  repo.activate({ uid: 'fb-orgadmin', email: 'orgadmin@example.test' }, inv.activationToken);
  assert.throws(() => repo.selfDelete('fb-orgadmin'), /LAST_ORG_ADMIN_PROTECTED/);
  assert.ok(repo.identityForUid('fb-orgadmin'));
}));

test('notification purge removes only the deleted person’s notifications and read states', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-self-delete-n-'));
  try {
    const center = new NotificationCenterRepository(dir);
    center.system({ title: 'Personal', body: 'For one user', category: 'identity', priority: 'normal', target: { type: 'user', userId: 'fb-x' } } as never);
    center.system({ title: 'Other', body: 'For another', category: 'identity', priority: 'normal', target: { type: 'user', userId: 'fb-y' } } as never);
    assert.equal(center.purgeUser('fb-x').removed, 1);
    const raw = fs.readdirSync(dir).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    assert.doesNotMatch(raw, /For one user/);
    assert.match(raw, /For another/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('server requires a recent sign-in (five minutes) before deleting', () => {
  const now = 1_800_000_000;
  assert.equal(accountDeletionRecent({ auth_time: now - 60 }, now), true);
  assert.equal(accountDeletionRecent({ auth_time: now - 301 }, now), false);
  assert.equal(accountDeletionRecent({}, now), false);
});

test('server-side auth deletion uses the admin SDK, treats a missing user as deleted, and reports missing credentials', async () => {
  const deleted: string[] = [];
  assert.equal(await deleteFirebaseAuthUser('u1', { setCustomUserClaims: async () => {}, deleteUser: async uid => { deleted.push(uid); } }), 'DELETED');
  assert.deepEqual(deleted, ['u1']);
  assert.equal(await deleteFirebaseAuthUser('u2', { setCustomUserClaims: async () => {}, deleteUser: async () => { throw Object.assign(new Error('x'), { code: 'auth/user-not-found' }); } }), 'DELETED');
  assert.equal(await deleteFirebaseAuthUser('u3', null), 'NOT_CONFIGURED');
});

function deps(over: Partial<AccountDeletionDeps> & { log?: string[] } = {}): AccountDeletionDeps {
  const log = over.log || [];
  return {
    reauthWithPassword: async () => { log.push('reauth'); },
    freshToken: async () => 'token',
    requestServerDeletion: async () => { log.push('server'); return { status: 200, body: { authDeleted: true } }; },
    deleteAuthUserOnClient: async () => { log.push('client-delete'); },
    signOut: async () => { log.push('sign-out'); },
    ...over,
  };
}

test('client flow: server deletes, then the user is signed out', async () => {
  const log: string[] = [];
  assert.deepEqual(await deleteOwnAccount(deps({ log })), { status: 'DONE' });
  assert.deepEqual(log, ['server', 'sign-out']);
});

test('client flow: stale sign-in asks for the password, then re-authenticates and completes', async () => {
  let fresh = false; const log: string[] = [];
  const d = deps({ log, reauthWithPassword: async () => { fresh = true; log.push('reauth'); }, requestServerDeletion: async () => fresh ? { status: 200, body: { authDeleted: true } } : { status: 401, body: { code: 'REQUIRES_RECENT_LOGIN' } } });
  assert.deepEqual(await deleteOwnAccount(d), { status: 'NEEDS_PASSWORD' });
  assert.deepEqual(await deleteOwnAccount(d, 'secret'), { status: 'DONE' });
  assert.deepEqual(log, ['reauth', 'sign-out']);
});

test('client flow: when the server cannot delete the login, the client does, handling auth/requires-recent-login', async () => {
  let needsLogin = true; const log: string[] = [];
  const d = deps({ log, requestServerDeletion: async () => ({ status: 200, body: { authDeleted: false } }), deleteAuthUserOnClient: async () => { if (needsLogin) throw Object.assign(new Error('x'), { code: 'auth/requires-recent-login' }); log.push('client-delete'); }, reauthWithPassword: async () => { needsLogin = false; } });
  assert.deepEqual(await deleteOwnAccount(d), { status: 'NEEDS_PASSWORD' });
  assert.deepEqual(await deleteOwnAccount(d, 'secret'), { status: 'DONE' });
  assert.deepEqual(log, ['client-delete', 'sign-out']);
});

test('client flow: wrong password and protected accounts surface clear errors without signing out', async () => {
  const log: string[] = [];
  assert.deepEqual(await deleteOwnAccount(deps({ log, reauthWithPassword: async () => { throw Object.assign(new Error('x'), { code: 'auth/wrong-password' }); } }), 'bad'), { status: 'NEEDS_PASSWORD', wrongPassword: true });
  assert.deepEqual(await deleteOwnAccount(deps({ log, requestServerDeletion: async () => ({ status: 409, body: { code: 'LAST_ORG_ADMIN_PROTECTED' } }) })), { status: 'ERROR', code: 'LAST_ORG_ADMIN_PROTECTED' });
  assert.ok(!log.includes('sign-out'));
});

test('the delete endpoint is identity-guarded, requires recent login and explicit confirmation', () => {
  const server = read('server.ts');
  const line = server.split('\n').find(l => l.includes("app.post('/api/identity/me/delete'"));
  assert.ok(line, 'endpoint exists');
  assert.match(line!, /requireFirebaseBase/);
  assert.match(line!, /accountDeletionRecent/);
  assert.match(line!, /DELETE_MY_ACCOUNT/);
  assert.match(line!, /selfDelete/);
  assert.match(line!, /deleteFirebaseAuthUser/);
});

test('“My account → Delete my account” is reachable in two taps from the header and the broadcast bar, with fuṣḥā scope text', () => {
  assert.match(read('src/components/layout/Header.tsx'), /<AccountButton\/>/);
  assert.match(read('src/App.tsx'), /<AccountButton [^>]*label\/>/);
  const ui = read('src/components/auth/AccountDeletion.tsx');
  assert.match(ui, /حذف حسابي/);
  assert.match(ui, /يُحفظ مُجهَّلًا/);
  assert.match(ui, /لا يمكن التراجع عن الحذف/);
  assert.match(ui, /أعد إدخال كلمة المرور/);
});
