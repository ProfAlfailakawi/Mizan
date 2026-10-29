import test from 'node:test';
import fs from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';

/*
 * المتسابق يكتب ما يخصّه فقط.
 *
 * كانت قاعدةُ تحديث الاعتراض تكتفي بأن الوثيقة وثيقتُه، فيكتب المتسابق فيها `status:'accepted'`
 * و`resolvedBy` و`scoreAdjustmentDelta`. وكانت قاعدةُ نطاقه تكتفي بأن حالته الحالية قابلة
 * للتعديل، فيكتب فيها `status:'approved'` أو `'locked'` بنفسه. فتُقصر كتابتُه هنا على حقوله.
 *
 * التشغيل: npm run qa:firestore-rules
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const ORG = 'org-pw', COMP = 'comp-pw';
const UID = 'uid-participant';
const appealPath = (id: string) => `organizations/${ORG}/competitions/${COMP}/appeals/${id}`;
const scopePath = (id: string) => `organizations/${ORG}/competitions/${COMP}/participant_scopes/${id}`;

let env: RulesTestEnvironment | null = null;
const ctx = (role: string, uid: string) =>
  env!.authenticatedContext(uid, { role, org_id: ORG, competition_id: COMP }).firestore() as unknown as Firestore;
const asGod = (fn: (db: Firestore) => Promise<unknown>) =>
  env!.withSecurityRulesDisabled(c => fn(c.firestore() as unknown as Firestore) as Promise<void>);

const appeal = (over: Record<string, unknown> = {}) => ({
  id: 'a', organizationId: ORG, competitionId: COMP, participantId: 'p-1', participantCode: 'P1', categoryName: 'Gold',
  grounds: 'scoring_miscalculation', reasonText: 'سبب', status: 'submitted', createdAt: '2026-05-01T08:00:00.000Z',
  uploaderUid: UID, updatedAt: '2026-05-01T08:00:00.000Z', ...over,
});
const scopeRecord = (status: string, over: Record<string, unknown> = {}) => ({
  id: 's', organizationId: ORG, competitionId: COMP, categoryId: 'cat-1', participantId: 'p-1', version: 1, status,
  scopeSignature: 'QS1:abc:100', selectionRuleVersion: 1, uploaderUid: UID,
  createdAt: '2026-05-01T08:00:00.000Z', updatedAt: '2026-05-01T08:00:00.000Z',
  scope: { version: 1, segments: [{ start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 5 } }] },
  selection: { version: 1, segments: [{ start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 5 } }] },
  ...over,
});

test('firestore rules: participant writes are limited to their own fields', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({
    projectId: 'mizan-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) },
  });
  t.after(async () => { await env?.cleanup(); });
  await asGod(db => setDoc(doc(db, `organizations/${ORG}/competitions/${COMP}`), { competition: { id: COMP, status: 'active' } }));

  /* ── الاعتراضات ── */
  await t.test('appeal: a participant cannot decide their own appeal or adjust their score', async () => {
    const p = ctx('participant', UID);
    for (const [id, patch] of [
      ['a-status', { status: 'accepted' }],
      ['a-resolver', { resolvedBy: 'usr-head', resolvedAt: '2026-05-02T08:00:00.000Z' }],
      ['a-delta', { scoreAdjustmentDelta: 5 }],
      ['a-notes', { resolutionNotes: 'قُبل' }],
    ] as const) {
      await asGod(db => setDoc(doc(db, appealPath(id)), appeal({ id })));
      await assertFails(updateDoc(doc(p, appealPath(id)), { ...patch, uploaderUid: UID }));
    }
    // ولا الوليّ ولا وكيلُ الدعم صاحبُ الوثيقة.
    for (const role of ['guardian', 'support_agent']) {
      await asGod(db => setDoc(doc(db, appealPath(`a-${role}`)), appeal({ id: `a-${role}` })));
      await assertFails(updateDoc(doc(ctx(role, UID), appealPath(`a-${role}`)), { status: 'accepted', uploaderUid: UID }));
    }
  });

  await t.test('appeal: a participant cannot file an appeal that is already decided', async () => {
    const p = ctx('participant', UID);
    await assertFails(setDoc(doc(p, appealPath('a-new-accepted')), appeal({ id: 'a-new-accepted', status: 'accepted' })));
    await assertFails(setDoc(doc(p, appealPath('a-new-delta')), appeal({ id: 'a-new-delta', scoreAdjustmentDelta: 3 })));
    await assertSucceeds(setDoc(doc(p, appealPath('a-new-ok')), appeal({ id: 'a-new-ok' })));
  });

  await t.test('appeal: the legitimate participant flows still work (re-sync, editing the filing)', async () => {
    await asGod(db => setDoc(doc(db, appealPath('a-sync')), appeal({ id: 'a-sync' })));
    const p = ctx('participant', UID);
    // إعادة المزامنة: الوثيقة نفسها مع ختم وقتٍ جديد.
    await assertSucceeds(setDoc(doc(p, appealPath('a-sync')), appeal({ id: 'a-sync', updatedAt: '2026-05-01T09:00:00.000Z' }), { merge: true }));
    await assertSucceeds(updateDoc(doc(p, appealPath('a-sync')), { reasonText: 'سببٌ أوضح', uploaderUid: UID }));
    // وإعادةُ مزامنة اعتراضٍ قرّرته الإدارة، بما قرّرته، تمرّ: لم يتغيّر شيءٌ من قرارها.
    await asGod(db => setDoc(doc(db, appealPath('a-decided')), appeal({ id: 'a-decided', status: 'accepted', resolvedBy: 'usr-head', scoreAdjustmentDelta: 2 })));
    await assertSucceeds(setDoc(doc(p, appealPath('a-decided')), appeal({ id: 'a-decided', status: 'accepted', resolvedBy: 'usr-head', scoreAdjustmentDelta: 2, updatedAt: 'later' }), { merge: true }));
  });

  await t.test('appeal: the administration still decides', async () => {
    await asGod(db => setDoc(doc(db, appealPath('a-admin')), appeal({ id: 'a-admin' })));
    await assertSucceeds(updateDoc(doc(ctx('head_judge', 'uid-head'), appealPath('a-admin')), {
      status: 'accepted', resolvedBy: 'usr-head', resolvedAt: '2026-05-02T08:00:00.000Z', scoreAdjustmentDelta: 1,
    }));
  });

  /* ── نطاق المتسابق ── */
  await t.test('scope: a participant cannot approve, lock or review their own range', async () => {
    const p = ctx('participant', UID);
    for (const from of ['draft', 'submitted', 'rejected']) {
      for (const to of ['approved', 'locked', 'under_review', 'superseded']) {
        const id = `s-${from}-${to}`;
        await asGod(db => setDoc(doc(db, scopePath(id)), scopeRecord(from, { id })));
        await assertFails(updateDoc(doc(p, scopePath(id)), { status: to, uploaderUid: UID }));
      }
    }
    for (const [id, patch] of [
      ['s-approvedBy', { approvedBy: 'usr-head', approvedAt: '2026-05-02T08:00:00.000Z' }],
      ['s-rejection', { rejectionReason: '' }],
      ['s-lockedAt', { lockedAt: '2026-05-02T08:00:00.000Z' }],
      ['s-version', { version: 9 }],
      ['s-participant', { participantId: 'p-other' }],
    ] as const) {
      await asGod(db => setDoc(doc(db, scopePath(id)), scopeRecord('submitted', { id, rejectionReason: 'x' })));
      await assertFails(updateDoc(doc(p, scopePath(id)), { ...patch, uploaderUid: UID }));
    }
  });

  await t.test('scope: the legitimate participant flows still work', async () => {
    const p = ctx('participant', UID);
    await asGod(db => setDoc(doc(db, scopePath('s-ok')), scopeRecord('draft', { id: 's-ok' })));
    // يقدّم مسودّته بنطاقٍ معدَّل.
    await assertSucceeds(updateDoc(doc(p, scopePath('s-ok')), {
      status: 'submitted', submittedAt: '2026-05-02T08:00:00.000Z', scopeSignature: 'QS1:def:120',
      selection: { version: 1, segments: [{ start: { surah: 1, ayah: 1 }, end: { surah: 3, ayah: 5 } }] }, uploaderUid: UID,
    }));
    // ويعيد مزامنة وثيقةٍ مرفوضة كما هي.
    await asGod(db => setDoc(doc(db, scopePath('s-rej')), scopeRecord('rejected', { id: 's-rej', rejectionReason: 'خارج المظلّة' })));
    await assertSucceeds(setDoc(doc(p, scopePath('s-rej')), scopeRecord('rejected', { id: 's-rej', rejectionReason: 'خارج المظلّة', updatedAt: 'later' }), { merge: true }));
    // ويعيد تقديمها.
    await assertSucceeds(updateDoc(doc(p, scopePath('s-rej')), { status: 'submitted', uploaderUid: UID }));
  });

  await t.test('scope: the administration still approves', async () => {
    await asGod(db => setDoc(doc(db, scopePath('s-admin')), scopeRecord('submitted', { id: 's-admin' })));
    await assertSucceeds(updateDoc(doc(ctx('comp_admin', 'uid-admin'), scopePath('s-admin')), { status: 'approved', approvedBy: 'usr-admin' }));
  });
});
