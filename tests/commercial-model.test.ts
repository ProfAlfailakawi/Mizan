/*
 * النموذج التجاري لميزان — اختبارات القبول الإلزامية.
 *
 * كل اختبار هنا يشغّل `SaaSPlatformRepository` الحقيقي على ملفٍّ مؤقّت وبساعةٍ محقونة، فحدود
 * الدورات (ديسمبر→يناير، التجديد، 29 فبراير) تُختبر بتواريخها الفعلية لا بتقريب.
 *
 * المراجع: MIZAN_COMMERCIAL_MODEL.md، والأقسام 111–124 و151–156 من وثيقة التنفيذ.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SaaSPlatformRepository, SecretVault } from '../server/saas-platform';
import { applyDiscountBps } from '../server/commercial/money';
import { addUtcMonthsClamped, anniversary, inclusiveEndDate } from '../server/commercial/term-calendar';
import { signWebhook, verifyWebhookSignature, backoffMs } from '../server/commercial/webhooks';

const owner = { uid: 'platform-owner', role: 'super_admin', organizationId: '__platform__' };
const day = (iso: string) => Date.parse(iso);

function harness(startIso: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-commercial-'));
  const clock = { now: day(startIso) };
  const vault = new SecretVault(path.join(dir, 'vault.json'), 'k'.repeat(40));
  const repo = new SaaSPlatformRepository(path.join(dir, 'saas.json'), vault, undefined, () => clock.now);
  const plan = (slug: string) => {
    const p = repo.publicCatalog().find(x => x.slug === slug);
    assert.ok(p, `catalog plan ${slug} is seeded`);
    return p!;
  };
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { repo, clock, plan, dir, cleanup };
}

function directCustomer(h: ReturnType<typeof harness>, slug: string, startsAt: string, name = 'جمعية القرآن') {
  const p = h.plan(slug);
  const expiresAt = addUtcMonthsClamped(startsAt, 12);
  const created = h.repo.createOrganization(owner, { officialName: name, shortName: name, organizationType: 'charity', country: 'KW', planId: p.id, startsAt, expiresAt });
  const admin = { uid: `admin-${created.organization.id}`, role: 'org_admin', organizationId: created.organization.id };
  return { org: created.organization, admin, planId: p.id };
}

function openCompetition(h: ReturnType<typeof harness>, admin: any, competitionId: string) {
  return h.repo.setCompetitionState(admin, { organizationId: admin.organizationId, competitionId, state: 'registration_open' });
}

function register(h: ReturnType<typeof harness>, admin: any, competitionId: string, from: number, count: number) {
  for (let i = from; i < from + count; i++) h.repo.recordParticipant(admin, { organizationId: admin.organizationId, competitionId, participantId: `P-${i}` });
}

/* ————————————————— money ————————————————— */

test('wholesale price is integer-exact for every catalog plan at 40%', () => {
  const expected: Record<number, number> = { 24_900: 14_940, 59_900: 35_940, 149_000: 89_400, 349_000: 209_400, 790_000: 474_000 };
  for (const [publicMinor, wholesale] of Object.entries(expected)) assert.equal(applyDiscountBps(Number(publicMinor), 4000), wholesale);
  assert.equal(applyDiscountBps(59_900, 6000), 23_960);
  assert.throws(() => applyDiscountBps(599.5 as number, 4000), /INTEGER/);
  assert.throws(() => applyDiscountBps(59_900, 10_001), /DISCOUNT_BPS_INVALID/);
});

/* ————————————————— calendar ————————————————— */

test('anniversary terms clamp month ends without drifting (Jan 31, Feb 29, Dec 31)', () => {
  assert.equal(addUtcMonthsClamped('2027-01-31T00:00:00.000Z', 1), '2027-02-28T00:00:00.000Z');
  assert.equal(addUtcMonthsClamped('2028-01-31T00:00:00.000Z', 1), '2028-02-29T00:00:00.000Z');
  assert.equal(addUtcMonthsClamped('2026-12-31T00:00:00.000Z', 12), '2027-12-31T00:00:00.000Z');
  const anchor = '2028-02-29T00:00:00.000Z';
  assert.deepEqual([1, 2, 3, 4].map(n => anniversary(anchor, n).slice(0, 10)), ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  assert.equal(inclusiveEndDate('2027-09-27T00:00:00.000Z'), '2027-09-26');
});

/* ————————————————— §111 December → January ————————————————— */

test('§111 a term that starts 20 Dec keeps its quota across 1 January', () => {
  const h = harness('2026-12-20T09:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-150', '2026-12-20T00:00:00.000Z');
    openCompetition(h, c.admin, 'C-1');
    register(h, c.admin, 'C-1', 0, 100);
    h.clock.now = day('2027-01-01T08:00:00Z');
    const billing = h.repo.organizationBilling(c.admin, c.org.id);
    assert.equal(billing.usage.participantsUsed, 100);
    assert.equal(billing.usage.participantsRemaining, 50, 'remaining capacity is 50, not 150');
    assert.equal(billing.term!.endsAt, '2027-12-20T00:00:00.000Z');
    assert.equal(inclusiveEndDate(billing.term!.endsAt), '2027-12-19');
    register(h, c.admin, 'C-1', 100, 50);
    assert.throws(() => register(h, c.admin, 'C-1', 150, 1), /ANNUAL_PARTICIPANT_LIMIT_REACHED/);
  } finally { h.cleanup(); }
});

