import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QuranCrosswalkTable,
  validateCrosswalkRow,
  MIZAN_IDENTITY_CROSSWALK,
  CrosswalkError,
  type QuranLocusCrosswalk,
} from '../src/lib/quran-locus-crosswalk';

const row = (over: Partial<QuranLocusCrosswalk> = {}): QuranLocusCrosswalk => ({
  rawiId: 'warsh',
  canonical: { surah: 2, ayah: 5 },
  native: { surah: 2, ayah: 5 },
  relation: 'EXACT',
  evidence: [],
  ...over,
});

test('the default Mizan crosswalk is deliberately empty — no invented mapping rows', () => {
  assert.equal(MIZAN_IDENTITY_CROSSWALK.size, 0);
  assert.equal(MIZAN_IDENTITY_CROSSWALK.mappingVersion, 'mizan-crosswalk-identity-v1');
  for (const rawiId of ['hafs', 'warsh', 'hisham', 'al-duri-kisai']) {
    assert.deepEqual(MIZAN_IDENTITY_CROSSWALK.rowsFor(rawiId), []);
  }
});

/*
 * فراغُ الجدول لا يعني «كل شيء آيةٌ بآية». البقرة في العدّ الدمشقي ٢٨٥ آية لا ٢٨٦، فموضعُ
 * هشام المقابل للآية ١٠ قانونيًّا غير معلوم بلا دليل — ولا يجوز اختلاقه.
 */
test('a locus in a surah whose native count differs is refused, not silently mapped', () => {
  const res = MIZAN_IDENTITY_CROSSWALK.toNative('hisham', { surah: 2, ayah: 10 });
  assert.equal(res.assurance, 'UNRESOLVED');
  assert.equal(res.native, undefined, 'no native locus may be invented for a diverging count');
  assert.match(String(res.reason), /^NATIVE_COUNT_DIVERGES:2:286:285$/);
});

test('a locus in a surah whose native count is verified equal maps one-to-one as a result', () => {
  // الكوفي: عدّ كل سورة مطابق، ومستخرَجٌ من بايتات الحزمة المثبَّتة.
  const res = MIZAN_IDENTITY_CROSSWALK.toNative('khalaf-hamzah', { surah: 2, ayah: 10 });
  assert.deepEqual(res.native, { surah: 2, ayah: 10 });
  assert.equal(res.relation, 'EXACT');
  assert.equal(res.assurance, 'VERIFIED_COUNT_IDENTITY');
  assert.equal(res.assumed, true, 'a verified count is still not an evidenced crosswalk row');
});

test('a delivered reading whose package numbering was never read stays an announced assumption', () => {
  const res = MIZAN_IDENTITY_CROSSWALK.toNative('warsh', { surah: 2, ayah: 10 });
  assert.deepEqual(res.native, { surah: 2, ayah: 10 });
  assert.equal(res.assurance, 'UNVERIFIED_COUNT_IDENTITY');
  assert.equal(res.assumed, true);
});

test('an evidenced row resolves as evidence, not assumption', () => {
  const table = new QuranCrosswalkTable([
    row({ rawiId: 'warsh', canonical: { surah: 2, ayah: 5 }, native: { surah: 2, ayah: 4 }, relation: 'BOUNDARY_SHIFT', evidence: ['committee-ref-1'] }),
  ]);
  const res = table.toNative('warsh', { surah: 2, ayah: 5 });
  assert.equal(res.assumed, false);
  assert.equal(res.relation, 'BOUNDARY_SHIFT');
  assert.deepEqual(res.native, { surah: 2, ayah: 4 });
  assert.deepEqual(res.evidence, ['committee-ref-1']);
  assert.ok(table.hasEvidenceFor('warsh', { surah: 2, ayah: 5 }));
  assert.ok(!table.hasEvidenceFor('warsh', { surah: 2, ayah: 6 }));
});

test('a difference claim without evidence is rejected', () => {
  assert.throws(() => validateCrosswalkRow(row({ relation: 'BOUNDARY_SHIFT', evidence: [] })),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_EVIDENCE_REQUIRED');
  assert.throws(() => validateCrosswalkRow(row({ relation: 'MERGED', evidence: ['   '] })),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_EVIDENCE_REQUIRED');
  // EXACT needs no evidence
  assert.doesNotThrow(() => validateCrosswalkRow(row({ relation: 'EXACT' })));
});

test('row shapes are validated and fail closed', () => {
  assert.throws(() => validateCrosswalkRow(row({ rawiId: 'not-a-rawi' })),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_UNKNOWN_RAWI');
  assert.throws(() => validateCrosswalkRow(row({ canonical: { surah: 2, ayah: 9999 } })),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_CANONICAL_LOCUS_INVALID');
  assert.throws(() => validateCrosswalkRow(row({ native: { surah: 2 } })),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_NATIVE_TARGET_REQUIRED');
  assert.throws(() => validateCrosswalkRow(row({ relation: 'SPLIT', native: { surah: 2, ayah: 5 }, evidence: ['x'] })),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_SPLIT_REQUIRES_RANGE');
  assert.throws(() => validateCrosswalkRow(row({ relation: 'MERGED', native: { surah: 2, ayahStart: 8, ayahEnd: 5 }, evidence: ['x'] })),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_NATIVE_RANGE_INVERTED');
});

test('duplicate canonical loci for one rawi are rejected', () => {
  assert.throws(() => new QuranCrosswalkTable([row(), row()]),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_DUPLICATE_CANONICAL_LOCUS');
  // the same canonical locus for a different rawi is fine
  assert.doesNotThrow(() => new QuranCrosswalkTable([row({ rawiId: 'warsh' }), row({ rawiId: 'qalun' })]));
});

test('the reverse direction is never guessed — only evidence answers it', () => {
  const table = new QuranCrosswalkTable([
    row({ rawiId: 'qalun', canonical: { surah: 7, ayah: 3 }, native: { surah: 7, ayahStart: 3, ayahEnd: 4 }, relation: 'SPLIT', evidence: ['ref'] }),
  ]);
  assert.deepEqual(table.toCanonicalFromEvidence('qalun', { surah: 7, ayah: 4 }), { surah: 7, ayah: 3 });
  // no evidenced row → undefined, not an identity guess
  assert.equal(table.toCanonicalFromEvidence('qalun', { surah: 9, ayah: 1 }), undefined);
  assert.throws(() => table.toCanonicalFromEvidence('not-a-rawi', { surah: 1, ayah: 1 }),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_UNKNOWN_RAWI');
});

test('resolution fails closed for an unknown rawi — never falls back to another reading', () => {
  assert.throws(() => MIZAN_IDENTITY_CROSSWALK.toNative('not-a-rawi', { surah: 1, ayah: 1 }),
    (e: unknown) => e instanceof CrosswalkError && e.code === 'CROSSWALK_UNKNOWN_RAWI');
});
