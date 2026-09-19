import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyConsoleError } from '../scripts/lib/qa-console-noise.mjs';

/*
 * حدُّ الاستثناء في سجلّ المتصفّح.
 *
 * فحوصُ الجودة تعدّ خطأَ السجلّ عطبًا، وتستثني ما غاب عن بيئة الفحص بحكم التصميم. وكان
 * الاستثناءُ يُكتب على نصّ الخطأ وفيه `404` مجرّدة — وقيس فتبيّن أن Playwright يعطي
 * للجميع نصًّا واحدًا حرفًا بحرف، والعنوانُ لا يظهر إلا في `location().url`. فابتلع
 * الاستثناءُ 404 على `/assets/` و`/fonts/`، أي أن الفحصَ كان يمرّ أخضرَ والمنتجُ المبنيّ
 * لا يحمّل أصولَه — وهو بعينه ما وُجد ليمسكه.
 *
 * فهذه الاختبارات تحرس الحدَّ من الجهتين: لا يتّسع فيبتلع عطبًا، ولا يضيق فيُغرق الفحصَ
 * بضجيجٍ مقصود.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** النصُّ الذي يعطيه المتصفّح لكلّ 404 — واحدٌ للجميع، وفيه بيتُ الداء. */
const NOT_FOUND = 'Failed to load resource: the server responded with a status of 404 (Not Found)';
const at = (path: string) => `http://127.0.0.1:4173${path}`;

test('الغائبُ بحكم التصميم يُستثنى — ويُسمّى سببُه', () => {
  const verdict = classifyConsoleError({ text: NOT_FOUND, url: at('/api/public/competitions') });
  assert.equal(verdict.suppressed, true, 'خادمُ المعاينة لا واجهةَ فيه، فغيابُها مقصود');
  assert.ok(verdict.ar && verdict.ar.length > 0, 'ولا يُستثنى شيءٌ بلا سببٍ يُطبع');
});

test('عطبُ المنتج يُبلَّغ ولو كان 404 — وهذا بيتُ القصيد', () => {
  for (const path of ['/assets/index-C1ypomZ8.js', '/fonts/KFGQPC-Uthmanic.woff2', '/brand/mizan-icon-32.png']) {
    const verdict = classifyConsoleError({ text: NOT_FOUND, url: at(path) });
    assert.equal(verdict.suppressed, false,
      `${path}: يخدمه البناءُ نفسُه، فغيابُه عطبٌ في المنتج لا ضجيجٌ في البيئة`);
  }
});

test('النصُّ وحدَه لا يفرّق، فلا يُحكم به', () => {
  const broken = classifyConsoleError({ text: NOT_FOUND, url: at('/assets/index-C1ypomZ8.js') });
  const expected = classifyConsoleError({ text: NOT_FOUND, url: at('/api/public/x') });
  assert.notEqual(broken.suppressed, expected.suppressed,
    'النصّان متطابقان حرفًا بحرف ويختلف الحكم — فالعنوانُ وحدَه هو الفاصل');
});

test('عنوانٌ مجهول لا يُعذَر: الشكُّ يُقرأ عطبًا لا براءة', () => {
  assert.equal(classifyConsoleError({ text: NOT_FOUND, url: '' }).suppressed, false);
  assert.equal(classifyConsoleError({ text: NOT_FOUND }).suppressed, false);
});

test('تعذّرُ الوصول إلى مضيفٍ خارجيّ ليس عطبًا في الشاشة', () => {
  const verdict = classifyConsoleError({
    text: 'Failed to load resource: net::ERR_CONNECTION_REFUSED', url: 'https://example.invalid/x',
  });
  assert.equal(verdict.suppressed, true);
});

test('خطأٌ حقيقيٌّ فيه الرقمُ مصادفةً يُبلَّغ', () => {
  for (const text of ['TypeError: cannot read property at line 404', 'Uncaught Error: seal mismatch (request 9a404bf1)']) {
    assert.equal(classifyConsoleError({ text, url: at('/assets/app.js') }).suppressed, false,
      'الرقمُ في متنِ رسالةٍ ليس جوابَ خادم');
  }
});

test('لا يعود الحكمُ على النصّ في أيّ من الفحصين', () => {
  for (const file of ['scope-visual-qa.mjs', 'competition-day-qa.mjs']) {
    const source = readFileSync(join(ROOT, 'scripts', file), 'utf8');
    assert.doesNotMatch(source, /Failed to load resource: net::\|404/,
      `${file}: عادت \`404\` مجرّدةً إلى تعبير النصّ، وهي تبتلع عطبَ المنتج`);
    assert.match(source, /classifyConsoleError\(\{ text, url \}\)/,
      `${file}: الحكمُ يمرّ بالمصنِّف المشترك، فلا ينفرد فحصٌ بقاعدةٍ تخالف أخاه`);
    assert.match(source, /m\.location\(\)\?\.url/,
      `${file}: العنوانُ يُقرأ من \`location()\`، فهو وحدَه يحمل الجواب`);
  }
});

test('المستثنى يُطبع في الفحصين كليهما — واستثناءٌ لا يُرى لا يُراجَع', () => {
  for (const file of ['scope-visual-qa.mjs', 'competition-day-qa.mjs']) {
    const source = readFileSync(join(ROOT, 'scripts', file), 'utf8');
    assert.match(source, /if \(verdict\.suppressed\) \{ console\.log/,
      `${file}: كان يُبتلع هنا بلا ذكر`);
  }
});