/* ————————————————— §151 + §112 direct journey and renewal ————————————————— */

test('§151/§112 direct MIZAN 150: sequential competitions, no Jan reset, renewal resets usage not history', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-150', '2026-09-27T00:00:00.000Z');
    h.repo.createSubscription(owner, { subjectType: 'organization', subjectId: c.org.id, planId: c.planId, startsAt: '2026-09-27T00:00:00.000Z' });
    const [a, b, cc] = ['A', 'B', 'C'];
    openCompetition(h, c.admin, a); register(h, c.admin, a, 0, 60);
    h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: a, state: 'completed' });
    openCompetition(h, c.admin, b); register(h, c.admin, b, 60, 40);
    h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: b, state: 'archived' });
    openCompetition(h, c.admin, cc); register(h, c.admin, cc, 100, 50);
    assert.throws(() => register(h, c.admin, cc, 150, 1), /ANNUAL_PARTICIPANT_LIMIT_REACHED/, 'the 151st unique participant is blocked');
    // نفس الشخص في مسابقة أخرى داخل الدورة لا يُحتسب مرتين.
    h.repo.recordParticipant(c.admin, { organizationId: c.org.id, competitionId: cc, participantId: 'P-5' });

    h.clock.now = day('2027-01-01T00:00:00Z');
    assert.equal(h.repo.organizationBilling(c.admin, c.org.id).usage.participantsRemaining, 0, 'nothing resets on 1 January');

    h.clock.now = day('2027-09-27T06:00:00Z');
    const cycle = h.repo.runBillingCycle();
    assert.equal(cycle.issued.length, 1, 'one renewal invoice');
    assert.equal(h.repo.organizationBilling(c.admin, c.org.id).accessState, 'grace', 'unpaid renewal → grace, not deletion');
    h.repo.markInvoicePaid(owner, cycle.issued[0].id, { method: 'bank_transfer' });
    h.repo.markInvoicePaid(owner, cycle.issued[0].id, { method: 'bank_transfer' }); // مُعاد: لا دورة ثانية
    const after = h.repo.organizationBilling(c.admin, c.org.id);
    assert.equal(after.accessState, 'active');
    assert.equal(after.term!.startsAt, '2027-09-27T00:00:00.000Z');
    assert.equal(after.term!.endsAt, '2028-09-27T00:00:00.000Z');
    assert.equal(after.usage.participantsUsed, 0);
    assert.equal(after.usage.participantAllowance, 150);
    assert.equal(after.history.length, 1, 'exactly one earlier term');
    assert.equal(after.history[0].participantsUsed, 150, 'old usage stays attached to the old term');
    assert.throws(() => openCompetition(h, c.admin, 'D'), /ACTIVE_COMPETITION_LIMIT_REACHED/, 'C is still open, so the simultaneous cap still applies');
    h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: cc, state: 'completed' });
    openCompetition(h, c.admin, 'D');
    register(h, c.admin, 'D', 0, 150);
  } finally { h.cleanup(); }
});

/* ————————————————— §113 simultaneous active competitions ————————————————— */

test('§113/§62 the active-competition cap is simultaneous, not historical', async () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-150', '2026-09-27T00:00:00.000Z');
    h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: 'draft-1', state: 'draft' });
    openCompetition(h, c.admin, 'A');
    assert.throws(() => openCompetition(h, c.admin, 'B'), /ACTIVE_COMPETITION_LIMIT_REACHED/);
    h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: 'A', state: 'completed' });
    openCompetition(h, c.admin, 'B');
    for (let i = 0; i < 5; i++) {
      h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: 'B', state: 'archived' });
      openCompetition(h, c.admin, `N-${i}`);
      h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: `N-${i}`, state: 'completed' });
      h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: 'B', state: 'registration_open' });
    }
    // محاولتان متزامنتان لفتح مسابقتين والحدّ ممتلئ — واحدة فقط تنجح.
    h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: 'B', state: 'completed' });
    const results = await Promise.allSettled([
      Promise.resolve().then(() => openCompetition(h, c.admin, 'X')),
      Promise.resolve().then(() => openCompetition(h, c.admin, 'Y')),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  } finally { h.cleanup(); }
});

test('§61 two registrations racing for the last seat never produce 151', async () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-150', '2026-09-27T00:00:00.000Z');
    openCompetition(h, c.admin, 'A');
    register(h, c.admin, 'A', 0, 149);
    const results = await Promise.allSettled(['late-1', 'late-2'].map(id =>
      Promise.resolve().then(() => h.repo.recordParticipant(c.admin, { organizationId: c.org.id, competitionId: 'A', participantId: id }))));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(h.repo.organizationBilling(c.admin, c.org.id).usage.participantsUsed, 150);
  } finally { h.cleanup(); }
});

/* ————————————————— §11 non-payment lifecycle ————————————————— */

