import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BILLING_AUDIENCE_ROLES, InAppProvider, isBillingTrigger, type OutboxMessage } from '../server/communications';
import { NotificationCenterRepository } from '../server/notification-center';

/*
 * «تعذّر سداد فاتورة الاشتراك — قد تنتقل الجهة إلى وضع القراءة فقط» كان يصل كلَّ من في الجهة: المحكّم، غرفة العمليات،
 * مكتب الاستثناءات. شأنٌ تجاريّ لا يخصّهم ولا يملكون فيه إجراء، ويُربك قاعةً في يوم المسابقة.
 */
const msg = (trigger: OutboxMessage['trigger']): OutboxMessage => ({
  id: 'm1', trigger, channel: 'in_app', to: 'org-1', organizationId: 'org-1', locale: 'ar', subject: 'تعذّر سداد فاتورة الاشتراك', body: '…',
  dedupeKey: 'k', status: 'queued', attempts: 0, nextAttemptAt: new Date().toISOString(), createdAt: new Date().toISOString(),
});
const identity = (role: string, uid: string) => ({ uid, role, organizationId: 'org-1' }) as never;

test('billing triggers are recognised and the provider passes the trigger through', async () => {
  assert.equal(isBillingTrigger('payment_failed'), true);
  assert.equal(isBillingTrigger('renewal_approaching'), true);
  assert.equal(isBillingTrigger('results_published'), false);
  const seen: string[] = [];
  await new InAppProvider(i => { seen.push(i.trigger); }).send(msg('payment_failed'));
  assert.deepEqual(seen, ['payment_failed']);
});

test('a billing notice reaches the organisation and billing admins and nobody else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-notif-'));
  const center = new NotificationCenterRepository(dir);
  for (const role of BILLING_AUDIENCE_ROLES) center.system({ title: 'تعذّر سداد فاتورة الاشتراك', body: 'x', target: { type: 'role', role, organizationId: 'org-1' } as never });
  const sees = (role: string) => center.list(identity(role, `u-${role}`)).notifications.length;
  assert.equal(sees('org_admin'), 1);
  assert.equal(sees('billing_admin'), 1);
  for (const role of ['judge', 'head_judge', 'comp_admin', 'ops_manager', 'exception_host', 'delegation_manager', 'storage_admin', 'participant']) assert.equal(sees(role), 0, role);
  assert.equal(center.list({ uid: 'x', role: 'org_admin', organizationId: 'org-2' } as never).notifications.length, 0, 'and not another organisation');
});

test('the server routes billing triggers through the role audience', () => {
  const server = fs.readFileSync('server.ts', 'utf8');
  assert.match(server, /if\(isBillingTrigger\(trigger\)\)\{for\(const role of BILLING_AUDIENCE_ROLES\)/);
});
