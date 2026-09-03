// Feature front-end — the single definition of "an acoustic feature vector" in MIZAN alignment.
//
// Both the reference audio and the live microphone audio pass through THIS exact class, so they are
// directly comparable. Deltas are CAUSAL (current − previous) rather than centred, because the live
// path cannot see the future; using causal deltas everywhere keeps reference and live identical.

import { MfccExtractor, RunningCMN } from './features';

export class FeatureFrontend {
  private extractor: MfccExtractor;
  private cmn = new RunningCMN();
  private prev: Float64Array | null = null;

  constructor(
    sampleRate: number,
    frameLen: number,
    melBands: number,
    mfccCount: number,
    private useDeltas: boolean,
  ) {
    this.extractor = new MfccExtractor(sampleRate, frameLen, melBands, mfccCount);
  }

  /** One analysis frame of samples → normalized feature vector (with causal delta if enabled). */
  frame(samples: Float32Array): Float64Array {
    const m = this.cmn.apply(this.extractor.extract(samples));
    if (!this.useDeltas) return m;
    const out = new Float64Array(m.length * 2);
    out.set(m, 0);
    if (this.prev) for (let i = 0; i < m.length; i++) out[m.length + i] = m[i] - this.prev[i];
    this.prev = m;
    return out;
  }
}

/** Squared Euclidean distance — the local acoustic cost between two feature vectors. */
export function featureDistanceSq(a: Float64Array, b: Float64Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}