test('§11 non-payment walks grace → read-only → suspended and never deletes history', () => {
  const h = harness('2026-01-10T10:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-500', '2026-01-10T00:00:00.000Z');
    openCompetition(h, c.admin, 'A'); register(h, c.admin, 'A', 0, 10);
    h.clock.now = day('2027-01-15T00:00:00Z');
    assert.equal(h.repo.organizationBilling(c.admin, c.org.id).accessState, 'grace');
    h.clock.now = day('2027-02-10T00:00:00Z');
    assert.equal(h.repo.organizationBilling(c.admin, c.org.id).accessState, 'read_only');
    assert.throws(() => openCompetition(h, c.admin, 'B'), /TENANT_READ_ONLY/);
    assert.throws(() => h.repo.recordParticipant(c.admin, { organizationId: c.org.id, competitionId: 'A', participantId: 'new' }), /TENANT_READ_ONLY/);
    // الإغلاق مسموح دائمًا: لا تُحبس مسابقةٌ نشطة.
    h.repo.setCompetitionState(c.admin, { organizationId: c.org.id, competitionId: 'A', state: 'completed' });
    h.clock.now = day('2027-06-01T00:00:00Z');
    const view = h.repo.organizationBilling(c.admin, c.org.id);
    assert.equal(view.accessState, 'suspended');
    assert.equal(view.history[0]?.participantsUsed ?? view.term?.id, 10, 'history is still readable');
  } finally { h.cleanup(); }
});

/* ————————————————— operator ————————————————— */

function operatorSetup(h: ReturnType<typeof harness>, opts: { tier?: string; commitmentMinor?: number; name?: string } = {}) {
  const op = h.repo.createOperator(owner, { name: opts.name || 'Quran Events Arabia' });
  const agreement = h.repo.createAgreement(owner, { operatorId: op.id, tierId: opts.tier || 'authorized' });
  h.repo.approveAgreement(owner, agreement.id);
  h.repo.fundCommitment(owner, agreement.id, { reference: `wire-${op.id}`, amountMinor: opts.commitmentMinor });
  const actor = { uid: `op-${op.id}`, role: 'operator_owner', organizationId: `operator:${op.id}`, operatorId: op.id };
  return { op, agreement, actor };
}

const identity = (name: string) => ({ officialName: name, shortName: name, organizationType: 'charity', country: 'SA' });

test('§115/§117/§153 activation debits exactly $359.40 once, even when retried', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h);
    assert.equal(h.repo.operatorCommercial(o.actor).summary.balanceMinor, 250_000);
    const input = { ...identity('جمعية القرآن X'), planId: h.plan('mizan-500').id };
    const first = h.repo.operatorActivateOrganization(o.actor, input, 'activate-x-1');
    const again = h.repo.operatorActivateOrganization(o.actor, input, 'activate-x-1');
    assert.equal(first.walletEntry.amountMinor, -35_940);
    assert.equal(again.organization.id, first.organization.id);
    const view = h.repo.operatorCommercial(o.actor);
    assert.equal(view.summary.balanceMinor, 214_060, '$2,500 − $359.40 = $2,140.60');
    assert.equal(view.ledger.filter((e: any) => e.type === 'license_activation').length, 1, 'one debit');
    assert.equal(view.customers.length, 1, 'one subscription');
    assert.throws(() => h.repo.operatorActivateOrganization(o.actor, { ...input, planId: h.plan('mizan-2k').id }, 'activate-x-1'), /IDEMPOTENCY_KEY_REUSED/);
    // العميل يرى 500 مشارك ولا يرى سعر الجملة ولا الخصم.
    const customer = { uid: 'cust', role: 'org_admin', organizationId: first.organization.id };
    const billing = h.repo.organizationBilling(customer, first.organization.id);
    assert.equal(billing.usage.participantAllowance, 500);
    const text = JSON.stringify(billing);
    for (const secret of ['wholesalePriceMinor', 'discountBps', 'operatorAgreementId', 'walletEntryId', '35940', '59900']) assert.ok(!text.includes(secret), `customer must not see ${secret}`);
    assert.equal(billing.upgradePath, 'contact_operator');
  } finally { h.cleanup(); }
});

test('§116 insufficient balance fails safely: no licence, no subscription, no negative wallet', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h, { commitmentMinor: 10_000 });
    const before = h.repo.dashboard(owner).counts.organizations;
    assert.throws(() => h.repo.operatorActivateOrganization(o.actor, { ...identity('Short'), planId: h.plan('mizan-150').id }, 'k-short'), (err: any) => {
      assert.equal(err.message, 'INSUFFICIENT_WALLET_BALANCE');
      assert.deepEqual(err.details, { requiredMinor: 14_940, availableMinor: 10_000, shortfallMinor: 4_940, currency: 'USD' });
      return true;
    });
    assert.equal(h.repo.dashboard(owner).counts.organizations, before);
    assert.equal(h.repo.operatorCommercial(o.actor).summary.balanceMinor, 10_000);
    assert.equal(h.repo.operatorCommercial(o.actor).customers.length, 0);
  } finally { h.cleanup(); }
});

