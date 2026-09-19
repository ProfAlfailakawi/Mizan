/*
 * البوّابتان اللتان تحتاجان أسرارًا — تُشغَّلان حيث توجد الأسرار.
 *
 * `preflight` و`quran:verify-r2` لا تعملان على جهاز التطوير، فكانتا تُسجَّلان في كلّ
 * تقرير «محجوبة بإعداد خارجي». وهي حقيقة — لكنّها تبقى حقيقةً إلى الأبد ما لم يُشغَّل
 * شيءٌ حيث توجد الأسرار. فصار لهما سيرُ عملٍ يُشغّلهما في CI.
 *
 * وخطران في هذا الملفّ تحديدًا، ولكلٍّ اختبار:
 *
 *   · **تسريبُ سرّ**: سطرٌ يطبع القيمة للتشخيص يضعها في سجلٍّ عامّ إلى الأبد.
 *   · **إحمرارٌ بلا ذنب**: إفشالُ الدفعة لغياب سرّ يمنع مساهمًا من فرعٍ خارجيّ لا
 *     يملكه — فيصير الحارسُ عائقًا لمن لا شأن له به.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const WORKFLOW_PATH = path.join(process.cwd(), '.github', 'workflows', 'release-gates.yml');
const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');

test('the workflow exists and runs both secret-backed gates', () => {
  assert.ok(workflow.includes('npm run preflight'), 'preflight must run here');
  assert.ok(workflow.includes('npm run quran:verify-r2 -- --all --deep'),
    'R2 verification must be deep — a package present with different bytes passes a shallow check');
});

test('signing secrets are sourced from the Cloud Run deployment contract without copying values to GitHub', () => {
  for (const name of ['MIZAN_PASS_SIGNING_SECRET', 'MIZAN_CERT_SIGNING_SECRET']) {
    assert.ok(workflow.includes(`cloudbuild-substitution.mjs --secret "$name"`),
      `${name} binding must be read from cloudbuild.yaml`);
  }
  assert.ok(workflow.includes('configured-via-secret-manager'),
    'preflight receives only a non-secret presence marker after the binding is verified');
  assert.equal(/secrets\.MIZAN_(PASS|CERT)_SIGNING_SECRET/.test(workflow), false,
    'signing secret material must not be duplicated into GitHub Actions secrets');
});

test('no secret value is ever printed, not even its length or first characters', () => {
  /*
   * سجلُّ الدفعة عامّ ويبقى. وطبعُ القيمة «للتشخيص» مرّةً واحدة يكفي لنشرها، ولا
   * تُسحب بعدها. والمطبوعُ هنا اسمٌ وحضورٌ أو غياب، لا أكثر.
   */
  for (const leak of [/echo\s+"?\$\{?\s*secrets\./, /echo[^\n]*\$\{!name\}/, /\$\{#[A-Z_]+\}/, /head -c/, /cut -c/]) {
    assert.equal(leak.test(workflow), false, `a step may leak a secret value: ${leak}`);
  }
  // ما يُطبع هو أسماءُ الناقص فقط.
  assert.ok(workflow.includes('${missing[*]}'), 'the skip message names what is missing');
});

