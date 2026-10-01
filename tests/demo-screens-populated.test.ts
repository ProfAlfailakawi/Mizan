import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDemoUniverse } from '../src/data/demo-universe';
import { demoIdentityGovernance } from '../src/data/demo-extras';
import { demoCommercialResponse } from '../src/data/demo-commercial';

/*
 * كل دورٍ في شريط العرض يفتح على بيانات لا على «لا يوجد بعد».
 * هذه القوائم هي ما تقرؤه شاشات المحكّم ورئيس اللجنة والمدقّق وفريق الجهة وغرفة القيادة.
 */
const ORG = 'org-demo-mizan';
const COMPETITION = 'comp-dubai-2027';
const u = buildDemoUniverse();

test('demo: judge, head judge and ops lists are populated', () => {
  for (const [name, list] of Object.entries({ committees: u.committees, judges: u.judges, participants: u.participants, results: u.results, judgeSubmissions: u.judgeSubmissions, appeals: u.appeals, incidents: u.incidents, reviewCases: u.reviewCases, certificates: u.certificates })) {
    assert.ok(list.length > 0, `${name} is empty`);
  }
  const committee = u.committees.find(c => c.status === 'ready') || u.committees[0];
  const judge = u.judges.find(j => j.userId === committee.judgeIds[0]);
  assert.ok(judge, 'demo judge identity resolves to a judge record');
  assert.ok(u.participants.some(p => p.assignedCommitteeId === committee.id && p.status === 'in_queue'), 'judge has a queue');
});

test('demo: audit log rows describe their own participant, in the demo organization', () => {
  const summaries = new Set(u.auditLogs.map(e => e.humanSummaryArabic));
  assert.ok(summaries.size > 100, 'audit summaries are not a single repeated line');
  assert.ok(u.auditLogs.every(e => e.organizationId === ORG && e.competitionId === COMPETITION));
  assert.ok(u.auditLogs[0].timestamp > u.auditLogs[u.auditLogs.length - 1].timestamp, 'newest first');
});

test('demo: identity governance feeds team, auditor and session screens', () => {
  const g = demoIdentityGovernance(ORG, COMPETITION, u.judges, u.committees, u.participants);
  assert.ok(g.identityAccounts.filter(a => a.status === 'ACTIVE' && a.organizationId === ORG).length >= u.judges.length);
  assert.equal(g.roleGrants.length, g.identityAccounts.length);
  assert.ok(g.authSessions.some(s => s.status === 'ACTIVE'));
  assert.ok(g.identityInvitations.length > 0 && g.passReissues.length > 0 && g.continuityIncidents.length > 0);
  assert.ok(g.continuityIncidents.every(i => i.status === 'RESOLVED'), 'no alarm panel injected on admin screens');
});

test('demo: platform owner control tower has a payload', () => {
  const tower = demoCommercialResponse('/api/owner/control-tower') as { platform: { scoreAvailable: boolean }; needsAttention: unknown[] };
  assert.ok(tower.platform.scoreAvailable);
  assert.ok(tower.needsAttention.length > 0);
});

test('demo: commercial panels (subscription, operator, platform, brand, SSO, gateways) have payloads', () => {
  const billing = demoCommercialResponse('/api/saas/organization/billing') as { usage: { participantAllowance: number; participantsRemaining: number }; limits: { effective: Record<string, number> }; catalog: unknown[]; history: unknown[] };
  assert.ok(billing.usage.participantAllowance > 0 && billing.usage.participantsRemaining > 0);
  assert.ok(billing.limits.effective.participantAllowance > 0 && billing.catalog.length > 0 && billing.history.length > 0);

  const op = demoCommercialResponse('/api/saas/operator/commercial') as { customers: unknown[]; ledger: { balanceAfterMinor: number }[]; pricing: unknown[]; summary: { balanceMinor: number }; agreement: { operatorId: string } };
  assert.ok(op.customers.length >= 4 && op.pricing.length > 0 && op.ledger.length >= 8);
  assert.equal(op.ledger[0].balanceAfterMinor, op.summary.balanceMinor, 'wallet balance equals the newest ledger balance');

  const owner = demoCommercialResponse('/api/saas/owner/commercial') as { plans: unknown[]; tiers: unknown[]; report: { agreements: unknown[]; operators: unknown[] } };
  assert.ok(owner.plans.length > 0 && owner.tiers.length > 0 && owner.report.agreements.length > 0 && owner.report.operators.length > 0);

  assert.ok((demoCommercialResponse('/api/saas/brand/organization/org-demo-mizan') as { domains: unknown[] }).domains.length > 0);
  assert.ok((demoCommercialResponse('/api/saas/organization/discover') as { listings: unknown[] }).listings.length > 0);
  assert.ok((demoCommercialResponse('/api/saas/organization/sso') as { config: { roleMapping: unknown[] } }).config.roleMapping.length > 0);
  assert.ok((demoCommercialResponse('/api/saas/payment-gateways/organization/org-demo-mizan') as { gateways: unknown[] }).gateways.length > 0);
  assert.ok((demoCommercialResponse('/api/saas/payment-gateways/presets') as { presets: unknown[] }).presets.length > 0);
  assert.equal(typeof demoCommercialResponse('/api/saas/owner/wallet/ledger?format=csv'), 'string');

  const dash = demoCommercialResponse('/api/saas/owner/dashboard') as { billing: { invoices: { number: string; daysOverdue: number }[] } };
  assert.ok(dash.billing.invoices.every(i => i.number && Number.isFinite(i.daysOverdue)), 'invoice rows never render undefined');
});

test('demo: operator team and inbox are populated', async () => {
  const g = demoIdentityGovernance(ORG, COMPETITION, u.judges, u.committees, u.participants);
  assert.ok(g.identityAccounts.filter(a => a.organizationId === '__operator__:OP-DEMO-1').length >= 3);
  const { demoInbox } = await import('../src/data/demo-inbox');
  for (const role of ['judge', 'head_judge', 'comp_admin', 'participant', 'ops_manager', 'auditor', 'org_admin']) {
    const inbox = demoInbox(role, COMPETITION, 'مسابقة تجريبية', ORG);
    assert.ok(inbox.notifications.length >= 5 && inbox.unread > 0, `${role} inbox`);
  }
});

test('demo: public Discover directory lists open and closed competitions', async () => {
  const { demoDiscoverDirectory } = await import('../src/data/demo-commercial');
  const all = demoDiscoverDirectory();
  assert.ok(all.listings.length >= 3 && all.listings.some(l => !l.registrationOpen));
  assert.ok(demoDiscoverDirectory('', true).listings.every(l => l.registrationOpen));
  assert.equal(demoDiscoverDirectory('دبي').listings.length, 1);
});
