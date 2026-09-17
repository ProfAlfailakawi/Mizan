/*
 * P18 / §31 — سجلُّ التدقيق على تخزينٍ مشترك.
 *
 * السجلُّ كان ملفَّ JSONL بجوار العملية. وهذا يعمل على خادمٍ واحد، وينكسر **بصمت** على
 * أكثر: نسختان خلف موازِن حِمل لا تريان ملفَّ بعضهما، فتبدأ كلٌّ منهما من `GENESIS`،
 * وتكتبان التسلسل ١ مرّتين. والنتيجةُ سجلّان متوازيان لمسابقةٍ واحدة — كلٌّ منهما سليمٌ
 * في نفسه، ومجموعُهما لا يُحتجّ به. ويظهر ذلك حين يُحتاج إليه بالضبط: عند النزاع.
 *
 * فهذه الاختبارات تُشغَّل على محاكي Firestore الحقيقي، وتتعمّد السباق: نسختان من الخادم
 * تكتبان معًا، والمطلوب سلسلةٌ **واحدة** متّصلة لا سلسلتان.
 *
 * التشغيل: npm run qa:firestore-rules
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { FirestoreRestRepository } from '../server/firestore-rest';
import { FirestoreAuditStore } from '../server/firestore-audit-store';
import { DurableAuditLedger } from '../server/durable-audit-ledger';
import { MemoryAuditStore, verifyChain } from '../server/audit-ledger-store';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'mizan-rules-test';

const actor = (over: Partial<{ uid: string; role: string; organizationId: string; competitionId: string }> = {}) =>
  ({ uid: 'uid-head-judge', role: 'head_judge', organizationId: 'org-audit', competitionId: 'comp-audit', ...over });

const event = (n: number, over: Record<string, unknown> = {}) => ({
  eventId: `evt-${n}`,
  organizationId: 'org-audit',
  competitionId: 'comp-audit',
  action: 'RESULT_SEALED',
  entityType: 'Result',
  entityId: `p-${n}`,
  reason: `sealed ${n}`,
  ...over,
});

/** المحاكي لا يطلب اعتمادًا، فالرمز أيُّ شيء غير فارغ. */
const emulatorBackend = () => new FirestoreRestRepository(PROJECT, '(default)', async () => 'owner');

