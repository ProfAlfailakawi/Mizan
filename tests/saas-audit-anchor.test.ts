import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SaaSPlatformRepository } from '../server/saas-platform';

/*
 * قطعُ ذيل السجل كان الحدَّ المعروف: سلسلةُ التلبيد تكشف تغييرَ سطرٍ وحذفَه من الوسط
 * وقلبَ الرتبة، ولا تكشف حذفَ الأخيرة — لأن البادئةَ سلسلةٌ صحيحةٌ أقصر. ومن قطع
 * الذيلَ محا آخرَ ما جرى: إيقافًا، أو كسرَ زجاج، أو سدادَ فاتورة.
 *
 * فيلزمها شاهدٌ من خارج السلسلة يقول «كان الطولُ كذا وتلبيدُه كذا». وهذا ما تفعله
 * المرساة. ويُفصَل مستوَيا الحماية بصدق:
 *
 *  - **المرساةُ المجاورة** (ملفٌّ إلى جانب الحالة): تكشف القطعَ وتُرفع الكلفة، ولا
 *    تعصم من عبثٍ يملك الكتابةَ على القرص — فيُحرّر الملفَّين معًا.
 *  - **المرساةُ الممرَّرة** (`auditAnchor()` محفوظةً خارج المضيف): هي الحرزُ الحقيقي،
 *    فلا يبلغها مَن يملك القرصَ وحده. ولذلك تُقدَّم على المجاورة.
 *
 * ولا يُدَّعى ما لا يقع: `anchored` يُعلَن في كل نتيجة، فسجلٌّ بلا مرساةٍ تُفحَص
 * سلسلتُه ولا يُقال إن قطعَه مكشوف.
 */

const owner = { uid: 'owner', role: 'super_admin', organizationId: '__platform__' };
const dates = { startsAt: '2026-01-01', expiresAt: '2027-01-01' };

const withLedger = (run: (ctx: {
  repo: SaaSPlatformRepository; file: string; anchorFile: string;
  truncate: (keep: number) => void; reopen: () => SaaSPlatformRepository;
}) => void) => () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-anchor-'));
  const file = path.join(dir, 'state.json');
  try {
    const repo = new SaaSPlatformRepository(file);
    const plan = repo.seedInitialPlan(owner);
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      repo.createOrganization(owner, {
        officialName: name, shortName: name, organizationType: 'charity',
        country: 'KW', planId: plan.id, ...dates,
      });
    }
    run({
      repo, file, anchorFile: `${file}.audit-anchor.json`,
      truncate: (keep: number) => {
        const state = JSON.parse(fs.readFileSync(file, 'utf8'));
        state.audit = state.audit.slice(0, keep);
        fs.writeFileSync(file, JSON.stringify(state, null, 2));
      },
      reopen: () => new SaaSPlatformRepository(file),
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test('a healthy ledger verifies and reports that it is anchored', withLedger(({ repo, anchorFile }) => {
  assert.ok(fs.existsSync(anchorFile), 'the anchor is written alongside the state');
  const result = repo.verifyAudit();
  assert.equal(result.valid, true);
  assert.equal((result as { anchored: boolean }).anchored, true, 'the guarantee is declared, not assumed');
}));

test('truncating the tail is now detected — the documented limit is closed', withLedger(({ truncate, reopen }) => {
  truncate(1);
  const result = reopen().verifyAudit();
  assert.equal(result.valid, false, 'a shorter valid prefix must no longer pass');
  assert.equal((result as { code: string }).code, 'AUDIT_LEDGER_TRUNCATED');
  assert.equal((result as { rows: number }).rows, 1);
  assert.ok((result as { expectedRows: number }).expectedRows > 1, 'the anchor names the length that was expected');
}));

test('erasing the whole ledger is detected', withLedger(({ truncate, reopen }) => {
  // محوُ السجل كلِّه أسهلُ من قطع ذيله، وكان يمرّ بالحجّة نفسها.
  truncate(0);
  const result = reopen().verifyAudit();
  assert.equal(result.valid, false);
  assert.equal((result as { code: string }).code, 'AUDIT_LEDGER_TRUNCATED');
}));

test('an externally held anchor outranks the sidecar', withLedger(({ repo, file, truncate }) => {
  /*
   * جوهرُ الأمر: مَن قطع الذيلَ يستطيع تحرير المرساة المجاورة معه. فتُحفظ المرساةُ
   * خارج المضيف وتُمرَّر، فلا ينجو العبثُ ولو زُوِّرت المجاورة زُورًا متّسقًا.
   */
  const held = repo.auditAnchor();
  assert.ok(held.rows >= 3 && held.lastHash !== 'GENESIS', 'a real anchor was exported');

  truncate(1);
  // ويُزوَّر الجارُ ليطابق الحالة المقطوعة — فلو اعتُمد عليه وحده لمرّ القطع.
  const forgedSidecar = { rows: 1, lastHash: JSON.parse(fs.readFileSync(file, 'utf8')).audit[0].hash, updatedAt: new Date().toISOString() };
  fs.writeFileSync(`${file}.audit-anchor.json`, JSON.stringify(forgedSidecar));

  const reopened = new SaaSPlatformRepository(file);
  assert.equal(reopened.verifyAudit().valid, true,
    'the forged sidecar does pass — which is exactly why it is not the guarantee');

  const withHeld = reopened.verifyAudit(held);
  assert.equal(withHeld.valid, false, 'the externally held anchor still catches it');
  assert.equal((withHeld as { code: string }).code, 'AUDIT_LEDGER_TRUNCATED');
}));

test('a ledger with no anchor is verified but never claimed to be anchored', withLedger(({ file, anchorFile }) => {
  /* سجلٌّ من قبل هذه الإضافة: تُفحَص سلسلتُه، ولا يُدَّعى كشفُ القطع فيه. */
  fs.rmSync(anchorFile, { force: true });
  const result = new SaaSPlatformRepository(file).verifyAudit();
  assert.equal(result.valid, true, 'the chain itself is still sound');
  assert.equal((result as { anchored: boolean }).anchored, false,
    'no anchor means no truncation guarantee, and the result must say so');
}));

test('a rewritten last row is caught by the anchor hash, not only by the chain', withLedger(({ file, repo }) => {
  const held = repo.auditAnchor();
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  // يُستبدَل السطرُ الأخير بآخرَ متّسقٍ مع سلفه تمامًا — فالسلسلةُ سليمة، والمرساةُ تكشفه.
  state.audit = state.audit.slice(0, -1);
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  const result = new SaaSPlatformRepository(file).verifyAudit(held);
  assert.equal(result.valid, false, 'the held anchor catches a silently shortened ledger');
}));
