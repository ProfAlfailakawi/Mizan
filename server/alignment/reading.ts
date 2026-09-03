// Reading isolation — a hard red line (§5).
//
// Every alignment session is bound to exactly one readingId. There is NO cross-reading fallback,
// NO merging of reading texts, and NO reusing one reading's lexicon/model for another. A mismatch
// between the requested reading and the available text/lexicon/model is FAIL-CLOSED: the session is
// refused rather than aligned against the wrong reading (which would either punish a correct reciter
// or hide a real divergence).

import { ReadingId } from './types';

const KNOWN_READINGS: ReadingId[] = ['hafs', 'warsh', 'qalun', 'shubah', 'duri', 'susi'];

/** Readings for which this build has a real, wired acoustic + lexicon path. */
const OPERATIONAL_READINGS: ReadingId[] = ['hafs']; // MVP: Hafs only (architecture is multi-reading)

export class ReadingIsolationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ReadingIsolationError';
  }
}

export function isKnownReading(id: string): id is ReadingId {
  return (KNOWN_READINGS as string[]).includes(id);
}

export function isOperationalReading(id: string): boolean {
  return (OPERATIONAL_READINGS as string[]).includes(id);
}

/**
 * Guard a session's reading before ANY alignment work begins. Throws (fail-closed) if:
 *  - the reading is unknown,
 *  - the reading is known but not operational in this build,
 *  - the provided lexicon/model reading tag disagrees with the session reading.
 */
export function assertReadingConsistency(input: {
  sessionReading: string;
  lexiconReading?: string;
  modelReading?: string;
}): asserts input is { sessionReading: ReadingId; lexiconReading?: ReadingId; modelReading?: ReadingId } {
  const { sessionReading, lexiconReading, modelReading } = input;
  if (!isKnownReading(sessionReading)) {
    throw new ReadingIsolationError('READING_UNKNOWN', `Unknown reading '${sessionReading}'.`);
  }
  if (!isOperationalReading(sessionReading)) {
    throw new ReadingIsolationError('READING_NOT_OPERATIONAL', `Reading '${sessionReading}' has no operational acoustic path in this build.`);
  }
  if (lexiconReading && lexiconReading !== sessionReading) {
    throw new ReadingIsolationError('READING_LEXICON_MISMATCH', `Lexicon reading '${lexiconReading}' ≠ session reading '${sessionReading}'.`);
  }
  if (modelReading && modelReading !== sessionReading) {
    throw new ReadingIsolationError('READING_MODEL_MISMATCH', `Model reading '${modelReading}' ≠ session reading '${sessionReading}'.`);
  }
}
