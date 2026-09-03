// Golden alignment session format (§40).
//
// A golden session pairs an audio source (or synthetic script) with independent ground-truth
// position-over-time. The runner replays the audio through the engine and compares its emitted
// positions to this truth. Human judge markers may be attached as ADDITIONAL evidence, but are NOT
// used as blind ground truth (§43) — they are timestamps by a human, not a timing instrument.

import { ReadingId } from '../types';

export interface GoldenTruthPoint {
  timeMs: number;
  surah: number;
  ayah: number;
  wordIndex: number;         // within ayah
  globalWordIndex: number;   // within passage
}

export interface GoldenSession {
  id: string;
  reading: ReadingId;
  surah: number;
  startAyah: number;
  endAyah: number;
  scenario: string;          // e.g. 'normal', 'slow', 'pause', 'backtrack'
  source: 'synthetic' | 'recorded';
  sampleRate: number;
  truth: GoldenTruthPoint[];
  humanMarkers?: { timeMs: number; note: string }[]; // additional evidence only (§43)
  notes?: string;
}

export function makeGoldenFromSynthTruth(
  base: Omit<GoldenSession, 'truth'>,
  truth: { timeMs: number; globalWordIndex: number }[],
  positionOf: (globalWordIndex: number) => { surah: number; ayah: number; wordIndex: number },
): GoldenSession {
  return {
    ...base,
    truth: truth.map((t) => {
      const p = positionOf(t.globalWordIndex);
      return { timeMs: t.timeMs, surah: p.surah, ayah: p.ayah, wordIndex: p.wordIndex, globalWordIndex: t.globalWordIndex };
    }),
  };
}
