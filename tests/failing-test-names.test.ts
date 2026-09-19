/*
 * «واحدٌ فشل» بلا اسمٍ ليس تشخيصًا.
 *
 * في 19 سبتمبر 2026 سقط اختبارٌ واحدٌ من 2091 في CI على #225، ونجحت الحزمةُ كاملةً
 * محليًّا بعد `npm ci` نظيف. ورفعُ `test-results.xml` مرفقًا — وهو موجودٌ لهذا
 * الغرض بالضبط — لم يُغنِ: سجلُّ الوظيفة لا يُقرأ إلا من ذيله، وذيلُه رفعُ المرفق
 * نفسه، وتنزيلُ المرفق يمرّ بمضيفِ تخزينٍ محجوبٍ عن بيئة التشخيص.
 *
 * فبقي الأحمرُ بلا اسم، ولا يُعالَج أحمرُ بلا اسمٍ إلا بإعادة تشغيلٍ حتى يختفي —
 * وهي كيف يُستأنس بالأحمر. فصار الاسمُ يُطبع في السجلّ، وهذه الحرّاس تثبّته.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {failingTests} from '../scripts/print-failing-tests.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a failing case is named, with its suite and the assertion message', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testcase name="اختبارٌ ينجح" time="0.001" classname="test"/>
  <testcase name="لا رجوع بين الروايات" time="0.002" classname="quran">
    <failure type="testCodeFailure" message="a reading must never be served another reading text"/>
  </testcase>
</testsuites>`;
  const failures = failingTests(xml);
  assert.equal(failures.length, 1, 'only the failing case counts');
  assert.equal(failures[0].name, 'لا رجوع بين الروايات', 'the name is what makes it diagnosable');
  assert.equal(failures[0].suite, 'quran');
  assert.match(failures[0].message, /another reading text/, 'the reason travels with the name');
});

test('a self-closed case is a passing case, and is never reported as failing', () => {
  const xml = '<testsuites><testcase name="nothing wrong" classname="test"/></testsuites>';
  assert.deepEqual(failingTests(xml), [], 'a green run must name nothing');
});

test('errors count too — a case that threw is as failed as one that asserted', () => {
  const xml = `<testsuites>
  <testcase name="threw" classname="boot"><error type="Error" message="ECONNREFUSED"/></testcase>
</testsuites>`;
  const failures = failingTests(xml);
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /ECONNREFUSED/);
});

test('Arabic names survive the XML entities they were written with', () => {
  const xml = `<testsuites>
  <testcase name="حارسُ &quot;القرعة&quot; &amp; العدالة" classname="fair">
    <failure message="قيمةٌ &lt; المتوقَّع"/>
  </testcase>
</testsuites>`;
  const [only] = failingTests(xml);
  assert.equal(only.name, 'حارسُ "القرعة" & العدالة', 'a mangled name is a name nobody can grep for');
  assert.equal(only.message, 'قيمةٌ < المتوقَّع');
});

test('the naming step is wired into CI, runs only on failure, and never decides the verdict', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /node scripts\/print-failing-tests\.mjs/,
    'the log must name the failure, not only upload it');

  const step = ci.split('- name: سمِّ الاختبارات الفاشلة')[1] || '';
  assert.ok(step, 'the step must exist by name');
  const body = step.split(/\n      - name:/)[0];
  assert.match(body, /if: failure\(\)/, 'it must not run on a green build');
  assert.match(body, /\|\| true/,
    'and its own stumble must never turn a green run red, nor mask a red one');
});
