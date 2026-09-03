// MIZAN Streaming Quran Forced-Alignment Engine — shared types.
//
// The engine answers ONE question, continuously: "where inside the EXPECTED Quran passage has the
// reciter reached now?" — never "what did they say?". Every public surface here is structured; the
// engine never emits free text. See ALIGNMENT_ENGINE.md for the architecture and honesty boundaries.

/** A reading (riwāyah). Reading isolation is a hard boundary — never cross-fallback. */
export type ReadingId =
  | 'hafs'      // حفص عن عاصم  (the only reading with a real acoustic path in this MVP)
  | 'warsh'     // ورش عن نافع
  | 'qalun'     // قالون عن نافع
  | 'shubah'    // شعبة عن عاصم
  | 'duri'      // الدوري عن أبي عمرو
  | 'susi';     // السوسي عن أبي عمرو

/** Tracking state machine — see state-machine.ts for entry/exit conditions. */
export type TrackingState =
  | 'INITIALIZING'
  | 'LISTENING'
  | 'PROBABLE'
  | 'LOCKED'
  | 'UNCERTAIN'
  | 'LOST'
  | 'REACQUIRING'
  | 'REACQUIRED'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED';

export type AlignmentEventType =
  | 'SESSION_STARTED'
  | 'AUDIO_STARTED'
  | 'POSITION_UPDATE'
  | 'AYAH_CHANGED'
  | 'WORD_CHANGED'
  | 'CONFIDENCE_DROP'
  | 'UNCERTAIN'
  | 'LOST'
  | 'REACQUIRE_STARTED'
  | 'REACQUIRED'
  | 'BACKTRACK'
  | 'REPEAT'
  | 'PAUSE'
  | 'RESUME'
  | 'POSSIBLE_SELF_CORRECTION'
  | 'MUTASHABIH_RISK'
  | 'SESSION_COMPLETED'
  | 'FAILED';

/**
 * A locus the current position is confusable WITH (a mutashābih). Evidence only — it flags that a
 * similar-wording passage exists near where the reciter is, so a human can watch the transition. It
 * never asserts the reciter erred.
 */
export interface ConfusableRef {
  kind: 'internal-repeat' | 'curated' | 'live-near-tie';
  globalWordIndex?: number; // where the look-alike sits inside THIS passage window (internal/live)
  surah?: number;
  ayah?: number;
  wordIndex?: number;
  label?: string;           // human note (e.g. a curated cross-sūrah description)
  gap?: number;             // live competing-gap (smaller = more confusable) when kind==='live-near-tie'
}

/** A concrete position inside the canonical passage. */
export interface QuranPosition {
  surah: number;
  ayah: number;
  wordIndex: number;   // 0-based index of the word WITHIN its ayah
  globalWordIndex: number; // 0-based index within the whole passage window
}

/** Confidence is multi-signal and never a constant — see confidence.ts. */
export interface ConfidenceReport {
  raw: number;          // 0..1 straight from the alignment path score
  calibrated: number;   // 0..1 after calibration + penalties
  stability: number;    // 0..1 temporal agreement across recent windows
  competingGap: number; // score gap to the 2nd-best hypothesis (bigger = safer)
}

/** One candidate the decoder is holding at a given moment. */
export interface PositionCandidate {
  globalWordIndex: number;
  score: number;        // 0..1, higher is better
}

/** The engine's structured output at each step. This is the contract MIZAN consumes. */
export interface AlignmentEvent {
  sessionId: string;
  readingId: ReadingId;
  eventType: AlignmentEventType;
  state: TrackingState;
  surah: number | null;
  ayah: number | null;
  wordIndex: number | null;
  globalWordIndex: number | null;
  confidence: number;             // == confidenceReport.calibrated, surfaced for convenience
  confidenceReport?: ConfidenceReport;
  audioTimeMs: number;            // audio clock at which this decision was made
  emittedAtMs: number;            // wall clock (server) when emitted
  sequence: number;               // monotonically increasing per session
  candidates?: PositionCandidate[];
  // Recovery / repeat evidence (present only on the relevant event types):
  fromGlobalWordIndex?: number;
  toGlobalWordIndex?: number;
  detail?: string;
  confusable?: ConfusableRef[];   // present on MUTASHABIH_RISK — the look-alike loci, evidence only
  // MIZAN governance guarantee — the engine is NEVER a judge:
  scoreDelta: 0;                  // always 0; the engine cannot affect any score
  authority: 'HUMAN_ONLY';        // every event is advisory evidence only
}

/** Session provisioning request — the expected passage MUST be known up front. */
export interface AlignmentSessionSpec {
  sessionId: string;
  readingId: ReadingId;
  surah: number;
  startAyah: number;
  endAyah: number;
  expectedStartWordIndex?: number; // word index within startAyah the reciter should begin at
  // Search-window margins (in words) — keep the decoder constrained (§6):
  backtrackMarginWords?: number;   // how far back before the start we tolerate
  forwardMarginWords?: number;     // how far past the end (if competition rules allow)
  // Governance / reproducibility provenance:
  canonicalTextHash: string;       // hash of the certified passage text this session aligns against
  canonicalPackageVersion: string; // certified Quran package version
}

/** Audio contract accepted by the engine: 16 kHz, mono, 16-bit little-endian PCM. */
export interface AudioFormat {
  sampleRate: 16000;
  channels: 1;
  encoding: 'pcm_s16le';
}

export const REQUIRED_AUDIO_FORMAT: AudioFormat = { sampleRate: 16000, channels: 1, encoding: 'pcm_s16le' };

/** Tunable engine configuration. All thresholds are explicit and versioned (config hash). */
export interface AlignmentConfig {
  frameMs: number;             // analysis frame length (25 ms typical)
  hopMs: number;               // frame hop (10 ms typical)
  melBands: number;            // mel filterbank size
  mfccCount: number;           // cepstral coefficients kept
  useDeltas: boolean;          // append delta features
  vadEnergyDb: number;         // energy floor (dBFS) below which a frame is silence
  vadHangoverFrames: number;   // frames of silence tolerated before declaring a pause
  dtwBandRadiusFrames: number; // Sakoe-Chiba-style band radius around the current position
  lockStabilityFrames: number; // consecutive stable frames required to reach LOCKED
  lockConfidence: number;      // min calibrated confidence for LOCKED
  uncertainConfidence: number; // below this → UNCERTAIN
  lostConfidence: number;      // below this (sustained) → LOST
  minCompetingGap: number;     // min gap to 2nd-best to allow LOCKED
  pauseSilenceMs: number;      // silence longer than this → PAUSED
  reacquireEvidenceFrames: number; // frames of agreement required to leave REACQUIRING
}

export const DEFAULT_CONFIG: AlignmentConfig = {
  frameMs: 25,
  hopMs: 10,
  melBands: 26,
  mfccCount: 13,
  useDeltas: true,
  vadEnergyDb: -55,
  vadHangoverFrames: 30,
  dtwBandRadiusFrames: 250,
  lockStabilityFrames: 5,
  lockConfidence: 0.58,
  uncertainConfidence: 0.4,
  lostConfidence: 0.26,
  minCompetingGap: 0.05,
  pauseSilenceMs: 1200,
  reacquireEvidenceFrames: 10,
};
