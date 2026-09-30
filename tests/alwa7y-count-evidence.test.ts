/*
 * أدلّة مصاحف التيسير (alwa7y.com) — أعداد الآي فقط.
 *
 * هذه الاختبارات تثبّت ما قيس، لا ما يُتمنّى: أن فهرس كل ناشر وقراءة علاماته متفقان إلا
 * في مواضع رُوجعت بالنظر، وأنهما يطابقان العدّ المنشور في quran-ws، وأين بالضبط يخالفان
 * حزم ميزان. فإن تغيّر رقمٌ في الحزمة أو في المستخرَج انكسر الاختبار وسُئل عنه.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ayahCountOf } from '../src/lib/quran-canon';
import { NATIVE_SURAH_AYAH_COUNTS } from '../src/lib/quran-native-count-systems';
import {
  buildForwardBoundaryMapping,
  compareForwardCounts,
} from '../src/lib/quran-count-boundary-mapping';
import { loadFrozenBoundaryBytes, parseBoundaryDocument } from '../scripts/quran-crosswalk-activate';

const ROOT = path.join('quran-sources', 'crosswalk', 'alwa7y');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'MANIFEST.json'), 'utf8'));
const extracted = JSON.parse(fs.readFileSync(path.join(ROOT, 'extracted-counts.json'), 'utf8'));
const boundaryDocument = parseBoundaryDocument(loadFrozenBoundaryBytes());

function publishedCounts(system: string): number[] {
  return buildForwardBoundaryMapping(boundaryDocument, system, ayahCountOf).surahs.map((s) => s.targetAyahCount);
}

function mismatchSurahs(a: readonly number[], b: readonly number[]): number[] {
  return a.flatMap((n, i) => (n === b[i] ? [] : [i + 1]));
}

const TAYSEER = ['TayseerDoryBasry.pdf', 'TayseerSosy.pdf', 'TayseerKathir.pdf', 'TayseerYakob.pdf'];

test('كل ملفٍّ في السجلّ له بصمة sha256 وحجمٌ ورابط', () => {
  for (const f of [...manifest.files, ...manifest.corroborating]) {
    assert.match(f.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isInteger(f.byteLength) && f.byteLength > 0);
    assert.match(f.url, /^https?:\/\//);
  }
  assert.equal(manifest.approval.by, 'ميزان');
  assert.deepEqual(
    manifest.files.filter((f: { url: string }) => { const host = new URL(f.url).hostname; return host === 'alwa7y.com' || host.endsWith('.alwa7y.com'); }).map((f: { url: string }) => path.basename(f.url)),
    TAYSEER,
  );
});

test('فهرس كل ناشر وقراءة علاماته متفقان إلا في مواضع رُوجعت بالنظر', () => {
  for (const name of TAYSEER) {
    const m = extracted.mushafs[name];
    assert.equal(m.publisherIndex.length, 114, name);
    assert.equal(m.markerReading.length, 114, name);
    const reconciled = m.reconciliation.map((r: { surah: number }) => r.surah);
    assert.deepEqual(mismatchSurahs(m.publisherIndex, m.markerReading), reconciled, name);
    for (const r of m.reconciliation) assert.equal(m.publisherIndex[r.surah - 1], r.index, name);
  }
});

test('أبو عمرو: مصحفا الدوري والسوسي بصريّان 6204 ويطابقان quran-ws ١١٤/١١٤', () => {
  const basri = publishedCounts('basri');
  for (const name of ['TayseerDoryBasry.pdf', 'TayseerSosy.pdf']) {
    const counts = extracted.mushafs[name].publisherIndex;
    assert.equal(counts.reduce((a: number, b: number) => a + b, 0), 6204);
    assert.deepEqual(mismatchSurahs(counts, basri), [], name);
  }
});

test('ابن كثير: المصحف مكّيٌّ 6219 ويطابق quran-ws ١١٤/١١٤', () => {
  const counts = extracted.mushafs['TayseerKathir.pdf'].publisherIndex;
  assert.equal(counts.reduce((a: number, b: number) => a + b, 0), 6219);
  assert.deepEqual(mismatchSurahs(counts, publishedCounts('makki')), []);
});

test('يعقوب: المصحف بصريٌّ 6205 — يخالف quran-ws في ص وحدها (وجهٌ بصريٌّ معروف)', () => {
  const counts = extracted.mushafs['TayseerYakob.pdf'].publisherIndex;
  assert.equal(counts.reduce((a: number, b: number) => a + b, 0), 6205);
  assert.deepEqual(mismatchSurahs(counts, publishedCounts('basri')), [38]);
  assert.equal(counts[37], 86);
});

/*
 * الحكم على الحزم: مصحف اللجنة يُقابَل بحزمة كل راوٍ. لا يُفعَّل راوٍ إلا بـ١١٤/١١٤، وهذه
 * الأرقام تثبّت لماذا بقي كلٌّ منهم محجوبًا، فلا يُفعَّل أحدٌ بتعديلٍ صامت.
 */
