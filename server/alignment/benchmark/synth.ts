// Synthetic acoustic generator for ALGORITHM validation (§38, §39, §40, §49).
//
// HONESTY: this produces synthetic PCM — per-word multi-sine "acoustic signatures", NOT human
// speech. It exists to validate the tracking ALGORITHM (PCM → real MFCC → real DTW → position →
// recovery) against exact ground truth, deterministically and reproducibly. It does NOT measure
// human-recitation accuracy; that requires the certified reference audio + real recordings, and
// until that benchmark passes the engine stays SHADOW_ONLY. Reference and contestant share the same
// per-word signatures (same words), with tempo/pitch/noise variation — i.e. the real tracking task.

import { CanonicalPassage } from '../canonical';

const SR = 16000;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigSeed(signature: string): number {
  let h = 2166136261;
  for (const ch of signature) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Three formant-like frequencies (Hz) that uniquely characterise a word's synthetic signature. */
function wordFormants(signature: string, pitchScale = 1): [number, number, number] {
  const r = mulberry32(sigSeed(signature));
  const f1 = (250 + r() * 500) * pitchScale;
  const f2 = (900 + r() * 1200) * pitchScale;
  const f3 = (2100 + r() * 1400) * pitchScale;
  return [f1, f2, f3];
}

/** Render one word's signature tone into `durationMs` of 16 kHz float samples. */
function renderWord(signature: string, durationMs: number, opts: { pitchScale?: number; noise?: number; seed: number }): Float32Array {
  const [f1, f2, f3] = wordFormants(signature, opts.pitchScale ?? 1);
  const n = Math.round((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  const rng = mulberry32(opts.seed);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // A short amplitude envelope so consecutive words have onsets/offsets (frame dynamics).
    const env = Math.min(1, i / (0.02 * SR)) * Math.min(1, (n - i) / (0.02 * SR));
    let s = 0.5 * Math.sin(2 * Math.PI * f1 * t) + 0.3 * Math.sin(2 * Math.PI * f2 * t) + 0.2 * Math.sin(2 * Math.PI * f3 * t);
    s *= env;
    if (opts.noise) s += (rng() - 0.5) * 2 * opts.noise;
    out[i] = Math.max(-1, Math.min(1, s * 0.7));
  }
  return out;
}

/** Silence with a little room noise (§15) — must NOT read as progression. */
function renderSilence(durationMs: number, noise: number, seed: number): Float32Array {
  const n = Math.round((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) out[i] = (rng() - 0.5) * 2 * noise;
  return out;
}

function toPcmS16LE(chunks: Float32Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const buf = Buffer.alloc(total * 2);
  let off = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i++) { buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767))), off); off += 2; }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export interface ReferenceRender {
  pcm: Uint8Array;
  sampleRate: number;
  wordBoundariesMs: { globalWordIndex: number; startMs: number; endMs: number }[];
}

/** Render the reference recitation of the whole passage (one signature tone per word). */
export function synthReference(passage: CanonicalPassage, wordMs = 320, noise = 0.01): ReferenceRender {
  const chunks: Float32Array[] = [];
  const boundaries: ReferenceRender['wordBoundariesMs'] = [];
  let ms = 0;
  passage.words.forEach((w) => {
    const seg = renderWord(w.signature, wordMs, { noise, seed: sigSeed(w.signature) ^ 0x999 });
    boundaries.push({ globalWordIndex: w.globalWordIndex, startMs: ms, endMs: ms + wordMs });
    chunks.push(seg);
    ms += wordMs;
  });
  return { pcm: toPcmS16LE(chunks), sampleRate: SR, wordBoundariesMs: boundaries };
}

/** A step in a contestant script: read a word, or hold silence. */
export type ScriptStep = { kind: 'read'; globalWordIndex: number; durationMs: number } | { kind: 'silence'; durationMs: number };

export interface ContestantRender {
  pcm: Uint8Array;
  sampleRate: number;
  truth: { timeMs: number; globalWordIndex: number }[]; // ground-truth word active at each sampled time
}

/** Render a contestant performance from a script, with rendition variation (§17). */
export function synthContestant(passage: CanonicalPassage, script: ScriptStep[], opts: { pitchScale?: number; noise?: number } = {}): ContestantRender {
  const chunks: Float32Array[] = [];
  const truth: ContestantRender['truth'] = [];
  let ms = 0;
  let seed = 0xC0FFEE;
  for (const step of script) {
    if (step.kind === 'silence') {
      // Genuine near-silence (well below the VAD energy floor) — room-noise level only.
      chunks.push(renderSilence(step.durationMs, 0.0008, seed++));
    } else {
      const w = passage.words[step.globalWordIndex];
      chunks.push(renderWord(w.signature, step.durationMs, { pitchScale: opts.pitchScale ?? 1.03, noise: opts.noise ?? 0.03, seed: seed++ }));
      // Sample ground truth at the midpoint of each read word.
      truth.push({ timeMs: ms + step.durationMs / 2, globalWordIndex: step.globalWordIndex });
    }
    ms += step.durationMs;
  }
  return { pcm: toPcmS16LE(chunks), sampleRate: SR, truth };
}

// ---- Scenario script builders (§39) ----------------------------------------------------------

export function scriptNormal(passage: CanonicalPassage, wordMs = 300): ScriptStep[] {
  return passage.words.map((w) => ({ kind: 'read', globalWordIndex: w.globalWordIndex, durationMs: wordMs } as ScriptStep));
}
export function scriptSlow(passage: CanonicalPassage): ScriptStep[] { return scriptNormal(passage, 520); }
export function scriptFast(passage: CanonicalPassage): ScriptStep[] { return scriptNormal(passage, 180); }

export function scriptWithPause(passage: CanonicalPassage, afterWord: number, pauseMs = 1600, wordMs = 300): ScriptStep[] {
  const steps: ScriptStep[] = [];
  passage.words.forEach((w) => {
    steps.push({ kind: 'read', globalWordIndex: w.globalWordIndex, durationMs: wordMs });
    if (w.globalWordIndex === afterWord) steps.push({ kind: 'silence', durationMs: pauseMs });
  });
  return steps;
}

/** Read forward, then repeat a run of `len` words starting at `repeatFrom` (backtrack), then continue. */
export function scriptWithBacktrack(passage: CanonicalPassage, backAt: number, backTo: number, wordMs = 300): ScriptStep[] {
  const steps: ScriptStep[] = [];
  for (let i = 0; i <= backAt && i < passage.words.length; i++) steps.push({ kind: 'read', globalWordIndex: i, durationMs: wordMs });
  for (let i = backTo; i <= backAt && i < passage.words.length; i++) steps.push({ kind: 'read', globalWordIndex: i, durationMs: wordMs }); // re-read
  for (let i = backAt + 1; i < passage.words.length; i++) steps.push({ kind: 'read', globalWordIndex: i, durationMs: wordMs });
  return steps;
}

/** Start from the middle of the range (§39 "بدء من منتصف النطاق"). */
export function scriptFromMiddle(passage: CanonicalPassage, startWord: number, wordMs = 300): ScriptStep[] {
  return passage.words.filter((w) => w.globalWordIndex >= startWord).map((w) => ({ kind: 'read', globalWordIndex: w.globalWordIndex, durationMs: wordMs } as ScriptStep));
}