test('§118/§155 operator renewal: one debit, a fresh 500 term, history intact', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h);
    const { organization } = h.repo.operatorActivateOrganization(o.actor, { ...identity('Association X'), planId: h.plan('mizan-500').id }, 'act');
    const customer = { uid: 'cust', role: 'org_admin', organizationId: organization.id };
    openCompetition(h, customer, 'Y2026'); register(h, customer, 'Y2026', 0, 320);
    h.repo.setCompetitionState(customer, { organizationId: organization.id, competitionId: 'Y2026', state: 'completed' });
    assert.throws(() => h.repo.operatorRenewOrganization(o.actor, organization.id, 'early'), /RENEWAL_TOO_EARLY/);
    // الاتفاقية السنوية للمشغّل تنتهي أيضًا؛ تُجدَّد قبل موعد تجديد العميل.
    const next = h.repo.renewAgreement(owner, o.agreement.id);
    h.clock.now = day('2027-09-20T00:00:00Z');
    const r1 = h.repo.operatorRenewOrganization(o.actor, organization.id, 'renew-1') as any;
    const r2 = h.repo.operatorRenewOrganization(o.actor, organization.id, 'renew-1') as any;
    assert.equal(r1.term.id, r2.term.id);
    assert.throws(() => h.repo.operatorRenewOrganization(o.actor, organization.id, 'renew-2'), /RENEWAL_TOO_EARLY/, 'a second key cannot renew the same period twice');
    const view = h.repo.operatorCommercial(o.actor);
    assert.equal(view.ledger.filter((e: any) => e.type === 'license_renewal').length, 1);
    assert.equal(view.summary.balanceMinor, 250_000 - 35_940 - 35_940);
    h.repo.approveAgreement(owner, next.id);
    h.clock.now = day('2027-09-28T00:00:00Z');
    const billing = h.repo.organizationBilling(customer, organization.id);
    assert.equal(billing.term!.participantAllowance, 500);
    assert.equal(billing.usage.participantsUsed, 0);
    assert.equal(billing.history[0].participantsUsed, 320, 'the 2026 edition usage remains on its own term');
  } finally { h.cleanup(); }
});

test('§122/§123 discount and price changes never rewrite history', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h);
    const first = h.repo.operatorActivateOrganization(o.actor, { ...identity('Org One'), planId: h.plan('mizan-500').id }, 'a1');
    h.clock.now = day('2026-09-28T10:00:00Z');
    h.repo.updateAgreement(owner, o.agreement.id, { discountBps: 5000 }, 'renegotiated tier');
    assert.throws(() => h.repo.schedulePlanPrice(owner, h.plan('mizan-500').id, { publicPriceMinor: 64_900, effectiveFrom: '2026-01-01T00:00:00Z' }), /RETROACTIVE/);
    h.repo.schedulePlanPrice(owner, h.plan('mizan-500').id, { publicPriceMinor: 64_900 });
    const second = h.repo.operatorActivateOrganization(o.actor, { ...identity('Org Two'), planId: h.plan('mizan-500').id }, 'a2');
    const ledger = h.repo.walletLedger(owner, { operatorId: o.op.id });
    const e1 = ledger.find((e: any) => e.organizationId === first.organization.id)!;
    const e2 = ledger.find((e: any) => e.organizationId === second.organization.id)!;
    assert.equal(e1.amountMinor, -35_940); assert.equal(e1.discountBps, 4000); assert.equal(e1.publicPriceMinor, 59_900);
    assert.equal(e2.amountMinor, -32_450); assert.equal(e2.discountBps, 5000); assert.equal(e2.publicPriceMinor, 64_900);
    assert.equal(first.term.publicPriceMinor, 59_900, 'the historical term keeps its price snapshot');
    assert.equal(h.plan('mizan-500').publicPriceMinor, 64_900);
  } finally { h.cleanup(); }
});

test('§45 operator upgrade debits the wholesale difference within the term', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h);
    const { organization } = h.repo.operatorActivateOrganization(o.actor, { ...identity('Upgrader'), planId: h.plan('mizan-500').id }, 'a');
    const up = h.repo.operatorUpgradeOrganization(o.actor, organization.id, h.plan('mizan-2k').id, 'u1') as any;
    assert.equal(up.debitMinor, 53_460, '$894.00 − $359.40 = $534.60');
    assert.equal(h.repo.operatorCommercial(o.actor).summary.balanceMinor, 250_000 - 35_940 - 53_460);
    const billing = h.repo.organizationBilling({ uid: 'c', role: 'org_admin', organizationId: organization.id }, organization.id);
    assert.equal(billing.usage.participantAllowance, 2000);
    assert.equal(billing.usage.activeCompetitionAllowance, 5);
  } finally { h.cleanup(); }
});

test('§91 downgrades are scheduled for the next term and never delete competitions', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-500', '2026-09-27T00:00:00.000Z');
    h.repo.createSubscription(owner, { subjectType: 'organization', subjectId: c.org.id, planId: c.planId, startsAt: '2026-09-27T00:00:00.000Z' });
    openCompetition(h, c.admin, 'A'); openCompetition(h, c.admin, 'B');
    const scheduled = h.repo.scheduleDowngrade(c.admin, c.org.id, h.plan('mizan-150').id) as any;
    assert.equal(scheduled.validation.exceedsActiveLimit, true);
    assert.equal(h.repo.organizationBilling(c.admin, c.org.id).usage.participantAllowance, 500, 'current term unchanged');
    h.clock.now = day('2027-09-27T01:00:00Z');
    const cycle = h.repo.runBillingCycle();
    assert.equal(cycle.issued[0].amountMinor, 24_900, 'renewal invoiced at the new plan price');
    h.repo.markInvoicePaid(owner, cycle.issued[0].id, {});
    const billing = h.repo.organizationBilling(c.admin, c.org.id);
    assert.equal(billing.usage.participantAllowance, 150);
    assert.equal(billing.usage.activeCompetitions, 2, 'existing competitions are kept, not deleted');
  } finally { h.cleanup(); }
});

