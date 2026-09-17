import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/*
 * مصفوفة التسويق أسهل ما يُزوَّر في مشروع: جدولٌ يُكتب مرةً ويبقى يقول «جاهز» بعد أن
 * تتغيّر الشيفرة تحته. فالجدول المنشور هنا ليس مكتوبًا — هو مخرَجُ المولّد حرفًا بحرف،
 * وهذا الاختبار يعيد تشغيل المولّد ويقارن. أي انحرافٍ بين ما نقوله وما نملكه يسقط هنا.
 */
test('the published twenty-reading matrix is exactly what the generator computes', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'MIZAN_COMPLETION_MATRIX.md'), 'utf8');
  const begin = '<!-- BEGIN GENERATED: quran:release-matrix --markdown -->';
  const end = '<!-- END GENERATED -->';
  const start = doc.indexOf(begin);
  const stop = doc.indexOf(end);
  assert.ok(start > -1 && stop > start, 'the generated block markers must exist');
  const published = doc.slice(start + begin.length, stop).trim();

  const generated = execFileSync('npx', ['tsx', 'scripts/quran-release-matrix.ts', '--markdown'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 180_000,
  }).trim();

  assert.equal(published, generated, 'MIZAN_COMPLETION_MATRIX.md drifted from the computed state — regenerate it');
});

test('the matrix never claims a release-ready reading without stating its evidence columns', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'MIZAN_COMPLETION_MATRIX.md'), 'utf8');
  // صفوف الجدول وحدها — لا شرحُ الحالات النثري الذي يذكر الاسم نفسه.
  for (const line of doc.split('\n')) {
    if (!line.startsWith('|') || !line.includes('RELEASE_READY')) continue;
    // صفٌّ «جاهز للإصدار» لا بدّ أن يحمل بصمةً متحقَّقة وجسرًا مكتملًا ونصًّا محمَّلًا.
    assert.ok(line.includes('✅'), line);
    assert.ok(!line.includes('❌'), `a RELEASE_READY row cannot carry a failing column: ${line}`);
    assert.ok(!line.includes('⚠️'), `a RELEASE_READY row cannot carry an unverified column: ${line}`);
  }
});
