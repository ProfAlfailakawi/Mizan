import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, type Firestore } from 'firebase/firestore';

/*
 * قواعد Firestore تُختبر على المحاكي لا على الحيّ.
 *
 * الحاجزُ الأخير بين نطاق متسابقٍ وبين من لا حقّ له فيه ليس شيفرة الواجهة ولا المخزن: هو
 * `firestore.rules`. فالتسجيل العامّ يكتب مباشرةً، والمزامنة تكتب من كل جهاز، والقراءة تصل
 * من متصفحٍ لا نتحكم فيه. وكان هذا الحاجز بلا اختبارٍ واحد.
 *
 * والمحاكي هو الموضع الصحيح لهذا: يشغّل القواعد نفسها حرفًا بحرف، بلا اعتماد، وبلا أن تُكتب
 * حرفٌ واحد في قاعدة بيانات حيّة فيها بيانات متسابقين.
 *
 * التشغيل: npm run qa:firestore-rules
 * وحين لا يعمل المحاكي تُتخطّى هذه الفحوص بنصٍّ صريح — لا تمرّ صامتةً موهمةً أنها فحصت.
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const ORG = 'org-a', COMP = 'comp-a', OTHER_ORG = 'org-b', OTHER_COMP = 'comp-b';
const scopePath = (org = ORG, comp = COMP, id = 'pscope-1') =>
  `organizations/${org}/competitions/${comp}/participant_scopes/${id}`;

const scopeDoc = (uploaderUid: string, status = 'submitted') => ({
  id: 'pscope-1', organizationId: ORG, competitionId: COMP, categoryId: 'cat-1',
  participantId: 'part-1', version: 1, status, scopeSignature: 'QS1:abc:100',
  selectionRuleVersion: 1, uploaderUid, createdAt: '2026-05-01T08:00:00.000Z', updatedAt: '2026-05-01T08:00:00.000Z',
  scope: { version: 1, assurance: 'CANONICAL_TABLE', segments: [{ start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 5 } }] },
  selection: { version: 1, assurance: 'CANONICAL_TABLE', segments: [{ start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 5 } }] },
});

let env: RulesTestEnvironment | null = null;

const ctx = (role: string, uid: string, org = ORG, comp = COMP) =>
  env!.authenticatedContext(uid, { role, org_id: org, competition_id: comp }).firestore() as unknown as Firestore;

async function seedCompetition() {
  await env!.withSecurityRulesDisabled(async context => {
    const db = context.firestore() as unknown as Firestore;
    for (const [org, comp] of [[ORG, COMP], [OTHER_ORG, OTHER_COMP]]) {
      await setDoc(doc(db, `organizations/${org}/competitions/${comp}`), { competition: { id: comp, status: 'active' } });
    }
  });
}

test('firestore rules: participant_scopes', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({
    projectId: 'mizan-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) },
  });
  t.after(async () => { await env?.cleanup(); });
  await seedCompetition();

  await t.test('an unauthenticated reader is refused — the range is not public', async () => {
    const db = env!.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(db, scopePath())));
    await assertFails(setDoc(doc(db, scopePath()), scopeDoc('anyone')));
  });

  await t.test('a participant writes only a record stamped with their own uid', async () => {
    const db = ctx('participant', 'uid-1');
    await assertFails(setDoc(doc(db, scopePath()), scopeDoc('uid-someone-else')));
    await assertSucceeds(setDoc(doc(db, scopePath()), scopeDoc('uid-1')));
  });

  await t.test('a participant reads their own record and no one else\'s', async () => {
    await env!.withSecurityRulesDisabled(async c => {
      const db = c.firestore() as unknown as Firestore;
      await setDoc(doc(db, scopePath(ORG, COMP, 'pscope-other')), { ...scopeDoc('uid-2'), id: 'pscope-other' });
    });
    const mine = ctx('participant', 'uid-1');
    await assertSucceeds(getDoc(doc(mine, scopePath())));
    await assertFails(getDoc(doc(mine, scopePath(ORG, COMP, 'pscope-other'))));
  });

  await t.test('the committee reads every record in its own competition', async () => {
    for (const role of ['comp_admin', 'head_judge', 'judge', 'auditor', 'delegation_manager']) {
      await assertSucceeds(getDoc(doc(ctx(role, `uid-${role}`), scopePath())));
    }
  });

  await t.test('a role with no business in ranges is refused the read', async () => {
    await assertFails(getDoc(doc(ctx('broadcast_operator', 'uid-bc'), scopePath())));
  });

  await t.test('a participant may revise a draft, submitted or rejected record — but never an approved one', async () => {
    const db = ctx('participant', 'uid-1');
    for (const status of ['draft', 'submitted', 'rejected']) {
      await env!.withSecurityRulesDisabled(async c => {
        await setDoc(doc(c.firestore() as unknown as Firestore, scopePath()), scopeDoc('uid-1', status));
      });
      await assertSucceeds(updateDoc(doc(db, scopePath()), { updatedAt: '2026-05-02T08:00:00.000Z', uploaderUid: 'uid-1' }));
    }
    for (const status of ['approved', 'locked', 'superseded']) {
      await env!.withSecurityRulesDisabled(async c => {
        await setDoc(doc(c.firestore() as unknown as Firestore, scopePath()), scopeDoc('uid-1', status));
      });
      await assertFails(updateDoc(doc(db, scopePath()), { updatedAt: '2026-05-02T08:00:00.000Z', uploaderUid: 'uid-1' }));
    }
  });

  await t.test('a participant cannot hand their record to someone else on update', async () => {
    await env!.withSecurityRulesDisabled(async c => {
      await setDoc(doc(c.firestore() as unknown as Firestore, scopePath()), scopeDoc('uid-1', 'submitted'));
    });
    await assertFails(updateDoc(doc(ctx('participant', 'uid-1'), scopePath()), { uploaderUid: 'uid-2' }));
  });

  await t.test('the administration approves what a participant may not', async () => {
    await env!.withSecurityRulesDisabled(async c => {
      await setDoc(doc(c.firestore() as unknown as Firestore, scopePath()), scopeDoc('uid-1', 'approved'));
    });
    await assertSucceeds(updateDoc(doc(ctx('comp_admin', 'uid-admin'), scopePath()), { status: 'locked' }));
    await assertFails(updateDoc(doc(ctx('judge', 'uid-judge'), scopePath()), { status: 'approved' }), );
  });

  await t.test('no one deletes a range record — a version is superseded, never removed', async () => {
    for (const role of ['participant', 'comp_admin', 'org_admin', 'super_admin']) {
      await assertFails(deleteDoc(doc(ctx(role, `uid-del-${role}`), scopePath())));
    }
  });

  await t.test('a claim for another organization or another competition reaches nothing', async () => {
    const foreignOrg = env!.authenticatedContext('uid-x', { role: 'comp_admin', org_id: OTHER_ORG, competition_id: COMP }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(foreignOrg, scopePath())));
    const foreignComp = env!.authenticatedContext('uid-y', { role: 'comp_admin', org_id: ORG, competition_id: OTHER_COMP }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(foreignComp, scopePath())));
  });

  await t.test('an update to a record that does not exist never writes — but the two roles are refused differently', async () => {
    /*
     * تحديثُ وثيقةٍ غير موجودة يُردّ في الحالين، وبطريقتين مختلفتين — والفرق يستحق التثبيت:
     *
     *   • **المتسابق**: قاعدته تقرأ `resource.data.uploaderUid`، و`resource` عدمٌ حين لا وثيقة،
     *     فتخرج القاعدة بخطأ تقييم. فايرستور يمنع عند الخطأ، فالمنع يقع — لكنه منعٌ بالعثرة
     *     لا بالحكم، ويظهر في المراقبة كعطبٍ في القاعدة لا كرفضٍ مقصود.
     *   • **الإدارة**: قاعدتها لا تمسّ `resource` أصلًا، فتسمح؛ ثم يردّ فايرستور نفسه
     *     `NOT_FOUND` لأن لا شيء يُحدَّث. وهذا سليم: لا وثيقة تُنشأ، ولا بيانات تُمسّ.
     *
     * والنتيجة واحدة — لا كتابة — وهذا ما يُثبَّت هنا. وتحسينُ الأولى بحارس `resource != null`
     * يبقى قرارًا للمالك: النمط نفسه في أحد عشر موضعًا عبر مجالاتٍ لم أبنِها، وتعديل قواعد
     * الأمان على نطاقٍ أوسع من عملي توسيعٌ لا يُقدَم عليه بلا طلب.
     */
    const path = scopePath(ORG, COMP, 'never-written');
    await assertFails(updateDoc(doc(ctx('participant', 'uid-missing-p'), path), { updatedAt: 'x' }));
    for (const role of ['comp_admin', 'delegation_manager']) {
      await assert.rejects(
        () => updateDoc(doc(ctx(role, `uid-missing-${role}`), path), { updatedAt: 'x' }),
        (error: { code?: string }) => error.code === 'not-found' || String(error).includes('NOT_FOUND'),
        `${role} must not create a range record through an update`);
    }
    /* وفي الحالين لا وثيقة تُولد. */
    await env!.withSecurityRulesDisabled(async c => {
      const snapshot = await getDoc(doc(c.firestore() as unknown as Firestore, path));
      assert.equal(snapshot.exists(), false, 'a refused update must not have created anything');
    });
  });

  await t.test('a role claim with no competition claim at all is refused, not defaulted open', async () => {
    const noComp = env!.authenticatedContext('uid-z', { role: 'comp_admin', org_id: ORG }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(noComp, scopePath())));
  });
});