test('a missing secret skips the gate — it never fails the run', () => {
  /*
   * مساهمٌ من فرعٍ خارجيّ لا يملك أسرارَ المستودع. وإحمرارُ دفعته لغيابها يمنعه من
   * المساهمة بلا ذنب، ويُعلّم الفريقَ تجاهلَ الأحمر — وهو أسوأ ما يُصنع ببوّابة.
   */
  const guards = (workflow.match(/if \(\( \$\{#missing\[@\]\} \)\); then/g) || []).length;
  assert.ok(guards >= 3, 'each secret-reading step guards on what is missing');
  // لكلّ حارسٍ مخرجٌ نظيف، ولا مخرجَ نظيفٌ بلا حارس — فالعدّان متساويان لا رقمًا سحريًّا.
  assert.equal((workflow.match(/exit 0/g) || []).length, guards, 'every guard must skip cleanly when unset');
  assert.equal(/exit 1/.test(workflow), false, 'a missing secret must never be turned into a failure');
});

test('when the secrets are present the gate really runs, and its failure is the run failure', () => {
  // `set -uo pipefail` بلا `-e`: التخطّي يخرج صفرًا، وفشلُ الأمر الأخير هو فشلُ الخطوة.
  assert.ok(workflow.includes('set -uo pipefail'));
  // ولا `|| true` ولا `continue-on-error` يبتلع نتيجة بوّابة.
  assert.equal(/continue-on-error/.test(workflow), false, 'a gate result must not be swallowed');
  assert.equal(/npm run (preflight|quran:verify-r2)[^\n]*\|\| true/.test(workflow), false,
    'a gate must not be run with its result discarded');
});

test('the secret names match the ones the product documents', () => {
  /*
   * اسمٌ في سير العمل يخالف اسمًا في المثال يعني سرًّا مضبوطًا لا يصل، والبوّابة تُتخطّى
   * إلى الأبد وهي تبدو مضبوطة.
   */
  const example = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
  const documented = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(m => m[1]));
  const used = new Set([...workflow.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1]));
  const undocumented = [...used].filter(name => !documented.has(name)).sort();
  assert.deepEqual(undocumented, [], 'these secrets are read by CI but the example never mentions them');
  // والحزمتان المقصودتان حاضرتان بالفعل.
  for (const required of ['VITE_REQUIRE_AUTH', 'R2_ENDPOINT', 'R2_SECRET_ACCESS_KEY', 'MIZAN_LEGAL_TERMS_URL']) {
    assert.ok(used.has(required), `${required} must be wired into the gate run`);
  }
});

test('a check no commit can satisfy is not stamped on commits', () => {
  /*
   * موضوعُ هاتين البوّابتين حالةُ التخزين والبيئة، لا فرقُ الدفعة. ولا تغييرَ في شيفرة
   * دفعةٍ — ولا في دمجةٍ على `main` — يجعلهما خضراوين ما دامت الشجرةُ على R2 بلا كتالوج
   * تحقّق، والوثيقتان غيرَ منشورتين.
   *
   * وقد أُصلح هذا مرّتين. أُزيل `pull_request` أوّلًا بهذه الحجّة نفسها، ثم بقي
   * `push: [main]` — وهو الحجّةُ نفسُها مرفوعةً درجة: كلُّ دمجةٍ تحمل علامةً حمراء عن
   * حالةٍ لا تملك تغييرَها. والعلامةُ التي تظهر دائمًا لا تُخبر عن شيء، ويعتاد الناسُ
   * تخطّيها، فتمرّ يومًا حمرةٌ حقيقية بينها بلا أن يلتفت أحد. ولم يُرَ ذلك حتى رآه
   * المالكُ أربع مرّات.
   *
   * فلا يبقى إلا ما يقيس موضوعَها فعلًا: الزمنُ والطلب.
   */
  assert.ok(/schedule:/.test(workflow) && /cron: '[^']+'/.test(workflow),
    'storage state changes from outside the repository, so time is what measures it');
  assert.ok(workflow.includes('workflow_dispatch:'), 'and it must be runnable on demand');
  /*
   * والدقيقةُ ليست صفرًا.
   *
   * أوّلُ موعدٍ مجدولٍ لهذه البوّابة بعد نقلها — 19 سبتمبر 2026 الساعة 04:00 UTC — لم
   * يُنشئ تشغيلًا أصلًا. وجدولةُ GitHub أفضلُ جهدٍ لا وعد: تتأخّر وتُسقَط عند الازدحام،
   * ورأسُ الساعة أزحمُ ما فيها. فالإزاحةُ عن الصفر تُنقص الاحتمال، ولا تُلغيه — ولذلك
   * يُشترط أن يذكرها دليلُ الإطلاق تشغيلًا يدويًّا أدناه.
   */
  const minute = /cron: '(\d+)/.exec(workflow)?.[1];
  assert.notEqual(minute, '0', 'the busiest minute on GitHub is the one a dropped schedule hides in');
  assert.equal(/^\s*pull_request:/m.test(workflow), false,
    'a check no diff can satisfy must not gate every diff');
  assert.equal(/^\s*push:/m.test(workflow), false,
    'nor stamp every merge — a merge cannot publish a catalog or a legal document either');
  assert.ok(workflow.includes('permissions:\n  contents: read'), 'it needs nothing but read');
});

test('moving it off pull requests did not disable it or make it optional', () => {
  /*
   * الفرقُ بين «نُقلت إلى موضعها» و«أُسكتت» يُقاس هنا لا يُوعد به: الوظيفةُ قائمة،
   * والأوامرُ تُشغَّل، ولا `continue-on-error` ولا `|| true` يبتلع نتيجة، ولا `exit 1`
   * مُحوَّلٌ إلى نجاح.
   */
  assert.ok(workflow.includes('secret-backed-gates:'), 'the job must still exist');
  assert.ok(workflow.includes('npm run preflight'), 'and still run the preflight gate');
  assert.ok(workflow.includes('npm run quran:verify-r2 -- --all --deep'), 'and still run the deep R2 verification');
  assert.equal(/continue-on-error/.test(workflow), false, 'its result must not be swallowed');
  assert.equal(/if: \$\{\{ false \}\}|if: false/.test(workflow), false, 'it must not be switched off by condition');
});

test('the gate code itself is still covered on every pull request', () => {
  /*
   * القسمةُ صحيحة فقط إن بقيت الشيفرةُ مفحوصةً على الدفعات: حالةُ التخزين تُفحص على
   * مسار الإصدار، والشيفرةُ التي تفحصها تُفحص مع كلّ تغيير.
   */
  for (const guard of ['quran-verify-r2-diagnosis.test.ts', 'r2-delivery-verification.test.ts']) {
    assert.ok(fs.existsSync(path.join(process.cwd(), 'tests', guard)),
      `${guard} must exist — it is what covers the gate's code on pull requests`);
  }
});

test('the R2 tree is inventoried before it is judged, and the inventory only reads', () => {
  /*
   * فشلُ `quran:verify-r2` لا يميّز بين ثلاثة: رفعٍ لم يجرِ، ومُرفِّعٍ لم يُبنَ، وتخطيطٍ
   * مهجورٍ شجرتُه الحيّة تحت مفتاحٍ آخر. والفرقُ بينها يقرّر عملًا مختلفًا تمامًا، فلا
   * يُترك للظنّ: يُسأل التخزينُ نفسه أوّلًا.
   */
  assert.ok(workflow.includes('npm run r2:inventory'), 'the inventory must run in the R2 group');
  assert.ok(workflow.indexOf('npm run r2:inventory') < workflow.indexOf('npm run quran:verify-r2'),
    'the inventory comes before the verdict — a diagnosis printed after the failure is read last, or not at all');

  const script = fs.readFileSync(path.join(process.cwd(), 'scripts', 'r2-inventory.ts'), 'utf8');
  for (const mutation of ['putObject', 'deleteObject', 'copyObject']) {
    assert.equal(script.includes(mutation), false,
      `the inventory is a diagnosis, not a change: it must never call ${mutation}`);
  }
  // ولا يطبع اسمَ الدلو ولا نقطةَ النهاية — وكلاهما سرٌّ مضبوط.
  assert.equal(/console\.(log|error)\([^\n]*cfg\.(bucket|endpoint|accessKeyId|secretAccessKey)/.test(script), false,
    'the inventory must not print the bucket, the endpoint, or a key');
  assert.ok(script.includes("EXPECTED_PREFIXES"),
    'an empty prefix must be reported by name — otherwise "nothing there" is indistinguishable from "not looked at"');
});

test('the verify step still runs even when the inventory step fails', () => {
  // الجردُ قبل الحكم؛ ولو انقطع الجرد فالحكمُ هو البوّابة، فلا يُلغى بانقطاعه.
  const verifyStep = workflow.slice(workflow.indexOf('التحقّق من حزم القرآن على R2'));
  assert.ok(verifyStep.includes('if: always()'),
    'the gate must not be skipped because a diagnostic step before it failed');
});

test('the launch runbook does not let a release depend on a schedule that may not fire', () => {
  /*
   * بوّابةٌ لا تعمل ولا يشكو أحد أسوأُ من بوّابةٍ حمراء: الحمراءُ تُقرأ، والصامتةُ
   * تُحسب خضراء. وقد وقع هذا: `docs/GO-LIVE.md` لم يكن يذكر هذه البوّابة أصلًا، فلو
   * سقط جدولُها شهرًا لَما لاحظ أحد.
   *
   * فالدليلُ يذكرها بالاسم، ويأمر بتشغيلها يدويًّا وقراءةِ سببِ حمرتها لا لونِها.
   */
  const runbook = fs.readFileSync(path.join(process.cwd(), 'docs', 'GO-LIVE.md'), 'utf8');
  assert.ok(runbook.includes('release-gates.yml'), 'the runbook must name the gate a release depends on');
  assert.ok(/workflow run release-gates\.yml|Run workflow/.test(runbook),
    'and say how to run it on demand, because the schedule is best-effort');
});
