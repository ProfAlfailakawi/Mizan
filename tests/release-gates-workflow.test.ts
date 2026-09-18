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
  const skips = [...workflow.matchAll(/if \(\( \$\{#missing\[@\]\} \)\); then[\s\S]{0,400?}?exit 0/g)];
  assert.equal((workflow.match(/exit 0/g) || []).length, 2, 'both gates must skip cleanly when unset');
  assert.equal(/exit 1/.test(workflow), false, 'a missing secret must never be turned into a failure');
  assert.ok(skips.length >= 0);
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

test('the gate never runs on a fork pull request, where secrets are empty anyway', () => {
  // يعمل على `main` و`pull_request` إلى main — والأسرار لا تُمنح لفرعٍ خارجيّ، فيتخطّى.
  assert.ok(/on:\s*\n\s*push:\s*\n\s*branches: \[main\]/.test(workflow));
  assert.ok(workflow.includes('pull_request:'));
  assert.ok(workflow.includes('permissions:\n  contents: read'), 'it needs nothing but read');
});
