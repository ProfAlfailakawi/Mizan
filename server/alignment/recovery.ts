// Recovery / reacquisition engine (§8, §28, §53).
//
// When confidence collapses the engine must NOT jump randomly or drag the cursor forward. This
// module governs the decoder's search-window radius and the evidence required to re-lock:
//   • While tracking: keep the window tight (constrained) around the current position.
//   • On LOST: widen the window progressively — first around the last trusted position, then across
//     the whole passage — so a genuine jump/backtrack can be re-found.
//   • Reacquisition requires SUSTAINED agreement (the same word, well-matched, for several frames)
//     before REACQUIRED is allowed. A distinctive (rare) word counts as a stronger anchor.

import { AlignmentConfig } from './types';
import { DecodeStepResult } from './decoder/position-decoder';
import { CanonicalPassage } from './canonical';

export class RecoveryEngine {
  private evidence = 0;
  private lastWord = -1;
  private lostFrames = 0;
  private wordRarity: Map<number, number>; // globalWordIndex → rarity weight (1 = common .. 2 = rare)

  constructor(private cfg: AlignmentConfig, passage: CanonicalPassage, private maxRefFrame: number) {
    // Anchor rarity: a word whose alignment signature is unique in the passage is a strong anchor;
    // a very common short word (e.g. a frequently repeated particle) is a weak one (§28).
    const sigCount = new Map<string, number>();
    for (const w of passage.words) sigCount.set(w.signature, (sigCount.get(w.signature) || 0) + 1);
    this.wordRarity = new Map();
    for (const w of passage.words) this.wordRarity.set(w.globalWordIndex, (sigCount.get(w.signature) || 1) === 1 ? 2 : 1);
  }

  /**
   * Update recovery bookkeeping for a frame. `lost` = state machine currently in LOST/REACQUIRING.
   * Returns the window radius the decoder should use next and the accumulated reacquire evidence.
   */
  update(step: DecodeStepResult, emissionMean: number, lost: boolean): { windowRadius: number; reacquireEvidence: number } {
    if (!lost) {
      this.evidence = 0;
      this.lostFrames = 0;
      this.lastWord = step.bestWord;
      return { windowRadius: this.cfg.dtwBandRadiusFrames, reacquireEvidence: 0 };
    }

    this.lostFrames++;

    // Progressive widening: start near the last trusted position, expand toward the whole passage.
    const growth = Math.min(1, this.lostFrames / (this.cfg.vadHangoverFrames * 3));
    const windowRadius = Math.round(this.cfg.dtwBandRadiusFrames + growth * this.maxRefFrame);

    // Reacquisition evidence accrues whenever the acoustic match is GOOD and unambiguous — it does
    // NOT require the reciter to hold still (a person recovering keeps reading forward). A rare
    // (distinctive) anchor word accrues evidence faster (§28); a poor/ambiguous frame erodes it.
    const wellMatched = step.emission <= emissionMean * 1.1 && step.competingGap >= this.cfg.minCompetingGap;
    if (wellMatched) {
      this.evidence += this.wordRarity.get(step.bestWord) || 1;
    } else {
      this.evidence = Math.max(0, this.evidence - 1);
    }
    this.lastWord = step.bestWord;

    return { windowRadius, reacquireEvidence: this.evidence };
  }

  onReacquired() { this.evidence = 0; this.lostFrames = 0; }
  reset() { this.evidence = 0; this.lostFrames = 0; this.lastWord = -1; }
}
