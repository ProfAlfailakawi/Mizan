import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { DELIVERY_READING_BY_RAWI, PINNED_DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { QURAN_FULL_TEXT_CANDIDATES, candidateSourceForRawi } from '../src/lib/quran-candidate-sources';
import { NATIVE_SURAH_AYAH_COUNTS, nativeTotalAyahs, surahsDivergingFromCanonical } from '../src/lib/quran-native-count-systems';
import { countSystemForReading } from '../src/lib/reading-count-systems';
import { crosswalkCoverage, isReadingQuestionSafe, readingQuestionBlockers } from '../src/lib/quran-locus-crosswalk';
import { ayahCountOf, QURAN_SURAH_TOTAL } from '../src/lib/quran-canon';
import {
  IslamwebPackageError,
  clearIslamwebPackageCache,
  islamwebNativePassage,
  islamwebPackageStatus,
  loadIslamwebReadingPackage,
} from '../server/islamweb-reading-packages';
import { MizanQuranDelivery, candidateRawiForDeliveryKey } from '../server/quran-reading-delivery';
import { KfgqpcDeliveryRepository } from '../server/kfgqpc-delivery';

/*
 * هذا الاختبار يقرأ البايتات الحقيقية الملتزَمة في `quran-sources/`، لا تركيبةً في الذاكرة.
 * فما يُثبته هنا هو ما سيراه المحكّم يوم المسابقة: نصُّ كل رواية من حزمتها هي، وفشلٌ
 * صريحٌ مسمّى متى غابت أو عُبث بها — لا نصُّ روايةٍ أخرى معروضًا على أنه نصُّها.
 */

test('all twenty readings have a delivery path, and the twelve pinned ones load from real bytes', () => {
  assert.equal(CANONICAL_RAWI_IDS.length, 20);
  for (const rawiId of CANONICAL_RAWI_IDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(DELIVERY_READING_BY_RAWI, rawiId), `${rawiId} has a delivery key`);
  }
  const status = islamwebPackageStatus();
  assert.equal(status.length, 12);
  for (const row of status) {
    assert.ok(row.present, `${row.rawiId} artifact present on disk`);
    assert.ok(row.loadable, `${row.rawiId} loadable: ${row.error || ''}`);
  }
});

for (const source of QURAN_FULL_TEXT_CANDIDATES) {
  test(`[${source.rawiId}] the pinned artifact is structurally whole and matches its declared counts`, () => {
    const pkg = loadIslamwebReadingPackage(source.rawiId);

    assert.equal(pkg.rawiId, source.rawiId);
    assert.equal(pkg.compressedSha256, source.expectedCompressedSha256, 'bytes on disk are the approved bytes');
    assert.equal(pkg.nativeVerseCount, source.expectedVerseCount);
    assert.equal(pkg.authority, 'ISLAMWEB_DERIVED');
    assert.notEqual(pkg.publisherAuthority as string, 'KFGQPC');

    // ١١٤ سورة، وتسلسل آياتٍ متّصل بلا ثغرة ولا تكرار، ونصٌّ غير فارغ.
    const bySurah = new Map<number, number[]>();
    for (const verse of pkg.verses) {
      assert.ok(verse.aya_text.length > 0, `${source.rawiId} ${verse.sura_no}:${verse.aya_no} has text`);
      assert.equal(verse.aya_text, verse.aya_text.trim());
      const list = bySurah.get(verse.sura_no) || [];
      list.push(verse.aya_no);
      bySurah.set(verse.sura_no, list);
    }
    assert.equal(bySurah.size, QURAN_SURAH_TOTAL);
    for (let surah = 1; surah <= QURAN_SURAH_TOTAL; surah++) {
      const ayat = bySurah.get(surah)!;
      assert.deepEqual(ayat, Array.from({ length: ayat.length }, (_, i) => i + 1), `${source.rawiId} surah ${surah} is contiguous from 1`);
      // وجدولُ العدّ المنشور في الشجرة هو عدُّ هذه البايتات نفسها، لا رقمٌ منقول.
      assert.equal(ayat.length, NATIVE_SURAH_AYAH_COUNTS[source.nativeCountSystem][surah - 1],
        `${source.rawiId} surah ${surah} count agrees with the published native table`);
    }
  });
}

test('the published native count tables are exactly what the pinned bytes contain', () => {
  for (const source of QURAN_FULL_TEXT_CANDIDATES) {
    assert.equal(nativeTotalAyahs(source.nativeCountSystem), source.expectedVerseCount, source.rawiId);
  }
  // والكوفي وحده يطابق العدّ القانوني في السور كلّها؛ البقية تخالف في سورٍ معلومة.
  assert.deepEqual(surahsDivergingFromCanonical('KUFIC'), []);
  assert.equal(surahsDivergingFromCanonical('DIMASHQI').length, 50);
  assert.equal(surahsDivergingFromCanonical('MADANI_AWWAL').length, 46);
  assert.equal(surahsDivergingFromCanonical('BASRI_YAQUB_RUWAYS').length, 47);
  assert.equal(surahsDivergingFromCanonical('BASRI_YAQUB_RAWH').length, 46);
});

