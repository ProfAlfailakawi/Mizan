// Versioning & reproducibility manifest (§45, §46).
//
// Every session and every benchmark records exactly which model, lexicon, canonical package, and
// config produced its results, so any alignment can be re-interpreted or reproduced later.

import crypto from 'crypto';
import { AlignmentConfig, ReadingId } from './types';
import { AcousticBackend } from './acoustic/backend';
import { LEXICON_VERSION } from './lexicon-hafs';

export const ENGINE_VERSION = 'mizan-aligner-0.1.0';
export function modelVersionFor(reading: ReadingId): string { return `mizan-aligner-${reading}-v0.1.0`; }

export interface AlignmentManifest {
  engineVersion: string;
  modelId: string;
  modelVersion: string;
  backendKind: string;
  reading: ReadingId;
  lexiconVersion: string;
  canonicalPackageVersion: string;
  canonicalTextHash: string;
  configHash: string;
  refFrameCount: number;
}

export function configHash(cfg: AlignmentConfig): string {
  return crypto.createHash('sha256').update(JSON.stringify(cfg, Object.keys(cfg).sort())).digest('hex').slice(0, 16);
}

export function buildManifest(input: {
  reading: ReadingId;
  backend: AcousticBackend;
  canonicalPackageVersion: string;
  canonicalTextHash: string;
  cfg: AlignmentConfig;
}): AlignmentManifest {
  const m = input.backend.manifest();
  return {
    engineVersion: ENGINE_VERSION,
    modelId: m.id,
    modelVersion: modelVersionFor(input.reading),
    backendKind: m.kind,
    reading: input.reading,
    lexiconVersion: LEXICON_VERSION,
    canonicalPackageVersion: input.canonicalPackageVersion,
    canonicalTextHash: input.canonicalTextHash,
    configHash: configHash(input.cfg),
    refFrameCount: input.backend.refFrameCount,
  };
}
