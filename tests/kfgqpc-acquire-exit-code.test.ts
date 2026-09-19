/*
 * خطوةٌ خضراء لم تكتسب شيئًا كذبةٌ في السير.
 *
 * كان `scripts/kfgqpc-acquire.ts` يخرج بالرمز **صفر** ولو لم يُفتح موقعُ المجمَّع أصلًا:
 * يكتب تقريرًا فيه `SOURCE_PAGE_UNREACHABLE` ثم ينتهي هادئًا. فخطوةُ «جلبُ الحزم الخفيفة»
 * في `kfgqpc-ingest.yml` تُعرض خضراء ولم تُكتسب حزمةٌ واحدة.
 *
 * وأثرُ ذلك ليس تجميليًّا: السيرُ نفسُه يحمل معالجًا (`if: failure()`) يبحث عن
 * `SOURCE_PAGE_UNREACHABLE` ليقول للمالك أين العطل — **ولم يكن يبلغه قطّ**، لأن الخطوة
 * التي تعرف العطل لا تفشل. فيُنسب الفشلُ كلُّه إلى الأصول الثقيلة، ويُقرأ الخفيفُ سليمًا.
 *
 * والحزمُ الخفيفة كلُّها مطلوبة، ولا اختياريَّ فيها. فهذه الحرّاس تثبّت الحدّين:
 * لا يُقال «نجح» إلا إن تحقّقت كلُّ حزمةٍ من بصمتها، ولا يُقال «فشل» عند نجاحٍ تامّ.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LIGHT_PACKAGES, lightAcquisitionVerdict} from '../server/kfgqpc-acquisition-policy';

const allVerified = () => ({
  status: 'COMPLETE',
  results: [
    ...LIGHT_PACKAGES.map(spec => ({id: spec.id, status: 'ACQUIRED_VERIFIED'})),
    {id: 'mushaf-pages', status: 'DEFERRED'},
    {id: 'audio-hafs', status: 'DEFERRED_HEAVY'},
  ],
});

test('an unreachable source is a failure, not a quiet report', () => {
  const verdict = lightAcquisitionVerdict({status: 'SOURCE_PAGE_UNREACHABLE', results: []});
  assert.equal(verdict.exitCode, 2, 'the step must go red when the complex was never reached');
  assert.equal(verdict.reason, 'SOURCE_PAGE_UNREACHABLE',
    'and it must name the cause the workflow failure handler greps for');
});

test('a full, verified acquisition succeeds', () => {
  assert.deepEqual(lightAcquisitionVerdict(allVerified()), {exitCode: 0});
});

test('one package short of verified is short, and is named', () => {
  for (const held of LIGHT_PACKAGES) {
    const report = allVerified();
    const row = report.results.find(r => r.id === held.id);
    assert.ok(row, `${held.id} must appear in the report at all`);
    row.status = 'NOT_ACQUIRED';
    const verdict = lightAcquisitionVerdict(report);
    assert.equal(verdict.exitCode, 2, `${held.id} unverified must fail the step`);
    assert.match(String(verdict.reason), new RegExp(`REQUIRED_LIGHT_PACKAGES_NOT_VERIFIED:.*\\b${held.id}\\b`),
      'the owner must read which package is missing, not a bare code');
  }
});

test('a package missing from the report entirely is missing, not assumed', () => {
  const report = allVerified();
  report.results = report.results.filter(r => r.id !== LIGHT_PACKAGES[0].id);
  const verdict = lightAcquisitionVerdict(report);
  assert.equal(verdict.exitCode, 2,
    'absence of evidence is not evidence of acquisition');
  assert.match(String(verdict.reason), new RegExp(LIGHT_PACKAGES[0].id));
});

test('a report with no results at all never reads as success', () => {
  assert.equal(lightAcquisitionVerdict({status: 'COMPLETE', results: []}).exitCode, 2);
  assert.equal(lightAcquisitionVerdict({status: 'COMPLETE'}).exitCode, 2);
  assert.equal(lightAcquisitionVerdict({}).exitCode, 2, 'an empty report is not a passing report');
});

test('the script itself routes both endings through the verdict', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, '..', 'scripts', 'kfgqpc-acquire.ts'), 'utf8');
  assert.equal((source.match(/finish\(report\)/g) || []).length, 2,
    'both the unreachable-source ending and the complete ending must set the exit code');
  assert.match(source, /lightAcquisitionVerdict/,
    'the script must not re-implement the verdict beside the tested one');
});
