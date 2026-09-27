/*
 * §69–§71 وما تبقّى من المنصّة: الاتصالات الآلية، الدخول الموحّد، التسليم المثبّت للـwebhooks،
 * أحداث المسابقة، وعلامة المضيف.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CommunicationsService, HttpJsonProvider, renderTemplate, type Provider } from '../server/communications';
import { SsoConfigRepository, suggestRole, validateSsoConfig } from '../server/sso';
import { pinnedHttpsPost, domainEventPayload, DOMAIN_EVENT_REPORTERS } from '../server/commercial/webhooks';
import { SaaSPlatformRepository, SecretVault } from '../server/saas-platform';
import { isWhiteLabel } from '../src/lib/host-brand';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-platform-'));

test('§71 communications: templates, dedupe, honest provider status, retries', async () => {
  const dir = tmp();
  try {
    let clock = Date.parse('2026-10-01T00:00:00Z');
    let failures = 1;
    const sent: string[] = [];
    const email: Provider = { channel: 'email', name: 'fake-email', configured: true, send: async m => { if (failures-- > 0) return { ok: false, error: 'HTTP_503' }; sent.push(m.to); return { ok: true, providerMessageId: 'x1' }; } };
    const svc = new CommunicationsService(path.join(dir, 'outbox.json'), [email, new HttpJsonProvider('sms', 'http-sms', undefined, undefined)], () => clock);
    const r = renderTemplate('renewal_approaching', 'ar', { organization: 'جمعية', date: '2027-09-27', days: 30 });
    assert.match(r.body, /جمعية/); assert.match(r.body, /30/); assert.doesNotMatch(r.body, /\{\{/);
    const created = svc.enqueue('renewal_approaching', 'term-1:30', [{ channel: 'email', address: 'admin@assoc.org', locale: 'ar' }, { channel: 'sms', address: '+96555555555', locale: 'ar' }, { channel: 'email', address: 'not-an-email', locale: 'en' }], { organization: 'X', date: 'd', days: 30 });
    assert.equal(created.length, 2, 'invalid email dropped');
    assert.equal(created.find(m => m.channel === 'sms')!.status, 'provider_not_configured', 'never pretends an unconfigured channel sent');
    assert.equal(svc.enqueue('renewal_approaching', 'term-1:30', [{ channel: 'email', address: 'admin@assoc.org', locale: 'ar' }], {}).length, 0, 'same reminder not queued twice');
    assert.deepEqual(await svc.dispatch(), { attempted: 1, sent: 0 });
    assert.deepEqual(await svc.dispatch(), { attempted: 0, sent: 0 }, 'backoff respected');
    clock += 2 * 60_000;
    assert.deepEqual(await svc.dispatch(), { attempted: 1, sent: 1 });
    assert.deepEqual(sent, ['admin@assoc.org']);
    const listed = svc.list();
    assert.ok(listed.every(m => !m.to.includes('admin@')), 'addresses are masked in listings');
    assert.deepEqual(svc.status().map(c => [c.channel, c.configured]), [['in_app', false], ['email', true], ['sms', false], ['whatsapp', false]]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('§70 SSO: validated config, least-privilege role suggestion, domain discovery without secrets', () => {
  assert.throws(() => validateSsoConfig({ protocol: 'saml', firebaseProviderId: 'oidc.x', allowedEmailDomains: ['uni.edu'] }), /PROVIDER_ID_INVALID/);
  assert.throws(() => validateSsoConfig({ protocol: 'saml', firebaseProviderId: 'saml.uni', allowedEmailDomains: ['gmail.com'] }), /PUBLIC_EMAIL_DOMAIN/);
  assert.throws(() => validateSsoConfig({ protocol: 'saml', firebaseProviderId: 'saml.uni', allowedEmailDomains: ['uni.edu'], roleMapping: [{ group: 'root', role: 'super_admin' as never }] }), /ROLE_MAPPING_INVALID/);
  const dir = tmp();
  try {
    const repo = new SsoConfigRepository(path.join(dir, 'sso.json'));
    const cfg = repo.save('org-1', 'admin', { protocol: 'saml', firebaseProviderId: 'saml.uni', displayName: 'University SSO', allowedEmailDomains: ['@Uni.edu'], roleMapping: [{ group: 'staff', role: 'org_admin' }, { group: 'judges', role: 'judge' }], status: 'active' });
    assert.deepEqual(cfg.allowedEmailDomains, ['uni.edu']);
    assert.deepEqual(suggestRole(cfg, { email: 'a@uni.edu', groups: ['staff', 'judges'] }), { role: 'judge', matchedGroup: 'judges' }, 'least privilege wins');
    assert.equal(suggestRole(cfg, { email: 'a@other.edu', groups: ['staff'] }), null);
    assert.equal(suggestRole(cfg, { email: 'a@uni.edu', groups: ['students'] }), null, 'unmapped group → deny');
    assert.equal(suggestRole(cfg, { email: 'a@uni.edu', groups: ['judges'], signInProvider: 'saml.evil' }), null);
    assert.deepEqual(repo.discover('someone@uni.edu'), { providerId: 'saml.uni', protocol: 'saml', displayName: 'University SSO', preferSso: false });
    assert.equal(repo.discover('someone@elsewhere.org'), null);
    assert.throws(() => repo.save('org-2', 'admin', { protocol: 'saml', firebaseProviderId: 'saml.other', allowedEmailDomains: ['uni.edu'] }), /DOMAIN_CLAIMED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('webhook delivery is pinned to the validated address and refuses private pins', async () => {
  await assert.rejects(() => pinnedHttpsPost('https://hooks.example.com/x', { headers: {}, body: '{}' }, '127.0.0.1'), /PRIVATE_NETWORK/);
  await assert.rejects(() => pinnedHttpsPost('http://hooks.example.com/x', { headers: {}, body: '{}' }, '93.184.216.34'), /HTTPS/);
  const dir = tmp();
  try {
    const clock = Date.parse('2026-10-01T00:00:00Z');
    const repo = new SaaSPlatformRepository(path.join(dir, 's.json'), new SecretVault(path.join(dir, 'v.json'), 'k'.repeat(40)), undefined, () => clock);
    const owner = { uid: 'o', role: 'super_admin', organizationId: '__platform__' };
    const plan = repo.publicCatalog()[0];
    const org = repo.createOrganization(owner, { officialName: 'O', shortName: 'O', organizationType: 'x', country: 'KW', planId: plan.id, startsAt: '2026-09-01T00:00:00Z', expiresAt: '2027-09-01T00:00:00Z' }).organization;
    const admin = { uid: 'a', role: 'org_admin', organizationId: org.id };
    repo.createWebhookEndpoint(admin, org.id, { url: 'https://hooks.example.com/m', events: ['results.published', 'certificate.issued'] });
    // أحداث المسابقة: دور مسموح، حمولة بلا بيانات شخصية، ولا تكرار.
    assert.throws(() => repo.reportDomainEvent({ ...admin, role: 'judge' }, org.id, { type: 'results.published', competitionId: 'c1', subjectId: 'c1' }), /ROLE_NOT_ALLOWED/);
    assert.throws(() => repo.reportDomainEvent(admin, org.id, { type: 'subscription.renewed', competitionId: 'c1', subjectId: 'c1' }), /TYPE_NOT_ALLOWED/);
    assert.equal(repo.reportDomainEvent(admin, org.id, { type: 'results.published', competitionId: 'c1', subjectId: 'c1' }), 1);
    assert.equal(repo.reportDomainEvent(admin, org.id, { type: 'results.published', competitionId: 'c1', subjectId: 'c1' }), 0, 'deduplicated');
    assert.deepEqual(domainEventPayload({ competitionId: 'c1', subjectId: 'cert-1', participantCode: 'A-1', fullName: 'Secret Name', email: 'x@y' }), { competitionId: 'c1', subjectId: 'cert-1', participantCode: 'A-1' });
    assert.ok(DOMAIN_EVENT_REPORTERS['judging.completed'].includes('judge'));
    const pins: string[] = [];
    await repo.dispatchWebhooks(async (_u, _i, address) => { pins.push(address); return { status: 200 }; }, async () => ['93.184.216.34']);
    assert.deepEqual(pins, ['93.184.216.34'], 'the send is told which validated address to connect to');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('host brand: white label only for a non-MIZAN host with a non-MIZAN mode, and the logo hides the MIZAN mark when allowed', () => {
  assert.equal(isWhiteLabel(null), false);
  assert.equal(isWhiteLabel({ context: 'mizan', brandingMode: 'mizan', productName: 'MIZAN', showPoweredByMizan: true }), false);
  assert.equal(isWhiteLabel({ context: 'operator', brandingMode: 'full_white_label', productName: 'QEA', showPoweredByMizan: false }), true);
  const logo = fs.readFileSync('src/components/design-system/MizanLogo.tsx', 'utf8');
  assert.match(logo, /hideMizanMark: !!hostWL && hostWL.brandingMode === 'full_white_label' && !hostWL.showPoweredByMizan/);
  assert.match(logo, /brandInfo\.hideMizanMark \?/);
  assert.match(fs.readFileSync('src/main.tsx', 'utf8'), /loadHostBrand\(\)/);
});
