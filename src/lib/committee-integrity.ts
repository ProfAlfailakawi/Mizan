/*
 * Committee-level integrity signals (post-session, advisory).
 *
 * A tempting but dangerous idea is to rank individual judges by "bias" or "follow-the-leader"
 * behaviour. MIZAN forbids that on purpose (see BlindAnchorCalibrationRecord.individualRankingProhibited
 * and judge-drift.ts, which compares a judge only against their own earlier self). Naming and
 * ranking judges homogenizes legitimate judging differences and, with the handful of scores a
 * judge gives per session, is mostly noise.
 *
 * This module keeps the useful part and drops the harmful part: it aggregates to the COMMITTEE
 * and produces two advisory signals for the general secretariat — never a per-judge score:
 *
 *  1. Submission synchrony — how tightly a committee's score submissions cluster in time. Very
 *     tight clustering after the first submission is a *committee-level* prompt to check that
 *     judging stayed independent; it does not accuse any individual.
 *  2. Regional evenness — whether a committee's average deduction differs across the delegations
 *     it judged, controlling only at the committee level. A gap is a prompt to review, not proof
 *     of bias, and never attaches to a person.
 *
 * Output is explicitly non-official and never ranks individuals.
 */

export const COMMITTEE_INTEGRITY_VERSION = 'MIZAN-COMMITTEE-INTEGRITY-1';

export interface ScoreEvent {
  committeeId: string;
  region?: string;      // participant delegation/region — never a judge identity
  penalty: number;      // deduction magnitude recorded for the event
  submitOffsetMs?: number; // submit time relative to the panel's first submission for that recitation
}

export interface CommitteeIntegritySignal {
  committeeId: string;
  sampleCount: number;
  /** Median spread (ms) of submissions after the first; smaller = more synchronized. */
  submissionSpreadMs?: number;
  synchrony: 'INDEPENDENT' | 'REVIEW_SYNC' | 'INSUFFICIENT';
  /** Largest gap between any two regions' mean penalty within this committee. */
  regionalPenaltyGap?: number;
  regionalEvenness: 'EVEN' | 'REVIEW_REGIONAL' | 'INSUFFICIENT';
  status: 'CLEAR' | 'REVIEW';
}

export interface CommitteeIntegrityReport {
  version: string;
  nonOfficial: true;
  individualRankingProhibited: true;
  committees: CommitteeIntegritySignal[];
  statement: string;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface CommitteeIntegrityOptions {
  /** Below this median submission spread (ms), a committee is flagged for a synchrony review. */
  syncReviewMs?: number;
  /** Above this regional mean-penalty gap, a committee is flagged for a regional review. */
  regionalReviewGap?: number;
  /** Minimum events before a committee's signal is trustworthy. */
  minSamples?: number;
}

export function analyzeCommitteeIntegrity(events: ScoreEvent[], options: CommitteeIntegrityOptions = {}): CommitteeIntegrityReport {
  const { syncReviewMs = 400, regionalReviewGap = 0.5, minSamples = 6 } = options;
  const byCommittee = new Map<string, ScoreEvent[]>();
  for (const e of events) byCommittee.set(e.committeeId, [...(byCommittee.get(e.committeeId) || []), e]);

  const committees: CommitteeIntegritySignal[] = [...byCommittee.entries()].map(([committeeId, rows]) => {
    const enough = rows.length >= minSamples;

    // synchrony
    const offsets = rows.map(r => r.submitOffsetMs).filter((x): x is number => typeof x === 'number' && x > 0);
    const submissionSpreadMs = offsets.length ? Number(median(offsets).toFixed(1)) : undefined;
    const synchrony: CommitteeIntegritySignal['synchrony'] =
      !enough || submissionSpreadMs === undefined ? 'INSUFFICIENT' : submissionSpreadMs < syncReviewMs ? 'REVIEW_SYNC' : 'INDEPENDENT';

    // regional evenness
    const byRegion = new Map<string, number[]>();
    for (const r of rows) if (r.region) byRegion.set(r.region, [...(byRegion.get(r.region) || []), r.penalty]);
    const regionMeans = [...byRegion.values()].filter(v => v.length).map(v => v.reduce((s, x) => s + x, 0) / v.length);
    const regionalPenaltyGap = regionMeans.length >= 2 ? Number((Math.max(...regionMeans) - Math.min(...regionMeans)).toFixed(3)) : undefined;
    const regionalEvenness: CommitteeIntegritySignal['regionalEvenness'] =
      !enough || regionalPenaltyGap === undefined ? 'INSUFFICIENT' : regionalPenaltyGap > regionalReviewGap ? 'REVIEW_REGIONAL' : 'EVEN';

    const status: CommitteeIntegritySignal['status'] = synchrony === 'REVIEW_SYNC' || regionalEvenness === 'REVIEW_REGIONAL' ? 'REVIEW' : 'CLEAR';
    return { committeeId, sampleCount: rows.length, submissionSpreadMs, synchrony, regionalPenaltyGap, regionalEvenness, status };
  });

  return {
    version: COMMITTEE_INTEGRITY_VERSION,
    nonOfficial: true,
    individualRankingProhibited: true,
    committees,
    statement: 'Committee-level advisory signals for the secretariat. No individual judge is scored, named or ranked.',
  };
}
