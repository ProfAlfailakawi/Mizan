// Benchmark runner + metrics + production gates (§38, §41, §44, §46).
//
// Replays a golden session's audio through a REAL engine instance and scores the emitted positions
// against independent ground truth. Produces the metrics MIZAN needs to decide whether a reading may
// leave SHADOW_ONLY. No claim of "production ready" is made by code — only measured numbers vs gates.

import { AlignmentEngine } from '../engine';
import { AlignmentEvent } from '../types';
import { GoldenSession } from './golden';

export interface BenchmarkResult {
  goldenId: string;
  scenario: string;
  samples: number;
  ayahAccuracy: number;       // fraction of truth points with the correct ayah reported
  wordAccuracy: number;       // fraction with the exact word reported (±0)
  wordAccuracyTol1: number;   // fraction within ±1 word
  meanPositionErrorWords: number;
  lostRate: number;           // fraction of processed frames spent LOST
  falseJumpRate: number;      // reported forward jumps > 3 words that truth did not make, per sample
  medianLatencyMs: number;    // onset delay: time from truth word onset to engine reporting it
  confidenceWhenCorrect: number;
  confidenceWhenWrong: number;
  finalState: string;
}

export interface GateThresholds {
  minAyahAccuracy: number;
  minWordAccuracy: number;
  maxFalseJumpRate: number;
  maxLostRate: number;
  maxMedianLatencyMs: number;
}

export const DEFAULT_GATES: GateThresholds = {
  minAyahAccuracy: 0.9,
  minWordAccuracy: 0.75,
  maxFalseJumpRate: 0.05,
  maxLostRate: 0.15,
  maxMedianLatencyMs: 900,
};

/** Run one golden session through the engine (fed in realistic chunks) and score it. */
export function runGolden(
  engine: AlignmentEngine,
  golden: GoldenSession,
  pcm: Uint8Array,
  chunkMs = 100,
): { result: BenchmarkResult; events: AlignmentEvent[] } {
  const bytesPerMs = (16000 * 2) / 1000;
  const chunkBytes = Math.round(chunkMs * bytesPerMs) & ~1; // even (16-bit aligned)
  const events: AlignmentEvent[] = [];
  for (let off = 0; off < pcm.length; off += chunkBytes) {
    const chunk = pcm.subarray(off, Math.min(pcm.length, off + chunkBytes));
    events.push(...engine.pushAudio(chunk, golden.sampleRate));
  }
  events.push(engine.complete());

  // Build a position timeline from POSITION_UPDATE/WORD_CHANGED events.
  const timeline = events
    .filter((e) => e.globalWordIndex !== null && (e.eventType === 'POSITION_UPDATE' || e.eventType === 'WORD_CHANGED'))
    .map((e) => ({ t: e.audioTimeMs, g: e.globalWordIndex as number, ayah: e.ayah, conf: e.confidence }));

  const reportedAt = (timeMs: number) => {
    // Most recent reported position at or before timeMs (the engine holds position between updates).
    let cur: { g: number; ayah: number | null; conf: number } | null = null;
    for (const p of timeline) { if (p.t <= timeMs) cur = { g: p.g, ayah: p.ayah, conf: p.conf }; else break; }
    return cur;
  };

  let ayahOk = 0, wordOk = 0, wordTol1 = 0, errSum = 0, scored = 0;
  let confCorrect = 0, confCorrectN = 0, confWrong = 0, confWrongN = 0;
  for (const truth of golden.truth) {
    const rep = reportedAt(truth.timeMs);
    if (!rep) continue;
    scored++;
    const err = Math.abs(rep.g - truth.globalWordIndex);
    errSum += err;
    if (rep.ayah === truth.ayah) ayahOk++;
    if (err === 0) { wordOk++; confCorrect += rep.conf; confCorrectN++; } else { confWrong += rep.conf; confWrongN++; }
    if (err <= 1) wordTol1++;
  }

  // False jumps: consecutive reported forward leaps > 3 words.
  let jumps = 0;
  for (let i = 1; i < timeline.length; i++) if (timeline[i].g - timeline[i - 1].g > 3) jumps++;

  // Latency: for the normal forward truth, delay between a word's truth onset and first report.
  const latencies: number[] = [];
  const firstReportOfWord = new Map<number, number>();
  for (const p of timeline) if (!firstReportOfWord.has(p.g)) firstReportOfWord.set(p.g, p.t);
  const firstTruthOfWord = new Map<number, number>();
  for (const t of golden.truth) if (!firstTruthOfWord.has(t.globalWordIndex)) firstTruthOfWord.set(t.globalWordIndex, t.timeMs);
  for (const [g, tTruth] of firstTruthOfWord) { const r = firstReportOfWord.get(g); if (r !== undefined && r >= tTruth) latencies.push(r - tTruth); }
  latencies.sort((a, b) => a - b);
  const medianLatencyMs = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0;

  const metrics = engine.getMetrics();
  const lostRate = metrics.framesProcessed ? metrics.lostFrames / metrics.framesProcessed : 0;

  return {
    events,
    result: {
      goldenId: golden.id,
      scenario: golden.scenario,
      samples: scored,
      ayahAccuracy: scored ? ayahOk / scored : 0,
      wordAccuracy: scored ? wordOk / scored : 0,
      wordAccuracyTol1: scored ? wordTol1 / scored : 0,
      meanPositionErrorWords: scored ? errSum / scored : 0,
      lostRate,
      falseJumpRate: golden.truth.length ? jumps / golden.truth.length : 0,
      medianLatencyMs,
      confidenceWhenCorrect: confCorrectN ? confCorrect / confCorrectN : 0,
      confidenceWhenWrong: confWrongN ? confWrong / confWrongN : 0,
      finalState: engine.state,
    },
  };
}

