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
