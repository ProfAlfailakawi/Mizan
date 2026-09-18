/*
 * بوّابةٌ تنتظر سكونَ الشبكة تنتظر ما لا يعنيها.
 *
 * `qa:public-registration` سقط على عدّاء CI مرّتين — سطحُ المكتب والهاتف — برسالةٍ
 * واحدة: `page.goto: Timeout 30000ms exceeded ... waiting until "networkidle"` على
 * `#register`. وفي التشغيل نفسه مرّت بقيةُ الصفحات، وهنا يمرّ القسم كلُّه.
 *
 * و`networkidle` شرطٌ على الشبكة لا على الصفحة: «مضت نصفُ ثانيةٍ بلا طلبٍ معلّق». فهي
 * تُعلّق البوّابة بكلّ ما تلمسه الصفحةُ ممّا لا يعنيها — عاملُ خدمةٍ يُهيّئ مخزونَه،
 * أو خطٌّ يُجلب، أو نداءٌ خارجيّ يُحجب فيبقى معلّقًا حتى مهلته. أيُّ واحدٍ يُسقط
 * الفحصَ والصفحةُ سليمة، والرسالةُ «انتهت المهلة» لا تدلّ على شيء.
 *
 * والأسوأُ أنها تمرّ حيث لا يهمّ وتسقط حيث يهمّ: بوّابةٌ خضراء على جهاز من كتبها،
 * حمراء على العدّاء — فتُقرأ تقلّبًا ويُعتاد إعادةُ التشغيل حتى تخضرّ. وهي العادةُ
 * التي وُجدت كلُّ بوّابةٍ في هذا المستودع لمنعها.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
/** التعليقاتُ تُنزع: حارسٌ يطابق شرحَ العطل يمرّ وإن عاد العطلُ نفسه. */
const codeOf = (file: string) =>
  fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** كلُّ بوّابةٍ تقود متصفّحًا. تُشتقّ من `package.json` لا تُعاد كتابتها هنا. */
function browserGates(): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const files = new Set<string>();
  for (const [name, command] of Object.entries(pkg.scripts)) {
    if (!name.startsWith('qa:')) continue;
    for (const m of command.matchAll(/(scripts\/[\w.-]+\.mjs)/g)) files.add(m[1]);
  }
  for (const file of fs.readdirSync(path.join(ROOT, 'scripts'))) {
    if (!file.endsWith('.mjs')) continue;
    const source = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
    if (/from 'playwright'|require\('playwright'\)/.test(source)) files.add(`scripts/${file}`);
  }
  return [...files].sort();
}

test('the scan actually finds the browser gates — an empty list proves nothing', () => {
  const gates = browserGates();
  assert.ok(gates.length >= 2, `expected the browser gates, found ${gates.length}`);
  assert.ok(gates.includes('scripts/scope-visual-qa.mjs'), 'the gate that failed must be in scope');
});

test('no browser gate waits on network silence', () => {
  const offenders = browserGates().filter(file => /networkidle/.test(codeOf(file)));
  assert.deepEqual(offenders, [],
    'these wait for the network to go quiet instead of for the page to be usable');
});

test('the registration gate waits for the form itself, and names what is missing', () => {
  const code = codeOf('scripts/scope-visual-qa.mjs');
  assert.match(code, /await page\.goto\(url, \{ waitUntil: 'domcontentloaded' \}\)/,
    'navigation must not block on unrelated traffic');
  assert.match(code, /waitFor\(\{ state: 'visible', timeout \}\)/,
    'readiness is an element being visible, not a quiet network');
  assert.match(code, /openPage\(page, `\$\{BASE\}\/#register\?comp=\$\{COMP\}`,\s*'label:has-text\("الاسم بالعربية"\)'/,
    'the registration gate must wait for the first field it is about to fill');
  // ولا يُبتلع الإخفاق: يُسمّى ما لم يظهر، ويُعدّ ملاحظةً تُسقط البوّابة.
  assert.match(code, /note\(`\[\$\{label\}\] الصفحة فُتحت ولم يظهر \$\{what\}`\)/,
    'a page that never became usable must say what never appeared');
});

test('"the server did not serve it" is told apart from "the form did not render"', () => {
  /*
   * تشخيصان مختلفان يستدعيان عملين مختلفين: الأوّل خللٌ في الزرع أو في الخادم،
   * والثاني خللٌ في الصفحة. وخلطُهما يُرسل من يقرأ إلى غير العطل.
   */
  const code = codeOf('scripts/scope-visual-qa.mjs');
  assert.match(code, /لم نعثر على المسابقة\|CompetitionNotFound/,
    'the not-found page must be recognised');
  assert.match(code, /الخادم لم يخدم المسابقة المزروعة/,
    'and reported as its own diagnosis');
});

test('nothing was loosened to get green', () => {
  const code = codeOf('scripts/scope-visual-qa.mjs');
  // الملاحظاتُ ما زالت تُسقط البوّابة، ولم تتحوّل إلى طباعةٍ تُقرأ وتُنسى.
  assert.match(code, /process\.exitCode = problems\.length \? 1 : 0/,
    'findings must still fail the run');
  assert.equal(/\|\|\s*true/.test(code), false, 'no failure may be turned into a pass');
  assert.equal(/\.skip\(|xit\(|xdescribe\(/.test(code), false, 'no section may be skipped to pass');
});
