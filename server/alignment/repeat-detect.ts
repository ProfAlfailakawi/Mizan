// Repeat / backtrack / self-correction detection (§7, §9, §10).
//
// Distinguishes natural progression from a repeat, a multi-word backtrack, or a self-correction, so
// the engine records structured EVIDENCE instead of treating a legitimate re-reading as an error.
// It NEVER judges: it only labels what the trajectory did (§11). The judge decides meaning.

export type TrajectoryEventType = 'BACKTRACK' | 'REPEAT' | 'POSSIBLE_SELF_CORRECTION' | null;

export interface TrajectoryEvent {
  type: Exclude<TrajectoryEventType, null>;
  fromGlobalWordIndex: number;
  toGlobalWordIndex: number;
  detail: string;
}

export class RepeatBacktrackDetector {
  private history: number[] = []; // confirmed word trajectory (deduped consecutive)
  private maxForward = -1;        // furthest word reached so far

  /**
   * Feed the current confirmed word. Returns a trajectory event when the motion is not a simple
   * forward step, else null.
   */
  observe(word: number): TrajectoryEvent | null {
    const last = this.history[this.history.length - 1];
    if (last === word) return null; // no motion
    this.history.push(word);
    if (this.history.length > 64) this.history.shift();

    let event: TrajectoryEvent | null = null;

    if (last !== undefined && word < last) {
      // Moved backward.
      const back = last - word;
      if (back >= 1) {
        // If we had previously passed this word and are now returning, it's a repeat/backtrack.
        const wasVisited = this.history.slice(0, -1).includes(word);
        event = {
          type: back >= 3 ? 'BACKTRACK' : (wasVisited ? 'REPEAT' : 'BACKTRACK'),
          fromGlobalWordIndex: last,
          toGlobalWordIndex: word,
          detail: `moved back ${back} word(s)`,
        };
      }
    } else if (last !== undefined && word > last) {
      // Forward motion. If we had recently backtracked and are now moving PAST the previous max,
      // that pattern (back → resume → surpass) is evidence of a possible self-correction.
      if (word > this.maxForward && this.recentlyBacktracked()) {
        event = {
          type: 'POSSIBLE_SELF_CORRECTION',
          fromGlobalWordIndex: this.maxForward,
          toGlobalWordIndex: word,
          detail: 'resumed past prior furthest position after a backtrack',
        };
      }
    }

    if (word > this.maxForward) this.maxForward = word;
    return event;
  }

  private recentlyBacktracked(): number {
    const h = this.history;
    for (let i = h.length - 2; i >= Math.max(0, h.length - 8); i--) {
      if (h[i] > h[i + 1]) return 1;
    }
    return 0;
  }

  reset() { this.history = []; this.maxForward = -1; }
}