test('wallet: refunds compensate, adjustments need a reason, expiry is a ledger event', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h);
    const act = h.repo.operatorActivateOrganization(o.actor, { ...identity('Refunded'), planId: h.plan('mizan-150').id }, 'r');
    assert.throws(() => h.repo.adminAdjustWallet(owner, o.op.id, { amountMinor: 100, currency: 'USD', reason: '' }), /REASON_REQUIRED/);
    h.repo.refundWalletEntry(owner, act.walletEntry.id, { amountMinor: 4_940, reason: 'goodwill partial refund' });
    assert.throws(() => h.repo.refundWalletEntry(owner, act.walletEntry.id, { amountMinor: 10_001, reason: 'too much refund' }), /REFUND_EXCEEDS_DEBIT/);
    assert.equal(h.repo.operatorCommercial(o.actor).summary.balanceMinor, 250_000 - 14_940 + 4_940);
    h.clock.now = day('2027-09-28T00:00:00Z');
    const cycle = h.repo.runBillingCycle();
    assert.equal(cycle.expiredAgreements[0].expiredMinor, 240_000);
    const report = h.repo.platformCommercialReport(owner);
    assert.ok(report.walletChecks.every((w: any) => w.valid), 'ledger and cached balance agree');
    const types = h.repo.walletLedger(owner, { operatorId: o.op.id }).map((e: any) => e.type).reverse();
    assert.deepEqual(types.slice(0, 3), ['commitment', 'license_activation', 'refund']);
    assert.ok(types.includes('expiration'));
    assert.match(h.repo.exportWalletLedgerCsv(owner, o.op.id), /^id,createdAt,operatorId/);
  } finally { h.cleanup(); }
});

test('§30 exclusivity is never implied by tier and must be explicit and dated', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const op = h.repo.createOperator(owner, { name: 'Strategic' });
    const a = h.repo.createAgreement(owner, { operatorId: op.id, tierId: 'strategic' });
    assert.equal(a.exclusivity, undefined);
    assert.equal(a.discountBps, 6000);
    assert.throws(() => h.repo.createAgreement(owner, { operatorId: op.id, tierId: 'strategic', exclusivity: { enabled: true, territories: [] } }), /TERRITORIES_REQUIRED/);
    assert.throws(() => h.repo.createAgreement(owner, { operatorId: op.id, tierId: 'strategic', exclusivity: { enabled: true, territories: ['KW'] } }), /DATES_REQUIRED/);
  } finally { h.cleanup(); }
});

/* ————————————————— white label & Discover ————————————————— */

test('§119/§154 full white label: the operator domain shows the operator brand, not MIZAN', async () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h);
    h.repo.setBrandProfile(o.actor, 'operator', o.op.id, { brandingMode: 'full_white_label', productName: 'Quran Events Arabia', directoryName: 'QEA Discover', showPoweredByMizan: false, primaryColor: '#0f5132' });
    const d1 = h.repo.requestCustomDomain(o.actor, 'operator', o.op.id, { hostname: 'platform.qea.example' });
    const d2 = h.repo.requestCustomDomain(o.actor, 'operator', o.op.id, { hostname: 'discover.qea.example', purpose: 'discover' });
    const resolver = (tokens: Record<string, string>) => async (name: string) => tokens[name] ? [[tokens[name]]] : Promise.reject(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }));
    const failed = await h.repo.verifyCustomDomain(o.actor, d1.id, resolver({}));
    assert.equal(failed.status, 'failed');
    await h.repo.verifyCustomDomain(o.actor, d1.id, resolver({ '_mizan-verify.platform.qea.example': d1.verificationToken }));
    await h.repo.verifyCustomDomain(o.actor, d2.id, resolver({ '_mizan-verify.discover.qea.example': d2.verificationToken }));
    for (const host of ['platform.qea.example', 'discover.qea.example']) {
      const brand = h.repo.resolveBrand(host);
      assert.equal(brand.productName, 'Quran Events Arabia');
      assert.equal(brand.showPoweredByMizan, false);
      const visible = Object.values(brand).filter((v): v is string => typeof v === 'string');
      assert.ok(!visible.some(v => /MIZAN|ميزان/i.test(v)), `no MIZAN branding leaks on ${host}: ${visible.join(' | ')}`);
    }
    assert.equal(h.repo.resolveBrand('unknown.example').productName, 'MIZAN');
  } finally { h.cleanup(); }
});

