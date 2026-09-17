/*
 * P26 — المفتاح المنصّي والجهةُ التي يتصرّف باسمها.
 *
 * المسارُ كان يقرأ `organizationId` من جسم الطلب خلف مفتاحٍ مشترك بلا أيِّ فحص. والقرار
 * المعماريّ المتّخذ: المفتاح اعتمادُ **مشغّل منصّة** لا اعتمادَ جهة — فيبقى المعرّف آتيًا
 * من الطلب، لكنه يمرّ بثلاثة حدودٍ ويُدقَّق. هذه الاختبارات تثبت الحدود الثلاثة، وتثبت
 * أن المسار نفسه يستعملها بدل قراءة الجسم مباشرةً.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parseAllowedOrgIds, resolveEnterpriseOrganization } from '../server/enterprise-scope';

const SERVER = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

/** المسارات مكتوبةٌ سطرًا واحدًا في هذا الملف، فيُقرأ السطر كلُّه لا حتى أول `});`. */
const routeLine = (needle: string) =>
  SERVER.split('\n').find(line => line.includes(needle)) || '';

test('a request without an organization is refused, not defaulted', () => {
  for (const value of [undefined, null, '', '   ', 0, 42, {}, ['org-a']]) {
    const decision = resolveEnterpriseOrganization({ requestedOrganizationId: value });
    assert.deepEqual(decision, { ok: false, status: 400, code: 'ENTERPRISE_ORGANIZATION_REQUIRED' }, String(value));
  }
});

test('a key scoped to some tenants cannot act for another — the cross-tenant exploit', () => {
  const scoped = { allowedOrgIds: ['org-alpha', 'org-beta'], knownOrgIds: ['org-alpha', 'org-beta', 'org-gamma'] };
  assert.deepEqual(
    resolveEnterpriseOrganization({ requestedOrganizationId: 'org-gamma', ...scoped }),
    { ok: false, status: 403, code: 'ENTERPRISE_ORGANIZATION_NOT_IN_KEY_SCOPE' },
    'a tenant that exists but is outside the key scope must still be refused',
  );
  assert.deepEqual(
    resolveEnterpriseOrganization({ requestedOrganizationId: 'org-alpha', ...scoped }),
    { ok: true, organizationId: 'org-alpha' },
  );
});

test('an organization that does not exist is refused, so no session is created for a phantom tenant', () => {
  assert.deepEqual(
    resolveEnterpriseOrganization({ requestedOrganizationId: 'org-nowhere', knownOrgIds: ['org-alpha'] }),
    { ok: false, status: 404, code: 'ENTERPRISE_ORGANIZATION_UNKNOWN' },
  );
});

test('an empty registry means a single-tenant deployment, not "accept anything"', () => {
  // سجلٌّ فارغ = لم تُسجَّل الجهة بعد. لكن وجودَ سجلٍّ يجعل الفحص قاطعًا — وهو المُختبَر أعلاه.
  assert.deepEqual(
    resolveEnterpriseOrganization({ requestedOrganizationId: 'org-solo', knownOrgIds: [] }),
    { ok: true, organizationId: 'org-solo' },
  );
  // وحصرُ المفتاح يبقى ساريًا حتى بلا سجلّ جهات.
  assert.deepEqual(
    resolveEnterpriseOrganization({ requestedOrganizationId: 'org-solo', allowedOrgIds: ['org-other'], knownOrgIds: [] }),
    { ok: false, status: 403, code: 'ENTERPRISE_ORGANIZATION_NOT_IN_KEY_SCOPE' },
  );
});

test('the allow-list is parsed from the environment exactly as documented', () => {
  assert.deepEqual(parseAllowedOrgIds('org-a, org-b ,,org-c '), ['org-a', 'org-b', 'org-c']);
  assert.deepEqual(parseAllowedOrgIds(''), []);
  assert.deepEqual(parseAllowedOrgIds(undefined), []);
});

test('the provision route derives its tenant through the guard and never straight from the body', () => {
  const route = routeLine("app.post('/api/enterprise/question-runtime/provision'");
  assert.ok(route, 'the provision route must exist');
  assert.ok(route.includes('enterpriseOrganization(req,res)'), 'the route must resolve the tenant through the guard');
  assert.equal(
    /organizationId:String\(body\.organizationId/.test(route), false,
    'the route must not read organizationId straight out of the request body any more',
  );
  assert.ok(route.includes('enterpriseAuditRateLimit'), 'a platform-wide key needs a rate limit');
  assert.ok(route.includes('QUESTION_RUNTIME_PROVISIONED_BY_PLATFORM_OPERATOR'), 'every platform-operator provision is audited');
  assert.ok(route.includes('platformOperatorActor('), 'the audit actor says plainly that this was the platform operator');
});

test('the enterprise escrow route is guarded the same way', () => {
  const route = routeLine("app.post('/api/enterprise/question-escrow/sessions'");
  assert.ok(route, 'the escrow route must exist');
  assert.ok(route.includes('enterpriseOrganization(req,res)'));
  assert.equal(/organizationId:String\(body\.organizationId/.test(route), false);
  assert.ok(route.includes('enterpriseAuditRateLimit'));
});

test('the platform-key threat model is written down where the key is checked', () => {
  const module = fs.readFileSync(path.join(process.cwd(), 'server', 'enterprise-scope.ts'), 'utf8');
  assert.ok(module.includes('MIZAN_ENTERPRISE_API_KEY'), 'the module must name the credential it governs');
  assert.ok(module.includes('MIZAN_ENTERPRISE_ALLOWED_ORG_IDS'), 'the scoping variable must be documented');
  assert.ok(/وما لا يحميه هذا/.test(module), 'the threat model must state what it does NOT protect against');
});
