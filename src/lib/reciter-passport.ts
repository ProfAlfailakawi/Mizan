import type { ParticipantPassportEntry } from '../types';

/*
 * Reciter participation record (the honest slice of a "global passport").
 *
 * The full proposal — W3C Verifiable Credentials for a reciter's ijāzāt and asānīd, plus a
 * biometric voiceprint — is deliberately NOT built here:
 *   - no authority issues digitally-verifiable ijāzāt to bind to, and issuing a VC for an
 *     unverified sanad would dress a claim up as an official record (violates README principle 7);
 *   - a voiceprint is Article-9 biometric data whose legal risk outweighs its benefit, and the
 *     real problem it was meant to solve (a past winner re-entering a beginners' category) is
 *     solved by a unified participation record and a stable id, not by biometrics.
 *
 * What IS safe and useful is unifying a reciter's verified participation history across
 * competitions into one summary with a stable fingerprint, and flagging duplicate or
 * re-entry situations for a human to review. That is what this module does — no new external
 * capability is presented as working.
 */

export const RECITER_PASSPORT_VERSION = 'MIZAN-RECITER-PASSPORT-1';

export interface ReciterPassport {
  version: string;
  participantId: string;
  competitionCount: number;
  verifiedCount: number;
  categories: string[];
  years: string[];
  bestResult?: string;
  certificateNumbers: string[];
  /** Deterministic, order-independent fingerprint of the verified record; hash it to seal. */
  fingerprint: string;
  entries: ParticipantPassportEntry[];
}

function canonical(entries: ParticipantPassportEntry[]): string {
  return entries
    .map(e => [e.competitionId, e.year, e.categoryName, e.result ?? '', e.certificateNumber ?? '', e.verified ? '1' : '0'].join('|'))
    .sort()
    .join('\n');
}

/** Rank labels best→worst; lower index = higher placement. Used only for the advisory re-entry flag. */
const DEFAULT_PLACEMENT_ORDER = ['المركز الأول', 'first', 'المركز الثاني', 'second', 'المركز الثالث', 'third'];

export function aggregateReciterPassport(participantId: string, allEntries: ParticipantPassportEntry[]): ReciterPassport {
  const entries = allEntries.filter(e => e.participantId === participantId);
  const verified = entries.filter(e => e.verified);
  const categories = [...new Set(entries.map(e => e.categoryName).filter(Boolean))].sort();
  const years = [...new Set(entries.map(e => e.year).filter(Boolean))].sort();
  const certificateNumbers = [...new Set(entries.map(e => e.certificateNumber).filter((x): x is string => !!x))].sort();
  const placementIndex = (r?: string) => (r ? DEFAULT_PLACEMENT_ORDER.findIndex(p => r.toLowerCase().includes(p.toLowerCase())) : -1);
  const best = verified
    .map(e => ({ e, i: placementIndex(e.result) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => a.i - b.i)[0]?.e.result;
  return {
    version: RECITER_PASSPORT_VERSION,
    participantId,
    competitionCount: new Set(entries.map(e => e.competitionId)).size,
    verifiedCount: verified.length,
    categories,
    years,
    bestResult: best,
    certificateNumbers,
    fingerprint: canonical(verified),
    entries,
  };
}

export interface EligibilityFlag {
  kind: 'DUPLICATE_ENTRY' | 'REPEAT_HIGH_PLACEMENT';
  message: string;
  competitionId?: string;
  year?: string;
}

/**
 * Advisory eligibility flags for a human to review — never an automatic block.
 * @param highPlacementCategories categories where a prior verified top placement should
 *   prompt review if the reciter re-enters (e.g. a beginners' tier). Optional.
 */
export function detectEligibilityFlags(passport: ReciterPassport, options: { highPlacementReviewCategories?: string[] } = {}): EligibilityFlag[] {
  const flags: EligibilityFlag[] = [];

  // duplicate: same competition + year appears more than once
  const seen = new Map<string, number>();
  for (const e of passport.entries) {
    const key = `${e.competitionId}::${e.year}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [key, count] of seen) if (count > 1) {
    const [competitionId, year] = key.split('::');
    flags.push({ kind: 'DUPLICATE_ENTRY', competitionId, year, message: `Reciter appears ${count}× in the same competition (${competitionId}, ${year}).` });
  }

  // repeat high placement into a review-gated category
  const review = new Set((options.highPlacementReviewCategories || []).map(c => c.toLowerCase()));
  const hasTopPlacement = passport.entries.some(e => e.verified && /(الأول|first|الثاني|second|الثالث|third)/i.test(e.result || ''));
  if (hasTopPlacement && review.size) {
    for (const e of passport.entries) {
      if (review.has((e.categoryName || '').toLowerCase())) {
        flags.push({ kind: 'REPEAT_HIGH_PLACEMENT', competitionId: e.competitionId, year: e.year, message: `A prior top-placed reciter is entered in a review-gated category (${e.categoryName}).` });
      }
    }
  }
  return flags;
}
