/*
 * سيرُ عملٍ يكتب في التخزين الإنتاجيّ — فالحرّاسُ عليه تُقاس لا تُوصف.
 *
 * `scripts/kfgqpc-ingest.ts --verify --upload` يرفع الحزم ويُصدر كتالوج التحقّق. وهو
 * الطريقُ الوحيدُ إلى كتالوجٍ **مُكتسَب** (بحالة تحقّقٍ وبصمةٍ لكلّ حزمة) بدل الجرد المنشور
 * اليوم. وهو أيضًا الطريقُ الوحيدُ في هذا المستودع الذي يكتب بايتاتٍ في دلوٍ حقيقيّ.
 *
 * فالخطرُ واضح: أن يعمل من تلقاء نفسه — بدفعٍ إلى `main`، أو بجدولةٍ ليليّة، أو بضغطة زرٍّ
 * وضعُها الافتراضيُّ النشر. وكلُّها تعني كتابةً في الإنتاج لم يقصدها أحد.
 *
 * ولذلك: بالطلب اليدويّ وحده، ووضعُه الافتراضيُّ `dry-run`، والنشرُ اختيارٌ يُتّخذ صراحةً.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflow = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'kfgqpc-ingest.yml'), 'utf8');

test('nothing but a person can start it', () => {
  /*
   * دفعٌ إلى `main` أو جدولةٌ ليليّة تعني رفعًا إلى الإنتاج بلا قصد. والقرارُ فعلُ إنسان.
   */
  assert.ok(workflow.includes('workflow_dispatch:'), 'it must be dispatchable by hand');
  assert.equal(/^\s*push:/m.test(workflow), false, 'it must never run on a push');
  assert.equal(/^\s*schedule:/m.test(workflow), false, 'nor on a schedule');
  assert.equal(/^\s*pull_request:/m.test(workflow), false, 'nor on a pull request');
});

test('the default does not write — publishing is chosen, never defaulted into', () => {
  assert.ok(/default: dry-run/.test(workflow), 'the default mode must be the one that writes nothing');
  assert.ok(/options:\s*\n\s*- dry-run\s*\n\s*- publish/.test(workflow), 'and the two modes are explicit');
  // والخطوةُ الكاتبةُ مشروطةٌ بالاختيار، لا بغيابه.
  assert.ok(/if: inputs\.mode == 'publish'/.test(workflow), 'the writing step is gated on the explicit choice');
});

test('only the writing step is given the storage credentials', () => {
  /*
   * والتحقّقُ لا يحتاجها: يقابل بصماتِ المجمَّع ببايتاتٍ أُنزلت الآن. فإعطاؤها لخطوةٍ لا
   * تكتب توسيعٌ بلا سبب.
   */
  const publishStep = workflow.slice(workflow.indexOf("if: inputs.mode == 'publish'"));
  for (const secret of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    assert.ok(publishStep.includes(`secrets.${secret}`), `${secret} belongs to the publishing step`);
  }
  const beforePublish = workflow.slice(0, workflow.indexOf("if: inputs.mode == 'publish'"));
  assert.equal(/secrets\./.test(beforePublish), false, 'no earlier step needs a credential');
});

test('it verifies against the source, not against what is already uploaded', () => {
  /*
   * لو قِيس المرفوعُ بنفسه لكان التحقّقُ دائريًّا: تُقارن الحزمةُ ببصمةٍ حُسبت منها.
   * فالبايتاتُ تُنزل من المجمَّع ثمّ تُقابل ببصماته الرسمية.
   */
  assert.ok(workflow.includes('kfgqpc-acquire.ts'), 'the light packages are fetched from the source');
  assert.ok(workflow.includes('kfgqpc-heavy-acquire.ts --full'), 'and the heavy assets too');
  assert.ok(workflow.indexOf('kfgqpc-acquire.ts') < workflow.indexOf('--verify --upload'),
    'fetching comes before publishing');
  // والتحقّقُ يعمل في الوضعين: فتقريرُ `dry-run` هو ما يُتّخذ عليه قرارُ النشر.
  assert.ok(workflow.includes('kfgqpc-ingest.ts --dry-run'), 'the verification runs in both modes');
});

test('the reports survive either way, so the decision is read not remembered', () => {
  assert.ok(/if: always\(\)/.test(workflow), 'reports are kept whatever the outcome');
  assert.ok(workflow.includes('.mizan-ingest/reports'), 'and they are the ingest reports themselves');
});

test('no secret value is printed, and no result is swallowed', () => {
  for (const leak of [/echo\s+"?\$\{?\s*secrets\./, /echo[^\n]*\$\{!name\}/, /head -c/, /cut -c/]) {
    assert.equal(leak.test(workflow), false, `a step may leak a secret value: ${leak}`);
  }
  assert.equal(/continue-on-error/.test(workflow), false, 'a failure must not be discarded');
  assert.equal(/\|\| true/.test(workflow), false, 'nor swallowed by a shell fallback');
});

test('two ingests never run at once', () => {
  // كلاهما يكتب في المفاتيح نفسها؛ وتشغيلٌ يُلغي آخرَ في منتصفه يترك التخزين نصفَ مكتوب.
  assert.ok(/group: mizan-kfgqpc-ingest/.test(workflow), 'the runs are serialised');
  assert.ok(/cancel-in-progress: false/.test(workflow), 'and a running publish is never cancelled midway');
});
