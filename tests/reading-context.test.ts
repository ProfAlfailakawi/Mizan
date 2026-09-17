import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readingContextForRawi,
  readingContextFromInput,
  readingForContext,
  sameReadingContext,
  freezeReadingContext,
  assertContextMatchesFrozen,
  ReadingContextError,
} from '../src/lib/reading-context';

test('a reading context is built from the canonical registry, never guessed', () => {
  const ctx = readingContextForRawi('hisham');
  assert.equal(ctx.rawiId, 'hisham');
  assert.equal(ctx.qiraahId, 'ibn-amir');
  assert.equal(readingForContext(ctx)?.labelArabic, 'هشام عن ابن عامر');
});

test('an unknown rawi fails closed — no fallback to Hafs', () => {
  assert.throws(() => readingContextForRawi('not-a-rawi'), (e: unknown) => e instanceof ReadingContextError && e.code === 'READING_CONTEXT_UNKNOWN_RAWI');
});

test('ambiguous free input (bare al-Duri) fails closed instead of guessing', () => {
  assert.throws(() => readingContextFromInput({ rawi: 'الدوري' }), (e: unknown) => e instanceof ReadingContextError && e.code === 'READING_CONTEXT_UNRESOLVED');
  // full strings resolve to the correct distinct Duri
  assert.equal(readingContextFromInput({ rawi: 'الدوري عن أبي عمرو' }).rawiId, 'al-duri-abu-amr');
  assert.equal(readingContextFromInput({ rawi: 'الدوري عن الكسائي' }).rawiId, 'al-duri-kisai');
});

test('sameReadingContext matches on scientific identity only', () => {
  const a = readingContextForRawi('warsh', { sourcePackageId: 'pkg-a', packageVersion: 'v1' });
  const b = readingContextForRawi('warsh', { sourcePackageId: 'pkg-b', packageVersion: 'v2' });
  assert.ok(sameReadingContext(a, b));
  assert.ok(!sameReadingContext(a, readingContextForRawi('qalun')));
});

test('a frozen context cannot be silently changed after session lock', () => {
  const frozen = freezeReadingContext(readingContextForRawi('hisham'), '2026-09-16T00:00:00Z');
  assert.equal(frozen.frozen, true);
  assert.equal(frozen.frozenAt, '2026-09-16T00:00:00Z');
  assert.ok(Object.isFrozen(frozen));
  // same reading is accepted
  assert.doesNotThrow(() => assertContextMatchesFrozen(frozen, readingContextForRawi('hisham')));
  // a different reading is rejected
  assert.throws(() => assertContextMatchesFrozen(frozen, readingContextForRawi('hafs')),
    (e: unknown) => e instanceof ReadingContextError && e.code === 'READING_CONTEXT_FROZEN_MISMATCH');
});

/*
 * ضمانةٌ ضدّ تفرّع الأنواع: النوعُ الأساس في محرّك الأسئلة، وهذا مُشتقٌّ منه بتشديد
 * الهوية. فما يُبنى هنا يمرّ إلى القرعة ومحرّك النطاق بلا تحويلٍ ولا نسخةٍ ثانية.
 */
test('the strengthened context is the engine context, not a parallel type', async () => {
  const { poolItemToCandidate } = await import('../src/lib/fairdraw');
  const ctx = readingContextForRawi('hisham', { sourcePackageId: 'pkg-hisham', packageVersion: 'v1' });

  // يُمرَّر إلى المحرّك كما هو — لو كان نوعًا منافسًا لَما قُبل هنا (يحرسه tsc).
  const candidate = poolItemToCandidate({
    id: 'q1', surahNumber: 2, surahNameArabic: 'البقرة', surahNameEnglish: 'Al-Baqarah',
    startAyah: 1, endAyah: 5, juzNumber: 1, riwaya: 'هشام عن ابن عامر',
    expectedTextArabic: 'نص', difficultyRating: 3, mutashabihatDensity: 'low',
    tajweedComplexity: 'intermediate', timesUsed: 0,
  }, ctx);

  // وهوية الرواية تنتقل إلى المرشّح، فلا يُسحب موضعٌ بلا راوٍ.
  assert.equal(candidate.rawiId, 'hisham');
  assert.equal(candidate.qiraahId, 'ibn-amir');
});

test('a source-package mismatch is visible in the context that travels with the session', () => {
  const a = readingContextForRawi('warsh', { sourcePackageId: 'pkg-a', packageVersion: 'v1' });
  assert.equal(a.sourcePackageId, 'pkg-a');
  assert.equal(a.packageVersion, 'v1');
  // والتجميد يحفظ الحزمة وإصدارها لإعادة تفسير النتيجة تاريخيًا.
  const frozen = freezeReadingContext(a);
  assert.equal(frozen.sourcePackageId, 'pkg-a');
  assert.equal(frozen.packageVersion, 'v1');
});