/*
 * الفرق بين رواية تُسأل ورواية لا تُسأل ليس رأيًا: هو أن يُعرف مقابلُ الموضع القانوني في
 * ترقيمها أو لا يُعرف. والمنع يُسمّي سورَه، فلا يُقال «غير جاهزة» بلا سبب.
 */
test('question safety is derived from real count evidence and names its blocked surahs', () => {
  const kufic = ['khalaf-hamzah', 'khallad', 'abu-al-harith', 'al-duri-kisai', 'ishaq', 'idris'];
  for (const rawiId of kufic) {
    const coverage = crosswalkCoverage(rawiId);
    assert.equal(coverage.countAssurance, 'VERIFIED_FROM_PINNED_ARTIFACT');
    assert.equal(coverage.unresolvedLoci, 0, rawiId);
    assert.equal(coverage.resolvedLoci, 6236, rawiId);
    assert.ok(coverage.mappingComplete, rawiId);
    assert.ok(isReadingQuestionSafe(rawiId), rawiId);
    assert.deepEqual(readingQuestionBlockers(rawiId), []);
  }
  /*
   * خمسٌ من الستّ المختلِفة عدًّا حُلَّت بأثرِ حدودٍ مثبَّتٍ ببصمته، فصارت مواضعُها كلُّها
   * مدعومةً بصفّ دليل — لا مفترَضة. والحسم كان بالدليل لا بتخفيف الشرط.
   */
  for (const rawiId of ['hisham', 'ibn-dhakwan', 'ibn-wardan', 'ibn-jammaz', 'ruways']) {
    const coverage = crosswalkCoverage(rawiId);
    assert.equal(coverage.countAssurance, 'VERIFIED_FROM_PINNED_ARTIFACT', rawiId);
    assert.equal(coverage.unresolvedLoci, 0, rawiId);
    assert.deepEqual(coverage.surahsRequiringEvidence, [], rawiId);
    assert.equal(isReadingQuestionSafe(rawiId), true, rawiId);
    assert.deepEqual(readingQuestionBlockers(rawiId), [], rawiId);
    assert.equal(coverage.resolvedLoci + coverage.unresolvedLoci + coverage.assumedLoci, coverage.canonicalAyahTotal);
  }

  // وروحٌ وحده باقٍ: سورةٌ واحدة تخالف أعدادَ حزمته، وواحدة تكفي للفشل المغلق.
  for (const rawiId of ['rawh']) {
    const coverage = crosswalkCoverage(rawiId);
    assert.ok(coverage.unresolvedLoci > 0, rawiId);
    assert.ok(coverage.surahsRequiringEvidence.length > 0, rawiId);
    assert.equal(isReadingQuestionSafe(rawiId), false, rawiId);
    assert.match(readingQuestionBlockers(rawiId)[0], /^CROSSWALK_UNRESOLVED_SURAHS:\d+:/);
    assert.equal(coverage.resolvedLoci + coverage.unresolvedLoci + coverage.assumedLoci, coverage.canonicalAyahTotal);
  }
  // حفصٌ قانونيٌّ بالتعريف، والسبعة الباقية من مرآة المجمع لم يُقرأ ترقيمها هنا.
  assert.equal(countSystemForReading('hafs')!.assurance, 'CANONICAL_BY_DEFINITION');
  assert.ok(isReadingQuestionSafe('hafs'));
  assert.equal(countSystemForReading('warsh')!.assurance, 'UNVERIFIED');
});

test('each reading serves its own text and no other', async () => {
  const delivery = new MizanQuranDelivery(new KfgqpcDeliveryRepository({}));
  const texts = new Map<string, string>();
  for (const rawiId of PINNED_DELIVERED_RAWI_IDS) {
    const passage = await delivery.passage(rawiId, 1, 1, 3);
    assert.ok(passage, `${rawiId} passage resolves`);
    assert.equal(passage.numbering, 'NATIVE');
    assert.equal(passage.provenance.authority, 'ISLAMWEB_DERIVED');
    assert.equal(passage.provenance.rawiId, rawiId);
    assert.equal(passage.provenance.supportsPageLoci, false);
    assert.deepEqual(passage.loci, [], 'no printed page loci are invented for a package without them');
    texts.set(rawiId, passage.text);
  }
  /*
   * المقطع الواحد قد يتطابق بين روايتين بحقّ — هشام وابن ذكوان يتفقان في مواضع كثيرة —
   * فتطابقُ ثلاث آياتٍ ليس دليل خلط. الدليل الصحيح أن كل رواية تُخدَم من حزمتها هي:
   * يُقابَل النصّ المُسلَّم ببايتات حزمتها نفسها، وتُقابَل الحزم ببصماتها.
   */
  for (const rawiId of PINNED_DELIVERED_RAWI_IDS) {
    const pkg = loadIslamwebReadingPackage(rawiId);
    const own = pkg.verses.filter(v => v.sura_no === 1 && v.aya_no <= 3).map(v => v.aya_text).join(' ');
    assert.equal(texts.get(rawiId), own, `${rawiId} is served from its own package bytes`);
  }

  // الحزم متمايزة ببصماتها، وإسحاق وإدريس وحدهما يتطابقان لأن المصدر المنشور واحد.
  const digests = new Map(PINNED_DELIVERED_RAWI_IDS.map(id => [id, loadIslamwebReadingPackage(id).compressedSha256]));
  const identicalPair = new Set(['ishaq', 'idris']);
  for (const [a, da] of digests) {
    for (const [b, db] of digests) {
      if (a === b) continue;
      if (identicalPair.has(a) && identicalPair.has(b)) { assert.equal(da, db); continue; }
      assert.notEqual(da, db, `${a} and ${b} must not be the same package`);
    }
  }

  // وتمايزُ الحزم ليس نظريًّا: هشام وابن ذكوان يفترقان فعلًا في نصّ آيةٍ ما.
  const hisham = loadIslamwebReadingPackage('hisham').verses;
  const dhakwan = loadIslamwebReadingPackage('ibn-dhakwan').verses;
  assert.ok(hisham.some((v, i) => dhakwan[i] && v.aya_text !== dhakwan[i].aya_text),
    'two transmissions of Ibn Amir must differ somewhere in the text');
});

