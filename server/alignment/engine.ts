// Alignment engine orchestrator — wires the whole pipeline into a streaming, incremental tracker.
//
//   PCM chunk → framer → VAD → feature front-end → constrained decoder → smoothing → confidence
//            → repeat/backtrack → state machine → recovery → structured events.
//
// Streaming discipline (§13): audio is processed frame-by-frame as it arrives; only a small tail of
// samples and a fixed-size feature history are retained; no full-session reprocessing per chunk.
// Conservatism (§53): the reported cursor moves ONLY when the state machine permits AND the decoder
// has a stable, sufficiently-confident position. When LOST, the last trusted position is held.

import {
  AlignmentSessionSpec, AlignmentConfig, DEFAULT_CONFIG, AlignmentEvent, TrackingState,
} from './types';
import { CanonicalPassage, positionForGlobalIndex } from './canonical';
import { AcousticBackend } from './acoustic/backend';
import { assertReadingConsistency } from './reading';
import { StreamingFramer, decodePcmS16LE, resampleLinear } from './audio/pcm';
import { FeatureFrontend } from './audio/frontend';
import { Vad } from './audio/vad';
import { StreamingPositionDecoder, DEFAULT_DECODER_CONFIG } from './decoder/position-decoder';
import { ConfidenceEngine } from './confidence';
import { TemporalSmoother } from './smoothing';
import { TrackingStateMachine } from './state-machine';
import { RecoveryEngine } from './recovery';
import { RepeatBacktrackDetector } from './repeat-detect';
import { EventEmitter } from './events';
import { MutashabihatMap, liveNearTie, CuratedConfusable } from './mutashabihat';
import { ConfusableRef } from './types';

export interface EngineMetrics {
  framesProcessed: number;
  audioMs: number;
  events: number;
  lostFrames: number;
  lockedFrames: number;
  lastConfidence: number;
}

export class AlignmentEngine {
  private framer: StreamingFramer;
  private frontend: FeatureFrontend;
  private vad: Vad;
  private decoder: StreamingPositionDecoder;
  private confidence = new ConfidenceEngine();
  private smoother: TemporalSmoother;
  private stateMachine: TrackingStateMachine;
  private recovery: RecoveryEngine;
  private repeat = new RepeatBacktrackDetector();
  private emitter: EventEmitter;
  private mutashabihat: MutashabihatMap;
  private announcedRiskWindows = new Set<number>(); // window start indices already announced
  private lastLiveRiskFrame = -1000;

  private readonly hopMs: number;
  private readonly frameLenSamples: number;
  private readonly hopLenSamples: number;
  private readonly firstRefOfWord: Int32Array;
  private readonly wordCount: number;
  private readonly totalRefFrames: number;

  private frameIndex = 0;
  private windowRadius: number;
  private trustedWord = -1;
  private emissionMean = 1;
  private emissionCount = 0;
  private started = false;
  private prevBelowDrop = false;
  private metrics: EngineMetrics = { framesProcessed: 0, audioMs: 0, events: 0, lostFrames: 0, lockedFrames: 0, lastConfidence: 0 };

