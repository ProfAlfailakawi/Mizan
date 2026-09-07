/*
 * تعارض الجلسة على نطاق آخر، وحلّه بالاستيلاء الذاتي.
 *
 * نطاقا الجهة والمنصّة أصلان مختلفان في المتصفح، فلكلٍّ معرّف جهاز مستقل، فيبدوان
 * جهازين لهوية واحدة. من يملك إبطال جلساته يبطل الأخرى ويكمل — لا طريق مسدود يطلب
 * ممن لا أحد فوقه.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IdentityGovernanceRepository } from '../server/identity-governance';

const repo = () => new IdentityGovernanceRepository(fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-id-')));

function seedOwner(dir: string, uid = 'owner-uid') {
  const file = path.join(dir, 'identity-governance.json');
  const now = new Date().toISOString();
  const account = { id: 'acct1', uid, organizationId: 'org', email: 'o@x.co', displayName: 'مالك', status: 'ACTIVE', createdAt: now, activatedFromInvitationId: 'B' };
  const grant = { id: 'g1', accountId: 'acct1', organizationId: 'org', role: 'super_admin', status: 'ACTIVE', createdAt: now, createdBy: 'B' };
  fs.writeFileSync(file, JSON.stringify({ version: 1, invitations: [], accounts: [account], grants: [grant], sessions: [] }));
}

test('a privileged owner takes over a session held on another origin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-id-'));
  seedOwner(dir);
  const r = new IdentityGovernanceRepository(dir);
  const identity = { uid: 'owner-uid', email: 'o@x.co', role: 'super_admin' as const, organizationId: 'org' };

  // النطاق الأول فتح جلسة
  r.openSession(identity, 'device-mizan', 'المنصّة', 'MFA');
  // النطاق الثاني (جهاز مختلف) يُمنع بتعارض
  assert.throws(() => r.openSession(identity, 'device-tenant', 'الجهة', 'MFA'), /PRIVILEGED_SESSION_CONFLICT/);

  // الاستيلاء يبطل الأولى ويفتح الثانية
  const session = r.takeoverSession(identity, 'device-tenant', 'الجهة', 'MFA');
  assert.equal(session.status, 'ACTIVE');
  assert.equal(session.deviceId, 'device-tenant');
});

test('a role without revocation power cannot take over', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-id-'));
  const file = path.join(dir, 'identity-governance.json');
  const now = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify({ version: 1, invitations: [],
    accounts: [{ id: 'a', uid: 'j', organizationId: 'org', email: 'j@x.co', displayName: 'محكم', status: 'ACTIVE', createdAt: now, activatedFromInvitationId: 'B' }],
    grants: [{ id: 'g', accountId: 'a', organizationId: 'org', role: 'judge', status: 'ACTIVE', createdAt: now, createdBy: 'B' }],
    sessions: [] }));
  const r = new IdentityGovernanceRepository(dir);
  assert.throws(() => r.takeoverSession({ uid: 'j', email: 'j@x.co', role: 'judge', organizationId: 'org' }, 'd2'), /SESSION_TAKEOVER_NOT_ALLOWED/);
});