test('a missing or tampered artifact fails closed by name — it never becomes Hafs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-islamweb-'));
  try {
    clearIslamwebPackageCache();
    const env = { MIZAN_ISLAMWEB_SOURCE_ROOT: root } as NodeJS.ProcessEnv;

    // (أ) لا أثر أصلًا.
    assert.throws(() => loadIslamwebReadingPackage('hisham', env),
      (e: unknown) => e instanceof IslamwebPackageError && e.code === 'ISLAMWEB_PACKAGE_ARTIFACT_MISSING');

    // (ب) أثرٌ موجود لكن بايتاته ليست البايتات المعتمدة.
    const source = candidateSourceForRawi('hisham')!;
    const name = source.upstreamPath.split('/').pop() as string;
    const real = fs.readFileSync(path.join(process.cwd(), 'quran-sources', 'islamweb-derived', name));
    const tampered = Buffer.from(real);
    tampered[tampered.length - 1] ^= 0x01;
    fs.writeFileSync(path.join(root, name), tampered);
    clearIslamwebPackageCache();
    assert.throws(() => loadIslamwebReadingPackage('hisham', env),
      (e: unknown) => e instanceof IslamwebPackageError && e.code === 'ISLAMWEB_PACKAGE_DIGEST_MISMATCH');

    // (ج) رواية ليست من الاثنتي عشرة.
    assert.throws(() => loadIslamwebReadingPackage('hafs', env),
      (e: unknown) => e instanceof IslamwebPackageError && e.code === 'ISLAMWEB_PACKAGE_UNKNOWN_READING');
  } finally {
    clearIslamwebPackageCache();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an incomplete native passage returns nothing rather than a short one', () => {
  // الفاتحة في العدّ الدمشقي ٧ آيات؛ طلبُ ما بعدها لا يُقصّ بل يُرفض.
  assert.deepEqual(islamwebNativePassage('hisham', 1, 6, 9), []);
  assert.equal(islamwebNativePassage('hisham', 1, 5, 7).length, 3);
  assert.deepEqual(islamwebNativePassage('hisham', 0, 1, 2), []);
  assert.deepEqual(islamwebNativePassage('hisham', 1, 3, 2), []);
});

test('delivery keys resolve to exactly one reading and the two Duris stay apart', () => {
  assert.equal(candidateRawiForDeliveryKey('duri-al-kisai'), 'al-duri-kisai');
  assert.equal(candidateRawiForDeliveryKey('al-duri-kisai'), 'al-duri-kisai');
  // الدوري عن أبي عمرو ليس من الاثنتي عشرة، فلا يُلتقط بأي هجاء.
  assert.equal(candidateRawiForDeliveryKey('duri-abi-amr'), undefined);
  assert.equal(candidateRawiForDeliveryKey('al-duri-abu-amr'), undefined);
  assert.equal(candidateRawiForDeliveryKey('duri'), undefined);
  assert.equal(candidateRawiForDeliveryKey(''), undefined);
  // وخلفُ حمزة ليس خلفًا العاشر: مفتاحان مختلفان لهويتين مختلفتين.
  assert.equal(candidateRawiForDeliveryKey('khalaf-hamzah'), 'khalaf-hamzah');
  assert.ok(!CANONICAL_RAWI_IDS.includes('khalaf'));
});

test('the canonical ayah total is the Kufic total the competition coordinate system uses', () => {
  let total = 0;
  for (let surah = 1; surah <= QURAN_SURAH_TOTAL; surah++) total += ayahCountOf(surah);
  assert.equal(total, 6236);
  assert.equal(nativeTotalAyahs('KUFIC'), 6236);
});