  constructor(
    private spec: AlignmentSessionSpec,
    private passage: CanonicalPassage,
    private backend: AcousticBackend,
    private cfg: AlignmentConfig = DEFAULT_CONFIG,
    options?: { curatedConfusables?: CuratedConfusable[] },
  ) {
    // FAIL-CLOSED reading + provenance guards before any audio is touched (§5, §48).
    assertReadingConsistency({ sessionReading: spec.readingId, lexiconReading: passage.readingId, modelReading: backend.reading });
    if (passage.readingId !== spec.readingId) throw new Error('READING_PASSAGE_MISMATCH');
    if (backend.reading !== spec.readingId) throw new Error('READING_BACKEND_MISMATCH');
    if (!spec.canonicalTextHash) throw new Error('CANONICAL_TEXT_HASH_REQUIRED');

    this.frameLenSamples = Math.round((cfg.frameMs * 16000) / 1000);
    this.hopLenSamples = Math.round((cfg.hopMs * 16000) / 1000);
    this.hopMs = cfg.hopMs;
    this.windowRadius = cfg.dtwBandRadiusFrames;
    this.wordCount = passage.words.length;
    this.totalRefFrames = backend.refFrameCount;

    this.framer = new StreamingFramer(this.frameLenSamples, this.hopLenSamples);
    this.frontend = new FeatureFrontend(16000, this.frameLenSamples, cfg.melBands, cfg.mfccCount, cfg.useDeltas);
    this.vad = new Vad(cfg.vadEnergyDb, cfg.vadHangoverFrames, cfg.hopMs);
    this.decoder = new StreamingPositionDecoder(backend, DEFAULT_DECODER_CONFIG);
    this.smoother = new TemporalSmoother(5);
    this.stateMachine = new TrackingStateMachine(cfg);
    this.recovery = new RecoveryEngine(cfg, passage, this.totalRefFrames);
    this.emitter = new EventEmitter({ sessionId: spec.sessionId, readingId: spec.readingId });
    // Precompute the mutashābihāt (similar-passage) risk map for this passage (reading-locked).
    this.mutashabihat = MutashabihatMap.build(passage, { curated: options?.curatedConfusables });

    // Map words → first reference frame, to seed the constrained start region (§6).
    this.firstRefOfWord = new Int32Array(this.wordCount).fill(-1);
    for (let f = 0; f < this.totalRefFrames; f++) {
      const w = backend.refFrameToWord(f);
      if (w >= 0 && w < this.wordCount && this.firstRefOfWord[w] === -1) this.firstRefOfWord[w] = f;
    }
    const startWordGlobal = this.resolveStartWordGlobal();
    const backMargin = (spec.backtrackMarginWords ?? 2);
    const startRefLo = this.firstRefOfWord[Math.max(0, startWordGlobal - backMargin)] ?? 0;
    const startRefHi = this.firstRefOfWord[Math.min(this.wordCount - 1, startWordGlobal + 1)] ?? Math.min(this.totalRefFrames - 1, startRefLo + this.cfg.dtwBandRadiusFrames);
    this.decoder.initStartRegion(Math.max(0, startRefLo), Math.max(startRefLo, startRefHi));
  }

  private resolveStartWordGlobal(): number {
    const range = this.passage.ayahWordRanges.find(r => r.ayah === this.spec.startAyah);
    const base = range ? range.from : 0;
    return base + (this.spec.expectedStartWordIndex ?? 0);
  }

  /** SESSION_STARTED + (on first audio) AUDIO_STARTED are emitted by the session wrapper. */
  sessionStartedEvent(): AlignmentEvent {
    return this.emitter.make({ eventType: 'SESSION_STARTED', state: this.stateMachine.current, audioTimeMs: 0 });
  }

  /** Process one PCM chunk (16-bit LE). `sourceRate` defaults to 16 kHz. Returns emitted events. */
  pushAudio(bytes: Uint8Array, sourceRate = 16000): AlignmentEvent[] {
    const samples = resampleLinear(decodePcmS16LE(bytes), sourceRate, 16000);
    const frames = this.framer.push(samples);
    const events: AlignmentEvent[] = [];
    for (const frame of frames) events.push(...this.processFrame(frame));
    return events;
  }

