/*
 * موقعُ المجمّع معطَّل، والحزمُ نُزّلت من مرآة. وذلك لا يُضعف شيئًا: بصماتُ المجمّع
 * الرسميّة مثبَّتة، فأرشيفٌ تطابق بصمتاه **هو** أرشيفُ المجمّع بايتًا ببايت مهما كان
 * موضعُ تنزيله — إثباتٌ رياضيّ أقوى من ثقةٍ بمضيف.
 *
 * والخطرُ في هذا المسار واحد: أن يُصدَّق **اسمُ ملفّ**. فيُقاس هنا أن التعيين بالبصمة
 * وحدها، وأن بصمةً واحدةً من اثنتين ليست تعيينًا.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { digestBytes, identify, specsFromIngest, type ArchiveSpec } from '../scripts/kfgqpc-stage-archives';

const ROOT = process.cwd();
const ingestSource = fs.readFileSync(path.join(ROOT, 'scripts', 'kfgqpc-ingest.ts'), 'utf8');

test('the official digests are read from the ingest script — never written twice', () => {
  /*
   * ولو نُسخت البصماتُ هنا لصار موضعان يمكن أن يفترقا، وأحدُهما يحرس والآخر يُخدع.
   */
  const specs = specsFromIngest(ingestSource);
  const ids = specs.map(spec => spec.id);
  for (const id of ['hafs', 'warsh', 'shubah', 'qalun', 'duri-data', 'susi-data']) {
    assert.ok(ids.includes(id), `${id} must be read from the ingest definitions`);
  }
  for (const spec of specs) {
    assert.match(spec.md5, /^[0-9A-F]{32}$/);
    assert.match(spec.sha1, /^[0-9A-F]{40}$/);
    assert.ok(ingestSource.includes(spec.md5), `${spec.id}: the digest must come from the ingest file itself`);
  }
});

test('a file is identified by its digest, never by its name', () => {
  /*
   * أسوأُ ما يمكن في هذا المسار: ملفٌّ اسمُه `hafs.zip` وبايتاتُه بايتاتُ ورش، فيُدخل
   * حفصًا ويُخدم نصُّ روايةٍ باسم أخرى. والاسمُ لا يُقرأ هنا أصلًا.
   */
  const warshBytes = Buffer.from('bytes that happen to be warsh');
  const digest = digestBytes(warshBytes);
  const specs: ArchiveSpec[] = [
    {id: 'hafs', md5: 'A'.repeat(32), sha1: 'B'.repeat(40)},
    {id: 'warsh', md5: digest.md5, sha1: digest.sha1},
  ];
  assert.equal(identify(warshBytes, specs).spec?.id, 'warsh',
    'the bytes decide, whatever the file is called');
});

test('one digest matching without the other is refused, and named', () => {
  const bytes = Buffer.from('half a match');
  const digest = digestBytes(bytes);
  assert.deepEqual(
    identify(bytes, [{id: 'hafs', md5: digest.md5, sha1: 'C'.repeat(40)}]).partial, 'hafs');
  assert.deepEqual(
    identify(bytes, [{id: 'hafs', md5: 'D'.repeat(32), sha1: digest.sha1}]).partial, 'hafs');
});

test('an unrelated file identifies as nothing', () => {
  const found = identify(Buffer.from('not a package'), specsFromIngest(ingestSource));
  assert.equal(found.spec, undefined);
  assert.equal(found.partial, undefined);
});

test('the staging path never contacts the Quran Complex site', () => {
  /*
   * فغرضُه أن يعمل والموقعُ معطَّل. ولو حمل طلبَ شبكةٍ لعاد العطبُ من حيث فُرّ منه.
   */
  const script = fs.readFileSync(path.join(ROOT, 'scripts', 'kfgqpc-stage-archives.ts'), 'utf8');
  const code = script.slice(script.indexOf('import {'));
  assert.equal(/\bfetch\s*\(/.test(code), false, 'staging must not fetch anything');
  assert.equal(/https?:\/\/(?!qurancomplex\.gov\.sa\/en\/techquran\/dev)/.test(code), false,
    'the only URL it writes is the publisher identity recorded in source.json');
});
