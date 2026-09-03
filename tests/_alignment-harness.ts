// Shared harness for alignment tests/benchmark. NOT a test file (no *.test.ts suffix).
// Builds a REAL engine: synthetic reference PCM → real MFCC → ReferenceTemplateBackend → engine.
import { AlignmentEngine } from '../server/alignment/engine';
import { DEFAULT_CONFIG, AlignmentSessionSpec, AlignmentConfig } from '../server/alignment/types';
import { CanonicalPassage, devHafsPassage } from '../server/alignment/canonical';
import { ReferenceTemplateBackend } from '../server/alignment/acoustic/reference-template';
import { synthReference } from '../server/alignment/benchmark/synth';

export function frameParams(cfg: AlignmentConfig = DEFAULT_CONFIG) {
  return {
    frameLen: Math.round((cfg.frameMs * 16000) / 1000),
    hopLen: Math.round((cfg.hopMs * 16000) / 1000),
    melBands: cfg.melBands,
    mfccCount: cfg.mfccCount,
    useDeltas: cfg.useDeltas,
  };
}

export function buildBackend(passage: CanonicalPassage, wordMs = 280) {
  const ref = synthReference(passage, wordMs, 0.01);
  const fp = frameParams();
  return ReferenceTemplateBackend.build({
    reading: 'hafs', pcm: ref.pcm, sampleRate: ref.sampleRate, wordBoundariesMs: ref.wordBoundariesMs, ...fp,
  });
}

export function buildEngine(opts: { startAyah?: number; endAyah?: number; wordMs?: number } = {}) {
  const startAyah = opts.startAyah ?? 256;
  const endAyah = opts.endAyah ?? 256;
  const passage = devHafsPassage(startAyah, endAyah);
  const backend = buildBackend(passage, opts.wordMs ?? 280);
  const spec: AlignmentSessionSpec = {
    sessionId: 'test-sess', readingId: 'hafs', surah: 2, startAyah, endAyah,
    expectedStartWordIndex: 0, backtrackMarginWords: 2,
    canonicalTextHash: passage.canonicalTextHash, canonicalPackageVersion: 'dev-fixture',
  };
  const engine = new AlignmentEngine(spec, passage, backend, DEFAULT_CONFIG);
  return { engine, passage, backend, spec };
}

/** Feed PCM to the engine in realistic chunks and collect all events. */
export function feedPcm(engine: AlignmentEngine, pcm: Uint8Array, sourceRate = 16000, chunkMs = 100) {
  const bytesPerMs = (16000 * 2) / 1000;
  const chunkBytes = Math.round(chunkMs * bytesPerMs) & ~1;
  const events = [];
  for (let off = 0; off < pcm.length; off += chunkBytes) {
    events.push(...engine.pushAudio(pcm.subarray(off, Math.min(pcm.length, off + chunkBytes)), sourceRate));
  }
  return events;
}