  private processFrame(frame: Float32Array): AlignmentEvent[] {
    const events: AlignmentEvent[] = [];
    const audioTimeMs = this.frameIndex * this.hopMs;
    this.frameIndex++;
    this.metrics.framesProcessed++;
    this.metrics.audioMs = audioTimeMs;

    const vad = this.vad.process(frame);
    const feat = this.frontend.frame(frame);

    if (!this.started) {
      this.started = true;
      events.push(this.emitter.make({ eventType: 'AUDIO_STARTED', state: this.stateMachine.current, audioTimeMs }));
    }

    // Decode with the recovery-controlled window radius (set by the previous frame's recovery pass).
    const lostNow = this.stateMachine.current === 'LOST' || this.stateMachine.current === 'REACQUIRING';
    const step = this.decoder.step(feat, this.windowRadius);

    // Running emission mean (for recovery/anchor gating).
    this.emissionCount++;
    this.emissionMean += (step.emission - this.emissionMean) / Math.min(this.emissionCount, 300);

    const smoothedWord = this.smoother.push(step.bestWord);
    const conf = this.confidence.update(step, vad);
    this.metrics.lastConfidence = conf.calibrated;

    const positionStable = smoothedWord === this.trustedWord || smoothedWord === step.bestWord;
    // One recovery pass per frame; it returns the window radius to use NEXT frame + current evidence.
    const rec = this.recovery.update(step, this.emissionMean, lostNow);
    this.windowRadius = rec.windowRadius;
    const before = this.stateMachine.current;
    const st = this.stateMachine.step({ confidence: conf, vad, positionStable, reacquireEvidence: rec.reacquireEvidence });
    if (st.state === 'LOST') this.metrics.lostFrames++;
    if (st.state === 'LOCKED') this.metrics.lockedFrames++;

    // State-transition events.
    events.push(...this.stateTransitionEvents(before, st.state, audioTimeMs, conf));
    if (st.state === 'REACQUIRED') this.recovery.onReacquired();

    // Confidence-drop edge event.
    const below = conf.calibrated < this.cfg.uncertainConfidence;
    if (below && !this.prevBelowDrop) {
      events.push(this.emitter.make({ eventType: 'CONFIDENCE_DROP', state: st.state, audioTimeMs, confidence: conf, ...this.pos(this.trustedWord) }));
    }
    this.prevBelowDrop = below;

    // Cursor movement — conservative. Advance only when permitted and the smoothed word changed.
    if (st.mayAdvanceCursor && smoothedWord !== this.trustedWord && smoothedWord >= 0) {
      const prevWord = this.trustedWord;
      // Trajectory evidence (repeat/backtrack/self-correction) — evidence only, never a verdict.
      const traj = this.repeat.observe(smoothedWord);
      if (traj) {
        events.push(this.emitter.make({
          eventType: traj.type, state: st.state, audioTimeMs, confidence: conf,
          fromGlobalWordIndex: traj.fromGlobalWordIndex, toGlobalWordIndex: traj.toGlobalWordIndex, detail: traj.detail,
          ...this.pos(traj.toGlobalWordIndex),
        }));
      }
      this.trustedWord = smoothedWord;

      const prevPos = prevWord >= 0 ? positionForGlobalIndex(this.passage, prevWord) : null;
      const newPos = positionForGlobalIndex(this.passage, smoothedWord);
      if (newPos) {
        if (!prevPos || prevPos.ayah !== newPos.ayah) {
          events.push(this.emitter.make({ eventType: 'AYAH_CHANGED', state: st.state, audioTimeMs, confidence: conf, candidates: this.candidateList(step), ...this.pos(smoothedWord) }));
        }
        events.push(this.emitter.make({ eventType: 'WORD_CHANGED', state: st.state, audioTimeMs, confidence: conf, candidates: this.candidateList(step), ...this.pos(smoothedWord) }));
        events.push(this.emitter.make({ eventType: 'POSITION_UPDATE', state: st.state, audioTimeMs, confidence: conf, candidates: this.candidateList(step), ...this.pos(smoothedWord) }));
      }
    } else if (st.changed) {
      // Even without cursor motion, surface the current held position on a state change.
      events.push(this.emitter.make({ eventType: 'POSITION_UPDATE', state: st.state, audioTimeMs, confidence: conf, ...this.pos(this.trustedWord) }));
    }

    // Mutashābihāt early-warning (§29) — evidence only, never a verdict.
    events.push(...this.mutashabihatEvents(st.state, audioTimeMs, conf, step));

    this.metrics.events += events.length;
    return events;
  }

