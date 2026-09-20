/*
 * الأثرُ المجمَّد من مرآة المجمّع.
 *
 * والخطرُ هنا ليس الغياب — الغيابُ يُرى. الخطرُ **نصٌّ يُقبل وهو محرَّف**: رقمُ آيةٍ
 * يُنزع من موضعٍ ليس موضعَه، أو حقلُ سورةٍ يُخمَّن فيختلط ترتيبُ المصحف. فيُقاس هنا أن
 * كلَّ نزعٍ مُثبَتٌ برقمه، وأن الحقلَ يُقرأ ولا يُخمَّن.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildSurahTable, frozenFileName, stripAyahMarker, surahOf } from '../scripts/kfgqpc-mirror-freeze';
import { KFGQPC_MIRROR_CANDIDATES } from '../src/lib/quran-candidate-sources';
import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { candidateRawiForDeliveryKey } from '../server/quran-reading-delivery';

const ROOT = process.cwd();

test('the ayah marker is stripped only when it proves to be that ayah number', () => {
  /*
   * النصُّ القرآنيُّ لا يُقصّ بالظنّ. فلو حمل آخرُ الآية رقمًا غيرَ رقمها لم يُمسّ
   * ورُفعت الحزمةُ كلُّها — لأن رقمًا لا يطابق يعني أن فهمَنا للملفّ خاطئ.
   */
  assert.equal(stripAyahMarker('نصُّ الآية ٧', 7), 'نصُّ الآية');
  assert.equal(stripAyahMarker('نصُّ الآية ٢٥٥', 255), 'نصُّ الآية');
  assert.throws(() => stripAyahMarker('نصُّ الآية ٨', 7), /MIRROR_AYAH_MARKER_MISMATCH:7:8/);
  assert.throws(() => stripAyahMarker('نصٌّ بلا رقم', 7), /MIRROR_AYAH_MARKER_ABSENT/);
  assert.throws(() => stripAyahMarker('٧', 7), /MIRROR_AYAH_TEXT_EMPTY/);
});

test('the surah field is read, never guessed — and hafs names it differently', () => {
  // حفصٌ يستعمل `sora` وبقيّةُ الحزم `sura_no`. وحزمةٌ بلا واحدٍ منهما تسقط باسمها.
  assert.equal(surahOf({ sura_no: 2 }), 2);
  assert.equal(surahOf({ sora: 2 }), 2);
  assert.throws(() => surahOf({ surah: 2 }), /MIRROR_ROW_SURAH_INVALID/);
  assert.throws(() => surahOf({ sura_no: 115 }), /MIRROR_ROW_SURAH_INVALID/);
  assert.throws(() => surahOf({ sura_no: 0 }), /MIRROR_ROW_SURAH_INVALID/);
});

test('a surah whose ayah count disagrees with the measured counts stops the package', () => {
  const counts = new Array(114).fill(1);
  const rows = Array.from({ length: 114 }, (_, i) => ({ sura_no: i + 1, aya_no: 1, aya_text: 'نصّ ١' }));
  assert.ok(buildSurahTable(rows, counts));

  counts[0] = 2; // نتوقّع آيتين في الفاتحة ونعطيه واحدة
  assert.throws(() => buildSurahTable(rows, counts), /MIRROR_SURAH_COUNT:1:1:2/);
});

test('a gap in the native numbering stops the package rather than closing quietly', () => {
  const counts = new Array(114).fill(1);
  counts[0] = 2;
  const rows = Array.from({ length: 114 }, (_, i) => ({ sura_no: i + 1, aya_no: 1, aya_text: 'نصّ ١' }));
  rows.push({ sura_no: 1, aya_no: 3, aya_text: 'نصّ ٣' }); // ١ ثم ٣ — لا ٢
  assert.throws(() => buildSurahTable(rows, counts), /MIRROR_AYAH_GAP:1:2:3/);
});

