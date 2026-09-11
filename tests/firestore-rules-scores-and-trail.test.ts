import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, type Firestore } from 'firebase/firestore';

/*
 * قواعد الدرجات والتحكيم والتظلمات والسجلّ — على المحاكي.
 *
 * غُطّيت `participant_scopes` وحدها من تسعَ عشرةَ مجموعة في القواعد. وهذه الأربع تحمل
 * أثقل ما في المسابقة: درجةُ المحكّم، والنتيجةُ قبل إعلانها، وتظلّمُ متسابقٍ باسمه،
 * والسجلُّ الذي يُحتجّ به عند النزاع. وكانت قواعدها مكتوبةً ولم تُنفَّذ على خادمٍ قطّ —
 * والقاعدة لا تُقرأ، تُقيَّم.
 *
 * وما يُفحص هنا ليس «هل الصيغة صحيحة» بل ما تحميه القاعدة من الناس:
 *   · محكّمٌ لا يقرأ ورقة زميله ولا يكتب باسمه   (حياد التحكيم)
 *   · متسابقٌ لا يرى نتيجةً قبل إعلانها، ولا تظلّم غيره
 *   · محكّمٌ لا يكتب النتيجة النهائية — يرفع رأيه ويقرّر رئيسُ اللجنة
 *   · والسجلُّ لا يُعدَّل ولا يُحذف، وإلا فليس سجلًّا
 *
 * التشغيل: npm run qa:firestore-rules
 * وحين لا يعمل المحاكي تُتخطّى بنصٍّ صريح — لا تمرّ صامتةً موهمةً أنها فحصت.
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const ORG = 'org-a', COMP = 'comp-a', OTHER_ORG = 'org-b', OTHER_COMP = 'comp-b', CLOSED = 'comp-closed';

const at = (collection: string, id: string, org = ORG, comp = COMP) =>
  `organizations/${org}/competitions/${comp}/${collection}/${id}`;

const stamped = (uploaderUid: string, extra: Record<string, unknown> = {}) => ({
  organizationId: ORG, competitionId: COMP, uploaderUid,
  createdAt: '2026-05-01T08:00:00.000Z', updatedAt: '2026-05-01T08:00:00.000Z', ...extra,
});

let env: RulesTestEnvironment | null = null;

const ctx = (role: string, uid: string, org = ORG, comp = COMP) =>
  env!.authenticatedContext(uid, { role, org_id: org, competition_id: comp }).firestore() as unknown as Firestore;

const asGod = (fn: (db: Firestore) => Promise<unknown>) =>
  env!.withSecurityRulesDisabled(c => fn(c.firestore() as unknown as Firestore) as Promise<void>);

test('firestore rules: الدرجات والتحكيم والتظلمات والسجلّ', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({
    projectId: 'mizan-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) },
  });
  t.after(async () => { await env?.cleanup(); });

  await asGod(async db => {
    for (const [org, comp] of [[ORG, COMP], [OTHER_ORG, OTHER_COMP]]) {
      await setDoc(doc(db, `organizations/${org}/competitions/${comp}`), { competition: { id: comp, status: 'active' } });
    }
    /* مسابقةٌ انتهت: الأرشيف لا يبقى مفتوحًا لمن كان يشتغل فيها. */
    await setDoc(doc(db, `organizations/${ORG}/competitions/${CLOSED}`), { competition: { id: CLOSED, status: 'completed' } });
  });

  /* ═══ أوراق المحكّمين ═══ */

  await t.test('محكّمٌ يرفع ورقته باسمه، ولا يرفع باسم زميله', async () => {
    const db = ctx('judge', 'uid-judge-1');
    await assertFails(setDoc(doc(db, at('judge_submissions', 'sub-forged')), stamped('uid-judge-2', { score: 100 })));
    await assertSucceeds(setDoc(doc(db, at('judge_submissions', 'sub-1')), stamped('uid-judge-1', { score: 92 })));
  });

  await t.test('محكّمٌ لا يقرأ ورقة زميله — وهذا هو الحياد نفسه', async () => {
    await asGod(db => setDoc(doc(db, at('judge_submissions', 'sub-2')), stamped('uid-judge-2', { score: 78 })));
    const mine = ctx('judge', 'uid-judge-1');
    await assertSucceeds(getDoc(doc(mine, at('judge_submissions', 'sub-1'))));
    await assertFails(getDoc(doc(mine, at('judge_submissions', 'sub-2'))));
  });

  await t.test('محكّمٌ لا يعدّل ورقة زميله ولو عرف رقمها', async () => {
    const db = ctx('judge', 'uid-judge-1');
    await assertFails(updateDoc(doc(db, at('judge_submissions', 'sub-2')), { score: 40 }));
    /* والورقة تبقى كما تركها صاحبها. */
    await asGod(async god => {
      const snapshot = await getDoc(doc(god, at('judge_submissions', 'sub-2')));
      assert.equal(snapshot.data()?.score, 78, 'ورقة المحكّم تغيّرت رغم رفض القاعدة');
    });
  });

  await t.test('رئيس اللجنة والمدقّق يقرآن كل الأوراق — وإلا تعذّرت المراجعة', async () => {
    for (const role of ['head_judge', 'auditor', 'comp_admin']) {
      await assertSucceeds(getDoc(doc(ctx(role, `uid-${role}`), at('judge_submissions', 'sub-2'))));
    }
  });

  await t.test('متسابقٌ لا يقرأ أوراق التحكيم أصلًا', async () => {
    await assertFails(getDoc(doc(ctx('participant', 'uid-p1'), at('judge_submissions', 'sub-1'))));
  });

  await t.test('ولا أحد يحذف ورقة تحكيم — ولا صاحبها', async () => {
    await assertFails(deleteDoc(doc(ctx('judge', 'uid-judge-1'), at('judge_submissions', 'sub-1'))));
    await assertFails(deleteDoc(doc(ctx('super_admin', 'uid-root'), at('judge_submissions', 'sub-1'))));
  });

  /* ═══ النتائج ═══ */

  await t.test('المحكّم يرفع رأيه ولا يكتب النتيجة — يقرّرها رئيس اللجنة', async () => {
    await assertFails(setDoc(doc(ctx('judge', 'uid-judge-1'), at('results', 'res-1')), stamped('uid-judge-1', { total: 99 })));
    await assertSucceeds(setDoc(doc(ctx('head_judge', 'uid-hj'), at('results', 'res-1')), stamped('uid-hj', { total: 91 })));
  });

  await t.test('متسابقٌ لا يقرأ النتيجة من الباب الخلفي قبل إعلانها', async () => {
    await assertFails(getDoc(doc(ctx('participant', 'uid-p1'), at('results', 'res-1'))));
    await assertFails(getDoc(doc(ctx('guardian', 'uid-g1'), at('results', 'res-1'))));
  });

  await t.test('ولا تُقرأ نتيجةٌ بلا هوية أصلًا', async () => {
    const anon = env!.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anon, at('results', 'res-1'))));
    await assertFails(setDoc(doc(anon, at('results', 'res-anon')), stamped('none', { total: 100 })));
  });

  await t.test('ولا نتيجة تُحذف', async () => {
    await assertFails(deleteDoc(doc(ctx('comp_admin', 'uid-ca'), at('results', 'res-1'))));
  });

  await t.test('إدارةُ منظمةٍ أخرى لا تصل إلى نتائج هذه — ولو كانت مديرًا عندها', async () => {
    const stranger = ctx('comp_admin', 'uid-other', OTHER_ORG, OTHER_COMP);
    await assertFails(getDoc(doc(stranger, at('results', 'res-1'))));
    await assertFails(setDoc(doc(stranger, at('results', 'res-x')), stamped('uid-other', { total: 5 })));
  });

  await t.test('مسابقةٌ انتهت: يبقى الأرشيف للمدقّق والإدارة، ويُغلق عمّن كان يشتغل فيها', async () => {
    await asGod(db => setDoc(doc(db, at('results', 'res-old', ORG, CLOSED)), stamped('uid-hj', { total: 88 })));
    const closed = (role: string) => env!.authenticatedContext(`uid-${role}-c`, { role, org_id: ORG, competition_id: CLOSED }).firestore() as unknown as Firestore;
    await assertSucceeds(getDoc(doc(closed('auditor'), at('results', 'res-old', ORG, CLOSED))));
    await assertSucceeds(getDoc(doc(closed('org_admin'), at('results', 'res-old', ORG, CLOSED))));
    await assertFails(getDoc(doc(closed('judge'), at('results', 'res-old', ORG, CLOSED))));
    /* ولا يُكتب في مسابقةٍ انتهت — ولو كان الكاتب رئيس اللجنة. */
    await assertFails(setDoc(doc(closed('head_judge'), at('results', 'res-new', ORG, CLOSED)), stamped('uid-hj', { total: 70 })));
  });

  /* ═══ التظلمات ═══ */

  await t.test('متسابقٌ يتظلّم باسمه لا باسم غيره', async () => {
    const db = ctx('participant', 'uid-p1');
    await assertFails(setDoc(doc(db, at('appeals', 'app-forged')), stamped('uid-p2', { reason: 'باسم غيري' })));
    await assertSucceeds(setDoc(doc(db, at('appeals', 'app-1')), stamped('uid-p1', { reason: 'مراجعة درجة' })));
  });

  await t.test('ولا يقرأ تظلّم متسابقٍ آخر', async () => {
    await asGod(db => setDoc(doc(db, at('appeals', 'app-2')), stamped('uid-p2', { reason: 'تظلّم غيري' })));
    const mine = ctx('participant', 'uid-p1');
    await assertSucceeds(getDoc(doc(mine, at('appeals', 'app-1'))));
    await assertFails(getDoc(doc(mine, at('appeals', 'app-2'))));
  });

  await t.test('ولا يعدّل تظلّم غيره', async () => {
    await assertFails(updateDoc(doc(ctx('participant', 'uid-p1'), at('appeals', 'app-2')), { reason: 'غيّرتُه' }));
  });

  await t.test('من ينظر في التظلّم يقرؤه كلَّه', async () => {
    for (const role of ['head_judge', 'comp_admin', 'auditor', 'support_agent']) {
      await assertSucceeds(getDoc(doc(ctx(role, `uid-${role}`), at('appeals', 'app-1'))));
    }
  });

  await t.test('ولا تظلّم يُحذف — ولا من رئيس اللجنة', async () => {
    await assertFails(deleteDoc(doc(ctx('head_judge', 'uid-hj'), at('appeals', 'app-1'))));
  });

  /* ═══ السجلّ ═══ */

  await t.test('السجلُّ يُكتب فيه باسم كاتبه لا باسم سواه', async () => {
    const db = ctx('ops_manager', 'uid-ops');
    await assertFails(setDoc(doc(db, at('audit', 'ev-forged')), stamped('uid-someone-else', { action: 'انتحال' })));
    await assertSucceeds(setDoc(doc(db, at('audit', 'ev-1')), stamped('uid-ops', { action: 'فتح قاعة' })));
  });

  await t.test('ولا يُعدَّل حدثٌ كُتب — وإلا فليس سجلًّا', async () => {
    for (const role of ['ops_manager', 'comp_admin', 'head_judge', 'super_admin', 'auditor']) {
      await assertFails(updateDoc(doc(ctx(role, `uid-${role}`), at('audit', 'ev-1')), { action: 'شيء آخر' }));
    }
    /* والنصّ يبقى كما كُتب أول مرة. */
    await asGod(async god => {
      const snapshot = await getDoc(doc(god, at('audit', 'ev-1')));
      assert.equal(snapshot.data()?.action, 'فتح قاعة', 'حدث السجلّ تغيّر رغم رفض القاعدة');
    });
  });

  await t.test('ولا يُحذف — ولا من مالك المنصة', async () => {
    for (const role of ['super_admin', 'org_admin', 'comp_admin', 'auditor']) {
      await assertFails(deleteDoc(doc(ctx(role, `uid-${role}`), at('audit', 'ev-1'))));
    }
    await asGod(async god => {
      const snapshot = await getDoc(doc(god, at('audit', 'ev-1')));
      assert.equal(snapshot.exists(), true, 'حدث السجلّ اختفى رغم رفض القاعدة');
    });
  });

  await t.test('ومن لا شأن له بالسجلّ لا يقرؤه', async () => {
    for (const role of ['participant', 'guardian', 'judge', 'broadcast_operator']) {
      await assertFails(getDoc(doc(ctx(role, `uid-r-${role}`), at('audit', 'ev-1'))));
    }
  });

  /* ═══ بيانات المتسابقين ═══ */

  await t.test('متسابقٌ لا يكتب في سجلّ المتسابقين ولا يقرأ سجلّ غيره', async () => {
    await asGod(db => setDoc(doc(db, at('participants', 'part-1')), stamped('uid-admin', { code: 'A-001' })));
    await assertFails(setDoc(doc(ctx('participant', 'uid-p1'), at('participants', 'part-1')), stamped('uid-p1', { code: 'A-999' })));
    await assertFails(getDoc(doc(ctx('participant', 'uid-p1'), at('participants', 'part-1'))));
  });

  await t.test('ورتبةٌ بلا مطالبةِ مسابقةٍ تُرفض، لا تُفتح افتراضًا', async () => {
    const noComp = env!.authenticatedContext('uid-nc', { role: 'head_judge', org_id: ORG }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(noComp, at('results', 'res-1'))));
    await assertFails(getDoc(doc(noComp, at('judge_submissions', 'sub-1'))));
  });
});
