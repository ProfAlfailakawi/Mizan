/*
 * «نزّلناها من مكانٍ آخر وتأكّدنا» دعوى. وبصماتُ المجمّع المثبَّتة تحوّلها إلى قياس:
 * ملفٌّ تطابق بصمتاه هو حزمةُ المجمّع بايتًا ببايت مهما كان موضعُ تنزيله.
 *
 * ويُقاس هنا المسارُ الموجب أيضًا — لا السالب وحده. فحارسٌ جُرّب على الرفض فقط قد
 * يكون رافضًا لكلّ شيء، وهو أسوأُ من لا حارس بطريقةٍ أخرى.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { digestFile, judge } from '../scripts/kfgqpc-verify-local';
import { LIGHT_PACKAGES } from '../server/kfgqpc-acquisition-policy';

const tempFile = (contents: string) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-verify-')), 'package.zip');
  fs.writeFileSync(file, contents);
  return file;
};

test('a file whose two digests both match is judged the official package', async () => {
  // البصمةُ تُحسب من بايتاتٍ حقيقية ثم تُحقن مواصفةً — فالمسارُ الموجب مقيسٌ لا مفترَض.
  const file = tempFile('pretend this is an official archive');
  const digest = await digestFile(file);
  const synthetic = [{id: 'test-package', md5: digest.md5, sha1: digest.sha1, maxBytes: 1024}];

  assert.deepEqual(judge(digest, synthetic), {matched: 'test-package'});
});

test('one digest matching without the other is never a match', async () => {
  /*
   * ولو اكتُفي ببصمةٍ واحدة لصار «طابق» يعني «طابق أحدَهما». والحالةُ تُسمّى ولا
   * تُبتلع: إمّا نقلٌ معطوب وإمّا ما يستحقّ النظر.
   */
  const file = tempFile('bytes');
  const digest = await digestFile(file);
  const md5Only = [{id: 'half', md5: digest.md5, sha1: 'A'.repeat(40), maxBytes: 1024}];
  const sha1Only = [{id: 'half', md5: 'B'.repeat(32), sha1: digest.sha1, maxBytes: 1024}];

  assert.deepEqual(judge(digest, md5Only), {partial: 'half'});
  assert.deepEqual(judge(digest, sha1Only), {partial: 'half'});
});

test('an unrelated file matches nothing, and is not quietly accepted', async () => {
  const digest = await digestFile(tempFile('not an official package at all'));
  assert.deepEqual(judge(digest), {});
});

test('the digests it judges against are the ones pinned for the readings the owner needs', () => {
  /*
   * فلو سقط اسمٌ من `LIGHT_PACKAGES` لصار الفحصُ يقول «لا يطابق» عن حزمةٍ رسميّة —
   * ويُقرأ ذلك اتّهامًا لملفٍّ سليم.
   */
  const pinned = new Set(LIGHT_PACKAGES.map(spec => spec.id));
  for (const id of ['hafs', 'warsh', 'shubah', 'qalun', 'duri-data', 'susi-data']) {
    assert.ok(pinned.has(id), `${id} must stay pinned — the four blocked readings depend on it`);
  }
  for (const spec of LIGHT_PACKAGES) {
    assert.match(spec.md5, /^[0-9A-F]{32}$/, `${spec.id}: MD5 must be 32 hex digits`);
    assert.match(spec.sha1, /^[0-9A-F]{40}$/, `${spec.id}: SHA-1 must be 40 hex digits`);
  }
});