test('every frozen artifact on disk is the exact bytes the record pins', async () => {
  /*
   * هذا هو الحارسُ الذي يمنع انحرافَ الأثر عن سجلّه صامتًا. ولا يقرأ نصَّ شيفرة: يهشّ
   * البايتات التي ستُقرأ يوم المسابقة.
   */
  assert.equal(KFGQPC_MIRROR_CANDIDATES.length, 8);
  for (const source of KFGQPC_MIRROR_CANDIDATES) {
    const file = path.join(ROOT, 'quran-sources', 'kfgqpc-mirror-derived', frozenFileName(source.rawiId));
    assert.ok(fs.existsSync(file), `${source.rawiId}: the frozen artifact must be committed`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(digest, source.expectedCompressedSha256, `${source.rawiId}: artifact drifted from its pin`);
    assert.equal(source.artifactFileName, frozenFileName(source.rawiId));
  }
});

test('each frozen reading loads, counts what it promised, and carries no ayah numbers in its text', () => {
  for (const source of KFGQPC_MIRROR_CANDIDATES) {
    const pkg = loadIslamwebReadingPackage(source.rawiId);
    assert.equal(pkg.authority, 'KFGQPC_MIRROR_DERIVED');
    assert.equal(pkg.publisherAuthority, 'KFGQPC');
    assert.equal(pkg.nativeVerseCount, source.expectedVerseCount, `${source.rawiId}: verse count`);
    const withMarker = pkg.verses.filter(v => /[٠-٩۰-۹]\s*$/.test(v.aya_text));
    assert.deepEqual(withMarker.slice(0, 3), [],
      `${source.rawiId}: ayah numbers must not survive inside the served text`);
  }
});

test('the mirror text is never the same bytes as another reading served beside it', () => {
  /*
   * أسوأُ ما يقع: أن يُخدم نصُّ حفصٍ باسم ورش. فيُقاس أنهما يفترقان فعلًا في النصّ، لا
   * أن السجلّ يزعم ذلك.
   */
  const hafs = loadIslamwebReadingPackage('hafs').verses;
  const warsh = loadIslamwebReadingPackage('warsh').verses;
  const qalun = loadIslamwebReadingPackage('qalun').verses;
  assert.ok(hafs.some((v, i) => warsh[i] && v.aya_text !== warsh[i].aya_text));
  assert.ok(warsh.some((v, i) => qalun[i] && v.aya_text !== qalun[i].aya_text),
    'Warsh and Qalun share a count system — they must still differ in text');
});

test('every reading the matrix calls release-ready is actually served from disk by the production path', () => {
  /*
   * العطبُ الذي حدث فعلًا: أُضيفت حزمُ المرآة إلى **خريطة البحث** وحدها، فصارت
   * `candidateSourceForRawi` تجدها، بينما `CANDIDATE_KEYS` في مسار التسليم — وهو يمرّ
   * على **القائمة** — لا يراها. فقال التقريرُ «جاهزة» ومسارُ الإنتاج يظلّ يطلبها من
   * الشبكة. تقريرٌ أخضرُ قاس غيرَ ما يجري.
   *
   * فهذا الحارسُ يربط التقريرَ بالمسار العامل: ما يُقال عنه جاهزٌ يُطلب من مسار
   * الإنتاج نفسِه ويُحمَّل من القرص — لا من سكربت التقرير.
   */
  // يُشغَّل المولّدُ فعلًا ثمّ يُقرأ أثرُه — لا يُقرأ أثرٌ ملتزَمٌ قد يكون بالِيًا.
  execFileSync('npx', ['tsx', 'scripts/quran-release-matrix.ts'], {
    cwd: ROOT, encoding: 'utf8', timeout: 180_000, maxBuffer: 1 << 26,
  });
  const matrix = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'artifacts', 'mizan-quran-20-release-matrix.json'), 'utf8'),
  ) as { readings: Array<{ rawiId: string; productionReady: string; textSource: string }> };

  const ready = matrix.readings.filter(r => r.productionReady === 'RELEASE_READY');
  assert.ok(ready.length >= 15, `expected at least fifteen release-ready readings, found ${ready.length}`);

  for (const row of ready) {
    assert.equal(candidateRawiForDeliveryKey(row.rawiId), row.rawiId,
      `${row.rawiId}: declared release-ready but the delivery path does not route it to a local artifact`);
    const pkg = loadIslamwebReadingPackage(row.rawiId);
    assert.ok(pkg.verses.length > 0, `${row.rawiId}: declared release-ready but no verses load from disk`);
    assert.ok(row.textSource.startsWith(pkg.authority),
      `${row.rawiId}: the report names ${row.textSource} but the loaded package is ${pkg.authority}`);
  }
});
