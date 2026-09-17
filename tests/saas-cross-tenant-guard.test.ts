import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SaaSPlatformRepository } from '../server/saas-platform';

/*
 * `orgScope` هو الحاجزُ الوحيد بين جهةٍ وبيانات جهةٍ أخرى في طبقة SaaS: عشر دوالٍ
 * تستدعيه أولَ سطر، ومنه ترتفع `CROSS_TENANT_ACCESS_BLOCKED`.
 *
 * وكان المحروس منها واحدة: `usage`. فلو سقط `this.orgScope(...)` من `reserveUpload`
 * أو `configureStorage` — سطرٌ واحد في دالةٍ من سطر — لبقيت الحزمة خضراء بكاملها،
 * ولقرأت جهةٌ مساحةَ جهةٍ أخرى أو كتبت في تخزينها. وحاجزُ قواعد Firestore لا يراه:
 * ذاك يحرس وصولَ المتصفّح المباشر، وهذا مسارٌ آخر يمرّ بالخادم.
 *
 * فيُحرَس المبدأ لا الدالة: كلُّ دالةٍ ذات نطاقٍ جهويّ تُنادى بمعرّف جهةٍ أجنبية
 * فتُرفض — ويُثبَّت الجردُ نفسه حتى لا تُضاف دالةٌ حادسة بلا حاجز ولا تُنزَع من القائمة.
 */

const owner = { uid: 'owner', role: 'super_admin', organizationId: '__platform__' };
const dates = { startsAt: '2026-01-01', expiresAt: '2027-01-01' };

const withTwoOrganizations = (
  run: (ctx: { repo: SaaSPlatformRepository; mine: string; theirs: string }) => void | Promise<void>,
) => async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-cross-tenant-'));
  try {
    const repo = new SaaSPlatformRepository(path.join(dir, 'state.json'));
    const plan = repo.seedInitialPlan(owner);
    const org = (name: string) =>
      repo.createOrganization(owner, {
        officialName: name, shortName: name, organizationType: 'charity',
        country: 'KW', planId: plan.id, ...dates,
      }).organization.id;
    await run({ repo, mine: org('Mine'), theirs: org('Theirs') });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/* كلُّ دالةٍ يحرسها `orgScope`، ونداءٌ بمعرّف الجهة الأجنبية. */
const foreignCalls: [string, (repo: SaaSPlatformRepository, actor: any, theirs: string) => unknown][] = [
  ['usage', (r, a, t) => r.usage(a, t)],
  ['updateOperational', (r, a, t) => r.updateOperational(a, t, { contactName: 'Someone' })],
  ['requestIdentityChange', (r, a, t) => r.requestIdentityChange(a, t, { field: 'officialName', requestedValue: 'New', reason: 'a valid reason' })],
  ['setCompetitionState', (r, a, t) => r.setCompetitionState(a, { organizationId: t, competitionId: 'c1', state: 'registration_open' })],
  ['recordParticipant', (r, a, t) => r.recordParticipant(a, { organizationId: t, competitionId: 'c1', participantId: 'p1' })],
  ['reserveUpload', (r, a, t) => r.reserveUpload(a, { organizationId: t, fileType: 'audio', mimeType: 'audio/mpeg', sizeBytes: 1024 })],
  ['finalizeUpload', (r, a, t) => r.finalizeUpload(a, 'FILE-1', { organizationId: t, checksum: 'abc' })],
  ['configureStorage', (r, a, t) => r.configureStorage(a, t, { provider: 'cloudflare_r2', container: 'bucket', secret: { k: 'v' } })],
  ['testStorage', (r, a, t) => r.testStorage(a, t, 'SA-1')],
  ['startMigration', (r, a, t) => r.startMigration(a, t, 'mizan')],
];

for (const [method, call] of foreignCalls) {
  test(`${method} refuses a foreign organization`, withTwoOrganizations(async ({ repo, mine, theirs }) => {
    const actor = { uid: 'admin-of-mine', role: 'org_admin', organizationId: mine };
    await assert.rejects(
      async () => await call(repo, actor, theirs),
      /CROSS_TENANT_ACCESS_BLOCKED/,
      `${method} must reject an organization the actor does not belong to`,
    );
    // وليس الرفضُ عمى: الدالة نفسها على جهة الفاعل لا تُرفض بهذا الرمز.
    try { await call(repo, actor, mine); } catch (err) {
      assert.doesNotMatch(String(err), /CROSS_TENANT_ACCESS_BLOCKED/,
        `${method} must not block the actor from its own organization`);
    }
  }));
}

test('the guarded method inventory has not shrunk', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'server/saas-platform.ts'), 'utf8');
  const guarded = new Set<string>();
  for (const line of source.split('\n')) {
    if (!line.includes('this.orgScope(')) continue;
    const name = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(line)?.[1];
    if (name) guarded.add(name);
  }
  const expected = foreignCalls.map(([name]) => name).sort();
  assert.deepEqual([...guarded].sort(), expected,
    'a method gained or lost its orgScope guard — add it to this test or restore the guard');
});
