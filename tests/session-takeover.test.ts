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

function seedJudge(dir: string) {
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'identity-governance.json'), JSON.stringify({ version: 1, invitations: [],
    accounts: [
      { id: 'a', uid: 'j', organizationId: 'org', email: 'j@x.co', displayName: 'محكم', status: 'ACTIVE', createdAt: now, activatedFromInvitationId: 'B' },
      { id: 'b', uid: 'k', organizationId: 'org', email: 'k@x.co', displayName: 'محكم آخر', status: 'ACTIVE', createdAt: now, activatedFromInvitationId: 'B' },
    ],
    grants: [
      { id: 'g', accountId: 'a', organizationId: 'org', role: 'judge', status: 'ACTIVE', createdAt: now, createdBy: 'B' },
      { id: 'g2', accountId: 'b', organizationId: 'org', role: 'judge', status: 'ACTIVE', createdAt: now, createdBy: 'B' },
    ],
    sessions: [] }));
}

/*
 * المحكّم يفعّل دعوته على هاتفه، ثم يجلس إلى جهاز اللجنة فيصطدم بتعارض جلسة. كان الاستيلاء
 * محصورًا بمن يملك إبطال جلسات غيره، والمحكّم ليس منهم، فيردّ الخادم منعًا ويسقط في شاشة
 * «الحساب غير مفوض» بلا زرّ ولا مخرج، ثماني ساعاتٍ كاملة، وهو مفعَّلٌ سليم.
 * استعادةُ المرء جلسته هو ليست سلطةً على أحد.
 */
test('an activated judge reclaims their own session from a second device', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-id-'));
  seedJudge(dir);
  const r = new IdentityGovernanceRepository(dir);
  const judge = { uid: 'j', email: 'j@x.co', role: 'judge' as const, organizationId: 'org' };

  r.openSession(judge, 'phone', 'الهاتف', 'MFA');
  assert.throws(() => r.openSession(judge, 'panel-tablet', 'جهاز اللجنة', 'MFA'), /PRIVILEGED_SESSION_CONFLICT/);

  const session = r.takeoverSession(judge, 'panel-tablet', 'جهاز اللجنة', 'MFA');
  assert.equal(session.status, 'ACTIVE');
  assert.equal(session.deviceId, 'panel-tablet');
});

/* والاستيلاء لا يمسّ إلا جلسات صاحبه: جلسة زميله تبقى قائمة. */
test('takeover never touches another account session', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-id-'));
  seedJudge(dir);
  const r = new IdentityGovernanceRepository(dir);
  const judge = { uid: 'j', email: 'j@x.co', role: 'judge' as const, organizationId: 'org' };
  const peer = { uid: 'k', email: 'k@x.co', role: 'judge' as const, organizationId: 'org' };

  const peerSession = r.openSession(peer, 'peer-device', 'زميل', 'MFA');
  r.openSession(judge, 'phone', 'الهاتف', 'MFA');
  r.takeoverSession(judge, 'panel-tablet', 'جهاز اللجنة', 'MFA');

  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'identity-governance.json'), 'utf8')).sessions as { id: string; uid: string; status: string }[];
  assert.equal(rows.find(x => x.id === peerSession.id)?.status, 'ACTIVE');
  assert.equal(rows.filter(x => x.uid === 'j' && x.status === 'ACTIVE').length, 1);
});

/* أمّا إبطال جلسات غيره فسلطةٌ لا يملكها المحكّم — وهذا لم يتغيّر. */
test('a judge still cannot revoke another account sessions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-id-'));
  seedJudge(dir);
  const r = new IdentityGovernanceRepository(dir);
  assert.throws(() => r.revokeSessions({ uid: 'j', email: 'j@x.co', role: 'judge', organizationId: 'org' }, 'b', 'سبب كافٍ للإبطال'), /SESSION_REVOCATION_NOT_ALLOWED/);
});
