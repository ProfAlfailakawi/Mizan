/*
 * بابُ المتسابق الأماميّ صار يُفحص في متصفّح — على خادمٍ حقيقيٍّ ومحاكي Firestore.
 *
 * كان قسمُ التسجيل في `qa:scope-visual` يُتخطّى باسمه، لأن الرابط العامّ **يُعيد الجلبَ
 * من الخادم دائمًا ولا يقبل نسخةَ المتصفّح**. وذلك مقصودٌ ومكتوبٌ في `src/App.tsx`: وإلّا
 * عُرضت الصفحةُ كاملةً على جهاز الإدارة وحده، فيختبرها المسؤولُ فتنجح، ويفتحها المتسابقُ
 * فلا يجد شيئًا. فالتخطّي كان صادقًا — وكان يترك أوّلَ شاشةٍ يراها متسابقٌ بلا فحص.
 *
 * وحين شُغِّل فعلًا، كشف ثلاثةَ أشياء كان التخطّي يستُرها، ولا واحدَ منها عطلٌ في المنتج:
 *
 *   · النموذجُ يمنع المتابعة بحقلٍ مطلوبٍ فارغ — والفحصُ لم يكن يملأ تاريخ الميلاد.
 *   · الفئةُ لا تكفي: **الروايةُ تُختار صراحةً** قبل المتابعة — والفحصُ لم يكن يختارها.
 *   · خطوةُ اختيار النطاق لم تعد في التسجيل أصلًا، فقد أُزيلت بقرار المالك.
 *
 * وحارسان هنا: أن الزرعَ لا يلمس Firestore حقيقيًّا، وأنه لا يزرع كيانًا يرفضه الخادمُ
 * العامُّ أصلًا — فيقيس الفحصُ رفضًا لا صفحة.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { firestoreAccessToken } from '../server/firestore-rest';

const seed = fs.readFileSync(path.join(process.cwd(), 'scripts', 'seed-public-competition.ts'), 'utf8');
const runner = fs.readFileSync(path.join(process.cwd(), 'scripts', 'qa-public-registration.sh'), 'utf8');
const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

test('the seeder refuses to run without an emulator, rather than trying and failing', () => {
  /*
   * سكربتُ زرعٍ يُجرَّب في بيئةٍ فيها اعتمادُ إنتاج يكتب في سجلّ مسابقاتٍ حقيقيّ. فالرفضُ
   * قبل المحاولة، لا رسالةُ خطأٍ بعدها.
   */
  assert.throws(
    () => execFileSync('node', ['--import', 'tsx', 'scripts/seed-public-competition.ts'],
      { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '' }, stdio: 'pipe' }),
    /Command failed|status 2/);
  assert.ok(seed.includes('SEED_REFUSED_WITHOUT_EMULATOR'), 'and it refuses by name');
});

test('the seeded competition is not one the public server refuses to serve', () => {
  /*
   * `server.ts` يرفض `comp-dubai-2027` وجهتَها `org-gqa-global` صراحةً: بياناتُ العرض لا
   * تُخدَم على الرابط العامّ. وزرعُ أحدهما يجعل الفحصَ يقيس ذلك الرفضَ ويسمّيه عطلًا في
   * الواجهة — أو، أسوأ، يُغري بإضعاف الحارس.
   */
  const retired = /RETIRED_SEED_COMPETITION_IDS=new Set\(\['([^']+)'\]\)/.exec(server)?.[1];
  const retiredOrg = /RETIRED_SEED_ORGANIZATION_IDS=new Set\(\['([^']+)'\]\)/.exec(server)?.[1];
  assert.ok(retired && retiredOrg, 'the public server must still refuse the demo entities');
  assert.equal(seed.includes(`'${retired}'`), false, `the seeder must not plant ${retired}`);
  assert.equal(seed.includes(`'${retiredOrg}'`), false, `nor ${retiredOrg}`);
  assert.ok(seed.includes("'comp-qa-surface'") && seed.includes("'org-qa-surface'"),
    'it plants an entity of its own, named as the QA surface');
});

test('the run proves the seed reached the server before it opens a browser', () => {
  /*
   * وإلّا قُرئ زرعٌ فاشلٌ «واجهةً لا تعمل»، وأُنفق الوقتُ في الشاشة والعطلُ في البيانات.
   */
  assert.ok(runner.includes('/api/public/competitions/'), 'it asks the server for the competition first');
  assert.ok(runner.includes('PUBLIC_COMPETITION_NOT_SERVED'), 'and fails by name when it is not served');
  assert.ok(runner.includes('SERVER_DID_NOT_START'), 'and names a server that never answered');
  // والانتظارُ بالاستجابة لا بعددِ ثوانٍ ثابت.
  assert.ok(/curl -fsS "\$\{BASE\}\/api\/health"/.test(runner), 'readiness is polled, not slept through');
});

test('the emulator convention is honoured for the token, not only for the address', async () => {
  /*
   * كان العنوانُ وحده يحترم `FIRESTORE_EMULATOR_HOST`، والرمزُ يُطلب من الاعتماد
   * الافتراضيّ على كلّ حال — فيسقط الطلبُ قبل أن يُرسَل حيث لا سحابة، وهو الحالُ الذي
   * فُتح الاصطلاحُ من أجله.
   */
  assert.equal(await firestoreAccessToken('127.0.0.1:8080'), 'owner');
  // ولا يُهبَط إلى رمزٍ صوريٍّ صدفةً: غيابُ المتغيّر يعني السحابة، فيُطلب رمزٌ حقيقيّ.
  const adapter = fs.readFileSync(path.join(process.cwd(), 'server', 'firestore-rest.ts'), 'utf8');
  assert.ok(/return emulatorHost\?'owner':googleAccessToken\(\)/.test(adapter),
    'without an emulator host it must ask for a real credential');
});

test('the registration gate drives the rule the product actually enforces', () => {
  /*
   * لا تقدُّمَ برواية ضمنيّة — وهي قاعدةٌ محروسةٌ في
   * `tests/user-notes-2026-09-14-regression.test.ts`. والفحصُ يختارها بدلالة `aria-pressed`
   * لا بنصٍّ يُترجَم ويُصاغ.
   */
  const gate = fs.readFileSync(path.join(process.cwd(), 'scripts', 'scope-visual-qa.mjs'), 'utf8');
  assert.ok(gate.includes("button[aria-pressed]:visible"), 'the reading is chosen through its toggle semantics');
  assert.ok(gate.includes("aria-pressed') !== 'true'"), 'and the choice is confirmed, not assumed');
  // وما أُزيل يبقى مُزالًا: منتقي النطاق لا يعود إلى التسجيل.
  assert.ok(gate.includes('registration-juz-1'), 'the gate still watches for the removed picker');
  assert.ok(/عادت إلى التسجيل بعد أن أُزيل/.test(gate), 'and says so if it returns');
});
