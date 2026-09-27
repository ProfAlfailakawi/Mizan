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
