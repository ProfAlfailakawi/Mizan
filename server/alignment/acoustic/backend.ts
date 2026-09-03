// Acoustic backend interface (§20, §32, §33).
//
// This is the seam that keeps the decoder model-agnostic. Today the operational backend is the
// reference-template backend (real audio-to-audio matching against the certified reference recitation
// of the expected passage). Tomorrow a neural CTC/embedding backend (ONNX, local or venue GPU) can be
// dropped in behind the SAME interface with NO change to the decoder, confidence, or state machine.
//
// A backend exposes, per reference frame, (a) which passage word that frame belongs to and (b) a
// local cost of a live feature vector matching that frame. Everything else (search window, Viterbi
// decoding, confidence, recovery) lives above this seam.

import { ReadingId } from '../types';

export interface AcousticBackend {
  readonly id: string;                 // e.g. 'reference-template-mfcc'
  readonly reading: ReadingId;         // reading this backend is built for (isolation)
  readonly refFrameCount: number;      // number of reference frames
  readonly featureDim: number;

  /** Reference frame index → passage global word index. */
  refFrameToWord(refFrame: number): number;

  /** Local cost (≥0, lower = better) of a live feature vector matching a reference frame. */
  localCost(query: Float64Array, refFrame: number): number;

  /** Reference feature vector at an index (used by the recovery engine for anchors). */
  refFeature(refFrame: number): Float64Array;

  /** Provenance for the evidence ledger. */
  manifest(): { id: string; reading: ReadingId; refFrameCount: number; featureDim: number; kind: string };
}
