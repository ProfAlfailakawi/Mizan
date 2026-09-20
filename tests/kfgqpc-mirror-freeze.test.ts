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
import { buildSurahTable, frozenFileName, isPageSpan, pageGeometryOf, stripAyahMarker, surahOf } from '../scripts/kfgqpc-mirror-freeze';
import { KFGQPC_MIRROR_CANDIDATES, QURAN_FULL_TEXT_CANDIDATES } from '../src/lib/quran-candidate-sources';
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * موضعُ الآية على صفحة المصحف (٢٠ سبتمبر ٢٠٢٦)
 *
 * كان التحويلُ يُسقط `page`/`line_start`/`line_end` ويُبقي النصَّ وحده، فيعود `loci`
 * فارغًا في كلّ مقطع وتسقط صفحةُ المصحف المدني من السطح. وقد صار يحفظها — والخطرُ
 * الجديد هو أن تُخترع حيث لا تُعرف، فيقع المحكّم على سطرٍ ليس سطرَ الموضع.
 * ═══════════════════════════════════════════════════════════════════════════
 */

test('page geometry is kept when whole, refused when partial, and never half-invented', () => {
  const row = { page: 435, line_start: 1, line_end: 2 };
  assert.deepEqual(pageGeometryOf(row, 35, 4), { page: 435, lineStart: 1, lineEnd: 2 });
  /* ستُّ حزمٍ تكتبها نصًّا وحزمتان عددًا — فتُقرأ بالقيمة لا بالنوع. */
  assert.deepEqual(pageGeometryOf({ page: '435', line_start: '1', line_end: '2' }, 35, 4), { page: 435, lineStart: 1, lineEnd: 2 });
  /* حزمةٌ بلا هندسةٍ أصلًا: غيابٌ لا خطأ. */
  assert.equal(pageGeometryOf({}, 35, 4), null);
  /* أمّا النقصُ فخطأ: صفحةٌ بلا سطرٍ موضعٌ لا يُرسم. */
  assert.throws(() => pageGeometryOf({ page: 435 }, 35, 4), /MIRROR_PAGE_GEOMETRY_PARTIAL/);
  assert.throws(() => pageGeometryOf({ page: 435, line_start: 1 }, 35, 4), /MIRROR_PAGE_GEOMETRY_PARTIAL/);
  /* وحدودُ المصحف تُحرس: لا صفحةَ ٦٠٥، ولا سطرَ صفر، ولا نهايةٌ قبل بداية. */
  assert.throws(() => pageGeometryOf({ page: 605, line_start: 1, line_end: 2 }, 35, 4), /MIRROR_PAGE_INVALID/);
  assert.throws(() => pageGeometryOf({ page: 0, line_start: 1, line_end: 2 }, 35, 4), /MIRROR_PAGE_INVALID/);
  assert.throws(() => pageGeometryOf({ page: 435, line_start: 0, line_end: 2 }, 35, 4), /MIRROR_LINE_START_INVALID/);
  assert.throws(() => pageGeometryOf({ page: 435, line_start: 5, line_end: 4 }, 35, 4), /MIRROR_LINE_END_INVALID/);
  /* ونصٌّ ليس مدًى ولا عددًا يُرفض ولا يُصحَّح بالتخمين. */
  assert.throws(() => pageGeometryOf({ page: 'ص٤٣٥', line_start: 1, line_end: 2 }, 35, 4), /MIRROR_PAGE_INVALID/);
});

test('an ayah that crosses two pages claims neither', () => {
  /*
   * تكتبها الحزمةُ `"85-86"` مع `line_start: 14` و`line_end: 1` — فتأتي النهايةُ قبل
   * البداية، وهو تمامُ الصدق في بنيتها. وموضعُها لَوحان لا لوح، والشكلُ لا يسعهما،
   * فلا يُزعم واحدٌ منهما.
   */
  assert.equal(isPageSpan('85-86'), true);
  assert.equal(isPageSpan(' 317 - 318 '), true);
  assert.equal(pageGeometryOf({ page: '85-86', line_start: 14, line_end: 1 }, 4, 44), null);
  /* ومدًى ليس متجاورًا ليس عبورًا — فيبقى خطأً يُرفض. */
  assert.equal(isPageSpan('85-90'), false);
  assert.equal(isPageSpan('86-85'), false);
  assert.equal(isPageSpan('600-700'), false);
  assert.equal(isPageSpan(435), false);
  assert.throws(() => pageGeometryOf({ page: '85-90', line_start: 14, line_end: 1 }, 4, 44), /MIRROR_PAGE_INVALID/);
});

test('the frozen artifacts on disk actually carry the Mushaf geometry', () => {
  /*
   * دعوى في نصِّ الشيفرة ليست قياسًا: تُفتح البايتات الملتزَمة نفسُها ويُعدّ ما فيها.
   */
  let located = 0, crossing = 0, verses = 0;
  const pages = new Set<number>();
  for (const source of KFGQPC_MIRROR_CANDIDATES) {
    const pkg = loadIslamwebReadingPackage(source.rawiId);
    for (const v of pkg.verses) {
      verses += 1;
      if (v.page === undefined) { crossing += 1; continue; }
      located += 1;
      pages.add(v.page);
      assert.ok(v.page >= 1 && v.page <= 604, `${source.rawiId} ${v.sura_no}:${v.aya_no} صفحةٌ خارج المصحف`);
      assert.ok(v.line_start !== undefined && v.line_end !== undefined, 'موضعٌ ناقص نفذ إلى الأثر');
      assert.ok(v.line_end >= v.line_start, `${source.rawiId} ${v.sura_no}:${v.aya_no} نهايةٌ قبل بداية`);
    }
  }
  assert.equal(verses, 49774, `عدد الآي ${verses}`);
  assert.equal(located, 49748, `الآياتُ ذاتُ الموضع ${located}`);
  assert.equal(crossing, 26, `الآياتُ العابرةُ صفحتين ${crossing}`);
  assert.equal(pages.size, 604, `صفحاتُ المصحف المغطّاة ${pages.size}`);
});

test('the twelve Islamweb readings carry no page, and no page is borrowed for them', () => {
  /*
   * غيابُ الصفحة عندهم حقيقةٌ لا عطب: حزمُهم لا تحملها. والخطرُ أن تُعار صفحةُ رواية
   * لأخرى — وهو رجوعٌ بين الروايات، وهو ممنوع. فيُقاس أن الغياب باقٍ غيابًا.
   */
  const islamweb = QURAN_FULL_TEXT_CANDIDATES.filter(x => x.authority === 'ISLAMWEB_DERIVED');
  assert.ok(islamweb.length === 12, `حزم إسلام ويب ${islamweb.length}`);
  for (const source of islamweb) {
    const pkg = loadIslamwebReadingPackage(source.rawiId);
    const withPage = pkg.verses.filter(v => v.page !== undefined).length;
    assert.equal(withPage, 0, `${source.rawiId} حمل ${withPage} موضعًا لم تنشره حزمتُه`);
  }
});
