import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TenantStore, validateTenant, normalizeTenant, RESERVED_SUBDOMAINS } from '../server/tenant-store';
import { resolveTenant, resetTenantRegistry } from '../server/tenant-registry';

/* حلّ النطاق الفرعي يقاس بالنطاق الأساسي، فيُثبَّت هنا بدل الاتكال على بيئة التشغيل. */
process.env.MIZAN_BASE_DOMAIN = 'mizan.com';
resetTenantRegistry();

const store = () => new TenantStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-tenants-')), 'tenants.json'));

test('a new organization is added and resolves from its subdomain', () => {
  const s = store();
  const added = s.add({ orgId: 'jamiat-a', subdomain: 'a', displayNameArabic: 'جهة أ' });
  assert.equal(added.ok, true);
  assert.deepEqual(s.list().map(t => t.orgId), ['jamiat-a']);
  assert.equal(resolveTenant('a.mizan.com', s.list())?.orgId, 'jamiat-a');
});

test('a subdomain already taken by another organization is refused', () => {
  const s = store();
  s.add({ orgId: 'first', subdomain: 'noor' });
  const clash = s.add({ orgId: 'second', subdomain: 'NOOR' });
  assert.equal(clash.ok, false);
  assert.deepEqual(clash.ok === false && clash.errors, ['SUBDOMAIN_TAKEN']);
  assert.equal(s.list().length, 1);
});

test('a custom domain claimed by another organization is refused', () => {
  const s = store();
  s.add({ orgId: 'first', customDomains: ['quran.example.org'] });
  const clash = s.add({ orgId: 'second', customDomains: ['Quran.Example.org.'] });
  assert.equal(clash.ok, false);
  assert.equal(clash.ok === false && clash.errors[0].startsWith('CUSTOM_DOMAIN_TAKEN'), true);
});

test('reserved and malformed subdomains are refused', () => {
  const s = store();
  for (const reserved of RESERVED_SUBDOMAINS) {
    assert.equal(s.add({ orgId: `org-${reserved}`, subdomain: reserved }).ok, false);
  }
  assert.equal(s.add({ orgId: 'dotted', subdomain: 'a.b' }).ok, false);
  assert.equal(s.add({ orgId: 'spaced', subdomain: 'a b' }).ok, false);
});

test('an organization with neither subdomain nor custom domain is refused', () => {
  assert.deepEqual(validateTenant({ orgId: 'ghost' }, []).errors, ['HOST_REQUIRED']);
});

test('updating an organization does not collide with its own hosts', () => {
  const s = store();
  s.add({ orgId: 'org', subdomain: 'noor', customDomains: ['quran.example.org'] });
  const renamed = s.update('org', { displayNameArabic: 'الاسم الجديد' });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.ok && renamed.tenant.subdomain, 'noor');
});

test('a duplicate organization id is refused rather than silently merged', () => {
  const s = store();
  s.add({ orgId: 'org', subdomain: 'one' });
  const again = s.add({ orgId: 'org', subdomain: 'two' });
  assert.equal(again.ok, false);
  assert.deepEqual(again.ok === false && again.errors, ['ORG_ID_TAKEN']);
});

test('a suspended organization stays in the registry but stops resolving', () => {
  const s = store();
  s.add({ orgId: 'org', subdomain: 'noor' });
  assert.equal(s.suspend('org').ok, true);
  assert.equal(s.list().length, 1);
  assert.equal(resolveTenant('noor.mizan.com', s.list()), null);
  assert.equal(s.activate('org').ok, true);
  assert.equal(resolveTenant('noor.mizan.com', s.list())?.orgId, 'org');
});

test('hosts are normalized so casing and trailing dots cannot fork one tenant into two', () => {
  const record = normalizeTenant({ orgId: 'org', subdomain: '  NOOR ', customDomains: ['Quran.Example.ORG.', 'quran.example.org'] });
  assert.equal(record.subdomain, 'noor');
  assert.deepEqual(record.customDomains, ['quran.example.org']);
});

test('an unknown organization cannot be updated into existence', () => {
  assert.deepEqual(store().update('missing', { subdomain: 'x' }), { ok: false, errors: ['ORG_NOT_FOUND'] });
});
