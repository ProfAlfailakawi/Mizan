import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, type Firestore } from 'firebase/firestore';

/*
 * ما يراه العامّة، وما لا يُمسّ.
 *
 * `public_boards` و`public_competitions` مقروءتان **للعالم كلِّه** بلا هوية — عن قصد:
 * شاشة القاعة تُعلَّق على تلفازٍ في ممرّ، والبديل أن يُسجَّل جهازُ عرضٍ بدورٍ تشغيليّ
 * فيملك قراءة سجلّ المتسابقين كاملًا.
 *
 * فالحاجز الوحيد بين ما على التلفاز وبين أسماء المتسابقين هو **شرطٌ في القاعدة**:
 * `privacyMode == 'CODES_ONLY'`. وهذا هو وعدُ §٩٩ منفَّذًا على الخادم لا في شيفرة
 * الواجهة. ولو رُخّي يومًا لما أمسكه شيء — فيُمسك هنا.
 *
 * ويُفحص معه ما لا يُمسّ بحال: نصُّ المصحف المعتمد، والشهادة بعد إصدارها، وحدثُ
 * المحكّم بعد كتابته.
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const ORG = 'org-a', COMP = 'comp-a', OTHER_ORG = 'org-b', OTHER_COMP = 'comp-b', CLOSED = 'comp-closed';

const scopedAt = (collectionName: string, id: string, org = ORG, comp = COMP) =>
  `organizations/${org}/competitions/${comp}/${collectionName}/${id}`;

const board = (privacyMode: string, org = ORG, comp = COMP) => ({
  organizationId: org, board: { competitionId: comp, privacyMode, rows: [{ code: 'A-001', state: 'in_queue' }] },
});

let env: RulesTestEnvironment | null = null;
const ctx = (role: string, uid: string, org = ORG, comp = COMP) =>
  env!.authenticatedContext(uid, { role, org_id: org, competition_id: comp }).firestore() as unknown as Firestore;
const anon = () => env!.unauthenticatedContext().firestore() as unknown as Firestore;
const asGod = (fn: (db: Firestore) => Promise<unknown>) =>
  env!.withSecurityRulesDisabled(c => fn(c.firestore() as unknown as Firestore) as Promise<void>);

test('firestore rules: الشاشات العامة والمصادر وما لا يُمسّ', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({
    projectId: 'mizan-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) },
  });
  t.after(async () => { await env?.cleanup(); });

  await asGod(async db => {
    for (const [org, comp] of [[ORG, COMP], [OTHER_ORG, OTHER_COMP]]) {
      await setDoc(doc(db, `organizations/${org}/competitions/${comp}`), { competition: { id: comp, status: 'active' } });
    }
    await setDoc(doc(db, `organizations/${ORG}/competitions/${CLOSED}`), { competition: { id: CLOSED, status: 'completed' } });
  });

  /* ═══ شاشة القاعة: مقروءةٌ للعالم، ولا تحمل اسمًا ═══ */

  await t.test('شاشة القاعة لا تُكتب إلا وهي مُعلِنةٌ وضع الأكواد صراحةً', async () => {
    const db = ctx('ops_manager', 'uid-ops');
    await assertFails(setDoc(doc(db, `public_boards/${COMP}`), board('FULL_NAMES')));
    await assertFails(setDoc(doc(db, `public_boards/${COMP}`), board('NAMES_AND_SCORES')));
    await assertSucceeds(setDoc(doc(db, `public_boards/${COMP}`), board('CODES_ONLY')));
  });

  await t.test('ولا تُقلب بعد إنشائها إلى شاشةٍ تحمل الأسماء', async () => {
    const db = ctx('comp_admin', 'uid-ca');
    await assertFails(setDoc(doc(db, `public_boards/${COMP}`), board('FULL_NAMES')));
    await assertFails(updateDoc(doc(db, `public_boards/${COMP}`), { 'board.privacyMode': 'FULL_NAMES' }));
    /* والوثيقة تبقى كما كانت. */
    await asGod(async god => {
      const snapshot = await getDoc(doc(god, `public_boards/${COMP}`));
      assert.equal(snapshot.data()?.board?.privacyMode, 'CODES_ONLY', 'وضع الخصوصية تغيّر رغم رفض القاعدة');
    });
  });

  await t.test('ولا تُنقل الشاشة إلى جهةٍ أخرى بتحديث', async () => {
    await assertFails(setDoc(doc(ctx('comp_admin', 'uid-ca'), `public_boards/${COMP}`), board('CODES_ONLY', OTHER_ORG)));
  });

  await t.test('والعابرُ في الممرّ يقرؤها بلا هوية — وهذا مقصود', async () => {
    await assertSucceeds(getDoc(doc(anon(), `public_boards/${COMP}`)));
  });

  await t.test('لكنه لا يكتب فيها، ولا يكتبها دورٌ لا يدير المسابقة', async () => {
    await assertFails(setDoc(doc(anon(), `public_boards/${COMP}`), board('CODES_ONLY')));
    await assertFails(setDoc(doc(ctx('judge', 'uid-j'), `public_boards/${COMP}`), board('CODES_ONLY')));
    await assertFails(setDoc(doc(ctx('participant', 'uid-p'), `public_boards/${COMP}`), board('CODES_ONLY')));
  });

  /* ═══ رابط الرحلة: لا يُقرأ بلا هوية، ولا يُعدّ أصلًا ═══ */

  await t.test('رابط الرحلة لا يُقرأ بلا هوية، ولا تُعدّ الروابط أصلًا', async () => {
    await asGod(db => setDoc(doc(db, 'public_journeys/hash-1'), { organizationId: ORG, competitionId: COMP, revoked: false }));
    await assertFails(getDoc(doc(anon(), 'public_journeys/hash-1')));
    /* والإحصاء ممنوع منعًا باتًّا — ولو لمن يملك القراءة. */
    await assertFails(getDocs(collection(ctx('comp_admin', 'uid-ca'), 'public_journeys')));
    await assertSucceeds(getDoc(doc(ctx('comp_admin', 'uid-ca'), 'public_journeys/hash-1')));
  });

  await t.test('ورابطٌ أُلغي أو انتهت مسابقتُه لا يُقرأ ولو من الإدارة', async () => {
    await asGod(async db => {
      await setDoc(doc(db, 'public_journeys/hash-revoked'), { organizationId: ORG, competitionId: COMP, revoked: true });
      await setDoc(doc(db, 'public_journeys/hash-closed'), { organizationId: ORG, competitionId: CLOSED, revoked: false });
    });
    await assertFails(getDoc(doc(ctx('comp_admin', 'uid-ca'), 'public_journeys/hash-revoked')));
    const closedCtx = env!.authenticatedContext('uid-ca-c', { role: 'comp_admin', org_id: ORG, competition_id: CLOSED }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(closedCtx, 'public_journeys/hash-closed')));
  });

  /* ═══ نصّ المصحف المعتمد ═══ */

  await t.test('نصّ المصحف المعتمد لا يكتبه محكّم ولا يمحوه أحد', async () => {
    await asGod(db => setDoc(doc(db, scopedAt('quran_sources', 'src-1')), { organizationId: ORG, competitionId: COMP, packageHash: 'sha256:aaa' }));
    await assertFails(updateDoc(doc(ctx('judge', 'uid-j'), scopedAt('quran_sources', 'src-1')), { packageHash: 'sha256:bbb' }));
    await assertFails(deleteDoc(doc(ctx('super_admin', 'uid-root'), scopedAt('quran_sources', 'src-1'))));
    await asGod(async god => {
      const snapshot = await getDoc(doc(god, scopedAt('quran_sources', 'src-1')));
      assert.equal(snapshot.data()?.packageHash, 'sha256:aaa', 'بصمة المصدر تغيّرت رغم رفض القاعدة');
    });
  });

  await t.test('ويقرؤه من يحتاجه، ولا يقرؤه من لا شأن له به', async () => {
    for (const role of ['head_judge', 'judge', 'auditor', 'comp_admin']) {
      await assertSucceeds(getDoc(doc(ctx(role, `uid-${role}`), scopedAt('quran_sources', 'src-1'))));
    }
    await assertFails(getDoc(doc(ctx('participant', 'uid-p'), scopedAt('quran_sources', 'src-1'))));
  });

  /* ═══ ما لا يُمسّ بعد كتابته ═══ */

  await t.test('الشهادة بعد إصدارها لا تُعدَّل ولا تُمحى — ولا من مُصدِرها', async () => {
    await assertSucceeds(setDoc(doc(ctx('comp_admin', 'uid-ca'), scopedAt('certificates', 'cert-1')), { organizationId: ORG, competitionId: COMP, number: 'C-1' }));
    for (const role of ['comp_admin', 'org_admin', 'super_admin']) {
      await assertFails(updateDoc(doc(ctx(role, `uid-${role}`), scopedAt('certificates', 'cert-1')), { number: 'C-999' }));
      await assertFails(deleteDoc(doc(ctx(role, `uid-${role}`), scopedAt('certificates', 'cert-1'))));
    }
  });

  await t.test('وحدثُ المحكّم يُكتب ولا يُعاد فيه النظر', async () => {
    await assertSucceeds(setDoc(doc(ctx('judge', 'uid-j'), scopedAt('judge_events', 'ev-1')), { organizationId: ORG, competitionId: COMP, kind: 'started' }));
    await assertFails(updateDoc(doc(ctx('judge', 'uid-j'), scopedAt('judge_events', 'ev-1')), { kind: 'never-happened' }));
    await assertFails(deleteDoc(doc(ctx('head_judge', 'uid-hj'), scopedAt('judge_events', 'ev-1'))));
    /* ولا يكتبه غيرُ المحكّم — الحدث شهادةُ من حضر. */
    await assertFails(setDoc(doc(ctx('comp_admin', 'uid-ca'), scopedAt('judge_events', 'ev-2')), { organizationId: ORG, competitionId: COMP, kind: 'started' }));
  });
});