test('§48 an operator cannot grant itself rights its agreement does not hold', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    h.repo.upsertOperatorTier(owner, { slug: 'reseller-basic', name: 'Reseller Basic', nameArabic: 'موزّع أساسي', minimumAnnualCommitmentMinor: 100_000, discountBps: 2000, defaultWhiteLabelRights: { level: 'co_branded', customDomain: false, customEmailBranding: false, hideMizanBrand: false } });
    const o = operatorSetup(h, { tier: 'reseller-basic' });
    assert.throws(() => h.repo.setBrandProfile(o.actor, 'operator', o.op.id, { brandingMode: 'full_white_label', productName: 'Mine' }), /BRANDING_MODE_NOT_PERMITTED/);
    assert.throws(() => h.repo.setBrandProfile(o.actor, 'operator', o.op.id, { brandingMode: 'co_branded', productName: 'Mine', showPoweredByMizan: false }), /HIDE_MIZAN_BRAND_NOT_PERMITTED/);
    assert.throws(() => h.repo.requestCustomDomain(o.actor, 'operator', o.op.id, { hostname: 'mine.example' }), /CUSTOM_DOMAIN_NOT_PERMITTED/);
    h.repo.setBrandProfile(o.actor, 'operator', o.op.id, { brandingMode: 'co_branded', productName: 'Mine' });
  } finally { h.cleanup(); }
});

test('§120/§154 Discover: global syndication OFF never reaches the global directory', async () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h);
    const d = h.repo.requestCustomDomain(o.actor, 'operator', o.op.id, { hostname: 'discover.qea.example', purpose: 'discover' });
    await h.repo.verifyCustomDomain(o.actor, d.id, async () => [[d.verificationToken]]);
    const { organization } = h.repo.operatorActivateOrganization(o.actor, { ...identity('Assoc'), planId: h.plan('mizan-500').id }, 'a');
    h.repo.publishDiscoverListing(o.actor, organization.id, { competitionId: 'private-comp', title: 'Operator Only Cup', registrationOpen: true, visibility: { operatorDirectory: true, globalSyndication: false } });
    h.repo.publishDiscoverListing(o.actor, organization.id, { competitionId: 'global-comp', title: 'Syndicated Cup', registrationOpen: true, visibility: { operatorDirectory: true, globalSyndication: true } });
    const global = h.repo.discover(undefined, {}).listings.map((l: any) => l.title);
    assert.deepEqual(global, ['Syndicated Cup']);
    for (const q of [{ q: 'Operator Only' }, { registrationOpen: true }, { country: 'SA' }, { limit: 500 }]) {
      assert.ok(!h.repo.discover('mizan.app', q as any).listings.some((l: any) => l.title === 'Operator Only Cup'), `guessed params ${JSON.stringify(q)} cannot surface it`);
    }
    const scoped = h.repo.discover('discover.qea.example', {}).listings.map((l: any) => l.title).sort();
    assert.deepEqual(scoped, ['Operator Only Cup', 'Syndicated Cup']);
    const row = h.repo.discover(undefined, {}).listings[0] as Record<string, unknown>;
    for (const internal of ['organizationId', 'competitionId', 'operatorId', 'visibility', 'publishedBy']) assert.ok(!(internal in row), `${internal} is not public`);
    // مشغّلٌ آخر لا يرى مسابقات هذا المشغّل في دليله.
    const other = operatorSetup(h, { name: 'Other Operator' });
    assert.throws(() => h.repo.publishDiscoverListing(other.actor, organization.id, { competitionId: 'x', title: 'Hijack' }), /CROSS_TENANT_ACCESS_BLOCKED/);
  } finally { h.cleanup(); }
});

/* ————————————————— §121 cross-tenant ————————————————— */

test('§121 operators and organizations cannot reach each other by ID manipulation', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const a = operatorSetup(h, { name: 'Operator A' });
    const b = operatorSetup(h, { name: 'Operator B' });
    const orgA = h.repo.operatorActivateOrganization(a.actor, { ...identity('Org A'), planId: h.plan('mizan-150').id }, 'a').organization;
    const orgB = h.repo.operatorActivateOrganization(b.actor, { ...identity('Org B'), planId: h.plan('mizan-150').id }, 'b').organization;
    assert.equal(h.repo.operatorCommercial(b.actor).customers.map((c: any) => c.organizationId).join(), orgB.id, 'B sees only its own customers');
    assert.ok(!JSON.stringify(h.repo.operatorCommercial(b.actor)).includes(a.op.id), 'B view carries nothing of A');
    assert.throws(() => h.repo.adminOperatorCommercial(b.actor, a.op.id), /SUPER_ADMIN_REQUIRED/);
    assert.throws(() => h.repo.operatorUpgradeOrganization(b.actor, orgA.id, h.plan('mizan-500').id, 'x'), /CROSS_OPERATOR_ACCESS_BLOCKED/);
    assert.throws(() => h.repo.walletLedger(b.actor as any), /SUPER_ADMIN_REQUIRED/);
    const adminA = { uid: 'a-admin', role: 'org_admin', organizationId: orgA.id };
    assert.throws(() => h.repo.organizationBilling(adminA, orgB.id), /CROSS_TENANT_ACCESS_BLOCKED/);
    assert.throws(() => h.repo.recordParticipant(adminA, { organizationId: orgB.id, competitionId: 'c', participantId: 'p' }), /CROSS_TENANT_ACCESS_BLOCKED/);
    assert.throws(() => h.repo.setBrandProfile(adminA, 'organization', orgB.id, { brandingMode: 'mizan' }), /CROSS_TENANT_ACCESS_BLOCKED/);
  } finally { h.cleanup(); }
});

