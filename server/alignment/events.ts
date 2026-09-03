// Event factory (§11, §30).
//
// Every event carries the two non-negotiable governance fields: scoreDelta = 0 and
// authority = 'HUMAN_ONLY'. The engine produces evidence, never verdicts. This factory is the ONLY
// place events are constructed, so those guarantees cannot be forgotten at a call site.

import { AlignmentEvent, AlignmentEventType, ReadingId, TrackingState, ConfidenceReport, PositionCandidate, ConfusableRef } from './types';

export interface EventContext {
  sessionId: string;
  readingId: ReadingId;
}

export class EventEmitter {
  private seq = 0;
  constructor(private ctx: EventContext) {}

  make(input: {
    eventType: AlignmentEventType;
    state: TrackingState;
    audioTimeMs: number;
    surah?: number | null;
    ayah?: number | null;
    wordIndex?: number | null;
    globalWordIndex?: number | null;
    confidence?: ConfidenceReport;
    candidates?: PositionCandidate[];
    fromGlobalWordIndex?: number;
    toGlobalWordIndex?: number;
    detail?: string;
    confusable?: ConfusableRef[];
  }): AlignmentEvent {
    return {
      sessionId: this.ctx.sessionId,
      readingId: this.ctx.readingId,
      eventType: input.eventType,
      state: input.state,
      surah: input.surah ?? null,
      ayah: input.ayah ?? null,
      wordIndex: input.wordIndex ?? null,
      globalWordIndex: input.globalWordIndex ?? null,
      confidence: input.confidence ? input.confidence.calibrated : 0,
      confidenceReport: input.confidence,
      audioTimeMs: Math.round(input.audioTimeMs),
      emittedAtMs: Date.now(),
      sequence: this.seq++,
      candidates: input.candidates,
      fromGlobalWordIndex: input.fromGlobalWordIndex,
      toGlobalWordIndex: input.toGlobalWordIndex,
      detail: input.detail,
      confusable: input.confusable,
      scoreDelta: 0,          // the engine can never change a score
      authority: 'HUMAN_ONLY', // every event is advisory evidence for a human judge
    };
  }
}
