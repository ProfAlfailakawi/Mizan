import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenant, publicTenant, type TenantRecord } from '../server/tenant-registry';

const TENANTS: TenantRecord[] = [
  { orgId: 'org-a', subdomain: 'jamiat-a', displayNameArabic: 'جهة أ', customDomains: ['quran.jamiat-a.org'] },
  { orgId: 'org-b', subdomain: 'jamiat-b', displayNameArabic: 'جهة ب' },
  { orgId: 'org-old', subdomain: 'old', status: 'suspended' },
];

test('a custom domain resolves to its organization', () => {
  process.env.MIZAN_BASE_DOMAIN = 'mizan.app';
  assert.equal(resolveTenant('quran.jamiat-a.org', TENANTS)?.orgId, 'org-a');
  // مع منفذ وحالة أحرف مختلفة
  assert.equal(resolveTenant('QURAN.Jamiat-A.org:8443', TENANTS)?.orgId, 'org-a');
});

test('a subdomain under the base domain resolves to its organization', () => {
  process.env.MIZAN_BASE_DOMAIN = 'mizan.app';
  assert.equal(resolveTenant('jamiat-b.mizan.app', TENANTS)?.orgId, 'org-b');
});

test('one organization never resolves from another organization host', () => {
  process.env.MIZAN_BASE_DOMAIN = 'mizan.app';
  assert.equal(resolveTenant('jamiat-a.mizan.app', TENANTS)?.orgId, 'org-a');
  assert.notEqual(resolveTenant('jamiat-b.mizan.app', TENANTS)?.orgId, 'org-a');
});

test('unknown, bare, nested and suspended hosts resolve to no tenant', () => {
  process.env.MIZAN_BASE_DOMAIN = 'mizan.app';
  assert.equal(resolveTenant('mizan.app', TENANTS), null);          // النطاق الأساسي نفسه
  assert.equal(resolveTenant('nope.mizan.app', TENANTS), null);     // نطاق فرعي غير مسجّل
  assert.equal(resolveTenant('a.jamiat-b.mizan.app', TENANTS), null); // تداخل نطاقات
  assert.equal(resolveTenant('old.mizan.app', TENANTS), null);      // جهة موقوفة
  assert.equal(resolveTenant('', TENANTS), null);
  assert.equal(resolveTenant(undefined, TENANTS), null);
});

test('the public shape exposes branding only', () => {
  const view = publicTenant(TENANTS[0]);
  assert.deepEqual(Object.keys(view).sort(), ['displayName', 'displayNameArabic', 'logoUrl', 'orgId']);
  assert.equal((view as Record<string, unknown>).customDomains, undefined);
});
