import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_READINGS,
  CANONICAL_RAWI_IDS,
  CANONICAL_READING_BY_RAWI,
  readingCapability,
  readingCapabilityMatrix,
  readingReleaseSummary,
  resolveCanonicalRawiId,
  AL_DURI_ABU_AMR,
  AL_DURI_KISAI,
} from '../src/lib/canonical-readings';
import { TEN_QIRAAT_GRAPH, resolveReading } from '../src/lib/scientific-core';
import { DELIVERY_READING_BY_RAWI, DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { readingOptions } from '../src/lib/quran-reading-sources';

/*
 * السجلّ القانوني الواحد للقراءات العشر ورواتها العشرين.
 * هذه الاختبارات تمنع عودة التجزئة: كل طبقة تعرف الرواة نفسهم، ولا يُخمَّن «الدوري»،
 * والملخّص صادقٌ محسوبٌ من الحالة لا رقمٌ ثابت.
 */

test('the canonical registry holds exactly the ten qiraat and their twenty rawis', () => {
  assert.equal(CANONICAL_READINGS.length, 20, 'twenty transmissions');
  assert.equal(CANONICAL_RAWI_IDS.length, 20);
  // لا تكرار في معرّفات الرواة.
  assert.equal(new Set(CANONICAL_RAWI_IDS).size, 20, 'no duplicate rawiId');
  // عشر قراءات مميّزة.
  assert.equal(new Set(CANONICAL_READINGS.map(r => r.qiraahId)).size, 10, 'ten distinct qiraat');
});

test('the registry is derived from the canonical graph, not a fourth hand-written list', () => {
  // كل عقدة في الرسم لها صفٌّ في السجلّ بنفس الهوية — لا زيادة ولا نقصان.
  const graphRawis = new Set(TEN_QIRAAT_GRAPH.map(n => n.rawiId));
  const registryRawis = new Set(CANONICAL_RAWI_IDS);
  assert.deepEqual([...registryRawis].sort(), [...graphRawis].sort());
  for (const node of TEN_QIRAAT_GRAPH) {
    const row = CANONICAL_READING_BY_RAWI.get(node.rawiId);
    assert.ok(row, `registry has ${node.rawiId}`);
    assert.equal(row!.qiraahId, node.qiraahId, `qiraah identity agrees for ${node.rawiId}`);
    assert.equal(row!.graphSourceStatus, node.sourceStatus);
  }
});

test('display labels agree with the single display list — no spelling drift', () => {
  const byRawi = new Map(readingOptions().map(o => [o.rawiId, o]));
  for (const r of CANONICAL_READINGS) {
    const opt = byRawi.get(r.rawiId);
    assert.ok(opt, `display option exists for ${r.rawiId}`);
    assert.equal(r.labelArabic, opt!.labelArabic, `arabic label agrees for ${r.rawiId}`);
    assert.equal(r.labelEnglish, opt!.labelEnglish, `english label agrees for ${r.rawiId}`);
  }
});

test('every delivered rawi is a known canonical rawi — delivery cannot drift ahead of the registry', () => {
  for (const rawiId of DELIVERED_RAWI_IDS) {
    assert.ok(CANONICAL_READING_BY_RAWI.has(rawiId), `delivered rawi ${rawiId} is canonical`);
  }
  // وكل مفتاح في جدول التسليم كذلك.
  for (const rawiId of Object.keys(DELIVERY_READING_BY_RAWI)) {
    assert.ok(CANONICAL_READING_BY_RAWI.has(rawiId), `delivery-map rawi ${rawiId} is canonical`);
  }
});

test('the capability matrix reports real state, never a blanket 20/20', () => {
  const matrix = readingCapabilityMatrix();
  assert.equal(matrix.length, 20);
  // الهوية القانونية واعتماد اللجنة والصوت العالمي — للعشرين.
  assert.ok(matrix.every(r => r.canonicalIdentity), 'canonical identity for all 20');
  assert.ok(matrix.every(r => r.committeeApproved), 'committee approval for all 20');
  assert.ok(matrix.every(r => r.globalHafsAudio), 'global Hafs audio for all 20');
  // لكن الجاهزية للإنتاج تتبع حزمة التسليم الفعلية فقط.
  for (const row of matrix) {
    const delivered = Object.prototype.hasOwnProperty.call(DELIVERY_READING_BY_RAWI, row.rawiId);
    assert.equal(row.productionReady, delivered, `production readiness matches delivery for ${row.rawiId}`);
    assert.equal(row.deliveryState, delivered ? 'DELIVERY_READY' : 'PENDING_SOURCE');
  }
});

test('the release summary is computed honestly from state', () => {
  const s = readingReleaseSummary();
  assert.equal(s.total, 20);
  assert.equal(s.canonicalIdentities, 20);
  assert.equal(s.committeeApproved, 20);
  assert.equal(s.globalHafsAudio, 20);
  // حزم التسليم = مفاتيح جدول التسليم فعلًا.
  assert.equal(s.deliveryPackages, Object.keys(DELIVERY_READING_BY_RAWI).length);
  assert.equal(s.productionReady, s.deliveryPackages);
  // الروايات المعلّقة = 20 ناقص ذوات الحزم، ولا واحدة منها في جدول التسليم.
  assert.equal(s.pendingSource.length, 20 - s.deliveryPackages);
  for (const rawiId of s.pendingSource) {
    assert.ok(!Object.prototype.hasOwnProperty.call(DELIVERY_READING_BY_RAWI, rawiId));
  }
  // Hafs جاهزٌ دائمًا.
  assert.ok(!s.pendingSource.includes('hafs'), 'Hafs is never pending');
});

test('al-Duri is never guessed: the two Duris are distinct and resolve unambiguously', () => {
  assert.notEqual(AL_DURI_ABU_AMR, AL_DURI_KISAI);
  assert.ok(CANONICAL_READING_BY_RAWI.has(AL_DURI_ABU_AMR));
  assert.ok(CANONICAL_READING_BY_RAWI.has(AL_DURI_KISAI));
  assert.equal(CANONICAL_READING_BY_RAWI.get(AL_DURI_ABU_AMR)!.qiraahId, 'abu-amr');
  assert.equal(CANONICAL_READING_BY_RAWI.get(AL_DURI_KISAI)!.qiraahId, 'al-kisai');

  // بالنصّ الكامل يُحلّ كلٌّ قاطعًا إلى راويه.
  assert.equal(resolveCanonicalRawiId({ rawi: 'الدوري عن أبي عمرو' }), AL_DURI_ABU_AMR);
  assert.equal(resolveCanonicalRawiId({ rawi: 'الدوري عن الكسائي' }), AL_DURI_KISAI);

  // «الدوري» وحدها → غامضة → لا يُخمَّن (فشلٌ مغلق)، ولو أُضيفت القراءة كمُرشِّح.
  assert.equal(resolveCanonicalRawiId({ rawi: 'الدوري' }), undefined);
  assert.equal(resolveCanonicalRawiId({ qiraah: 'أبو عمرو', rawi: 'الدوري' }), undefined);
  assert.equal(resolveReading({ rawi: 'الدوري' }), undefined);
});

test('readingCapability returns undefined for an unknown rawi — fail closed', () => {
  assert.equal(readingCapability('not-a-rawi'), undefined);
  assert.equal(resolveCanonicalRawiId({ rawi: 'لا-أحد' }), undefined);
});
