/*
 * إعادة تقسيم الحزم الخمس على عدّ مصاحف التيسير — ما يُضمن، مُثبتًا من البايتات.
 *
 *   ١. البناء يعيد إنتاج الآثار الملتزَمة بايتًا ببايت.
 *   ٢. الكلماتُ هي كلماتُ الحزمة الأصل بترتيبها — لا حرفَ زيد ولا نقص.
 *   ٣. كلُّ أثرٍ يطابق فهرسَ مصحف التيسير المطبوع ١١٤/١١٤.
 *   ٤. بايتٌ واحدٌ مُغيَّر في الأثر يُسقط التحميل.
 *   ٥. أيُّ التباسٍ أو عدٍّ خاطئٍ أو إصلاحٍ لا يجد كلمته يُفشل البناء — لا تخمين.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

import { candidateSourceForRawi } from '../src/lib/quran-candidate-sources';
import { TAYSEER_RESEGMENTATIONS, type CountModel } from '../src/lib/quran-tayseer-resegmentation';
import { resegmentPackage, ResegmentError, type PackageTable } from '../src/lib/quran-tayseer-resegment-core';
import { buildTayseerResegmentation } from '../scripts/quran-tayseer-resegment';
import { loadFrozenBoundaryBytes, parseBoundaryDocument } from '../scripts/quran-crosswalk-activate';
import { clearIslamwebPackageCache, loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';

const ROOT = process.cwd();
const dirOf = (file: string) => (file.startsWith('Qiraah') ? 'islamweb-derived' : 'kfgqpc-mirror-derived');
const fileOf = (file: string) => path.join(ROOT, 'quran-sources', dirOf(file), file);
const tableOf = (file: string): PackageTable => JSON.parse(new TextDecoder().decode(inflateRawSync(fs.readFileSync(fileOf(file)))));
const wordsOf = (t: PackageTable) =>
  Array.from({ length: 114 }, (_, i) => t[String(i + 1)]).flatMap(rows => rows.flatMap(r => r.text.split(/\s+/).filter(Boolean)));
const EXTRACTED = JSON.parse(fs.readFileSync(path.join(ROOT, 'quran-sources/crosswalk/alwa7y/extracted-counts.json'), 'utf8'));
const DOC = parseBoundaryDocument(loadFrozenBoundaryBytes());
const HAFS = tableOf('hafs.kfgqpc-mirror.json.deflate');
const BUILDS = buildTayseerResegmentation();

test('the build reproduces every committed artifact byte for byte, and the register pins it', () => {
  for (const build of BUILDS) {
    const r = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === build.rawiId)!;
    assert.equal(build.artifactSha256, r.artifactSha256, `${r.rawiId}: build drifted from its pin`);
    const onDisk = createHash('sha256').update(fs.readFileSync(fileOf(r.artifactFileName))).digest('hex');
    assert.equal(onDisk, r.artifactSha256, `${r.rawiId}: committed bytes drifted`);
    const source = candidateSourceForRawi(r.rawiId)!;
    assert.equal(source.expectedCompressedSha256, r.artifactSha256);
    assert.equal(source.committeeDecision.boundCompressedSha256, r.artifactSha256);
    assert.equal(source.resegmentedFrom?.sha256, r.baseArtifactSha256);
  }
});

test('not one word is added, dropped or moved out of order — except a named corrupted word', () => {
  for (const r of TAYSEER_RESEGMENTATIONS) {
    const fixes = new Map(r.repairs.flatMap(x => ('replaceWord' in x ? [[x.replaceWord.from, x.replaceWord.to] as const] : [])));
    const base = wordsOf(tableOf(r.baseArtifactFileName));
    const after = wordsOf(tableOf(r.artifactFileName));
    assert.deepEqual(after, base.map(w => fixes.get(w) ?? w), r.rawiId);
    // والكلمةُ التالفة تُستبدل في موضعها الوحيد، ولا يبقى منها أثر.
    for (const [from] of fixes) {
      assert.equal(base.filter(w => w === from).length, 1, `${r.rawiId}: ${from} occurs once`);
      assert.equal(after.includes(from), false);
    }
  }
  // رويس: «خائفين» دخلتها لامٌ زائدة (U+0644 U+064E) — والإصلاحُ يحذفهما وحدهما.
  const ruways = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === 'ruways')!.repairs[0];
  assert.ok('replaceWord' in ruways);
  if ('replaceWord' in ruways) assert.equal(ruways.replaceWord.from, `${ruways.replaceWord.to.slice(0, -1)}\u0644\u064e`);
});

test('every artifact matches its printed Tayseer index 114/114', () => {
  for (const r of TAYSEER_RESEGMENTATIONS) {
    const t = tableOf(r.artifactFileName);
    const counts = Array.from({ length: 114 }, (_, i) => t[String(i + 1)].length);
    assert.deepEqual(counts, EXTRACTED.mushafs[r.tayseerMushaf].publisherIndex, r.rawiId);
    assert.equal(counts.reduce((a, b) => a + b, 0), r.verseCount, r.rawiId);
  }
});

test('the scale of each change is exactly what the evidence calls for', () => {
  const scale = Object.fromEntries(BUILDS.map(b => [b.rawiId, [b.log.merges.length, b.log.splits.length, b.log.repairs.length]]));
  assert.deepEqual(scale, {
    'al-duri-abu-amr': [55, 42, 0],
    'al-susi': [55, 42, 1],
    'al-bazzi': [1, 0, 0],
    qunbul: [1, 0, 0],
    rawh: [2, 1, 0],
    ruways: [0, 1, 1],
  });
  // ابن كثير: الدمجُ الوحيد هو «عذابًا قريبًا». روح: الانشقاق دمجان، والقسمةُ «والحق أقول».
  const bazzi = BUILDS.find(b => b.rawiId === 'al-bazzi')!.log;
  assert.deepEqual(bazzi.merges, [{ surah: 78, packageAyah: 40, word: 'قريبا' }]);
  const rawh = BUILDS.find(b => b.rawiId === 'rawh')!.log;
  assert.deepEqual(rawh.merges.map(m => [m.surah, m.word]), [[84, 'بيمينه'], [84, 'ظهره']]);
  assert.deepEqual(rawh.splits.map(s => [s.surah, s.word, s.offset]), [[38, 'أقول', 0]]);
  // وكلُّ قسمةٍ اتفق فيها الدليلان (الكلمة وموضعها بحسب حفص) إلى كلمةٍ واحدة على الأكثر.
  for (const b of BUILDS) for (const s of b.log.splits) assert.ok(Math.abs(s.offset) <= 1, `${b.rawiId} ${s.surah}:${s.packageAyah} ${s.word}`);
});

test('one changed byte in a served artifact makes it unloadable', () => {
  const r = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === 'qunbul')!;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-tayseer-'));
  try {
    const bytes = Buffer.from(fs.readFileSync(fileOf(r.artifactFileName)));
    bytes[bytes.length >> 1] ^= 0x01;
    fs.writeFileSync(path.join(tmp, r.artifactFileName), bytes);
    clearIslamwebPackageCache();
    assert.throws(() => loadIslamwebReadingPackage('qunbul', { ...process.env, MIZAN_KFGQPC_MIRROR_SOURCE_ROOT: tmp }),
      /ISLAMWEB_PACKAGE_DIGEST_MISMATCH/);
  } finally {
    clearIslamwebPackageCache();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // والأثرُ الملتزَم نفسه يُحمَّل بعدّه الجديد.
  assert.equal(loadIslamwebReadingPackage('qunbul').nativeVerseCount, 6219);
});

const run = (rawiId: string, override: Partial<Parameters<typeof resegmentPackage>[0]> = {}) => {
  const r = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === rawiId)!;
  return resegmentPackage({
    table: tableOf(r.baseArtifactFileName), hafs: HAFS, doc: DOC,
    packageModel: r.packageModel, targetModel: r.targetModel, repairs: r.repairs, ...override,
  });
};

test('a wrong account of the package fails closed before anything is cut', () => {
  // حزمةُ الدوري ليست المدنيَّ الأول على رواية أبي جعفر — بل على رواية شيبة.
  const plainMadaniFirst: CountModel = { base: 'madani-first', add: [], drop: [], evidence: 'test' };
  assert.throws(() => run('al-duri-abu-amr', { packageModel: plainMadaniFirst }), (e: Error) =>
    e instanceof ResegmentError && /^PACKAGE_(MODEL_COUNT|END_WORD_MISMATCH):/.test(e.message));
  // ونقطةٌ لا وجود لها في المصدر لا تُقبل في وصف عدّ.
  const ghost: CountModel = { base: 'makki', add: [{ surah: 78, kufiAyah: 40, kind: 'internal', word: 'لاوجود' }], drop: [], evidence: 'test' };
  assert.throws(() => run('al-bazzi', { packageModel: ghost }), /MODEL_POINT_NOT_IN_SOURCE/);
});

test('the Susi repair is applied only to the exact words it names', () => {
  const r = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === 'al-susi')!;
  assert.throws(() => run('al-susi', { repairs: [{ ...r.repairs[0], moveWords: ['نَارًا'] }] }), /REPAIR_WORDS_NOT_FOUND/);
  // وبلا الإصلاح تتوقّف الحزمةُ عند موضع العيب نفسه — نوح ٢٦ — ولا تتجاوزه.
  assert.throws(() => run('al-susi', { repairs: [] }), /PACKAGE_END_WORD_MISMATCH:71:26:/);
});

test('a split whose word is not where both proofs place it is refused', () => {
  // تُمحى «أقول» من سطر روح فتغيب كلمةُ القسمة الوحيدة — فيفشل البناء ولا يُقسم في موضعٍ آخر.
  const r = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === 'rawh')!;
  const table = tableOf(r.baseArtifactFileName);
  const sad = table['38'].map(x => ({ ...x }));
  const row = sad.find(x => /أَقُولُ/.test(x.text))!;
  row.text = row.text.replace(/\S*أَقُولُ\S*/, 'أَحۡكُمُ');
  assert.throws(() => run('rawh', { table: { ...table, '38': sad } }), /SPLIT_AMBIGUOUS:38:/);
});