test('الحزم تخالف مصاحف اللجنة — فالخمسة محجوبون، وكلٌّ بسوره المسمّاة', () => {
  const idx = (name: string) => extracted.mushafs[name].publisherIndex;
  const abuAmr = mismatchSurahs(idx('TayseerDoryBasry.pdf'), NATIVE_SURAH_AYAH_COUNTS.BASRI_ABU_AMR_DELIVERY);
  assert.equal(abuAmr.length, 41);
  assert.deepEqual(mismatchSurahs(idx('TayseerSosy.pdf'), NATIVE_SURAH_AYAH_COUNTS.BASRI_ABU_AMR_DELIVERY), abuAmr);
  assert.deepEqual(mismatchSurahs(idx('TayseerKathir.pdf'), NATIVE_SURAH_AYAH_COUNTS.MAKKI_IBN_KATHIR_DELIVERY), [78]);
  assert.deepEqual(mismatchSurahs(idx('TayseerYakob.pdf'), NATIVE_SURAH_AYAH_COUNTS.BASRI_YAQUB_RAWH), [38, 84]);
});

test('حزمة أبي عمرو معدودةٌ بالمدني الأول لا بالبصري — ٣ سور فقط تفارقه، وهي موضع 6214/6217', () => {
  const pkg = NATIVE_SURAH_AYAH_COUNTS.BASRI_ABU_AMR_DELIVERY;
  assert.deepEqual(compareForwardCounts(
    buildForwardBoundaryMapping(boundaryDocument, 'madani-first', ayahCountOf), pkg,
  ).mismatches.map((m) => m.surah), [37, 80, 81]);
  assert.equal(pkg.reduce((a, b) => a + b, 0), 6217);
});

/*
 * الدليل الثاني على «مكان» الحدّ لا عدده فقط: كل موضعٍ نصّ عليه الداني في أبواب المفردات
 * والاشتراك يجب أن يكون في quran-ws بالكلمة نفسها وبالحكم نفسه.
 */
test('مواضع الداني المنصوصة (٥٣) تطابق حدود quran-ws كلمةً وحكمًا', () => {
  const anchors = JSON.parse(fs.readFileSync(path.join(ROOT, 'dani-anchors.json'), 'utf8')).anchors;
  const strip = (s: string) => s.replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  assert.equal(anchors.length, 53);
  for (const a of anchors) {
    const primitive = boundaryDocument.surahs[String(a.surah)]?.[String(a.kufiAyah)];
    const points = [...(primitive?.internal ?? []), ...(primitive?.end ? [primitive.end] : [])];
    const point = points.find((p) => strip(p.word).endsWith(strip(a.word)));
    assert.ok(point, `${a.surah}:${a.kufiAyah} ${a.word}`);
    for (const s of a.mustCount) assert.ok(point.counted_by.includes(s), `${a.surah}:${a.kufiAyah} ${a.word} ⟵ ${s}`);
    for (const s of a.mustNotCount) assert.ok(!point.counted_by.includes(s), `${a.surah}:${a.kufiAyah} ${a.word} ⟵ ليس ${s}`);
  }
});
