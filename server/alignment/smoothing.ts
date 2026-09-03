// Temporal smoothing (§ "Temporal Smoothing").
//
// The per-frame decoder output jitters (a word may flicker to a neighbour for one frame). A short
// mode filter over recent frames yields a stable reported word without materially adding latency.
// Smoothing reduces jitter only; it never invents forward motion — if the raw output is not moving,
// the smoothed output does not move either.

export class TemporalSmoother {
  private recent: number[] = [];
  constructor(private windowFrames: number) {}

  push(word: number): number {
    this.recent.push(word);
    if (this.recent.length > this.windowFrames) this.recent.shift();
    // Mode (most frequent) word in the window; ties resolved toward the most recent.
    const counts = new Map<number, number>();
    for (const w of this.recent) counts.set(w, (counts.get(w) || 0) + 1);
    let bestWord = word, bestCount = -1;
    for (let i = this.recent.length - 1; i >= 0; i--) {
      const w = this.recent[i];
      const c = counts.get(w)!;
      if (c > bestCount) { bestCount = c; bestWord = w; }
    }
    return bestWord;
  }

  reset() { this.recent = []; }
}