test('firestore rules: سجلّ تدقيقٍ دائم ومشترك', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  /* فضاءٌ خاصّ لكل تشغيل: الملفات تتشارك محاكيًا واحدًا ولا يمسح أحدها ما كتبه الآخر. */
  const root = `server_audit_${crypto.randomUUID().slice(0, 8)}`;
  const store = () => new FirestoreAuditStore(emulatorBackend(), root);

  await t.test('المهايئ يعلن أنه تخزينٌ مشترك دائم، بخلاف القرص المحلّي', () => {
    assert.equal(store().durability, 'SHARED_DURABLE_STORE');
    assert.equal(new MemoryAuditStore().durability, 'LOCAL_DISK_DEVELOPMENT_ADAPTER');
  });

  await t.test('السلسلة تُبنى متّصلةً ويثبت التحقّق صحّتها', async () => {
    const ledger = new DurableAuditLedger(store());
    for (let n = 1; n <= 5; n += 1) {
      const outcome = await ledger.append(actor(), event(n));
      assert.equal(outcome.idempotent, false);
      assert.equal(outcome.row.sequence, n);
    }
    const verification = await ledger.verify('org-audit', 'comp-audit');
    assert.equal(verification.valid, true, `chain broke at ${verification.failedSequence}`);
    assert.equal(verification.count, 5);
  });

  await t.test('حدثٌ بنفس المعرّف لا يُكتب مرّتين ولو أُعيد الطلب', async () => {
    const ledger = new DurableAuditLedger(store());
    const first = await ledger.append(actor(), event(1));
    const again = await ledger.append(actor(), event(1));
    assert.equal(again.idempotent, true);
    assert.equal(again.row.sequence, first.row.sequence);
    assert.equal(again.row.hash, first.row.hash);
    assert.equal((await ledger.verify('org-audit', 'comp-audit')).count, 5, 'no row was added');
  });

  await t.test('نسختان تكتبان معًا فتخرج سلسلةٌ واحدة لا سلسلتان', async () => {
    /*
     * هذا هو الاختبار الذي يسقط على القرص المحلّي. نسختان مستقلّتان تمامًا — كلٌّ
     * بمهايئها واتصالها — تكتبان عشرين حدثًا متزامنًا. والمطلوب: تسلسلٌ متّصل بلا
     * تكرارٍ ولا فجوة، وهاشٌ يصمد من أوّله إلى آخره.
     */
    const instanceA = new DurableAuditLedger(store());
    const instanceB = new DurableAuditLedger(store());
    const before = (await instanceA.verify('org-audit', 'comp-audit')).count;

    const writes = Array.from({ length: 20 }, (_, i) => {
      const ledger = i % 2 === 0 ? instanceA : instanceB;
      return ledger.append(actor({ uid: i % 2 === 0 ? 'uid-a' : 'uid-b' }), event(100 + i));
    });
    const outcomes = await Promise.all(writes);

    const sequences = outcomes.map(o => o.row.sequence).sort((a, b) => a - b);
    assert.equal(new Set(sequences).size, sequences.length, 'two instances must never win the same sequence');

    const rows = await store().rows('org-audit', 'comp-audit');
    assert.equal(rows.length, before + 20, 'every write landed exactly once');
    assert.deepEqual(rows.map(r => r.sequence), rows.map((_, i) => i + 1), 'the chain has no gap and no repeat');

    const verification = verifyChain(rows, 'org-audit', 'comp-audit');
    assert.equal(verification.valid, true, `chain broke at ${verification.failedSequence}`);

    // وخسارةُ السباق وقعت فعلًا — وإلا لم يُختبر شيء.
    assert.ok(outcomes.some(o => o.attempts > 1), 'the race must actually have happened for this test to prove anything');
  });

  await t.test('كلُّ نسخةٍ ترى ما كتبته الأخرى فورًا — وهو ما يعجز عنه القرص المحلّي', async () => {
    const instanceA = new DurableAuditLedger(store());
    const instanceB = new DurableAuditLedger(store());
    const written = await instanceA.append(actor(), event(900));
    const seen = await instanceB.list(actor(), 'comp-audit', 50);
    assert.ok(seen.some(row => row.eventId === written.row.eventId), 'a second instance reads the first instance write');
  });

  await t.test('مستأجرٌ لا يكتب في سلسلة غيره، ولا يقرؤها', async () => {
    const ledger = new DurableAuditLedger(store());
    await assert.rejects(
      () => ledger.append(actor({ organizationId: 'org-other' }), event(1)),
      /AUDIT_TENANT_MISMATCH/,
      'an actor may not write a row stamped with another tenant',
    );
    await assert.rejects(
      () => ledger.append(actor(), event(1, { competitionId: 'comp-other' })),
      /AUDIT_COMPETITION_MISMATCH/,
    );
    await assert.rejects(() => ledger.list(actor(), 'comp-other'), /AUDIT_COMPETITION_MISMATCH/);
    // وسلسلةُ مستأجرٍ آخر تبدأ من الصفر، لا تُرى ولا تُخلط.
    const otherTenant = await new DurableAuditLedger(store())
      .verify('org-elsewhere', 'comp-audit');
    assert.equal(otherTenant.count, 0);
  });

  await t.test('حدثٌ ناقص يُردّ قبل أن يمسّ السلسلة', async () => {
    const ledger = new DurableAuditLedger(store());
    const before = (await ledger.verify('org-audit', 'comp-audit')).count;
    for (const missing of ['eventId', 'competitionId', 'action', 'entityType', 'entityId']) {
      await assert.rejects(
        () => ledger.append(actor(), { ...event(777), [missing]: '' } as never),
        /AUDIT_EVENT_INVALID/,
        missing,
      );
    }
    assert.equal((await ledger.verify('org-audit', 'comp-audit')).count, before, 'a refused event leaves no trace');
  });

  await t.test('صفٌّ عُبث به يُكشف بالتحقّق، ولا يُقبل صامتًا', async () => {
    const rows = await store().rows('org-audit', 'comp-audit');
    assert.ok(rows.length >= 3);
    const tampered = rows.map((row, index) => (index === 1 ? { ...row, entityId: 'p-tampered' } : row));
    const verification = verifyChain(tampered, 'org-audit', 'comp-audit');
    assert.equal(verification.valid, false);
    assert.equal(verification.failedSequence, 2, 'verification names the row that no longer matches its hash');
  });
});
