// Reference-template acoustic backend — the REAL operational path for the MVP (§1, §20, §22).
//
// WHY THIS, NOT GENERIC STT: MIZAN already holds the certified reference recitation audio for each
// ayah. The most accurate, honest thing we can do WITHOUT a Quran-fine-tuned neural model is
// audio-to-audio forced alignment: extract MFCC from the reference recitation of the EXPECTED passage,
// and match the live reciter's MFCC against it, constrained to that passage. This answers "where has
// the reciter reached in the expected text?" directly, is fully measurable, and needs no cloud STT.
//
// The reference audio is a *development-time acoustic reference* for matching. It never replaces the
// certified canonical TEXT the position maps to (§22): word identity comes from the canonical passage.

import { ReadingId } from '../types';
import { AcousticBackend } from './backend';
import { FeatureFrontend, featureDistanceSq } from '../audio/frontend';
import { StreamingFramer, decodePcmS16LE, resampleLinear } from '../audio/pcm';

export interface ReferenceWordBoundary {
  globalWordIndex: number;
  startMs: number;
  endMs: number;
}

export interface ReferenceBuildInput {
  reading: ReadingId;
  pcm: Uint8Array;         // 16-bit PCM of the reference recitation of the whole passage
  sampleRate: number;      // source sample rate (resampled to 16 kHz if needed)
  wordBoundariesMs: ReferenceWordBoundary[]; // per-word time spans in the reference audio
  frameLen: number;        // samples (must match live path)
  hopLen: number;          // samples (must match live path)
  melBands: number;
  mfccCount: number;
  useDeltas: boolean;
}

export class ReferenceTemplateBackend implements AcousticBackend {
  readonly id = 'reference-template-mfcc';
  readonly reading: ReadingId;
  readonly refFrameCount: number;
  readonly featureDim: number;
  private readonly features: Float64Array[];
  private readonly frameWord: Int32Array;

  private constructor(reading: ReadingId, features: Float64Array[], frameWord: Int32Array) {
    this.reading = reading;
    this.features = features;
    this.frameWord = frameWord;
    this.refFrameCount = features.length;
    this.featureDim = features[0]?.length || 0;
  }

  static build(input: ReferenceBuildInput): ReferenceTemplateBackend {
    const raw = decodePcmS16LE(input.pcm);
    const signal = resampleLinear(raw, input.sampleRate, 16000);
    const framer = new StreamingFramer(input.frameLen, input.hopLen);
    const frames = framer.push(signal);
    const frontend = new FeatureFrontend(16000, input.frameLen, input.melBands, input.mfccCount, input.useDeltas);

    const features: Float64Array[] = [];
    const frameWord: number[] = [];
    const boundaries = [...input.wordBoundariesMs].sort((a, b) => a.startMs - b.startMs);
    frames.forEach((frame, i) => {
      features.push(frontend.frame(frame));
      const centerMs = ((i * input.hopLen + input.frameLen / 2) / 16000) * 1000;
      // Assign this reference frame to the word whose time span contains its centre.
      let word = boundaries[0]?.globalWordIndex ?? 0;
      for (const b of boundaries) { if (centerMs >= b.startMs) word = b.globalWordIndex; else break; }
      frameWord.push(word);
    });

    return new ReferenceTemplateBackend(input.reading, features, Int32Array.from(frameWord));
  }

  /** Build directly from pre-extracted feature vectors (used by the synthetic benchmark). */
  static fromFeatures(reading: ReadingId, features: Float64Array[], frameWord: number[]): ReferenceTemplateBackend {
    return new ReferenceTemplateBackend(reading, features, Int32Array.from(frameWord));
  }

  refFrameToWord(refFrame: number): number {
    return this.frameWord[Math.max(0, Math.min(this.refFrameCount - 1, refFrame))] ?? 0;
  }

  localCost(query: Float64Array, refFrame: number): number {
    return featureDistanceSq(query, this.features[refFrame]);
  }

  refFeature(refFrame: number): Float64Array {
    return this.features[Math.max(0, Math.min(this.refFrameCount - 1, refFrame))];
  }

  manifest() {
    return { id: this.id, reading: this.reading, refFrameCount: this.refFrameCount, featureDim: this.featureDim, kind: 'audio-to-audio-mfcc-dtw' };
  }
}
