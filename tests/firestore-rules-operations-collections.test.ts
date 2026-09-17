import test from 'node:test';
import fs from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, type Firestore } from 'firebase/firestore';

/*
 * خمسُ مجموعاتٍ كانت قواعدها مكتوبةً ولم تُقيَّم على خادمٍ قطّ:
 *   checkins · reviews · committees · support_sessions · session_checkpoints
 *
 * وقاعدةٌ لم تُنفَّذ ليست قاعدة: تبدو صحيحةً في القراءة وتنكسر عند التقييم. وما تحميه هذه
 * الخمس ليس تفصيلًا إداريًّا:
 *   · `checkins` تقول من حضر ومتى — وعليها يُبنى النداء والغياب.
 *   · `reviews` مراجعةُ رئيس اللجنة على تحكيمٍ وقع.
 *   · `committees` تكوينُ اللجان، ومن يعدّلها يعيد توزيع من يحكم من.
 *   · `support_sessions` جلساتُ دعمٍ تحمل بيانات متسابقين.
 *   · `session_checkpoints` نقاطُ استئناف جلسة — وعليها يُستأنف بعد انقطاع.
 *
 * ولكلٍّ منها هنا: دورٌ مسموح من المستأجر نفسه، ودورٌ ممنوع، ومستأجرٌ آخر، وغيرُ موثَّق،
 * ومعرّفٌ مخمَّن، ومسابقةٌ مغلقة. وحين لا يعمل المحاكي تُتخطّى بنصٍّ صريح — لا تمرّ صامتةً.
 *
 * التشغيل: npm run qa:firestore-rules
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
/* فضاءُ أسماءٍ خاصّ: الملفات تتشارك محاكيًا واحدًا ولا يمسح أحدها ما كتبه الآخر. */
const ORG = 'org-ops', COMP = 'comp-ops', OTHER_ORG = 'org-ops-b', OTHER_COMP = 'comp-ops-b', CLOSED = 'comp-ops-closed';

const at = (collection: string, id: string, org = ORG, comp = COMP) =>
  `organizations/${org}/competitions/${comp}/${collection}/${id}`;

const stamped = (uploaderUid: string, extra: Record<string, unknown> = {}) => ({
  organizationId: ORG, competitionId: COMP, uploaderUid,
  createdAt: '2026-05-01T08:00:00.000Z', updatedAt: '2026-05-01T08:00:00.000Z', ...extra,
});

let env: RulesTestEnvironment | null = null;

const ctx = (role: string, uid: string, org = ORG, comp = COMP) =>
  env!.authenticatedContext(uid, { role, org_id: org, competition_id: comp }).firestore() as unknown as Firestore;
const anon = () => env!.unauthenticatedContext().firestore() as unknown as Firestore;
const asGod = (fn: (db: Firestore) => Promise<unknown>) =>
  env!.withSecurityRulesDisabled(c => fn(c.firestore() as unknown as Firestore) as Promise<void>);

/*
 * عقدُ كل مجموعة كما هو منصوصٌ في `firestore.rules`، مكتوبًا هنا مرّةً واحدة ليُقاس عليه.
 * أيُّ توسيعٍ للأدوار في القواعد بلا تحديثٍ هنا يسقط في «دورٌ ممنوع» أدناه.
 */
const CONTRACTS = [
  {
    collection: 'checkins',
    readers: ['super_admin', 'org_admin', 'comp_admin', 'ops_manager', 'exception_host'],
    writers: ['comp_admin', 'ops_manager', 'exception_host'],
    deniedReaders: ['judge', 'participant', 'guardian', 'broadcast_operator'],
    deniedWriters: ['judge', 'head_judge', 'participant', 'auditor'],
  },
  {
    collection: 'reviews',
    readers: ['super_admin', 'org_admin', 'comp_admin', 'head_judge', 'auditor'],
    writers: ['head_judge', 'comp_admin'],
    deniedReaders: ['judge', 'participant', 'ops_manager', 'support_agent'],
    deniedWriters: ['judge', 'ops_manager', 'participant', 'auditor'],
  },
  {
    collection: 'committees',
    readers: ['super_admin', 'org_admin', 'comp_admin', 'head_judge', 'judge', 'ops_manager', 'exception_host', 'delegation_manager', 'auditor'],
    writers: ['super_admin', 'org_admin', 'comp_admin', 'ops_manager'],
    deniedReaders: ['participant', 'guardian', 'support_agent'],
    deniedWriters: ['judge', 'head_judge', 'participant', 'auditor'],
  },
  {
    collection: 'support_sessions',
    readers: ['super_admin', 'org_admin', 'comp_admin', 'support_agent', 'ops_manager', 'head_judge'],
    writers: ['super_admin', 'org_admin', 'comp_admin', 'ops_manager', 'head_judge', 'support_agent'],
    deniedReaders: ['judge', 'participant', 'guardian', 'auditor'],
    deniedWriters: ['judge', 'participant', 'guardian', 'auditor'],
  },
  {
    collection: 'session_checkpoints',
    readers: ['super_admin', 'org_admin', 'comp_admin', 'head_judge', 'judge', 'ops_manager', 'auditor'],
    writers: ['super_admin', 'org_admin', 'comp_admin', 'head_judge', 'judge', 'ops_manager'],
    deniedReaders: ['participant', 'guardian', 'support_agent', 'broadcast_operator'],
    deniedWriters: ['participant', 'guardian', 'auditor', 'support_agent'],
  },
] as const;