  /**
   * Emit MUTASHABIH_RISK when the reciter is at a confusable locus, from two independent sources:
   *   (a) STATIC: they entered a precomputed risk window (repeated/near-repeated wording) — announced
   *       once per window entry.
   *   (b) LIVE: the decoder currently holds a strong, DISTANT competing hypothesis (near-tie) —
   *       real-time acoustic evidence, debounced by a short cooldown.
   * The two are merged into one event so the head judge sees a single, well-evidenced warning.
   */
  private mutashabihatEvents(state: TrackingState, audioTimeMs: number, conf: import('./types').ConfidenceReport, step: import('./decoder/position-decoder').DecodeStepResult): AlignmentEvent[] {
    if (this.trustedWord < 0) return [];
    const confusable: ConfusableRef[] = [];

    // (a) static window entry (debounced per window).
    const win = this.mutashabihat.windowContaining(this.trustedWord);
    let staticEntry = false;
    if (win && !this.announcedRiskWindows.has(win.fromGlobalWordIndex)) {
      this.announcedRiskWindows.add(win.fromGlobalWordIndex);
      staticEntry = true;
      confusable.push(...win.confusableWith);
    }

    // (b) live near-tie (debounced by frame cooldown). Only while genuinely tracking.
    const tracking = state === 'LOCKED' || state === 'PROBABLE' || state === 'REACQUIRED';
    if (tracking && this.frameIndex - this.lastLiveRiskFrame > 40) {
      const tie = liveNearTie({
        bestWord: step.bestWord,
        competingWord: step.competingWord,
        competingGap: step.competingGap,
        gapThreshold: Math.max(0.12, this.cfg.minCompetingGap * 2),
        minDistanceWords: 3,
      });
      if (tie) {
        this.lastLiveRiskFrame = this.frameIndex;
        const w = tie.globalWordIndex !== undefined ? positionForGlobalIndex(this.passage, tie.globalWordIndex) : null;
        if (w) { tie.surah = w.surah; tie.ayah = w.ayah; tie.wordIndex = w.wordIndex; }
        confusable.push(tie);
      }
    }

    if (!confusable.length) return [];
    const peak = win?.peakRisk ?? 0;
    return [this.emitter.make({
      eventType: 'MUTASHABIH_RISK', state, audioTimeMs, confidence: conf,
      ...this.pos(this.trustedWord),
      confusable,
      detail: staticEntry
        ? `entered a similar-wording stretch (risk ${peak.toFixed(2)})`
        : 'live near-tie with a distant look-alike locus',
    })];
  }

  private stateTransitionEvents(before: TrackingState, after: TrackingState, audioTimeMs: number, conf: import('./types').ConfidenceReport): AlignmentEvent[] {
    if (before === after) return [];
    const out: AlignmentEvent[] = [];
    const base = { state: after, audioTimeMs, confidence: conf, ...this.pos(this.trustedWord) } as const;
    if (after === 'UNCERTAIN') out.push(this.emitter.make({ eventType: 'UNCERTAIN', ...base }));
    if (after === 'LOST') out.push(this.emitter.make({ eventType: 'LOST', ...base }));
    if (after === 'REACQUIRING') out.push(this.emitter.make({ eventType: 'REACQUIRE_STARTED', ...base }));
    if (after === 'REACQUIRED') out.push(this.emitter.make({ eventType: 'REACQUIRED', ...base }));
    if (after === 'PAUSED') out.push(this.emitter.make({ eventType: 'PAUSE', ...base }));
    if (before === 'PAUSED' && after !== 'PAUSED') out.push(this.emitter.make({ eventType: 'RESUME', ...base }));
    return out;
  }

  private pos(globalWordIndex: number) {
    if (globalWordIndex < 0) return { surah: this.passage.surah, ayah: null, wordIndex: null, globalWordIndex: null };
    const p = positionForGlobalIndex(this.passage, globalWordIndex);
    return p ? { surah: p.surah, ayah: p.ayah, wordIndex: p.wordIndex, globalWordIndex: p.globalWordIndex }
             : { surah: this.passage.surah, ayah: null, wordIndex: null, globalWordIndex: null };
  }

  private candidateList(step: import('./decoder/position-decoder').DecodeStepResult) {
    // Convert internal costs to 0..1 scores (lower cost → higher score), normalized within the set.
    const min = Math.min(...step.candidates.map(c => c.score));
    const max = Math.max(...step.candidates.map(c => c.score));
    const range = Math.max(1e-6, max - min);
    return step.candidates.map(c => ({ globalWordIndex: c.word, score: Math.round((1 - (c.score - min) / range) * 100) / 100 }));
  }

  complete(): AlignmentEvent {
    this.stateMachine.complete();
    return this.emitter.make({ eventType: 'SESSION_COMPLETED', state: 'COMPLETED', audioTimeMs: this.metrics.audioMs, ...this.pos(this.trustedWord) });
  }

  fail(detail: string): AlignmentEvent {
    this.stateMachine.fail();
    return this.emitter.make({ eventType: 'FAILED', state: 'FAILED', audioTimeMs: this.metrics.audioMs, detail });
  }

  getMetrics(): EngineMetrics { return { ...this.metrics }; }
  get state(): TrackingState { return this.stateMachine.current; }
  get trustedGlobalWord(): number { return this.trustedWord; }
}
