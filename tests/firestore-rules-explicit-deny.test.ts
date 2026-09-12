import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, type Firestore } from 'firebase/firestore';

/*
 * المنع منصوصًا لا عَرَضًا.
 *
 * كانت قواعدُ عدّةٌ تقرأ `resource.data` في شرطها. وحين لا توجد الوثيقة يكون `resource`
 * عدمًا، فتُقرأ `resource.data` منه فيقع خطأُ تقييم، وترفض المنصة عند الخطأ. فالنتيجة
 * رفضٌ — لكنه رفضٌ عارض لا منصوص.
 *
 * والفرق ليس فلسفيًا. قاعدةٌ تعتمد في منعها على أن تنكسر تنكسر معها ثلاثة أشياء:
 * إذا أُعيد ترتيب الشروط، أو أُضيف شرطٌ يسبقها فيقصّر التقييم قبل بلوغها، أو تغيّرت دلالة
 * خطأ التقييم في نسخةٍ قادمة من المنصة. وثلاثتها تقع بلا أن ينتبه أحد، لأن الفحوص كلها
 * تمرّ: الرفض واقعٌ في الحالين.
 *
 * فهذا الملف يثبّت **الصياغة** لا النتيجة وحدها: وثيقةٌ معدومة ⇒ منعٌ بشرطٍ مكتوب، وكل
 * قاعدةٍ تقرأ `resource.data` يسبقها `present()`. ويُفحص ذلك نصًّا أيضًا كي لا تنسلّ قاعدةٌ
 * جديدة بلا حارس.
 *
 * وعقد الصلاحيات لم يتغيّر: الوثيقة الموجودة تُحكم بما كانت تُحكم به حرفًا بحرف — وهذا
 * أيضًا مفحوصٌ أدناه.
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
/*
 * فضاءُ أسماءٍ خاصّ بهذا الملف.
 *
 * ملفات فحص القواعد تتشارك محاكيًا واحدًا ولا يمسح أحدها ما كتبه الآخر. فلو زرع هذا الملف
 * وثيقةً في مسارٍ يستعمله غيره لصار الفحص الآخر يرى وثيقةً موجودة حيث يتوقّع العدم، فينقلب
 * إنشاؤه تحديثًا ويسقط — سقوطًا سببه ترتيبُ التشغيل لا القواعد. ولذلك يُفرد هذا الملف
 * مستأجرَه ومسابقتَه ومعرّفاتِه.
 */
const ORG = 'org-deny', COMP = 'comp-deny', OTHER_ORG = 'org-deny-b', OTHER_COMP = 'comp-deny-b';

let env: RulesTestEnvironment | null = null;
const ctx = (role: string, uid: string, org = ORG, comp = COMP) =>
  env!.authenticatedContext(uid, { role, org_id: org, competition_id: comp }).firestore() as unknown as Firestore;

const JOURNEY = 'hash-deny-1';
const scopePath = (org = ORG, comp = COMP, id = 'pscope-deny') => `organizations/${org}/competitions/${comp}/participant_scopes/${id}`;
const appealPath = (id = 'appeal-deny') => `organizations/${ORG}/competitions/${COMP}/appeals/${id}`;
const submissionPath = (id = 'sub-deny') => `organizations/${ORG}/competitions/${COMP}/judge_submissions/${id}`;

test('كلُّ قاعدةٍ تقرأ resource.data يسبقها حارسٌ منصوص — فحصٌ نصّي لا يحتاج محاكيًا', () => {
  const source = fs.readFileSync('firestore.rules', 'utf8');
  assert.ok(source.includes('function present()'), 'حارس الوجود غير معرَّف');

  const unguarded: string[] = [];
  const lines = source.split('\n');
  let buffer = '', startLine = 0, inRule = false;
  lines.forEach((line, index) => {
    if (/allow\s+(get|read|list|update|delete)/.test(line)) { inRule = true; buffer = ''; startLine = index + 1; }
    if (!inRule) return;
    buffer += ` ${line}`;
    if (!/;\s*$/.test(line)) return;
    inRule = false;
    // `request.resource.data` هو المُدخل الجديد ولا علاقة له بوجود الوثيقة.
    const readsExisting = /(^|[^.\w])resource\.data/.test(buffer.replace(/request\.resource\.data/g, 'REQ'));
    if (readsExisting && !buffer.includes('present()')) unguarded.push(`سطر ${startLine}: ${buffer.trim().slice(0, 120)}`);
  });
  assert.deepEqual(unguarded, [], `قواعد تقرأ resource.data بلا حارس وجود:\n${unguarded.join('\n')}`);
});

