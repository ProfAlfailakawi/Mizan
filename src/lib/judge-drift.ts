// Silent Judge Drift monitor — "committee C2 may need a break."
//
// PURPOSE: detect, during the day, when a judge's severity has drifted from their own morning
// baseline — the classic unfairness of the late-afternoon contestant facing a tired panel.
//
// NON-NEGOTIABLE (consistent with AI_INTEGRITY.md): this NEVER touches a score. It produces an
// advisory signal visible to the Head Judge only, recommending a human intervention (a break,
// a re-calibration, a second listen). It compares a judge against *their own* earlier self, not
// against other judges, so it does not homogenize legitimate judging differences.

export interface JudgeEventLike {
  judgeId: string;
  relativeSeconds: number;      // offset within the judging day/session timeline
  penalty: number;              // deduction magnitude recorded for the event
  timestamp?: string;
}

export interface JudgeDriftSignal {
  judgeId: string;
  baselinePenaltyRate: number;  // avg penalty per event in the baseline window
  recentPenaltyRate: number;    // avg penalty per event in the recent window
  deltaSigma: number;           // how many std-devs the recent rate is from baseline
  direction: 'harsher' | 'gentler' | 'stable';
  attention: boolean;           // recent is ≥ driftSigma std-devs harsher than baseline
  baselineEvents: number;
  recentEvents: number;
  minutesObserved: number;
}

export interface JudgeDriftOptions {
  /** How many sigma of harsher drift before we surface it (default 2 = the user's ask). */
  driftSigma?: number;
  /** Minimum events in each window before the signal is trustworthy. */
  minEventsPerWindow?: number;
  /** Fraction of the timeline treated as the morning "baseline" window (default 0.5). */
  baselineFraction?: number;
}

function stats(values: number[]): { mean: number; std: number } {
  if (!values.length) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Compute a drift signal for one judge from their chronological penalty events.
 * The baseline is the judge's earlier events; "recent" is their latest events. We measure the
 * recent mean penalty against the baseline mean, scaled by the baseline's own variability, so a
 * naturally variable judge is not falsely flagged.
 */
export function computeJudgeDrift(events: JudgeEventLike[], options: JudgeDriftOptions = {}): JudgeDriftSignal {
  const driftSigma = options.driftSigma ?? 2;
  const minEvents = options.minEventsPerWindow ?? 4;
  const baselineFraction = options.baselineFraction ?? 0.5;

  const ordered = [...events].sort((a, b) => a.relativeSeconds - b.relativeSeconds);
  const judgeId = ordered[0]?.judgeId || '';
  const splitAt = Math.floor(ordered.length * baselineFraction);
  const baseline = ordered.slice(0, splitAt);
  const recent = ordered.slice(splitAt);

  const baseStat = stats(baseline.map((e) => e.penalty));
  const recentStat = stats(recent.map((e) => e.penalty));
  const spread = baseStat.std || Math.max(0.15, baseStat.mean * 0.35) || 0.25; // floor so tiny variance ≠ infinite sigma
  const deltaSigma = (recentStat.mean - baseStat.mean) / spread;

  const minutesObserved = ordered.length ? Math.round((ordered[ordered.length - 1].relativeSeconds - ordered[0].relativeSeconds) / 60) : 0;
  const enoughData = baseline.length >= minEvents && recent.length >= minEvents;
  const direction: JudgeDriftSignal['direction'] =
    deltaSigma > 0.75 ? 'harsher' : deltaSigma < -0.75 ? 'gentler' : 'stable';

  return {
    judgeId,
    baselinePenaltyRate: Math.round(baseStat.mean * 100) / 100,
    recentPenaltyRate: Math.round(recentStat.mean * 100) / 100,
    deltaSigma: Math.round(deltaSigma * 100) / 100,
    direction,
    attention: enoughData && deltaSigma >= driftSigma,
    baselineEvents: baseline.length,
    recentEvents: recent.length,
    minutesObserved,
  };
}

/**
 * DEMO ONLY — deterministic intraday penalty timeline per judge.
 * Real deployments feed computeAllJudgeDrift from the actual judging Flight Recorder. For
 * local review there is no full day of events, so we synthesize a stable timeline from each
 * judge's id and readiness. It is a projection to exercise the monitor, never a record of any
 * real judging. One judge is given a late-day harshening so the Head Judge can see a live alert.
 */
export function deriveDemoJudgeEvents(
  judges: { id: string; userId?: string; calibrationScore?: number; isReady?: boolean }[],
  eventsPerJudge = 16,
): JudgeEventLike[] {
  const out: JudgeEventLike[] = [];
  const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
  judges.forEach((j, jIdx) => {
    const id = j.userId || j.id;
    const base = 0.35 + hash(id) * 0.4;               // this judge's steady morning severity
    const wobble = 0.12 + hash(`${id}:w`) * 0.1;      // their natural variability
    const driftsLate = jIdx % 3 === 1;                 // ~1/3 of judges tire late in the day
    for (let i = 0; i < eventsPerJudge; i++) {
      const t = i / (eventsPerJudge - 1);              // 0..1 across the day
      const noise = (hash(`${id}:${i}`) - 0.5) * 2 * wobble;
      const afternoon = driftsLate && t > 0.5 ? (t - 0.5) * 1.8 : 0; // harsher after midday (fatigue)
      const penalty = Math.max(0, Math.round((base + noise + afternoon) * 4) / 4);
      out.push({ judgeId: id, relativeSeconds: Math.round(t * 6 * 3600), penalty });
    }
  });
  return out;
}

/** Group raw events by judge and compute a drift signal per judge that has enough activity. */
export function computeAllJudgeDrift(events: JudgeEventLike[], options: JudgeDriftOptions = {}): JudgeDriftSignal[] {
  const byJudge = new Map<string, JudgeEventLike[]>();
  for (const e of events) {
    if (!byJudge.has(e.judgeId)) byJudge.set(e.judgeId, []);
    byJudge.get(e.judgeId)!.push(e);
  }
  return [...byJudge.values()]
    .map((list) => computeJudgeDrift(list, options))
    .filter((s) => s.baselineEvents + s.recentEvents > 0)
    .sort((a, b) => b.deltaSigma - a.deltaSigma);
}
