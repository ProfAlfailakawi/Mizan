import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { revokeMatchingSessions, grantSessionScope, grantReissueInvitations, demoRescueRepairs } from '../src/lib/demo-identity';
import type { AuthSessionRecord, IdentityAccountRecord, RoleGrantRecord } from '../src/types';

const sess = (id: string, accountId: string, competitionId: string | undefined, status: AuthSessionRecord['status'] = 'ACTIVE'): AuthSessionRecord =>
  ({ id, accountId, organizationId: 'org', competitionId, role: 'judge', deviceId: 'd', openedAt: '', lastSeenAt: '', expiresAt: '', status, authenticationAssurance: 'DEMO' });

test('account session revocation actually revokes active sessions and counts them', () => {
  const out = revokeMatchingSessions([sess('a', 'acc1', 'c1'), sess('b', 'acc1', 'c2'), sess('c', 'acc2', 'c1'), sess('d', 'acc1', 'c1', 'ENDED')], { accountId: 'acc1' });
  assert.equal(out.count, 2);
  assert.deepEqual(out.sessions.map(s => s.status), ['REVOKED', 'REVOKED', 'ACTIVE', 'ENDED']);
});

test('grant session revocation stays within the grant competition', () => {
  const grant = { accountId: 'acc1', competitionId: 'c1' } as RoleGrantRecord;
  const out = revokeMatchingSessions([sess('a', 'acc1', 'c1'), sess('b', 'acc1', 'c2')], grantSessionScope(grant));
  assert.equal(out.count, 1);
  assert.deepEqual(out.sessions.map(s => s.status), ['REVOKED', 'ACTIVE']);
});

test('grant-aware reissue creates a READY invitation and retires the previous one', () => {
  const grant = { id: 'g1', accountId: 'acc1', role: 'judge', organizationId: 'org', competitionId: 'c1', status: 'ACTIVE' } as RoleGrantRecord;
  const account = { id: 'acc1', email: 'J@x.org', displayName: 'محكم' } as IdentityAccountRecord;
  const old = { id: 'i0', email: 'j@x.org', displayName: 'محكم', organizationId: 'org', requestedRole: 'judge' as const, competitionId: 'c1', status: 'READY' as const, createdAt: '', createdBy: '', expiresAt: '', activationTokenHash: 'h0' };
  const out = grantReissueInvitations([old], grant, account, { id: 'i1', activationTokenHash: 'h1', now: new Date('2026-01-01'), createdBy: 'me' });
  assert.equal(out[0].id, 'i1'); assert.equal(out[0].status, 'READY'); assert.equal(out[0].accountId, 'acc1'); assert.equal(out[0].activationTokenHash, 'h1');
  assert.equal(out[1].status, 'REVOKED'); assert.equal(out[1].activationTokenHash, undefined);
});

test('diagnostic report is not a repair; safe actions are', () => {
  assert.equal(demoRescueRepairs('diagnostic.bundle.generate', true), false);
  assert.equal(demoRescueRepairs('notification.retry', true), true);
  assert.equal(demoRescueRepairs('grant.suspend', false), false);
});

test('demo session never reaches owner endpoints even when an owner is signed in', () => {
  const src = fs.readFileSync('src/components/admin/RolePortals.tsx', 'utf8');
  assert.equal(/!user&&IS_DEMO_SESSION|!auth\.currentUser&&IS_DEMO_SESSION/.test(src), false);
  const gov = fs.readFileSync('src/components/admin/IdentityGovernance.tsx', 'utf8');
  assert.match(gov, /reissueRoleGrantActivation\(grant\.id\)/);
  assert.doesNotMatch(gov, /s\.reissueIdentityInvitation\(grant\.id\)/);
});

test('competition statuses on organization cards read in Arabic, never as raw codes', async () => {
  const { uiToken } = await import('../src/lib/ui-language');
  for (const s of ['registration_open', 'registration_closed', 'judging_complete', 'results_sealed', 'results_published'])
    assert.doesNotMatch(uiToken(s, true), /_/);
  assert.equal(uiToken('registration_open', true), 'التسجيل مفتوح');
});
