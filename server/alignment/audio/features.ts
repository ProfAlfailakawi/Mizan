// Acoustic feature extraction — real MFCC (§ "Acoustic Feature Extraction").
//
// Pipeline per frame: pre-emphasis → Hamming window → radix-2 FFT → power spectrum → mel filterbank
// → log → DCT-II (MFCC). Optional delta features capture short-term dynamics. This is standard,
// well-understood DSP (no learned weights), which is exactly why it is a trustworthy, inspectable
// front-end for both the reference-template acoustic backend and any future neural backend.

const PRE_EMPHASIS = 0.97;

/** Iterative in-place radix-2 Cooley–Tukey FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k], aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe; im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe; im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe; curRe = nextRe;
      }
    }
  }
}

function nextPow2(n: number): number { let p = 1; while (p < n) p <<= 1; return p; }
function hzToMel(hz: number): number { return 2595 * Math.log10(1 + hz / 700); }
function melToHz(mel: number): number { return 700 * (10 ** (mel / 2595) - 1); }

/** Precomputed mel filterbank + Hamming window + DCT basis, reused across frames. */
export class MfccExtractor {
  private readonly fftSize: number;
  private readonly window: Float64Array;
  private readonly melFilters: { start: number; center: number; end: number; weightsLeft: Float64Array; weightsRight: Float64Array }[];
  private readonly dct: Float64Array; // mfccCount × melBands

  constructor(
    private readonly sampleRate: number,
    private readonly frameLen: number,
    private readonly melBands: number,
    private readonly mfccCount: number,
  ) {
    this.fftSize = nextPow2(frameLen);
    this.window = new Float64Array(frameLen);
    for (let i = 0; i < frameLen; i++) this.window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameLen - 1));

    // Triangular mel filters spread linearly on the mel scale between 0 and Nyquist.
    const lowMel = hzToMel(0), highMel = hzToMel(sampleRate / 2);
    const points = new Array(melBands + 2).fill(0).map((_, i) => lowMel + ((highMel - lowMel) * i) / (melBands + 1));
    const bins = points.map(m => Math.floor(((this.fftSize + 1) * melToHz(m)) / sampleRate));
    this.melFilters = [];
    for (let m = 1; m <= melBands; m++) {
      const start = bins[m - 1], center = bins[m], end = bins[m + 1];
      const wl = new Float64Array(Math.max(0, center - start));
      for (let k = start; k < center; k++) wl[k - start] = (k - start) / Math.max(1, center - start);
      const wr = new Float64Array(Math.max(0, end - center));
      for (let k = center; k < end; k++) wr[k - center] = (end - k) / Math.max(1, end - center);
      this.melFilters.push({ start, center, end, weightsLeft: wl, weightsRight: wr });
    }

    // DCT-II basis for cepstral coefficients.
    this.dct = new Float64Array(mfccCount * melBands);
    for (let i = 0; i < mfccCount; i++)
      for (let j = 0; j < melBands; j++)
        this.dct[i * melBands + j] = Math.cos((Math.PI * i * (2 * j + 1)) / (2 * melBands));
  }

  /** One frame of samples → MFCC vector (length = mfccCount). */
  extract(frame: Float32Array): Float64Array {
    const re = new Float64Array(this.fftSize);
    const im = new Float64Array(this.fftSize);
    // Pre-emphasis + window.
    let prev = 0;
    for (let i = 0; i < this.frameLen; i++) {
      const s = frame[i] - PRE_EMPHASIS * prev;
      prev = frame[i];
      re[i] = s * this.window[i];
    }
    fft(re, im);

    // Power spectrum (first half).
    const half = this.fftSize >> 1;
    const power = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) power[k] = (re[k] * re[k] + im[k] * im[k]) / this.fftSize;

    // Mel energies (log).
    const mel = new Float64Array(this.melBands);
    for (let m = 0; m < this.melBands; m++) {
      const f = this.melFilters[m];
      let e = 0;
      for (let k = 0; k < f.weightsLeft.length; k++) e += (power[f.start + k] || 0) * f.weightsLeft[k];
      for (let k = 0; k < f.weightsRight.length; k++) e += (power[f.center + k] || 0) * f.weightsRight[k];
      mel[m] = Math.log(e + 1e-10);
    }

    // Cepstral coefficients (DCT-II).
    const mfcc = new Float64Array(this.mfccCount);
    for (let i = 0; i < this.mfccCount; i++) {
      let sum = 0;
      for (let j = 0; j < this.melBands; j++) sum += mel[j] * this.dct[i * this.melBands + j];
      mfcc[i] = sum;
    }
    return mfcc;
  }
}

/** Append first-order deltas (velocity) to a sequence of feature vectors. */
export function withDeltas(features: Float64Array[]): Float64Array[] {
  const dim = features[0]?.length || 0;
  return features.map((f, t) => {
    const prev = features[t - 1] || f;
    const next = features[t + 1] || f;
    const out = new Float64Array(dim * 2);
    out.set(f, 0);
    for (let i = 0; i < dim; i++) out[dim + i] = (next[i] - prev[i]) / 2;
    return out;
  });
}

/** Cepstral mean normalization (per stream, running) — reduces channel/mic bias (§16). */
export class RunningCMN {
  private mean: Float64Array | null = null;
  private count = 0;
  apply(vec: Float64Array): Float64Array {
    if (!this.mean) this.mean = new Float64Array(vec.length);
    this.count++;
    const out = new Float64Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      this.mean[i] += (vec[i] - this.mean[i]) / Math.min(this.count, 200); // slow-adapting mean
      out[i] = vec[i] - this.mean[i];
    }
    return out;
  }
}
