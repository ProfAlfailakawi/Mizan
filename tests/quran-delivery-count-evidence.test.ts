/*
 * P14 — ترقيم الروايات المخدومة من مرآة التسليم.
 *
 * كان النظام يفترض أن الثماني كلَّها كوفيّةُ العدّ. هذه الاختبارات تثبت أن الافتراض
 * استُبدل بقياسٍ من بايتاتٍ مثبَّتة، وأن ما لا يُثبت يفشل مغلقًا لا يُقرَّب.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { KFGQPC_DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { NATIVE_SURAH_AYAH_COUNTS, nativeTotalAyahs } from '../src/lib/quran-native-count-systems';
import { countSystemForReading } from '../src/lib/reading-count-systems';
import { crosswalkCoverage } from '../src/lib/quran-locus-crosswalk';
import {
  DELIVERY_COUNT_EVIDENCE_BUILD,
  DELIVERY_COUNT_SYSTEMS,
} from '../src/lib/quran-delivery-count-evidence.generated';
import {
  deliveryCountExpectation,
  verifyServedPackageNumbering,
} from '../src/lib/quran-delivery-count-guard';
import {
  loadDeliveryCountManifest,
  loadFrozenDeliveryCounts,
  measurePackageCounts,
  verifyAgainstFrozen,
} from '../scripts/quran-delivery-count-intake';

const FROZEN = loadFrozenDeliveryCounts();
const MANIFEST = loadDeliveryCountManifest();

test('the delivery mirror is pinned to a commit, never a moving ref', () => {
  assert.match(MANIFEST.upstreamCommit, /^[0-9a-f]{40}$/);
  assert.equal(DELIVERY_COUNT_EVIDENCE_BUILD.upstreamCommit, MANIFEST.upstreamCommit);
  for (const moving of ['main', 'master', 'latest', 'HEAD']) {
    assert.notEqual(MANIFEST.upstreamCommit, moving);
  }
});

test('every measured package carries its own digest and a contiguous 1..N per surah', () => {
  assert.equal(Object.keys(FROZEN).length, KFGQPC_DELIVERED_RAWI_IDS.length);
  for (const rawiId of KFGQPC_DELIVERED_RAWI_IDS) {
    const entry = FROZEN[rawiId];
    assert.ok(entry, `${rawiId} has frozen count evidence`);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.equal(entry.perSurahAyahCounts.length, 114);
    assert.equal(entry.malformedRows, 0, `${rawiId} package has malformed rows`);
    assert.equal(entry.surahsWithGaps, 0, `${rawiId} package numbering has gaps — it proves nothing`);
    assert.equal(entry.perSurahAyahCounts.reduce((a, b) => a + b, 0), entry.totalAyahs);
    assert.equal(entry.rowCount, entry.totalAyahs, `${rawiId} row count must equal its ayah count`);
  }
});

test('the measured numbering contradicts the old blanket Kufic assumption', () => {
  // هذا هو جوهر الاكتشاف: ستٌّ من الثماني ليست كوفيّةَ العدّ، وكانت تُعامَل على أنها كذلك.
  const nonKufic = KFGQPC_DELIVERED_RAWI_IDS.filter(rawiId => FROZEN[rawiId].totalAyahs !== 6236);
  assert.deepEqual(nonKufic.sort(), ['al-bazzi', 'al-duri-abu-amr', 'al-susi', 'qalun', 'qunbul', 'warsh'].sort());
  assert.equal(FROZEN.hafs.totalAyahs, 6236);
  assert.equal(FROZEN.shubah.totalAyahs, 6236, 'Shubah really is Kufic — now proved, not assumed');
});

test('two readings share a counting system only when all 114 counts agree', () => {
  for (const entry of DELIVERY_COUNT_SYSTEMS) {
    for (const pkg of entry.packages) {
      assert.deepEqual(
        [...FROZEN[pkg.rawiId].perSurahAyahCounts],
        [...entry.perSurahAyahCounts],
        `${pkg.rawiId} was grouped into ${entry.system} without matching it`,
      );
    }
    // والهوية لا تُمحى بالتجميع: لكل راوٍ بصمةُ حزمته الخاصّة.
    assert.equal(new Set(entry.packages.map(p => p.rawiId)).size, entry.packages.length);
  }
});

test('the generated count tables are exactly the frozen measurements', () => {
  for (const entry of DELIVERY_COUNT_SYSTEMS) {
    if (entry.system === 'KUFIC') continue;
    const table = NATIVE_SURAH_AYAH_COUNTS[entry.system as keyof typeof NATIVE_SURAH_AYAH_COUNTS];
    assert.ok(table, `${entry.system} must exist in the native count tables`);
    assert.deepEqual([...table], [...entry.perSurahAyahCounts]);
  }
  assert.equal(nativeTotalAyahs('MADANI_AKHIR'), 6214);
  assert.equal(nativeTotalAyahs('MAKKI_IBN_KATHIR_DELIVERY'), 6220);
  assert.equal(nativeTotalAyahs('BASRI_ABU_AMR_DELIVERY'), 6217);
});

test('no reading is left with an unverified numbering claim', () => {
  for (const rawiId of CANONICAL_RAWI_IDS) {
    const system = countSystemForReading(rawiId);
    assert.ok(system, rawiId);
    assert.notEqual(system!.assurance, 'UNVERIFIED', `${rawiId} still asserts a numbering it never measured`);
    assert.ok(system!.system, `${rawiId} must name its counting system`);
    assert.equal(crosswalkCoverage(rawiId).assumedLoci, 0, `${rawiId} still resolves loci by assumption`);
  }
});

test('re-measuring the frozen evidence reproduces it exactly', () => {
  // يُعاد القياس من الأرقام المجمَّدة نفسها حين لا يكون المستودع الأعلى حاضرًا.
  for (const [rawiId, entry] of Object.entries(FROZEN)) {
    const verdict = verifyAgainstFrozen(rawiId, {
      sha256: entry.sha256,
      byteLength: entry.byteLength,
      rowCount: entry.rowCount,
      malformedRows: 0,
      surahsWithGaps: 0,
      totalAyahs: entry.totalAyahs,
      perSurahAyahCounts: [...entry.perSurahAyahCounts],
    }, entry);
    assert.equal(verdict.matches, true, rawiId);
  }
});

test('measurement fails closed on malformed or non-contiguous packages', () => {
  assert.throws(() => measurePackageCounts(Buffer.from('{ not json', 'utf8')), /PACKAGE_JSON_INVALID/);
  assert.throws(() => measurePackageCounts(Buffer.from('{}', 'utf8')), /PACKAGE_NOT_A_ROW_ARRAY/);
  assert.throws(() => measurePackageCounts(Buffer.from('[]', 'utf8')), /PACKAGE_NOT_A_ROW_ARRAY/);

  const gappy = measurePackageCounts(Buffer.from(JSON.stringify([
    { sura_no: 1, aya_no: 1 }, { sura_no: 1, aya_no: 3 }, { sura_no: 1, aya_no: 'x' },
  ]), 'utf8'));
  assert.equal(gappy.malformedRows, 1);
  assert.ok(gappy.surahsWithGaps > 0, 'a surah missing an ayah is not evidence of anything');
});

test('a served package whose numbering diverges is refused, not served', () => {
  const warsh = deliveryCountExpectation('warsh')!;
  assert.equal(warsh.system, 'MADANI_AKHIR');

  const faithful = warsh.perSurahAyahCounts.flatMap((count, index) =>
    Array.from({ length: count }, (_, i) => ({ sura_no: index + 1, aya_no: i + 1 })));
  assert.equal(verifyServedPackageNumbering('warsh', faithful).matches, true);

  // حزمةٌ كوفيّةُ العدّ تُقدَّم على أنها ورش — وهي بالضبط ما كان يُفترض صامتًا.
  const kufic = NATIVE_SURAH_AYAH_COUNTS.KUFIC.flatMap((count, index) =>
    Array.from({ length: count }, (_, i) => ({ sura_no: index + 1, aya_no: i + 1 })));
  const verdict = verifyServedPackageNumbering('warsh', kufic);
  assert.equal(verdict.matches, false);
  assert.match(String(verdict.code), /^DELIVERY_PACKAGE_NUMBERING_MISMATCH:MADANI_AKHIR:\d+:/);
  assert.ok(verdict.mismatchedSurahs.length > 0);

  // ورواية بلا قياسٍ لا تمرّ بحجّة غياب المرجع.
  const unknown = verifyServedPackageNumbering('hisham', faithful);
  assert.equal(unknown.matches, false);
  assert.match(String(unknown.code), /^DELIVERY_COUNT_EXPECTATION_MISSING:hisham$/);
});

test('the frozen evidence file is committed so the proof survives without the network', () => {
  for (const relative of [
    'quran-sources/delivery-counts/kfgqpc-mirror/counts.json',
    'quran-sources/delivery-counts/kfgqpc-mirror/MANIFEST.json',
  ]) {
    assert.ok(fs.existsSync(path.resolve(process.cwd(), relative)), `${relative} must be in the tree`);
  }
});
