// Confidence engine (§12).
//
// Confidence is NEVER a constant and never a lone number. It is a weighted combination of real
// signals, temporally smoothed, and exposed as a report so the consumer can see WHY. Ambiguity
// (small competing gap) and instability pull calibrated confidence down; silence caps it. The
// combination is ADDITIVE (weighted) rather than a product of sub-one factors, so a genuinely good,
// stable, unambiguous match reads as high confidence instead of being multiplied into the floor.

import { ConfidenceReport } from './types';
import { DecodeStepResult } from './decoder/position-decoder';
import { VadFrameResult } from './audio/vad';

export class ConfidenceEngine {
  private emMean = 0;
  private emCount = 0;
  private recentWords: number[] = [];
  private ema = 0;         // smoothed calibrated confidence
  private started = false;

  private observeEmission(emission: number) {
    this.emCount++;
    this.emMean += (emission - this.emMean) / Math.min(this.emCount, 200);
  }

  update(step: DecodeStepResult, vad: VadFrameResult): ConfidenceReport {
    this.observeEmission(step.emission);

    // 1) Acoustic match: how good is this frame's best match vs the running-typical cost?
    //    ratio<1 ⇒ better than typical ⇒ high match. Robust, bounded to 0..1.
    const ratio = step.emission / Math.max(1e-6, this.emMean);
    const acoustic = 1 / (1 + Math.max(0, ratio - 0.4));

    // 2) Competing-hypothesis gap straight from the decoder (0..1).
    const gap = step.competingGap;

    // 3) Temporal stability of the recent best-word trajectory.
    this.recentWords.push(step.bestWord);
    if (this.recentWords.length > 12) this.recentWords.shift();
    const stability = this.trajectoryStability();

    const raw = acoustic;
    // Weighted blend of the signals (sums to 1). Each is a real, inspectable quantity.
    const blended = 0.5 * acoustic + 0.3 * gap + 0.2 * stability;

    // Temporal smoothing (EMA) so a single noisy frame does not throw the state machine.
    this.ema = this.started ? 0.6 * this.ema + 0.4 * blended : blended;
    this.started = true;

    // Silence caps confidence (a silent frame cannot assert a position) but does not zero it,
    // so the state machine can hold position through a brief unvoiced gap.
    const voicedCap = vad.label === 'speech' ? 1 : 0.4;
    const calibrated = Math.max(0, Math.min(1, Math.min(this.ema, voicedCap)));

    return { raw, calibrated, stability, competingGap: gap };
  }

  private trajectoryStability(): number {
    const n = this.recentWords.length;
    if (n < 2) return 0.5;
    // Monotonic-ish forward motion is stable; scattered/backward jumps are not.
    let forward = 0, jumps = 0;
    for (let i = 1; i < n; i++) {
      const d = this.recentWords[i] - this.recentWords[i - 1];
      if (d >= 0 && d <= 3) forward++;
      else jumps++;
    }
    return Math.max(0, Math.min(1, forward / (forward + jumps * 2 + 1e-6)));
  }

  reset() { this.recentWords = []; this.ema = 0; this.started = false; }
}
