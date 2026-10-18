import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';

/*
 * مدير الوفد يرى ويكتب متسابقي وفده وحدهم. كانت القاعدة تعطيه كل متسابقي المسابقة (هواتف وبريد وهويّات قاصرين من
 * وفودٍ أخرى) وتتيح له تعديل حالة أيٍّ منهم. الوفد: `delegation-<uid>` (src/lib/delegation-scope.ts).
 * يُشغَّل على المحاكي: npm run qa:firestore-rules
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const ORG = 'org-deleg', COMP = 'comp-deleg';
const base = `organizations/${ORG}/competitions/${COMP}`;
let env: RulesTestEnvironment | null = null;
const as = (role: string, uid: string) => env!.authenticatedContext(uid, { role, org_id: ORG, competition_id: COMP }).firestore() as unknown as Firestore;
const asGod = (fn: (db: Firestore) => Promise<unknown>) => env!.withSecurityRulesDisabled(c => fn(c.firestore() as unknown as Firestore) as Promise<void>);
const participant = (id: string, delegationId: string, extra: Record<string, unknown> = {}) => ({ id, organizationId: ORG, competitionId: COMP, fullName: id, status: 'submitted', statusHistory: [], delegationId, ...extra });

test('firestore rules: عزل الوفود', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({ projectId: 'mizan-rules-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) } });
  t.after(async () => { await env?.cleanup(); });
  await asGod(async db => {
    await setDoc(doc(db, base), { organizationId: ORG, competition: { id: COMP, organizationId: ORG, status: 'registration_open' } });
    await setDoc(doc(db, `${base}/participants/a1`), participant('a1', 'delegation-uidA'));
    await setDoc(doc(db, `${base}/participants/b1`), participant('b1', 'delegation-uidB'));
    await setDoc(doc(db, `${base}/participants/none`), { id: 'none', organizationId: ORG, competitionId: COMP, status: 'submitted', statusHistory: [] });
  });

  await t.test('يقرأ متسابق وفده ولا يقرأ متسابق وفدٍ آخر ولا متسابقًا بلا وفد', async () => {
    const a = as('delegation_manager', 'uidA');
    await assertSucceeds(getDoc(doc(a, `${base}/participants/a1`)));
    await assertFails(getDoc(doc(a, `${base}/participants/b1`)));
    await assertFails(getDoc(doc(a, `${base}/participants/none`)));
  });

  await t.test('القائمة تُقبل مقيَّدةً بوفده وتُرفض مفتوحة', async () => {
    const a = as('delegation_manager', 'uidA');
    const mine = await assertSucceeds(getDocs(query(collection(a, `${base}/participants`), where('delegationId', '==', 'delegation-uidA'))));
    assert.ok(mine.docs.length >= 1 && mine.docs.every(d => (d.data() as { delegationId: string }).delegationId === 'delegation-uidA'), 'only its own delegation comes back');
    assert.ok(mine.docs.some(d => d.id === 'a1'));
    await assertFails(getDocs(collection(a, `${base}/participants`)));
    await assertFails(getDocs(query(collection(a, `${base}/participants`), where('delegationId', '==', 'delegation-uidB'))));
  });

  await t.test('يسجّل لوفده فقط ولا ينقل متسابقًا إلى وفدٍ آخر ولا يعدّل متسابق غيره', async () => {
    const a = as('delegation_manager', 'uidA');
    await assertSucceeds(setDoc(doc(a, `${base}/participants/a2`), participant('a2', 'delegation-uidA')));
    await assertFails(setDoc(doc(a, `${base}/participants/a3`), participant('a3', 'delegation-uidB')));
    await assertFails(setDoc(doc(a, `${base}/participants/a4`), participant('a4', '')));
    await assertSucceeds(updateDoc(doc(a, `${base}/participants/a1`), { fullName: 'محدَّث' }));
    await assertFails(updateDoc(doc(a, `${base}/participants/a1`), { delegationId: 'delegation-uidB' }));
    await assertFails(updateDoc(doc(a, `${base}/participants/b1`), { status: 'approved' }));
  });

  await t.test('المشغِّلون الآخرون يقرؤون الجميع كما كانوا', async () => {
    for (const role of ['exception_host', 'ops_manager', 'comp_admin', 'head_judge', 'auditor', 'org_admin']) {
      await assertSucceeds(getDocs(collection(as(role, `uid-${role}`), `${base}/participants`)));
    }
    await assertSucceeds(setDoc(doc(as('exception_host', 'uidE'), `${base}/participants/e1`), participant('e1', 'delegation-uidA')));
    await assertFails(getDocs(collection(as('participant', 'uidP'), `${base}/participants`)));
  });
});
