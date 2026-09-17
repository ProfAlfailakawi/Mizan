import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QuranCrosswalkTable,
  validateCrosswalkRow,
  MIZAN_IDENTITY_CROSSWALK,
  CrosswalkError,
  crosswalkCoverage,
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

/*
 * الجدول لم يعد فارغًا، ولم يُملأ باجتهاد: صفوفه مولَّدةٌ من أثرِ حدودٍ مثبَّتٍ ببصمته،
 * ولا تدخله روايةٌ إلا بعد مطابقة أعداد سورها الـ١١٤ لأعداد حزمتها. فالشرط لم يَلِن —
 * تغيّر أن الدليل وصل. ولهذا يُحرَس هنا مصدرُ كل صفّ، لا عددُ الصفوف.
 */
test('every row in the default Mizan crosswalk comes from pinned evidence — none is invented', () => {
  assert.match(MIZAN_IDENTITY_CROSSWALK.mappingVersion, /^mizan-crosswalk-quranws-[0-9a-f]{12}-[0-9a-f]{12}$/);
  // روايةٌ عدُّها مطابقٌ للقانوني لا تحتاج صفًّا أصلًا، فلا يُصطنع لها.
  for (const rawiId of ['hafs', 'warsh', 'al-duri-kisai']) {
    assert.deepEqual(MIZAN_IDENTITY_CROSSWALK.rowsFor(rawiId), [], `${rawiId} needs no bridge rows`);
  }
  const hisham = MIZAN_IDENTITY_CROSSWALK.rowsFor('hisham');
  assert.ok(hisham.length > 0, 'hisham is evidenced from the pinned boundary artifact');
  for (const row of hisham) {
    assert.ok(row.evidence.some(e => e.includes('quran-ws/qiraat-ayah-map@')), 'each row names its pinned source');
    assert.ok(row.evidence.some(e => /^sha256:[0-9a-f]{64}$/.test(e)), 'each row names the source digest');
  }
});

/*
 * فراغُ الجدول لا يعني «كل شيء آيةٌ بآية». البقرة في العدّ الدمشقي ٢٨٥ آية لا ٢٨٦، فموضعُ
 * هشام المقابل للآية ١٠ قانونيًّا غير معلوم بلا دليل — ولا يجوز اختلاقه.
 */
test('a locus in a surah whose native count differs is refused unless a row proves it', () => {
  // روحٌ ما زال بلا دليل: سورةٌ واحدة تخالف، وواحدة تكفي لإبقاء الباب مغلقًا.
  const blocked = MIZAN_IDENTITY_CROSSWALK.toNative('rawh', { surah: 2, ayah: 10 });
  assert.equal(blocked.assurance, 'UNRESOLVED');
  assert.equal(blocked.native, undefined, 'no native locus may be invented for a diverging count');
  assert.match(String(blocked.reason), /^NATIVE_COUNT_DIVERGES:2:286:287$/);

  // وهشامٌ محلولٌ بدليلٍ منصوص لا بافتراض: ٢:١٠ تُقسَم آيتين في العدّ الدمشقي.
  const evidenced = MIZAN_IDENTITY_CROSSWALK.toNative('hisham', { surah: 2, ayah: 10 });
  assert.equal(evidenced.assurance, 'EVIDENCED_ROW');
  assert.equal(evidenced.assumed, false);
  assert.deepEqual(evidenced.native, { surah: 2, ayahStart: 9, ayahEnd: 10 });
  assert.equal(evidenced.relation, 'SPLIT');
  assert.ok(evidenced.evidence.length > 0);
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

/*
 * الطريق من «ست روايات معلّقة» إلى عشرينَ جاهزة يمرّ بقرار لجنةٍ لا بتعديل منطق. هذا
 * الاختبار يثبت أن الآلة جاهزة للاستقبال: صفٌّ معتمدٌ واحد يحلّ موضعه فورًا، وصفٌّ بلا
 * مرجع يُرفض، والملف اليوم فارغٌ قصدًا فلا يُدَّعى ما لم يصل.
 */
test('the evidence file carries only what the pinned artifact proves, and says which readings', async () => {
  const { COMMITTEE_CROSSWALK_ROWS, CROSSWALK_ACTIVATED_RAWIS } = await import('../src/lib/quran-crosswalk-evidence');
  assert.equal(COMMITTEE_CROSSWALK_ROWS.length, MIZAN_IDENTITY_CROSSWALK.size);
  assert.deepEqual([...CROSSWALK_ACTIVATED_RAWIS].sort(),
    ['hisham', 'ibn-dhakwan', 'ibn-jammaz', 'ibn-wardan', 'ruways']);
  // وما لم يُثبت لا يدخل: روحٌ بلا صفٍّ واحد، فيبقى محجوبًا عن السؤال.
  assert.equal(COMMITTEE_CROSSWALK_ROWS.some(r => r.rawiId === 'rawh'), false);
  assert.equal(crosswalkCoverage('rawh').questionSafe, false);
  assert.equal(crosswalkCoverage('hisham').questionSafe, true);
});

test('one evidenced committee row resolves its own locus and only its own', () => {
  const table = new QuranCrosswalkTable([
    {
      rawiId: 'hisham',
      canonical: { surah: 99, ayah: 6 },
      native: { surah: 99, ayahStart: 6, ayahEnd: 7 },
      relation: 'SPLIT',
      evidence: ['MIZAN-COMMITTEE-EXAMPLE-ROW'],
    },
  ], 'mizan-crosswalk-committee-test');

  const resolved = table.toNative('hisham', { surah: 99, ayah: 6 });
  assert.equal(resolved.assurance, 'EVIDENCED_ROW');
  assert.equal(resolved.relation, 'SPLIT');
  assert.deepEqual(resolved.native, { surah: 99, ayahStart: 6, ayahEnd: 7 });

  // الجارُ في السورة نفسها يبقى مجهولًا: صفٌّ واحد لا يفتح سورةً كاملة.
  assert.equal(table.toNative('hisham', { surah: 99, ayah: 7 }).assurance, 'UNRESOLVED');

  // والتغطية تتحرّك بمقدار الصفّ الواحد لا أكثر، والسورة تبقى في قائمة ما يحتاج دليلًا.
  // تُقاس من جدولٍ فارغ لا من جدول ميزان العامل، فالمقصود أثرُ الصفّ الواحد وحده.
  const before = crosswalkCoverage('hisham', new QuranCrosswalkTable([]));
  const after = crosswalkCoverage('hisham', table);
  assert.equal(after.resolvedLoci, before.resolvedLoci + 1);
  assert.equal(after.unresolvedLoci, before.unresolvedLoci - 1);
  assert.ok(after.surahsRequiringEvidence.includes(99));
  assert.equal(after.questionSafe, false);

  // ورواية أخرى لا تتأثّر بصفّ ليس لها.
  assert.equal(table.toNative('ibn-dhakwan', { surah: 99, ayah: 6 }).assurance, 'UNRESOLVED');
});