test('§85/§87 MIZAN direct cannot silently license an operator-managed organization', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const o = operatorSetup(h);
    const { organization } = h.repo.operatorActivateOrganization(o.actor, { ...identity('Channel'), planId: h.plan('mizan-150').id }, 'c');
    assert.throws(() => h.repo.createSubscription(owner, { subjectType: 'organization', subjectId: organization.id, planId: h.plan('mizan-150').id }), /ORGANIZATION_MANAGED_BY_OPERATOR/);
    const admin = { uid: 'x', role: 'org_admin', organizationId: organization.id };
    assert.throws(() => h.repo.requestDirectUpgrade(admin, organization.id, h.plan('mizan-500').id), /ORGANIZATION_MANAGED_BY_OPERATOR/);
    // النقل إلى المباشر عملية إدارية مُدقَّقة بسبب.
    assert.throws(() => h.repo.transferCommercialOwner(admin, organization.id, { toOperatorId: null, reason: 'moving to direct' }), /SUPER_ADMIN_REQUIRED/);
    const event = h.repo.transferCommercialOwner(owner, organization.id, { toOperatorId: null, reason: 'customer contracted MIZAN directly' });
    assert.equal(event.to.owner, 'direct');
    assert.equal(h.repo.organizationBilling(admin, organization.id).commercialOwner, 'direct');
  } finally { h.cleanup(); }
});

test('direct upgrade is invoiced and applied on payment, idempotently', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-150', '2026-09-27T00:00:00.000Z');
    const r = h.repo.requestDirectUpgrade(c.admin, c.org.id, h.plan('mizan-500').id) as any;
    assert.equal(r.invoice.amountMinor, 35_000);
    assert.equal((h.repo.requestDirectUpgrade(c.admin, c.org.id, h.plan('mizan-500').id) as any).invoice.id, r.invoice.id);
    h.repo.markInvoicePaid(owner, r.invoice.id, {});
    h.repo.markInvoicePaid(owner, r.invoice.id, {});
    const billing = h.repo.organizationBilling(c.admin, c.org.id);
    assert.equal(billing.usage.participantAllowance, 500);
    assert.equal(billing.term!.changes.length, 1);
  } finally { h.cleanup(); }
});

test('§92 contract overrides are visible as base + override = effective', () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-national', '2026-09-27T00:00:00.000Z', 'وزارة');
    assert.equal(h.repo.organizationBilling(c.admin, c.org.id).usage.participantAllowance, 0, 'National has no implicit unlimited capacity');
    h.repo.setContractOverride(owner, c.org.id, { participantAllowance: 250_000, activeCompetitionAllowance: 60, reason: 'National contract 2026' });
    const b = h.repo.organizationBilling(c.admin, c.org.id);
    assert.deepEqual(b.limits!.base, { participantAllowance: 0, activeCompetitionAllowance: 0 });
    assert.deepEqual(b.limits!.override, { participantAllowance: 250_000, activeCompetitionAllowance: 60 });
    assert.deepEqual(b.limits!.effective, { participantAllowance: 250_000, activeCompetitionAllowance: 60 });
  } finally { h.cleanup(); }
});

/* ————————————————— §124 migration ————————————————— */

