import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SaaSPlatformRepository, SecretVault } from '../server/saas-platform';
import { buildPaymentGateway, formEncode, validatePaymentProfile, type GatewayTransport } from '../server/payments';
import { PAYMENT_PRESETS, presetById } from '../server/payment-presets';
import { isoMinorToPlatformMinor, majorStringToPlatformMinor, platformMinorToIsoMinor, platformMinorToMajorString } from '../shared/currency';

/*
 * كل جهة أو مشغّل يعدّ بوابته هو (ماي فاتورة، تاب، سترايب، أو غيرها بملف إعداد)، والمال يذهب
 * إلى حسابه. تثبت هذه الاختبارات: العزل بين الجهات، وأن الأسرار لا تعود، وأن البوابة لا تُفعَّل
 * بلا اختبار، وأن السداد لا يُقبل إلا بمبلغه وعملته، ومرة واحدة، ومن مصدرٍ موثوق.
 */

const owner = { uid: 'owner', role: 'super_admin', organizationId: '__platform__' };
const dates = { startsAt: '2026-01-01', expiresAt: '2027-01-01' };

type Ctx = { repo: SaaSPlatformRepository; mine: string; theirs: string; opOrg: string; operatorId: string; vaultFile: string };
const setup = (run: (c: Ctx) => void | Promise<void>) => async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-pgw-'));
  try {
    const vaultFile = path.join(dir, 'vault.json');
    const repo = new SaaSPlatformRepository(path.join(dir, 'state.json'), new SecretVault(vaultFile, 'x'.repeat(32)));
    const plan = repo.seedInitialPlan(owner);
    const org = (name: string, operatorId?: string) => repo.createOrganization(owner, { officialName: name, shortName: name, organizationType: 'charity', country: 'KW', planId: plan.id, operatorId, ...dates }).organization.id;
    const operatorId = repo.createOperator(owner, { name: 'Gulf Operator' }).id;
    repo.adjustCredits(owner, operatorId, 1, 'test seat for an operated organization');
    await run({ repo, mine: org('Mine'), theirs: org('Theirs'), opOrg: org('Operated', operatorId), operatorId, vaultFile });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

/** بوابة وهمية تتكلم شكل ملف «demo» أدناه، وتسجّل كل طلب. */
const fakeGateway = (state: { status: string; amount: string; currency: string }) => {
  const calls: { url: string; method: string; body?: string; headers: Record<string, string> }[] = [];
  let n = 0;
  const transport: GatewayTransport = async (url, init) => {
    calls.push({ url, ...init });
    if (url.endsWith('/charges') && init.method === 'POST') { n++; return { status: 200, text: JSON.stringify({ id: `chg_${n}`, transaction: { url: `https://pay.example.com/c/${n}` } }) }; }
    const m = /\/charges\/(.+)$/.exec(url);
    if (m) return { status: 200, text: JSON.stringify({ id: decodeURIComponent(m[1]), status: state.status, amount: state.amount, currency: state.currency }) };
    return { status: 404, text: '{}' };
  };
  return { transport, calls };
};
const tap = presetById('tap')!;
const orgAdmin = (organizationId: string) => ({ uid: `admin-${organizationId}`, role: 'org_admin', organizationId });
const save = (c: Ctx, actor: any, ownerType: 'organization' | 'operator', ownerId: string) =>
  c.repo.savePaymentGateway(actor, ownerType, ownerId, { presetId: 'tap', provider: 'tap', profile: tap.profile, apiKey: 'sk_test_secret_value', webhookSecret: '' });
const testCall = (c: Ctx, actor: any, id: string, transport: GatewayTransport) =>
  c.repo.testPaymentGateway(actor, id, { currency: 'KWD', callbackUrl: 'https://app.example.com/#billing' }, transport);
const checkout = (c: Ctx, organizationId: string, transport: GatewayTransport, participantId = 'P1', amountMinor = 500) =>
  c.repo.startRegistrationCheckout({ organizationId, competitionId: 'C1', participantId, participantPath: `organizations/${organizationId}/competitions/C1/participants/${participantId}`, amountMinor, currency: 'KWD', description: 'fee', customer: { name: 'A', email: 'a@example.com' }, callbackUrl: 'https://app.example.com/ok', errorUrl: 'https://app.example.com/fail', webhookUrlFor: id => `https://app.example.com/api/payments/webhook/gateways/${id}` }, transport);

test('currency conversion follows ISO precision at the gateway boundary without floats', () => {
  assert.equal(platformMinorToMajorString(525, 'KWD'), '5.250');
  assert.equal(platformMinorToMajorString(525, 'USD'), '5.25');
  assert.equal(platformMinorToMajorString(1000, 'JPY'), '10');
  assert.throws(() => platformMinorToMajorString(1050, 'JPY'), /NOT_REPRESENTABLE/);
  assert.equal(platformMinorToIsoMinor(525, 'KWD'), 5250);
  assert.equal(isoMinorToPlatformMinor('5250', 'KWD'), 525);
  assert.equal(isoMinorToPlatformMinor('5251', 'KWD'), null, 'a fils amount not representable exactly must not settle');
  assert.equal(majorStringToPlatformMinor('5.250'), 525);
  assert.equal(majorStringToPlatformMinor(5.25), 525);
  assert.equal(majorStringToPlatformMinor('5.255'), null, 'extra precision is refused, never rounded');
  assert.equal(majorStringToPlatformMinor('-5'), null);
  assert.equal(majorStringToPlatformMinor('0.1e3'), null);
});

test('every preset is a valid profile that can prove settlement by querying the gateway', () => {
  assert.ok(PAYMENT_PRESETS.length >= 4);
  for (const p of PAYMENT_PRESETS) {
    assert.deepEqual(validatePaymentProfile(p.profile), [], p.id);
    assert.ok(p.profile.statusQuery, `${p.id} must verify settlement with the secret key, not trust a notification`);
    assert.ok(p.notes.length && p.notesArabic.length, `${p.id} must say what to verify before going live`);
  }
  assert.ok(validatePaymentProfile({ checkout: { url: 'http://insecure.example.com', paymentUrlPath: 'a', referencePath: 'b' } }).includes('CHECKOUT_URL_MUST_BE_HTTPS'));
  assert.ok(validatePaymentProfile({ checkout: { url: 'https://x.example.com', paymentUrlPath: 'a', referencePath: 'b' } }).includes('SETTLEMENT_VERIFICATION_REQUIRED'));
});

test('Tap preset sends KWD with three decimals as a number; Stripe preset sends fils form-encoded', async () => {
  const sent: any[] = [];
  const transport: GatewayTransport = async (url, init) => { sent.push({ url, ...init }); return { status: 200, text: JSON.stringify({ id: 'x1', url: 'https://checkout.stripe.com/x', transaction: { url: 'https://tap.example/x' } }) }; };
  const req = { invoiceId: 'C1-P1', invoiceNumber: 'P1', amountMinor: 525, currency: 'KWD', description: 'Fee', customer: { name: 'Ali', email: '' }, callbackUrl: 'https://a/ok', errorUrl: 'https://a/no', webhookUrl: 'https://a/hook' };
  await buildPaymentGateway(tap.profile, { apiKey: 'sk_test_1' }, 'tap', transport).createCheckout(req);
  const body = JSON.parse(sent[0].body);
  assert.equal(body.amount, 5.25);
  assert.equal(typeof body.amount, 'number');
  assert.equal(body.post.url, 'https://a/hook');
  assert.equal(sent[0].headers.authorization, 'Bearer sk_test_1');
  await buildPaymentGateway(presetById('stripe_checkout')!.profile, { apiKey: 'sk_test_2' }, 'stripe', transport).createCheckout(req);
  assert.equal(sent[1].headers['content-type'], 'application/x-www-form-urlencoded');
  assert.match(sent[1].body, /line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=5250/);
  assert.match(sent[1].body, /line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=kwd/);
  assert.doesNotMatch(sent[1].body, /customer_email=/, 'an empty email must be omitted, not sent blank');
  assert.equal(formEncode({ a: [{ b: '1' }], c: '' }), 'a%5B0%5D%5Bb%5D=1');
});

test('an organization configures its own gateway; secrets never come back and other tenants are blocked', setup(async c => {
  const g = save(c, orgAdmin(c.mine), 'organization', c.mine);
  assert.equal(g.status, 'pending_test');
  assert.equal(g.secretRef, 'stored_securely');
  const listed = c.repo.listPaymentGateways(orgAdmin(c.mine), 'organization', c.mine);
  assert.equal(JSON.stringify(listed).includes('sk_test_secret_value'), false);
  assert.equal(fs.readFileSync(c.vaultFile, 'utf8').includes('sk_test_secret_value'), false, 'the vault stores ciphertext only');
  assert.throws(() => save(c, orgAdmin(c.mine), 'organization', c.theirs), /CROSS_TENANT_ACCESS_BLOCKED/);
  assert.throws(() => c.repo.listPaymentGateways(orgAdmin(c.mine), 'organization', c.theirs), /CROSS_TENANT_ACCESS_BLOCKED/);
  assert.throws(() => save(c, { uid: 'j', role: 'judge', organizationId: c.mine }, 'organization', c.mine), /ORG_BILLING_ADMIN_REQUIRED/);
  assert.throws(() => save(c, orgAdmin(c.mine), 'operator', c.operatorId), /OPERATOR_OWNER_REQUIRED/);
  assert.equal(c.repo.publicPaymentAvailability(c.mine).available, false, 'an untested gateway must not collect money');
}));

test('a gateway activates only after a real checkout and status query succeed with the owner\'s keys', setup(async c => {
  const g = save(c, orgAdmin(c.mine), 'organization', c.mine);
  const broken: GatewayTransport = async () => ({ status: 401, text: '{"error":"bad key"}' });
  const failed = await testCall(c, orgAdmin(c.mine), g.id, broken);
  assert.equal(failed.ok, false);
  assert.equal(failed.gateway.status, 'pending_test');
  const { transport } = fakeGateway({ status: 'INITIATED', amount: '1.000', currency: 'KWD' });
  const passed = await testCall(c, orgAdmin(c.mine), g.id, transport);
  assert.equal(passed.ok, true);
  assert.equal(passed.gateway.status, 'active');
  assert.deepEqual(c.repo.publicPaymentAvailability(c.mine), { available: true, provider: 'tap', displayName: 'tap' });
  await assert.rejects(() => testCall(c, orgAdmin(c.theirs), g.id, transport), /CROSS_TENANT_ACCESS_BLOCKED/);
}));

test('an operator gateway serves its organizations unless one configures its own', setup(async c => {
  const opOwner = { uid: 'op', role: 'operator_owner', organizationId: '', operatorId: c.operatorId };
  const { transport } = fakeGateway({ status: 'INITIATED', amount: '1', currency: 'KWD' });
  const opGw = save(c, opOwner, 'operator', c.operatorId);
  await testCall(c, opOwner, opGw.id, transport);
  assert.equal(c.repo.publicPaymentAvailability(c.opOrg).available, true);
  assert.equal(c.repo.publicPaymentAvailability(c.mine).available, false, 'an operator gateway never reaches organizations it does not own');
  const own = save(c, opOwner, 'organization', c.opOrg);
  await testCall(c, opOwner, own.id, transport);
  assert.equal(c.repo.listPaymentGateways(opOwner, 'organization', c.opOrg).effective?.id, own.id);
  c.repo.disablePaymentGateway(opOwner, own.id);
  assert.equal(c.repo.listPaymentGateways(opOwner, 'organization', c.opOrg).effective?.id, opGw.id);
}));

test('registration payments settle once, only for the exact amount and currency, from the gateway itself', setup(async c => {
  const state = { status: 'INITIATED', amount: '5.250', currency: 'KWD' };
  const { transport, calls } = fakeGateway(state);
  const g = save(c, orgAdmin(c.mine), 'organization', c.mine);
  await testCall(c, orgAdmin(c.mine), g.id, transport);

  const first = await checkout(c, c.mine, transport, 'P1', 525);
  assert.ok('paymentUrl' in first && first.paymentUrl?.startsWith('https://'));
  const again = await checkout(c, c.mine, transport, 'P1', 525);
  assert.ok('reused' in again, 'an unfinished checkout is reused instead of opening a second charge');
  const intentId = first.intent.id;

  assert.equal((await c.repo.verifyRegistrationIntent(intentId, transport)).intent.status, 'created');
  state.status = 'CAPTURED'; state.amount = '0.250';
  const mismatch = await c.repo.verifyRegistrationIntent(intentId, transport);
  assert.equal(mismatch.intent.status, 'created', 'a smaller captured amount is never a payment');
  assert.equal(mismatch.intent.failureCode, 'AMOUNT_MISMATCH');
  state.amount = '5.250'; state.currency = 'USD';
  assert.equal((await c.repo.verifyRegistrationIntent(intentId, transport)).intent.failureCode, 'CURRENCY_MISMATCH');
  state.currency = 'KWD';
  const paid = await c.repo.verifyRegistrationIntent(intentId, transport);
  assert.equal(paid.intent.status, 'paid');
  assert.equal(paid.changed, true);
  assert.equal((await c.repo.verifyRegistrationIntent(intentId, transport)).changed, false, 'settlement is idempotent');
  assert.ok(c.repo.registrationIntentsToReconcile().some(i => i.id === intentId), 'paid but not yet written to the participant record');
  c.repo.markRegistrationIntentRecorded(intentId);
  assert.ok(!c.repo.registrationIntentsToReconcile().some(i => i.id === intentId));
  assert.ok('alreadyPaid' in await checkout(c, c.mine, transport, 'P1', 525));
  assert.ok(calls.every(x => x.url.startsWith('https://api.tap.company/')), 'only the configured gateway host is contacted');
}));

test('an unsigned notification only triggers a status query; a forged "paid" body settles nothing', setup(async c => {
  const state = { status: 'INITIATED', amount: '5.250', currency: 'KWD' };
  const { transport } = fakeGateway(state);
  const g = save(c, orgAdmin(c.mine), 'organization', c.mine);
  await testCall(c, orgAdmin(c.mine), g.id, transport);
  const out = await checkout(c, c.mine, transport, 'P2', 525);
  const ref = out.intent.externalRef;
  const forged = Buffer.from(JSON.stringify({ id: ref, status: 'CAPTURED', amount: 5.25, currency: 'KWD' }));
  assert.equal((await c.repo.handleGatewayNotification(g.id, {}, forged, transport)).intent.status, 'created', 'the gateway still says INITIATED');
  state.status = 'CAPTURED';
  assert.equal((await c.repo.handleGatewayNotification(g.id, {}, forged, transport)).intent.status, 'paid');
  await assert.rejects(() => c.repo.handleGatewayNotification(g.id, {}, Buffer.from(JSON.stringify({ id: 'chg_unknown' })), transport), /PAYMENT_INTENT_NOT_FOUND/);
  await assert.rejects(() => c.repo.handleGatewayNotification('PGW-missing', {}, forged, transport), /PAYMENT_GATEWAY_NOT_FOUND/);
}));

test('a webhook-only gateway is trusted only through a valid signature', setup(async c => {
  const profile = {
    name: 'signed-only',
    checkout: { url: 'https://api.pay.example.com/charges', body: { amount: '${amountMajor}' }, paymentUrlPath: 'transaction.url', referencePath: 'id' },
    webhook: { signatureHeader: 'x-sig', encoding: 'hex' as const, referencePath: 'id', statusPath: 'status', amountPath: 'amount', currencyPath: 'currency', paidValues: ['CAPTURED'] },
  };
  assert.throws(() => c.repo.savePaymentGateway(orgAdmin(c.mine), 'organization', c.mine, { profile, apiKey: 'k' }), /PAYMENT_WEBHOOK_SECRET_REQUIRED/);
  const g = c.repo.savePaymentGateway(orgAdmin(c.mine), 'organization', c.mine, { profile, apiKey: 'k', webhookSecret: 'whsec_1' });
  const { transport } = fakeGateway({ status: 'x', amount: '0', currency: 'KWD' });
  const t = await testCall(c, orgAdmin(c.mine), g.id, transport);
  assert.equal(t.code, 'AWAITING_SIGNED_NOTIFICATION');
  assert.equal(t.gateway.status, 'pending_test');
  const body = (ref: string) => Buffer.from(JSON.stringify({ id: ref, status: 'CAPTURED', amount: '1.00', currency: 'KWD' }));
  const sig = (b: Buffer) => crypto.createHmac('sha256', 'whsec_1').update(b.toString('utf8')).digest('hex');
  const testBody = body('chg_1');
  await assert.rejects(() => c.repo.handleGatewayNotification(g.id, { 'x-sig': 'forged' }, testBody, transport), /PAYMENT_SIGNATURE_INVALID/);
  assert.equal((await c.repo.handleGatewayNotification(g.id, { 'x-sig': sig(testBody) }, testBody, transport)).intent.status, 'paid');
  assert.equal(c.repo.listPaymentGateways(orgAdmin(c.mine), 'organization', c.mine).gateways[0].status, 'active', 'a signed paid test notification activates the gateway');
}));

test('a "paid" answer without a readable amount and currency never settles, and such a profile cannot activate', setup(async c => {
  const state = { status: 'INITIATED', amount: '5.250', currency: '' };
  const { transport } = fakeGateway(state);
  const g = save(c, orgAdmin(c.mine), 'organization', c.mine);
  const t = await testCall(c, orgAdmin(c.mine), g.id, transport);
  assert.equal(t.ok, false);
  assert.equal(t.code, 'STATUS_QUERY_MISSING_AMOUNT_OR_CURRENCY');
  state.currency = 'KWD';
  await testCall(c, orgAdmin(c.mine), g.id, transport);
  const out = await checkout(c, c.mine, transport, 'P9', 525);
  state.status = 'CAPTURED'; state.currency = '';
  const r = await c.repo.verifyRegistrationIntent(out.intent.id, transport);
  assert.equal(r.intent.status, 'created');
  assert.equal(r.intent.failureCode, 'SETTLEMENT_UNVERIFIABLE');
}));

test('a replaced or disabled gateway still settles payments it already started, but opens no new ones', setup(async c => {
  const state = { status: 'INITIATED', amount: '5.250', currency: 'KWD' };
  const { transport } = fakeGateway(state);
  const g = save(c, orgAdmin(c.mine), 'organization', c.mine);
  await testCall(c, orgAdmin(c.mine), g.id, transport);
  const out = await checkout(c, c.mine, transport, 'P7', 525);
  c.repo.disablePaymentGateway(orgAdmin(c.mine), g.id);
  await assert.rejects(() => checkout(c, c.mine, transport, 'P8', 525), /PAYMENT_GATEWAY_NOT_CONFIGURED/);
  state.status = 'CAPTURED';
  const note = Buffer.from(JSON.stringify({ id: out.intent.externalRef }));
  assert.equal((await c.repo.handleGatewayNotification(g.id, {}, note, transport)).intent.status, 'paid');
}));
