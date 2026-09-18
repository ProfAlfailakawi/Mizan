/*
 * «لم تُوجد حزمة» ليست «لم تُفتح صفحة».
 *
 * أوّلُ تشغيلٍ حقيقيّ لسير الاستيعاب ردّ أحدَ عشر سطرًا متطابقًا:
 *
 *   {"id":"font-hafs","status":"REQUIRED_NOT_ACQUIRED","attempts":[],"candidates":[]}
 *
 * ثم حكم: `REQUIRED_OFFICIAL_ASSETS_NOT_ACQUIRED`. والحكمُ يُرسل المسؤولَ يبحث عن روابطِ
 * تنزيلٍ انتقلت — والحقيقةُ أن صفحةَ المجمَّع لم تُفتح من ذلك العدّاء أصلًا، فلم يكن
 * هناك ما يُبحث فيه. صفرُ محاولات، وصفرُ مرشّحين: لا لأن شيئًا لم يُطابق، بل لأن شيئًا
 * لم يُقرأ.
 *
 * وسببُه سطرٌ واحد: `catch{continue}` — كلُّ صفحةٍ تتعذّر تُطرح بلا أثر، فيُقرأ صمتُها
 * «لا حزمةَ هنا».
 *
 * وهو الخلطُ نفسُه الذي أُصلح مرّتين قبلها: «حزمةٌ فاسدة» مقابل «حزمةٌ لم تُرفع»، و«بنكٌ
 * فارغ» مقابل «اختلافُ رواية». والفرقُ في كلّ مرّة هو مَن يُستدعى ولماذا.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = fs.readFileSync(path.join(process.cwd(), 'scripts', 'kfgqpc-heavy-acquire.ts'), 'utf8');
const CODE = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const WORKFLOW = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'kfgqpc-ingest.yml'), 'utf8');

test('a page that could not be read is no longer swallowed', () => {
  assert.equal(/getText\(url\)\}catch\s*\{\s*continue\s*\}/.test(CODE), false,
    'an empty catch here turns "the network refused" into "nothing matched"');
  assert.match(CODE, /pageFailures\.push\(\{url,reason:/,
    'every page that could not be read must record why, by its own message');
  /*
   * والـ`catch` الباقي في `links()` يبقى عمدًا: صفحةٌ رسميةٌ تحمل روابطَ إلى نطاقاتٍ
   * أخرى، وطرحُها هو قاعدةُ السلطة تعمل — لا عطلٌ يُبتلع. وتسجيلُها أعطالًا ضجيجٌ
   * يُغرق السببَ الحقيقيّ.
   */
  assert.match(CODE, /resolveOfficialKfgqpcUrl\(m\[1\],base\)\}catch\{continue\}/,
    'an off-domain link is still discarded by the authority rule, not reported as a fault');
});

test('"not one page opened" is its own verdict, not an absent package', () => {
  assert.match(CODE, /SOURCE_PAGES_UNREACHABLE/, 'the unreachable case needs its own code');
  assert.match(CODE, /pagesRead===0&&pageFailures\.length>0/,
    'it applies only when nothing was read at all — a page that opened and matched nothing is a different fact');
  // وصفحةٌ فُتحت ولم يُطابق فيها شيء تبقى على حكمها القديم.
  assert.match(CODE, /NO_OFFICIAL_CANDIDATE/, 'the "read it, found nothing" verdict must remain');
  assert.match(CODE, /REQUIRED_NOT_ACQUIRED/, 'and so must the required-but-absent one');
});

test('the summary line names which of the two happened', () => {
  assert.match(CODE, /KFGQPC_SOURCE_PAGES_UNREACHABLE:/,
    'the final error must say the source was never reached');
  assert.match(CODE, /unreachable\.length===results\.length/,
    'and only when that is true of every target');
  // ولا يُلخَّص السبب: يُذكر كما ردّته الشبكة (fetch failed · HTTP_403 · …).
  assert.match(CODE, /pageFailures\.map\(\(f:any\)=>f\.reason\)/,
    'the network’s own reasons must be printed, not a paraphrase');
  // والحالةُ المختلطة تُقال مختلطة: بعضُها لم تُفتح صفحتُه وبعضُها فُتحت ولم يُطابق.
  assert.match(CODE, /ومنها \$\{unreachable\.length\} لم تُفتح صفحتُها أصلًا/,
    'a partly-unreachable run must say how many of the failures are absences of access');
});

test('an unreachable source still fails the run — it is a blocker, not a note', () => {
  assert.match(CODE, /const blocked=results\.filter\(r=>!r\.optional&&\(r\.status==='REQUIRED_NOT_ACQUIRED'\|\|r\.status==='SOURCE_PAGES_UNREACHABLE'\)\)/,
    'a required asset whose source never opened must block');
  assert.match(CODE, /process\.exitCode=2/, 'and exit non-zero');
  // ولا يصير الاختياريُّ مانعًا: حالتُه تغيّرت، وأثرُه على الخروج لم يتغيّر.
  assert.match(CODE, /!r\.optional/, 'an optional dataset must not start blocking because its wording changed');
});

test('nothing was loosened: the authority rule and the checksum path are untouched', () => {
  /*
   * تشخيصٌ أوضح لا يعني تحقّقًا أضعف. النطاقُ الرسميّ ما زال مفروضًا على كل طلب،
   * والبنيةُ ما زالت تُتحقَّق قبل أن يُقال عن أصلٍ إنه مُستوعَب.
   */
  assert.match(CODE, /assertOfficialKfgqpcUrl\(url\)/, 'every fetch is still bound to the official domain');
  assert.match(CODE, /ACQUIRED_VERIFIED_STRUCTURE/, 'the verified verdict still requires validation to pass');
  assert.equal(/\|\|\s*true/.test(CODE), false, 'no failure may be turned into a pass');
  assert.equal(/continue-on-error/.test(WORKFLOW), false, 'and the workflow must not swallow the step');
});

test('the operator reads the reason in the summary, not in the tail of a long log', () => {
  assert.match(WORKFLOW, /name: لماذا تعذّر الجلب/, 'the run must explain itself where people look');
  assert.match(WORKFLOW, /if: failure\(\)/, 'it runs on failure only, and does not mask it');
  assert.match(WORKFLOW, /SOURCE_PAGE_UNREACHABLE/, 'it must distinguish the light acquirer’s unreachable case');
  assert.match(WORKFLOW, /SOURCE_PAGES_UNREACHABLE/, 'and the heavy one’s');
  assert.match(WORKFLOW, /العطلُ في السبيل إلى المصدر لا في الحزم/,
    'and say plainly which way to look');
});