test('§124/§56/§57 migration links calendar-year usage to terms, preserves every row, never converts credits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-migration-'));
  try {
    const file = path.join(dir, 'saas.json');
    const legacy = {
      version: 1, sequence: 50,
      plans: [{ id: 'PLAN-000001', name: 'Basic', currency: 'KWD', priceMinor: 100000, billingPeriod: 'annual', active: true, limits: { licensedOrganizations: 1, activeCompetitions: 3, annualParticipants: 2500, storageBytes: 1e9, branches: 3 }, features: {}, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }],
      operators: [{ id: 'OP-1', name: 'Legacy Op', status: 'active', pricingTier: 'standard', whiteLabelLevel: 'mizan', createdAt: '2025-01-01T00:00:00.000Z' }],
      organizations: [{ id: 'ORG-1', tenantId: 'TEN-1', licenseId: 'LIC-1', officialName: 'Legacy Org', shortName: 'LO', organizationType: 'charity', country: 'KW', operatorId: 'OP-1', operational: {}, status: 'active', createdAt: '2025-03-01T00:00:00.000Z', updatedAt: '2025-03-01T00:00:00.000Z' }],
      licenses: [{ id: 'LIC-1', organizationId: 'ORG-1', planId: 'PLAN-000001', startsAt: '2025-03-01T00:00:00.000Z', expiresAt: '2026-03-01T00:00:00.000Z', status: 'active', whiteLabelEnabled: false, brandingLevel: 'mizan', customDomainEnabled: false, createdAt: '2025-03-01T00:00:00.000Z', updatedAt: '2025-03-01T00:00:00.000Z' }],
      creditLedger: [{ id: 'CR-1', operatorId: 'OP-1', kind: 'purchase', quantity: 5, balanceAfter: 5, reason: 'bootstrap', createdAt: '2025-01-01T00:00:00.000Z', actorId: 'x' }, { id: 'CR-2', operatorId: 'OP-1', kind: 'consume', quantity: -1, balanceAfter: 4, reason: 'Organization ORG-1', createdAt: '2025-03-01T00:00:00.000Z', actorId: 'x' }],
      participantUsage: [
        { id: 'PU-1', tenantId: 'TEN-1', organizationId: 'ORG-1', competitionId: 'C', participantId: 'p1', year: 2025, createdAt: '2025-06-01T00:00:00.000Z' },
        { id: 'PU-2', tenantId: 'TEN-1', organizationId: 'ORG-1', competitionId: 'C', participantId: 'p2', year: 2026, createdAt: '2026-01-15T00:00:00.000Z' },
        { id: 'PU-3', tenantId: 'TEN-1', organizationId: 'ORG-1', competitionId: 'C', participantId: 'p3', year: 2024, createdAt: '2024-11-01T00:00:00.000Z' },
        { id: 'PU-4', tenantId: 'TEN-1', organizationId: 'ORG-1', competitionId: 'C', participantId: 'p4', year: 2026, createdAt: '2026-05-01T00:00:00.000Z' },
      ],
      competitions: [], storageObjects: [], storageAccounts: [], storageMigrations: [], changeRequests: [], audit: [], subscriptions: [], invoices: [],
    };
    fs.writeFileSync(file, JSON.stringify(legacy));
    const repo = new SaaSPlatformRepository(file, undefined, undefined, () => day('2026-09-27T00:00:00Z'));
    const report = repo.platformCommercialReport(owner).migrationReports[0];
    assert.equal(report.usageRowsBefore, 4);
    assert.equal(report.usageRowsAfter, 4);
    assert.equal(report.termsCreatedFromLicenses, 1);
    assert.equal(report.usageRowsLinked, 2, 'rows inside the licence period link to the real term');
    assert.equal(report.usageRowsLinkedToLegacyTerms, 2, 'rows outside it go to explicit legacy terms');
    assert.deepEqual(report.legacyCreditOperators, [{ operatorId: 'OP-1', operatorName: 'Legacy Op', legacyCreditBalance: 4 }]);
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(state.participantUsage.length, 4);
    for (const row of legacy.participantUsage) {
      const now = state.participantUsage.find((r: any) => r.id === row.id);
      assert.equal(now.createdAt, row.createdAt); assert.equal(now.year, row.year); assert.ok(now.subscriptionTermId);
    }
    assert.equal(state.creditLedger.length, 2, 'legacy credit ledger retained untouched');
    assert.equal(state.operatorWallets.length, 0, 'credits are not silently converted into money');
    const legacyTerms = state.subscriptionTerms.filter((t: any) => t.legacy);
    assert.deepEqual(legacyTerms.map((t: any) => t.legacyYear).sort(), [2024, 2026]);
    // مرّة واحدة فقط.
    new SaaSPlatformRepository(file, undefined, undefined, () => day('2026-09-28T00:00:00Z'));
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).migrationReports.length, 1);
    assert.equal(repo.verifyAudit().valid, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ————————————————— webhooks ————————————————— */

test('§69 webhooks are HMAC-signed, retried with backoff, and logged', async () => {
  const h = harness('2026-09-27T10:00:00Z');
  try {
    const c = directCustomer(h, 'mizan-150', '2026-09-27T00:00:00.000Z');
    assert.throws(() => h.repo.createWebhookEndpoint(c.admin, c.org.id, { url: 'http://insecure.example/x', events: ['subscription.renewed'] }), /HTTPS/);
    assert.throws(() => h.repo.createWebhookEndpoint(c.admin, c.org.id, { url: 'https://169.254.169.254/x', events: ['subscription.renewed'] }), /PRIVATE_NETWORK/);
    const { signingSecret } = h.repo.createWebhookEndpoint(c.admin, c.org.id, { url: 'https://hooks.example.com/mizan', events: ['subscription.renewed'] });
    h.repo.adminRenewTerm(owner, c.org.id, { reason: 'contract paid offline' });
    const seen: { body: string; sig: string }[] = [];
    let fail = true;
    const send = async (_url: string, init: any) => { seen.push({ body: init.body, sig: init.headers['x-mizan-signature'] }); return { status: fail ? 500 : 200 }; };
    assert.deepEqual(await h.repo.dispatchWebhooks(send), { attempted: 1, delivered: 0 });
    assert.deepEqual(await h.repo.dispatchWebhooks(send), { attempted: 0, delivered: 0 }, 'not retried before its backoff');
    h.clock.now += backoffMs(1);
    fail = false;
    assert.deepEqual(await h.repo.dispatchWebhooks(send), { attempted: 1, delivered: 1 });
    const { body, sig } = seen[1];
    assert.equal(verifyWebhookSignature(signingSecret, sig, body, Math.floor(h.clock.now / 1000)), true);
    assert.equal(verifyWebhookSignature('wrong', sig, body, Math.floor(h.clock.now / 1000)), false);
    assert.equal(JSON.parse(body).type, 'subscription.renewed');
    const log = h.repo.listWebhooks(c.admin, c.org.id);
    assert.equal(log.deliveries[0].status, 'delivered');
    assert.equal(log.deliveries[0].attempts, 2);
    assert.ok(!JSON.stringify(log).includes(signingSecret), 'the secret is never listed');
    assert.match(signWebhook('s', 1, 'b'), /^t=1,v1=[0-9a-f]{64}$/);
  } finally { h.cleanup(); }
});
