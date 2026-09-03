import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReadingConsistency, ReadingIsolationError, isOperationalReading, isKnownReading } from '../server/alignment/reading';
import { AlignmentSessionManager, SessionFailClosed } from '../server/alignment/session';
import { devHafsPassage } from '../server/alignment/canonical';
import { buildBackend } from './_alignment-harness';

// Reading isolation is a red line (§5) and sessions fail closed (§48). These tests lock that in.

test('assertReadingConsistency throws on unknown / non-operational / mismatched readings', () => {
  assert.throws(() => assertReadingConsistency({ sessionReading: 'martian' }), ReadingIsolationError);
  assert.throws(() => assertReadingConsistency({ sessionReading: 'warsh' }), (e: unknown) => e instanceof ReadingIsolationError && e.code === 'READING_NOT_OPERATIONAL');
  assert.throws(() => assertReadingConsistency({ sessionReading: 'hafs', lexiconReading: 'warsh' }), (e: unknown) => e instanceof ReadingIsolationError && e.code === 'READING_LEXICON_MISMATCH');
  assert.throws(() => assertReadingConsistency({ sessionReading: 'hafs', modelReading: 'qalun' }), (e: unknown) => e instanceof ReadingIsolationError && e.code === 'READING_MODEL_MISMATCH');
  assert.doesNotThrow(() => assertReadingConsistency({ sessionReading: 'hafs', lexiconReading: 'hafs', modelReading: 'hafs' }));
});

test('reading flags', () => {
  assert.equal(isKnownReading('hafs'), true);
  assert.equal(isKnownReading('nope'), false);
  assert.equal(isOperationalReading('hafs'), true);
  assert.equal(isOperationalReading('warsh'), false);
});

test('session manager fails closed when the acoustic reference is unavailable', () => {
  const passage = devHafsPassage(256, 256);
  const mgr = new AlignmentSessionManager(
    { getPassage: () => passage },
    { getBackend: () => null }, // reference not ingested
  );
  assert.throws(() => mgr.create({
    sessionId: 'x', readingId: 'hafs', surah: 2, startAyah: 256, endAyah: 256,
    canonicalTextHash: passage.canonicalTextHash, canonicalPackageVersion: 'dev',
  }), (e: unknown) => e instanceof SessionFailClosed && e.code === 'ACOUSTIC_REFERENCE_UNAVAILABLE');
});

test('session manager fails closed on canonical hash mismatch', () => {
  const passage = devHafsPassage(256, 256);
  const mgr = new AlignmentSessionManager(
    { getPassage: () => passage },
    { getBackend: (_s, p) => buildBackend(p, 200) },
  );
  assert.throws(() => mgr.create({
    sessionId: 'y', readingId: 'hafs', surah: 2, startAyah: 256, endAyah: 256,
    canonicalTextHash: 'WRONGHASH', canonicalPackageVersion: 'dev',
  }), (e: unknown) => e instanceof SessionFailClosed && e.code === 'CANONICAL_HASH_MISMATCH');
});

test('session manager runs a real session end-to-end and rejects out-of-order audio', () => {
  const passage = devHafsPassage(256, 256);
  const mgr = new AlignmentSessionManager(
    { getPassage: () => passage },
    { getBackend: (_s, p) => buildBackend(p, 220) },
  );
  const { handle, startedEvent } = mgr.create({
    sessionId: 'z', readingId: 'hafs', surah: 2, startAyah: 256, endAyah: 256,
    canonicalTextHash: passage.canonicalTextHash, canonicalPackageVersion: 'dev',
  });
  assert.equal(startedEvent.eventType, 'SESSION_STARTED');
  assert.ok(handle.manifest.configHash.length > 0);
  // A tiny valid PCM chunk at seq 0 works; seq 5 (out of order) is rejected.
  const chunk = new Uint8Array(3200); // 100ms of silence, 16-bit aligned
  assert.doesNotThrow(() => mgr.pushAudio('z', 0, chunk));
  assert.throws(() => mgr.pushAudio('z', 5, chunk), (e: unknown) => e instanceof SessionFailClosed && e.code === 'AUDIO_OUT_OF_ORDER');
  // Odd-length (misaligned) audio is rejected.
  assert.throws(() => mgr.pushAudio('z', 1, new Uint8Array(3)), (e: unknown) => e instanceof SessionFailClosed && e.code === 'AUDIO_MALFORMED');
});
