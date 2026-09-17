import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';

/*
 * P29 — من ختم النتيجة لا ينشرها، والحُكم على الخادم.
 *
 * كان الشرط مفروضًا في `store.ts` وحده. وهذا يحمي المستعمِل المستقيم ولا يحمي المسابقة:
 * عميلٌ مُعدَّل، أو نداءٌ مباشر على قاعدة البيانات بمطالبةٍ صحيحة، ينشر ما ختمه ولا يراه
 * أحد. فهذه الاختبارات تتعمّد تجاوز الواجهة وتكتب على Firestore مباشرةً — وتتوقّع الرفض.
 *
 * التشغيل: npm run qa:firestore-rules
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const ORG = 'org-sod', COMP = 'comp-sod';
const SEALER_UID = 'uid-sealer', PUBLISHER_UID = 'uid-publisher';

const resultPath = (id: string) => `organizations/${ORG}/competitions/${COMP}/results/${id}`;

let env: RulesTestEnvironment | null = null;
const ctx = (role: string, uid: string) =>
  env!.authenticatedContext(uid, { role, org_id: ORG, competition_id: COMP }).firestore() as unknown as Firestore;
const asGod = (fn: (db: Firestore) => Promise<unknown>) =>
  env!.withSecurityRulesDisabled(c => fn(c.firestore() as unknown as Firestore) as Promise<void>);

const sealed = (over: Record<string, unknown> = {}) => ({
  organizationId: ORG, competitionId: COMP, participantId: 'p-1',
  status: 'sealed', finalScore: 91.5,
  uploaderUid: SEALER_UID,
  sealMetadata: {
    sealedBy: 'المحكّم الرئيس', sealedById: 'usr-sealer', sealedByUid: SEALER_UID,
    sealedAt: '2026-05-01T08:00:00.000Z', cryptographicChecksum: 'SHA256:abc',
  },
  ...over,
});

test('firestore rules: فصل المهامّ عند نشر النتائج', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({
    projectId: 'mizan-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) },
  });
  t.after(async () => { await env?.cleanup(); });

  await asGod(db => setDoc(doc(db, `organizations/${ORG}/competitions/${COMP}`), { competition: { id: COMP, status: 'active' } }));

  await t.test('الخاتمُ نفسه لا ينشر ما ختمه — ولو كان دورُه يسمح بالنشر', async () => {
    await asGod(db => setDoc(doc(db, resultPath('r-self')), sealed()));
    const sealer = ctx('comp_admin', SEALER_UID);
    await assertFails(updateDoc(doc(sealer, resultPath('r-self')), {
      status: 'published', publishedById: 'usr-sealer', publishedAt: '2026-05-01T09:00:00.000Z', uploaderUid: SEALER_UID,
    }));
  });

  await t.test('ناشرٌ آخر مخوَّل يُقبل — فالقاعدة تفصل ولا تُعطّل', async () => {
    await asGod(db => setDoc(doc(db, resultPath('r-other')), sealed()));
    const publisher = ctx('comp_admin', PUBLISHER_UID);
    await assertSucceeds(updateDoc(doc(publisher, resultPath('r-other')), {
      status: 'published', publishedById: 'usr-publisher', publishedAt: '2026-05-01T09:00:00.000Z', uploaderUid: PUBLISHER_UID,
    }));
  });

  await t.test('الخاتمُ لا يتحايل بإعادة كتابة هويةِ الختم في نفس كتابة النشر', async () => {
    await asGod(db => setDoc(doc(db, resultPath('r-rewrite')), sealed()));
    const sealer = ctx('comp_admin', SEALER_UID);
    await assertFails(updateDoc(doc(sealer, resultPath('r-rewrite')), {
      status: 'published', uploaderUid: SEALER_UID,
      sealMetadata: { ...sealed().sealMetadata, sealedByUid: 'uid-someone-else' },
    }));
  });

  await t.test('ولا يتحايل بانتحال هويةِ ناشرٍ آخر في `uploaderUid`', async () => {
    await asGod(db => setDoc(doc(db, resultPath('r-impersonate')), sealed()));
    const sealer = ctx('comp_admin', SEALER_UID);
    await assertFails(updateDoc(doc(sealer, resultPath('r-impersonate')), {
      status: 'published', publishedById: 'usr-publisher', uploaderUid: PUBLISHER_UID,
    }));
  });

  await t.test('نتيجةٌ بلا هويةِ خاتمٍ لا تُنشَر — فشلٌ مغلق لا افتراضُ اختلاف', async () => {
    await asGod(db => setDoc(doc(db, resultPath('r-nouid')), sealed({
      sealMetadata: { sealedBy: 'قديم', sealedById: 'usr-old', sealedAt: '2026-01-01T00:00:00.000Z', cryptographicChecksum: 'SHA256:old' },
    })));
    const publisher = ctx('comp_admin', PUBLISHER_UID);
    await assertFails(updateDoc(doc(publisher, resultPath('r-nouid')), {
      status: 'published', uploaderUid: PUBLISHER_UID,
    }));
  });

  await t.test('التعديلات التي ليست نشرًا تبقى كما كانت — القاعدة لم توسّع المنع', async () => {
    await asGod(db => setDoc(doc(db, resultPath('r-normal')), sealed({ status: 'draft', sealMetadata: null })));
    const admin = ctx('comp_admin', PUBLISHER_UID);
    await assertSucceeds(updateDoc(doc(admin, resultPath('r-normal')), { finalScore: 88, uploaderUid: PUBLISHER_UID }));
  });

  await t.test('إعادةُ النشر لنتيجةٍ منشورة أصلًا ليست انتقالَ نشرٍ فلا تُحجب', async () => {
    await asGod(db => setDoc(doc(db, resultPath('r-republished')), sealed({ status: 'published' })));
    const sealer = ctx('comp_admin', SEALER_UID);
    await assertSucceeds(updateDoc(doc(sealer, resultPath('r-republished')), { publishedAt: '2026-05-01T10:00:00.000Z', uploaderUid: SEALER_UID }));
  });

  await t.test('ودورٌ لا يملك النشر يُردّ قبل أن يُسأل عن فصل المهامّ', async () => {
    await asGod(db => setDoc(doc(db, resultPath('r-judge')), sealed()));
    const judge = ctx('judge', 'uid-judge');
    await assertFails(updateDoc(doc(judge, resultPath('r-judge')), { status: 'published', uploaderUid: 'uid-judge' }));
  });
});