test('المنع المنصوص على المحاكي', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({
    projectId: 'mizan-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) },
  });
  t.after(async () => { await env?.cleanup(); });

  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore() as unknown as Firestore;
    for (const [org, comp] of [[ORG, COMP], [OTHER_ORG, OTHER_COMP]]) {
      await setDoc(doc(db, `organizations/${org}/competitions/${comp}`), { competition: { id: comp, status: 'active' } });
    }
    await setDoc(doc(db, `public_competitions/${COMP}`), { organizationId: ORG, competition: { id: COMP, status: 'active' } });
    await setDoc(doc(db, `public_boards/${COMP}`), { organizationId: ORG, board: { competitionId: COMP, privacyMode: 'CODES_ONLY' } });
    await setDoc(doc(db, `public_journeys/${JOURNEY}`), { organizationId: ORG, competitionId: COMP, revoked: false });
    await setDoc(doc(db, appealPath()), { organizationId: ORG, competitionId: COMP, uploaderUid: 'uid-owner' });
    await setDoc(doc(db, submissionPath()), { organizationId: ORG, competitionId: COMP, uploaderUid: 'uid-judge' });
    await setDoc(doc(db, scopePath()), { organizationId: ORG, competitionId: COMP, uploaderUid: 'uid-part', status: 'submitted' });
  });

  await t.test('وثيقةٌ معدومة: قراءةٌ وتحديثٌ وحذفٌ كلُّها ممنوعة', async () => {
    const admin = ctx('org_admin', 'uid-admin');
    const owner = ctx('participant', 'uid-part');
    const judge = ctx('judge', 'uid-judge');

    await assertFails(getDoc(doc(admin, `public_journeys/${COMP}-missing`)));
    await assertFails(deleteDoc(doc(admin, `public_competitions/${COMP}-missing`)));
    await assertFails(deleteDoc(doc(admin, `public_boards/${COMP}-missing`)));
    await assertFails(updateDoc(doc(owner, scopePath(ORG, COMP, 'missing')), { status: 'approved' }));
    await assertFails(getDoc(doc(owner, appealPath('missing'))));
    await assertFails(getDoc(doc(judge, submissionPath('missing'))));
  });

  await t.test('مستأجرٌ آخر: ممنوع ولو كانت الوثيقة موجودة', async () => {
    const stranger = ctx('org_admin', 'uid-stranger', OTHER_ORG, OTHER_COMP);
    await assertFails(getDoc(doc(stranger, `public_journeys/${JOURNEY}`)));
    await assertFails(deleteDoc(doc(stranger, `public_boards/${COMP}`)));
  });

  await t.test('مسابقةٌ أخرى: ممنوع', async () => {
    const wrongComp = ctx('head_judge', 'uid-hj', ORG, OTHER_COMP);
    await assertFails(getDoc(doc(wrongComp, `public_journeys/${JOURNEY}`)));
    await assertFails(getDoc(doc(wrongComp, appealPath())));
  });

  await t.test('فاعلٌ آخر: صاحب الوثيقة وحده، لا كل من حمل الدور', async () => {
    const otherParticipant = ctx('participant', 'uid-other');
    await assertFails(getDoc(doc(otherParticipant, appealPath())));
    await assertFails(updateDoc(doc(otherParticipant, scopePath()), { status: 'approved' }));
    const otherJudge = ctx('judge', 'uid-other-judge');
    await assertFails(getDoc(doc(otherJudge, submissionPath())));
  });

  await t.test('ادّعاءٌ مشوَّه: بلا دور، أو بلا مسابقة، أو بدورٍ غير معروف', async () => {
    const noRole = env!.authenticatedContext('uid-x', { org_id: ORG, competition_id: COMP }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(noRole, `public_journeys/${JOURNEY}`)));

    const noCompetition = env!.authenticatedContext('uid-y', { role: 'head_judge', org_id: ORG }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(noCompetition, `public_journeys/${JOURNEY}`)));

    const madeUpRole = env!.authenticatedContext('uid-z', { role: 'grand_overseer', org_id: ORG, competition_id: COMP }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(madeUpRole, `public_journeys/${JOURNEY}`)));
    await assertFails(getDoc(doc(madeUpRole, appealPath())));
  });

  await t.test('وعقد الصلاحيات لم يتغيّر: صاحب الحقّ ما زال يمرّ على الوثيقة الموجودة', async () => {
    await assertSucceeds(getDoc(doc(ctx('head_judge', 'uid-hj'), `public_journeys/${JOURNEY}`)));
    await assertSucceeds(getDoc(doc(ctx('participant', 'uid-owner'), appealPath())));
    await assertSucceeds(getDoc(doc(ctx('judge', 'uid-judge'), submissionPath())));
    await assertSucceeds(getDoc(doc(ctx('auditor', 'uid-audit'), scopePath())));
    // والقراءة العامة للشاشات تبقى عامة كما كانت — الحارس لم يغلق ما كان مفتوحًا عمدًا.
    await assertSucceeds(getDoc(doc(env!.unauthenticatedContext().firestore() as unknown as Firestore, `public_boards/${COMP}`)));
  });
});
