import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * ربط هوية الرافع في قواعد فايرستور.
 *
 * العلة الأصلية: القواعد كانت تقارن حقول النطاق المحلية (actorId، judgeId، participantId —
 * معرّفات سجلّ ميزان usr-...) بـ request.auth.uid (معرّف فايربيس). المقارنة لا تصحّ لأي حساب
 * على الإطلاق، فكان رفع سجل التدقيق مرفوضًا لكل الأدوار، وشريط «الصلاحية الحالية لا تسمح»
 * يظهر ويختفي مع كل حفظ ناجح لمجموعة أخرى.
 *
 * العقد الآن: العميل يختم كل مستند مرفوع بـ uploaderUid = uid المصادقة، والقواعد تقارن هذا
 * الحقل وحده بـ request.auth.uid. هذه الاختبارات تُشتقّ من الملفين لا تُنسخ باليد.
 */

const rules = fs.readFileSync('firestore.rules', 'utf8');
const store = fs.readFileSync('src/lib/store.ts', 'utf8');

test('rules never compare a domain-id field to request.auth.uid', () => {
  // أي سطر يقارن auth.uid بحقل بيانات يجب أن يكون الحقل uploaderUid حصرًا.
  const comparisons = rules.match(/data\.(\w+) == request\.auth\.uid/g) || [];
  assert.ok(comparisons.length > 0);
  for (const c of comparisons) assert.ok(c.includes('data.uploaderUid'), c);
});

test('the client stamps uploaderUid on every scoped upload', () => {
  // الختم داخل persistScopedDocument نفسه بجانب organizationId/competitionId/updatedAt.
  assert.match(store, /uploaderUid:auth\.currentUser\.uid/);
});

test('audit create binds the uploader, and audit stays append-only', () => {
  const start = rules.indexOf('match /audit/');
  assert.ok(start > -1);
  const audit = rules.slice(start); // آخر مجموعة فرعية في الملف
  assert.ok(audit.includes('request.resource.data.uploaderUid == request.auth.uid'));
  assert.ok(audit.includes('allow update, delete: if false'));
});

test('judges may update their own submission (client rewrites the same doc id on commit)', () => {
  const block = rules.slice(rules.indexOf('match /judge_submissions/'), rules.indexOf('match /checkins/'));
  /*
   * صار الشرط مسبوقًا بـ`present()` — حارسُ وجود الوثيقة، حتى لا يكون المنع عند العدم
   * رفضًا عَرَضيًّا بخطأ تقييم (انظر tests/firestore-rules-explicit-deny.test.ts).
   * وعقد الصلاحيات لم يتغيّر: المحكّم يحدّث ورقته هو وحدها، وهو ما يُفحص هنا.
   */
  assert.match(block, /allow update: if (present\(\) && )?writeScope[\s\S]*resource\.data\.uploaderUid == request\.auth\.uid/);
  assert.ok(block.includes('allow delete: if false'));
});

test('committees delete is allowed for the same writers the client uses', () => {
  // العميل ينادي deleteScopedDocument('committees'، ...) فعلاً — قاعدة delete:false كانت تُظهر شريط فشل عند كل حذف.
  assert.ok(store.includes("deleteScopedDocument('committees'"));
  const block = rules.slice(rules.indexOf('match /committees/'), rules.indexOf('match /appeals/'));
  assert.match(block, /allow delete: if writeScope/);
});

test('support_agent can create support sessions as the client write-map allows', () => {
  const block = rules.slice(rules.indexOf('match /support_sessions/'), rules.indexOf('match /session_checkpoints/'));
  const createLine = block.split('\n').find((l) => l.includes('allow create'));
  assert.ok(createLine && createLine.includes("'support_agent'"));
});

test('claims carry every active competition and rules accept membership in the list', () => {
  const bridge = fs.readFileSync('server/firebase-claims.ts', 'utf8');
  const governance = fs.readFileSync('server/identity-governance.ts', 'utf8');
  // السجلّ يجمع كل مسابقات التخويلات الفعّالة، لا مسابقة التخويل الأعلى وحدها.
  assert.match(governance, /competitionIds=\[\.\.\.new Set\(grants/);
  // الجسر يكتب القائمة ويمسحها بـnull عند السحب.
  assert.match(bridge, /competition_ids: claims\.competition_ids\?\.length \? claims\.competition_ids : null/);
  assert.match(bridge, /competition_id: null, competition_ids: null/);
  // والقواعد تقرأ الاسم نفسه الذي يكتبه الجسر — عضويةً في القائمة.
  assert.match(rules, /'competition_ids' in request\.auth\.token/);
  assert.match(rules, /competitionId in request\.auth\.token\.competition_ids/);
});

test('a filer may re-sync their own appeal (participant/guardian/support_agent update)', () => {
  const block = rules.slice(rules.indexOf('match /appeals/'), rules.indexOf('match /support_sessions/'));
  assert.match(block, /allow update:[\s\S]*roleIs\(\['participant','guardian','support_agent'\]\)[\s\S]*resource\.data\.uploaderUid == request\.auth\.uid[\s\S]*request\.resource\.data\.uploaderUid == request\.auth\.uid/);
});
