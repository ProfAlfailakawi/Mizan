import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';

/*
 * مدير الفرع (branch_admin): دورٌ على مستوى الجهة له إنشاء المسابقات وضبطها ومتسابقوها ولجانها وحضورها وجدولها —
 * ولا ختم ولا نشر ولا تحكيم ولا هويات (permissions.ts، SAAS_PLATFORM.md). كان غائبًا عن firestore.rules كلها:
 * يدخل فيرى جهةً فارغة ولا تُحفظ له كتابة. يُشغَّل على المحاكي: npm run qa:firestore-rules
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const ORG = 'org-branch', OTHER_ORG = 'org-branch-b', COMP = 'comp-branch-1', NEW_COMP = 'comp-branch-new';
const base = (org = ORG, comp = COMP) => `organizations/${org}/competitions/${comp}`;
let env: RulesTestEnvironment | null = null;
const branch = (org = ORG) => env!.authenticatedContext('uid-branch', { role: 'branch_admin', org_id: org }).firestore() as unknown as Firestore;
const asGod = (fn: (db: Firestore) => Promise<unknown>) => env!.withSecurityRulesDisabled(c => fn(c.firestore() as unknown as Firestore) as Promise<void>);
const competition = (id: string, org: string, status = 'draft') => ({ organizationId: org, competition: { id, organizationId: org, status } });

test('firestore rules: مدير الفرع', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({ projectId: 'mizan-rules-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) } });
  t.after(async () => { await env?.cleanup(); });
  await asGod(async db => {
    await setDoc(doc(db, base()), competition(COMP, ORG, 'registration_open'));
    await setDoc(doc(db, base(OTHER_ORG, 'comp-other')), competition('comp-other', OTHER_ORG, 'registration_open'));
    await setDoc(doc(db, `${base()}/participants/p1`), { organizationId: ORG, competitionId: COMP, status: 'approved' });
    await setDoc(doc(db, `${base()}/results/r1`), { organizationId: ORG, competitionId: COMP, status: 'sealed' });
    await setDoc(doc(db, `${base()}/certificates/c1`), { organizationId: ORG, competitionId: COMP });
    await setDoc(doc(db, `${base()}/reviews/rv1`), { organizationId: ORG, competitionId: COMP });
  });

  await t.test('يقرأ مسابقات جهته ويُنشئ مسابقة جديدة ويضبطها', async () => {
    await assertSucceeds(getDoc(doc(branch(), base())));
    await assertSucceeds(setDoc(doc(branch(), base(ORG, NEW_COMP)), competition(NEW_COMP, ORG)));
    await assertSucceeds(setDoc(doc(branch(), base(ORG, NEW_COMP)), competition(NEW_COMP, ORG, 'configured')));
  });

  await t.test('يكتشف كل مسابقات جهته بقائمةٍ واحدة (هكذا يبدأ دخوله) ولا يرى جهةً أخرى', async () => {
    const mine = await assertSucceeds(getDocs(collection(branch(), `organizations/${ORG}/competitions`)));
    assert.ok(mine.size >= 1);
    await assertFails(getDocs(collection(branch(), `organizations/${OTHER_ORG}/competitions`)));
  });

  await t.test('يدير المتسابقين واللجان والحضور والجدول', async () => {
    await assertSucceeds(getDoc(doc(branch(), `${base()}/participants/p1`)));
    await assertSucceeds(setDoc(doc(branch(), `${base()}/participants/p2`), { organizationId: ORG, competitionId: COMP, status: 'approved' }));
    await assertSucceeds(setDoc(doc(branch(), `${base()}/committees/c1`), { organizationId: ORG, competitionId: COMP, name: 'x' }));
    await assertSucceeds(setDoc(doc(branch(), `${base()}/checkins/p1`), { organizationId: ORG, competitionId: COMP }));
    await assertSucceeds(setDoc(doc(branch(), `${base()}/schedule_plans/s1`), { organizationId: ORG, competitionId: COMP }));
  });

  await t.test('لا يقرأ نتائج ولا شهادات ولا مراجعات التحكيم، ولا يكتبها', async () => {
    await assertFails(getDoc(doc(branch(), `${base()}/results/r1`)));
    await assertFails(getDoc(doc(branch(), `${base()}/certificates/c1`)));
    await assertFails(getDoc(doc(branch(), `${base()}/reviews/rv1`)));
    await assertFails(setDoc(doc(branch(), `${base()}/results/r2`), { organizationId: ORG, competitionId: COMP, status: 'sealed' }));
    await assertFails(setDoc(doc(branch(), `${base()}/certificates/c2`), { organizationId: ORG, competitionId: COMP }));
  });

  await t.test('لا يُغلق مسابقة ولا ينشرها للعموم', async () => {
    await assertFails(setDoc(doc(branch(), base()), competition(COMP, ORG, 'completed')));
    await assertFails(setDoc(doc(branch(), 'public_competitions/' + COMP), { organizationId: ORG, competition: { id: COMP, status: 'registration_open' } }));
  });

  await t.test('لا يتخطّى حدود جهته', async () => {
    await assertFails(getDoc(doc(branch(), base(OTHER_ORG, 'comp-other'))));
    await assertFails(setDoc(doc(branch(), base(OTHER_ORG, 'comp-new')), competition('comp-new', OTHER_ORG)));
    await assertFails(setDoc(doc(branch(OTHER_ORG), base()), competition(COMP, ORG)));
  });
});