test('firestore rules: مجموعات التشغيل الخمس', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
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

  for (const contract of CONTRACTS) {
    const { collection } = contract;

    await t.test(`${collection}: دورٌ مسموح من المستأجر نفسه يكتب ويقرأ`, async () => {
      for (const role of contract.writers) {
        const db = ctx(role, `uid-${collection}-${role}`);
        await assertSucceeds(setDoc(doc(db, at(collection, `doc-${role}`)), stamped(`uid-${collection}-${role}`, { note: 'x' })));
      }
      // زُرعت وثيقةٌ بصلاحياتٍ معطّلة كي تكون القراءةُ قراءةً لا إنشاءً.
      await asGod(db => setDoc(doc(db, at(collection, 'doc-seed')), stamped('uid-seed', { note: 'seed' })));
      for (const role of contract.readers) {
        const db = ctx(role, `uid-${collection}-r-${role}`);
        await assertSucceeds(getDoc(doc(db, at(collection, 'doc-seed'))));
      }
    });

    await t.test(`${collection}: دورٌ ممنوع يُردّ قراءةً وكتابة`, async () => {
      for (const role of contract.deniedReaders) {
        const db = ctx(role, `uid-${collection}-dr-${role}`);
        await assertFails(getDoc(doc(db, at(collection, 'doc-seed'))));
      }
      for (const role of contract.deniedWriters) {
        const db = ctx(role, `uid-${collection}-dw-${role}`);
        await assertFails(setDoc(doc(db, at(collection, `doc-forbidden-${role}`)), stamped(`uid-${collection}-dw-${role}`)));
      }
    });

    await t.test(`${collection}: مستأجرٌ آخر لا يصل ولو كان دورُه مسموحًا عنده`, async () => {
      const foreignAdmin = ctx('comp_admin', 'uid-foreign-admin', OTHER_ORG, OTHER_COMP);
      await assertFails(getDoc(doc(foreignAdmin, at(collection, 'doc-seed'))));
      await assertFails(setDoc(doc(foreignAdmin, at(collection, 'doc-cross-tenant')), stamped('uid-foreign-admin')));
    });

    await t.test(`${collection}: مطالبةٌ مزوَّرة بمستأجرٍ ليس مستأجرَه تُردّ`, async () => {
      // الدور صحيح والمسابقة صحيحة، لكن مطالبة org_id تخصّ مستأجرًا آخر.
      const forged = env!.authenticatedContext('uid-forged', { role: 'comp_admin', org_id: OTHER_ORG, competition_id: COMP })
        .firestore() as unknown as Firestore;
      await assertFails(getDoc(doc(forged, at(collection, 'doc-seed'))));
      await assertFails(setDoc(doc(forged, at(collection, 'doc-forged')), stamped('uid-forged')));
    });

    await t.test(`${collection}: مسابقةٌ ليست في مطالبته تُردّ ولو كان المستأجر صحيحًا`, async () => {
      const wrongComp = env!.authenticatedContext('uid-wrong-comp', { role: 'comp_admin', org_id: ORG, competition_id: OTHER_COMP })
        .firestore() as unknown as Firestore;
      await assertFails(getDoc(doc(wrongComp, at(collection, 'doc-seed'))));
      await assertFails(setDoc(doc(wrongComp, at(collection, 'doc-wrong-comp')), stamped('uid-wrong-comp')));
    });

    await t.test(`${collection}: غيرُ الموثَّق لا يقرأ ولا يكتب`, async () => {
      const db = anon();
      await assertFails(getDoc(doc(db, at(collection, 'doc-seed'))));
      await assertFails(setDoc(doc(db, at(collection, 'doc-anon')), stamped('nobody')));
    });

    await t.test(`${collection}: معرّفٌ مخمَّن لا يفتح بابًا — المنع بالنطاق لا بالجهل`, async () => {
      const outsider = ctx('participant', 'uid-guesser');
      for (const guessed of ['doc-seed', 'doc-comp_admin', 'aaaaaaaaaaaaaaaaaaaa']) {
        await assertFails(getDoc(doc(outsider, at(collection, guessed))));
      }
    });

    await t.test(`${collection}: الحذف ممنوعٌ إلا حيث نصّت القاعدة عليه`, async () => {
      const db = ctx('comp_admin', 'uid-deleter');
      const deletable = collection === 'committees';
      await asGod(d => setDoc(doc(d, at(collection, 'doc-delete')), stamped('uid-deleter')));
      if (deletable) await assertSucceeds(deleteDoc(doc(db, at(collection, 'doc-delete'))));
      else await assertFails(deleteDoc(doc(db, at(collection, 'doc-delete'))));
    });

    await t.test(`${collection}: مسابقةٌ مغلقة تُغلق الكتابة، ويبقى المدقّق يقرأ`, async () => {
      await asGod(d => setDoc(doc(d, at(collection, 'doc-closed', ORG, CLOSED)), {
        organizationId: ORG, competitionId: CLOSED, uploaderUid: 'uid-seed',
      }));
      const closedAdmin = ctx('comp_admin', 'uid-closed-admin', ORG, CLOSED);
      await assertFails(updateDoc(doc(closedAdmin, at(collection, 'doc-closed', ORG, CLOSED)), { note: 'after close' }));

      const auditorAllowed = (contract.readers as readonly string[]).includes('auditor');
      const auditor = ctx('auditor', 'uid-closed-auditor', ORG, CLOSED);
      if (auditorAllowed) await assertSucceeds(getDoc(doc(auditor, at(collection, 'doc-closed', ORG, CLOSED))));
      else await assertFails(getDoc(doc(auditor, at(collection, 'doc-closed', ORG, CLOSED))));
    });
  }
});
