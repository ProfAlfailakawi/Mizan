// Streaming constrained position decoder (§6, §26, §27, §28).
//
// This is the alignment core. It tracks a hidden state = reference-frame index, evolving as live
// query frames arrive. It is a banded Viterbi decoder (dynamic programming) over the constrained
// search window, with these transitions per step:
//
//   • ADVANCE  (p' ∈ {p, p-1, p-2, p-3} → p): normal forward motion. Preferred (cheapest). Because
//     reference and live share the same hop, staying/advancing 0–3 frames absorbs speed variation.
//   • RESET/JUMP (best previous state → p, flat penalty): lets the path leave monotonicity to model
//     a repeat, a backtrack, a self-correction, a forward skip, or a recovery jump. It costs more
//     than advancing, so the decoder only takes it when the acoustic evidence clearly favours it.
//
// This is "soft monotonic" alignment: forward is a strong prior, not a hard constraint. The band
// keeps it constrained to the expected passage (widened by the recovery engine only when LOST).

import { AcousticBackend } from '../acoustic/backend';

export interface DecodeStepResult {
  bestRef: number;         // best reference frame index this step
  bestWord: number;        // passage global word index of bestRef
  emission: number;        // local acoustic cost at bestRef (lower = better match)
  bestScore: number;       // accumulated score of the best state (relative, for internal use)
  competingWord: number | null; // the strongest DISTINCT competing word, if any
  competingGap: number;    // normalized score gap best↔competitor (larger = safer)
  tookJump: boolean;       // true if the best path used a RESET/JUMP transition (non-monotonic)
  candidates: { word: number; ref: number; score: number }[]; // top distinct-word hypotheses
}

export interface DecoderConfig {
  advanceStepPenalty: number; // per-frame deviation penalty for advancing ≠1
  jumpPenalty: number;        // flat cost of a RESET/JUMP transition
  forget: number;             // 0<forget≤1 accumulation decay so old evidence fades (enables recovery)
}

export const DEFAULT_DECODER_CONFIG: DecoderConfig = {
  advanceStepPenalty: 6,
  jumpPenalty: 42,
  forget: 0.92,
};

const INF = Number.POSITIVE_INFINITY;

export class StreamingPositionDecoder {
  private readonly M: number;
  private score: Float64Array;   // accumulated score per reference frame
  private prev: Float64Array;
  private windowLo = 0;
  private windowHi = 0;
  private started = false;

  constructor(
    private backend: AcousticBackend,
    private cfg: DecoderConfig = DEFAULT_DECODER_CONFIG,
  ) {
    this.M = backend.refFrameCount;
    this.score = new Float64Array(this.M).fill(INF);
    this.prev = new Float64Array(this.M).fill(INF);
  }

  /** Seed the free-start region (the expected start ± backtrack margin), in reference frames. */
  initStartRegion(lo: number, hi: number): void {
    this.score.fill(INF);
    for (let p = Math.max(0, lo); p <= Math.min(this.M - 1, hi); p++) this.score[p] = 0;
    this.windowLo = Math.max(0, lo);
    this.windowHi = Math.min(this.M - 1, hi);
    this.started = false;
  }

  /**
   * Advance one query frame. `windowRadius` is the band radius around the current best position;
   * the recovery engine grows it when LOST and shrinks it when LOCKED. Returns the decode result.
   */
  step(query: Float64Array, windowRadius: number): DecodeStepResult {
    [this.prev, this.score] = [this.score, this.prev];
    this.score.fill(INF);

    // Cheapest previous state overall — the source for a RESET/JUMP transition.
    let gmin = INF;
    for (let p = this.windowLo; p <= this.windowHi; p++) if (this.prev[p] < gmin) gmin = this.prev[p];
    if (!this.started && gmin === INF) gmin = 0; // very first frame: allow start anywhere seeded
    const jumpBase = gmin + this.cfg.jumpPenalty;

    // Determine the new band. On the first real step keep the seeded region; afterwards centre on
    // the previous best; the recovery engine controls the radius.
    let prevBest = this.windowLo, prevBestScore = INF;
    for (let p = this.windowLo; p <= this.windowHi; p++) if (this.prev[p] < prevBestScore) { prevBestScore = this.prev[p]; prevBest = p; }
    const lo = this.started ? Math.max(0, prevBest - windowRadius) : this.windowLo;
    const hi = this.started ? Math.min(this.M - 1, prevBest + windowRadius) : this.windowHi;

    for (let p = lo; p <= hi; p++) {
      // Best ADVANCE into p from {p, p-1, p-2, p-3}.
      let adv = INF;
      for (let k = 0; k <= 3; k++) {
        const src = p - k;
        if (src < 0) break;
        const pv = this.prev[src];
        if (pv === INF) continue;
        const stepDev = Math.abs(k - 1); // 1 frame advance is nominal (same hop)
        const c = pv + stepDev * this.cfg.advanceStepPenalty;
        if (c < adv) adv = c;
      }
      const incoming = Math.min(adv, jumpBase);
      if (incoming === INF) continue;
      this.score[p] = this.cfg.forget * incoming + this.backend.localCost(query, p);
    }

    this.windowLo = lo;
    this.windowHi = hi;
    this.started = true;

    return this.readout(query, lo, hi, prevBest);
  }

  /** Extract best + distinct competing hypotheses + candidates from the current score column. */
  private readout(query: Float64Array, lo: number, hi: number, prevBest: number): DecodeStepResult {
    let best = lo, bestScore = INF;
    for (let p = lo; p <= hi; p++) if (this.score[p] < bestScore) { bestScore = this.score[p]; best = p; }
    const bestWord = this.backend.refFrameToWord(best);

    // Collect the best score per distinct word in the band → candidates + competing hypothesis.
    const perWord = new Map<number, { ref: number; score: number }>();
    for (let p = lo; p <= hi; p++) {
      if (this.score[p] === INF) continue;
      const w = this.backend.refFrameToWord(p);
      const cur = perWord.get(w);
      if (!cur || this.score[p] < cur.score) perWord.set(w, { ref: p, score: this.score[p] });
    }
    const ranked = [...perWord.entries()].map(([word, v]) => ({ word, ref: v.ref, score: v.score }))
      .sort((a, b) => a.score - b.score);
    const competing = ranked.find(r => r.word !== bestWord) || null;

    // Normalized gap: difference relative to best, squashed to 0..1 (bigger = safer, less ambiguous).
    const emission = this.backend.localCost(query, best);
    const gapRaw = competing ? competing.score - bestScore : Infinity;
    const scale = Math.max(1e-6, Math.abs(bestScore) + 1);
    const competingGap = competing ? Math.max(0, Math.min(1, gapRaw / scale)) : 1;

    // Did the best state arrive via a jump (non-monotonic)? Heuristic: best is far from prevBest.
    const tookJump = Math.abs(best - prevBest) > 4;

    return {
      bestRef: best,
      bestWord,
      emission,
      bestScore,
      competingWord: competing ? competing.word : null,
      competingGap,
      tookJump,
      candidates: ranked.slice(0, 4),
    };
  }

  get currentBestRef(): number {
    let best = this.windowLo, bestScore = INF;
    for (let p = this.windowLo; p <= this.windowHi; p++) if (this.score[p] < bestScore) { bestScore = this.score[p]; best = p; }
    return best;
  }
}
