#!/usr/bin/env node
/*
 * يُسمّي الاختباراتِ الفاشلةَ في سجلّ الوظيفة نفسه.
 *
 * سببُ وجوده: `ci.yml` يرفع `test-results.xml` مرفقًا كي يُعرف اسمُ الفاشل حين
 * يسقط واحدٌ في CI وينجح محليًّا. وقد وقع ذلك في 19 سبتمبر 2026 على #225: سقط
 * اختبارٌ واحدٌ من 2091 في CI، ونجحت الحزمةُ كاملةً محليًّا بعد `npm ci` نظيف.
 *
 * والمرفقُ لم يُغنِ: سجلُّ الوظيفة لا يُقرأ إلا من ذيله — وذيلُه رفعُ المرفق نفسه —
 * وتنزيلُ المرفق يمرّ بمضيفِ تخزينٍ محجوبٍ عن بيئة التشخيص (CONNECT 403). فبقي
 * «واحدٌ فشل» بلا اسم، وهو نفسُ ما اشتكى منه تعليقُ `ci.yml` قبل شهر.
 *
 * فيُقرأ الملفُّ حيث كُتب، ويُطبع الاسمُ في الذيل. ولا يُغيّر هذا حكمَ البوّابة:
 * يعمل عند الفشل وحده، ويخرج صفرًا دائمًا — فشلُ الاختبارات هو ما يُفشل الوظيفة،
 * لا هذا. وخطؤه لا يبتلع أحمرَ أحد.
 */
import fs from 'node:fs';

const file = process.argv[2] || 'test-results.xml';

/** اسمٌ أو رسالةٌ داخل سِمة XML — تُفكّ كياناتُها كي تُقرأ عربيّةً كما كُتبت. */
const decode = (value) =>
  String(value)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

export function failingTests(xml) {
  const cases = String(xml).split(/<testcase\b/).slice(1);
  const failures = [];
  for (const block of cases) {
    // الفشلُ عنصرٌ داخل الحالة. و`<testcase ... />` المغلقةُ على نفسها ناجحة.
    const body = block.split(/<\/testcase>/)[0];
    if (!/<failure\b|<error\b/.test(body)) continue;
    const name = decode((body.match(/\bname="([^"]*)"/) || [])[1] || '(اختبارٌ بلا اسم)');
    const suite = decode((body.match(/\bclassname="([^"]*)"/) || [])[1] || '');
    const message = decode((body.match(/<(?:failure|error)[^>]*\bmessage="([^"]*)"/) || [])[1] || '');
    failures.push({ suite, name, message });
  }
  return failures;
}

function main() {
  if (!fs.existsSync(file)) {
    console.log(`لا ملفَّ نتائجَ عند ${file} — لم تُكتب الاختباراتُ تقريرًا.`);
    return;
  }
  const failures = failingTests(fs.readFileSync(file, 'utf8'));
  if (!failures.length) {
    console.log('الملفُّ لا يحمل فشلًا — فالفشلُ خارج الاختبارات (بناءٌ أو فحصُ أنواعٍ أو خطوةٌ أخرى).');
    return;
  }
  console.log(`═══ الاختباراتُ الفاشلة: ${failures.length} ═══`);
  for (const { suite, name, message } of failures) {
    console.log(`\n  ✗ ${name}`);
    if (suite) console.log(`    المجموعة: ${suite}`);
    if (message) console.log(`    السبب: ${message.slice(0, 500)}`);
  }
  console.log('\n═══════════════════════════════');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
