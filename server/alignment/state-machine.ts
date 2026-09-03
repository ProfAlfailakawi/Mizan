// Tracking state machine (§7, §53).
//
// A real machine with explicit entry/exit conditions — not just labels. The governing philosophy is
// conservative: move only with sufficient acoustic evidence; when in doubt, HOLD; when the position
// is lost, ADMIT it (do not advance by guessing); when re-found, return with confidence.

import { TrackingState, AlignmentConfig } from './types';
import { ConfidenceReport } from './types';
import { VadFrameResult } from './audio/vad';

export interface StateInput {
  confidence: ConfidenceReport;
  vad: VadFrameResult;
  positionStable: boolean;   // smoothed word unchanged for a few frames
  reacquireEvidence: number; // frames of agreement accumulated by the recovery engine
}

export interface StateOutput {
  state: TrackingState;
  changed: boolean;
  /** Whether the reported cursor is allowed to move forward this frame. */
  mayAdvanceCursor: boolean;
}

export class TrackingStateMachine {
  private state: TrackingState = 'INITIALIZING';
  private stableFrames = 0;
  private lowConfFrames = 0;

  constructor(private cfg: AlignmentConfig) {}

  get current(): TrackingState { return this.state; }

  private set(next: TrackingState): boolean {
    if (this.state === next) return false;
    this.state = next;
    return true;
  }

  step(input: StateInput): StateOutput {
    const { confidence, vad, positionStable, reacquireEvidence } = input;
    const c = confidence.calibrated;
    const before = this.state;

    // PAUSE is orthogonal: sustained silence pauses tracking from most states and preserves position.
    if (vad.label === 'silence' && vad.silenceRunMs >= this.cfg.pauseSilenceMs) {
      if (this.state !== 'COMPLETED' && this.state !== 'FAILED') this.set('PAUSED');
      return { state: this.state, changed: this.state !== before, mayAdvanceCursor: false };
    }
    if (this.state === 'PAUSED' && vad.label === 'speech') {
      // Resume into UNCERTAIN until evidence re-stabilizes; never resume straight to LOCKED.
      this.set('UNCERTAIN');
    }

    // Track stability / low-confidence run counters.
    if (positionStable && c >= this.cfg.uncertainConfidence) this.stableFrames++; else this.stableFrames = 0;
    if (c < this.cfg.uncertainConfidence) this.lowConfFrames++; else this.lowConfFrames = 0;

    switch (this.state) {
      case 'INITIALIZING':
        if (vad.label === 'speech') this.set('LISTENING');
        break;
      case 'LISTENING':
        if (c >= this.cfg.uncertainConfidence) this.set('PROBABLE');
        break;
      case 'PROBABLE':
        if (c >= this.cfg.lockConfidence && this.stableFrames >= this.cfg.lockStabilityFrames && confidence.competingGap >= this.cfg.minCompetingGap) this.set('LOCKED');
        else if (c < this.cfg.uncertainConfidence) this.set('UNCERTAIN');
        break;
      case 'LOCKED':
        // Leave LOCKED only on a genuine, sustained drop — not a single noisy frame.
        if (this.lowConfFrames >= 3 || confidence.competingGap < this.cfg.minCompetingGap * 0.5) this.set('UNCERTAIN');
        break;
      case 'UNCERTAIN':
        if (c >= this.cfg.lockConfidence && this.stableFrames >= this.cfg.lockStabilityFrames) this.set('LOCKED');
        else if (c >= this.cfg.uncertainConfidence) this.set('PROBABLE');
        // Only declare LOST after a genuinely sustained collapse (below the LOST floor), not on a
        // brief dip during normal reading. This prevents false-LOST mid-recitation.
        else if (this.lowConfFrames >= this.cfg.vadHangoverFrames && c < this.cfg.lostConfidence) this.set('LOST');
        break;
      case 'LOST':
        // The recovery engine widens the window; we enter REACQUIRING as soon as evidence appears.
        if (reacquireEvidence > 0) this.set('REACQUIRING');
        break;
      case 'REACQUIRING':
        if (reacquireEvidence >= this.cfg.reacquireEvidenceFrames && c >= this.cfg.uncertainConfidence) this.set('REACQUIRED');
        else if (reacquireEvidence === 0 && this.lowConfFrames > this.cfg.vadHangoverFrames * 2) this.set('LOST');
        break;
      case 'REACQUIRED':
        if (c >= this.cfg.lockConfidence && this.stableFrames >= this.cfg.lockStabilityFrames) this.set('LOCKED');
        else if (c < this.cfg.uncertainConfidence) this.set('UNCERTAIN');
        break;
    }

    // Cursor may advance only from confident, tracking states — never while LOST/REACQUIRING/PAUSED.
    const mayAdvanceCursor = (this.state === 'LOCKED' || this.state === 'PROBABLE' || this.state === 'REACQUIRED')
      && vad.label === 'speech';

    return { state: this.state, changed: this.state !== before, mayAdvanceCursor };
  }

  complete() { this.set('COMPLETED'); }
  fail() { this.set('FAILED'); }
  forceLost() { this.set('LOST'); }
}