export interface GateReport {
  passed: boolean;
  recommendation: 'SHADOW_ONLY' | 'LIVE_ASSIST';
  failures: string[];
  aggregate: {
    ayahAccuracy: number; wordAccuracy: number; falseJumpRate: number; lostRate: number; medianLatencyMs: number;
  };
}

/** Aggregate results across scenarios and apply gates. Synthetic-only ⇒ never promote past SHADOW. */
export function evaluateGates(results: BenchmarkResult[], gates: GateThresholds = DEFAULT_GATES, opts: { syntheticOnly: boolean } = { syntheticOnly: true }): GateReport {
  const avg = (f: (r: BenchmarkResult) => number) => results.reduce((a, r) => a + f(r), 0) / Math.max(1, results.length);
  const aggregate = {
    ayahAccuracy: avg((r) => r.ayahAccuracy),
    wordAccuracy: avg((r) => r.wordAccuracy),
    falseJumpRate: avg((r) => r.falseJumpRate),
    lostRate: avg((r) => r.lostRate),
    medianLatencyMs: avg((r) => r.medianLatencyMs),
  };
  const failures: string[] = [];
  if (aggregate.ayahAccuracy < gates.minAyahAccuracy) failures.push('AYAH_ACCURACY');
  if (aggregate.wordAccuracy < gates.minWordAccuracy) failures.push('WORD_ACCURACY');
  if (aggregate.falseJumpRate > gates.maxFalseJumpRate) failures.push('FALSE_JUMP_RATE');
  if (aggregate.lostRate > gates.maxLostRate) failures.push('LOST_RATE');
  if (aggregate.medianLatencyMs > gates.maxMedianLatencyMs) failures.push('LATENCY');

  // A synthetic benchmark can only validate the ALGORITHM. Human-recitation accuracy is unmeasured,
  // so the recommendation is capped at SHADOW_ONLY regardless of synthetic scores (§49).
  const passedAlgorithmic = failures.length === 0;
  return {
    passed: passedAlgorithmic,
    recommendation: opts.syntheticOnly ? 'SHADOW_ONLY' : (passedAlgorithmic ? 'LIVE_ASSIST' : 'SHADOW_ONLY'),
    failures,
    aggregate,
  };
}
