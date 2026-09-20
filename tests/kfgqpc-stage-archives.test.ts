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
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { digestBytes, digestFileStream, identify, leadingBytes, specsFromIngest, type ArchiveSpec } from '../scripts/kfgqpc-stage-archives';

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

/*
 * ما يلي يُشغِّل السكربت فعلًا على قرصٍ حقيقيّ. ودعوى في نصِّ شيفرةٍ ليست قياسًا: لو
 * اكتفيتُ بقراءة الكود لأقسمتُ أن الفكّ يُنظّف بعده، ولم أُثبت شيئًا.
 */
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const STAGE = path.join(ROOT, 'scripts', 'kfgqpc-stage-archives.ts');

/** مستودعٌ مصغَّر: `kfgqpc-ingest.ts` فيه بصماتٌ نصنعها، فيُقاس السلوك لا البيانات. */
function fakeRepo(archives: Array<{id: string; bytes: Buffer}>) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-stage-'));
  fs.mkdirSync(path.join(repo, 'scripts'), {recursive: true});
  const lines = archives.map(a => {
    const d = digestBytes(a.bytes);
    return `  '${a.id}':{id:'${a.id}',officialChecksum:{md5:'${d.md5}',sha1:'${d.sha1}'}},`;
  });
  /*
   * المُدخِل يرفض المضيّ بأقلّ من ستّ حزم، فتُملأ البقيّة ببصماتٍ لا يطابقها شيء.
   * والمعرِّفاتُ حروفٌ بلا أرقام لأن `specsFromIngest` يقرأ `[a-z-]+` — ولو حملت رقمًا
   * لسقطت من القراءة، فخرج السكربتُ قبل أن يعمل، ومرّ الاختبارُ دون أن يقيس شيئًا.
   */
  const filler = 'abcdefgh';
  for (let i = lines.length; i < 6; i++) {
    const id = `filler-${filler[i]}`;
    lines.push(`  '${id}':{id:'${id}',officialChecksum:{md5:'${'ABCDEF01'.repeat(4)}',sha1:'${String(i + 1).repeat(40)}'}},`);
  }
  const ingest = `export const X={\n${lines.join('\n')}\n};\n`;
  fs.writeFileSync(path.join(repo, 'scripts', 'kfgqpc-ingest.ts'), ingest);
  // حارسٌ على العدّة نفسِها: لولاه لمرّ اختبارٌ لم يُشغَّل فيه شيء.
  assert.equal(specsFromIngest(ingest).length, Math.max(archives.length, 6),
    'the fixture must actually parse, or the test measures nothing');
  const inbox = path.join(repo, 'inbox');
  fs.mkdirSync(inbox);
  for (const a of archives) fs.writeFileSync(path.join(inbox, `${a.id}.zip`), a.bytes);
  return {repo, inbox};
}

test('a failed extraction leaves nothing behind, and spares the good staging before it', () => {
  /*
   * أخطرُ حالةٍ في هذا المسار: أرشيفٌ صحيحُ البصمة إلى جانب حمولةٍ منقوصة. فـ
   * `kfgqpc-ingest.ts` يعدّ الحمولةَ موجودةً بمجرّد وجود مجلّدها، ويتحقّق من بصمة
   * الأرشيف فتنجح، ولا يفحص اكتمالَ حزم DATA — فيُقرأ النصفُ `VERIFIED` ويُرفع.
   */
  const bytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('ليس أرشيفًا سليمًا')]);
  const {repo, inbox} = fakeRepo([{id: 'warsh', bytes}]);

  // إدخالٌ سابقٌ سليم — يجب ألّا يمسَّه فشلُ ما بعده.
  const good = path.join(repo, '.mizan-ingest', 'warsh');
  fs.mkdirSync(path.join(good, 'payload'), {recursive: true});
  fs.writeFileSync(path.join(good, 'payload', 'kept.txt'), 'حمولةٌ كاملةٌ سابقة');
  fs.writeFileSync(path.join(good, 'source.json'), JSON.stringify({officialChecksumVerified: true}));

  const run = spawnSync(TSX, [STAGE, inbox], {cwd: repo, encoding: 'utf8'});

  assert.notEqual(run.status, 0, 'a refused archive must not exit green');
  assert.equal(fs.readFileSync(path.join(good, 'payload', 'kept.txt'), 'utf8'), 'حمولةٌ كاملةٌ سابقة',
    'the previously staged payload must survive a later failure');
  assert.deepEqual(
    fs.readdirSync(path.join(repo, '.mizan-ingest')).filter(name => name.startsWith('.pending-')), [],
    'no half-staged directory may survive');
  assert.equal(fs.existsSync(path.join(good, 'source.zip')), false,
    'a digest-perfect archive must never sit beside an incomplete payload');
});

test('a multi-gigabyte neighbour does not stop a valid archive from being staged', () => {
  /*
   * المجلّدُ يُمرَّر كما هو (`~/Downloads`)، وفيه ما ليس لنا. فلو حُمِّل كلُّ ملفٍّ إلى
   * الذاكرة لقتله جارٌ ضخم قبل أن يبلغ الحزمةَ الصحيحة. البصمةُ تُحسب بالتدفّق.
   */
  const bytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('payload')]);
  const {repo, inbox} = fakeRepo([{id: 'warsh', bytes}]);
  const huge = path.join(inbox, 'huge-video.bin');
  fs.writeFileSync(huge, Buffer.alloc(0));
  fs.truncateSync(huge, 6 * 1024 * 1024 * 1024); // ملفٌّ مثقوبٌ بحجم ٦ جيجابايت

  const run = spawnSync(TSX, [STAGE, inbox], {cwd: repo, encoding: 'utf8', maxBuffer: 1 << 24});

  assert.equal(/JavaScript heap out of memory|ERR_(?:FS_)?FILE_TOO_LARGE|Cannot create a Buffer/.test(
    `${run.stdout || ''}${run.stderr || ''}`), false,
    'hashing must stream — a huge neighbour must not exhaust the heap');
  assert.match(String(run.stdout || ''), /warsh/, 'the matching archive must still be reached and named');
});

test('digestFileStream agrees with digestBytes, and leadingBytes reads only the signature', async () => {
  const bytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('a'.repeat(200_000))]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-digest-')), 'x.zip');
  fs.writeFileSync(file, bytes);
  assert.deepEqual(await digestFileStream(file), digestBytes(bytes),
    'the streamed digest must equal the whole-buffer digest, or identity is not identity');
  assert.deepEqual(leadingBytes(file, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
});
