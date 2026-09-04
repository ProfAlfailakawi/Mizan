import type { QuestionPoolItem, QuestionSelection } from '../types';

/*
 * FairDraw cognitive-energy parity.
 *
 * The existing FairDraw (src/lib/fairdraw.ts) proves that each participant's set is
 * reproducible against the configured constraints, and it already balances each *question*
 * toward the policy's target difficulty. What it does NOT claim is that two participants in
 * the same category carry the same TOTAL cognitive load — a draw can be reproducible and
 * still hand one reciter three smooth passages while another gets three dense, trap-heavy
 * ones inside the same tolerance.
 *
 * This module measures that. It scores each passage's cognitive energy from three signals
 * the question bank already carries — raw difficulty, mutashabihat density, and tajweed
 * complexity — sums them per participant, and reports how far apart a cohort's totals are.
 *
 * It is deliberately a MEASUREMENT and a GATE, not a silent re-draw: it never mutates a
 * selection or a seed, so it cannot weaken the public commit–reveal proof. A competition may
 * use it to reject and re-draw a cohort whose parity falls outside tolerance, but the
 * decision — and the re-draw — stay explicit and auditable.
 */

export const FAIRDRAW_PARITY_VERSION = 'MIZAN-FAIRDRAW-PARITY-1';

const MUTASHABIHAT_WEIGHT: Record<QuestionPoolItem['mutashabihatDensity'], number> = { none: 0, low: 0.5, medium: 1, high: 1.75 };
const TAJWEED_WEIGHT: Record<QuestionPoolItem['tajweedComplexity'], number> = { basic: 0, intermediate: 0.75, advanced: 1.5 };

/** Cognitive energy of one passage: raw difficulty plus the two load multipliers the bank records. */
export function questionEnergy(q: Pick<QuestionPoolItem, 'difficultyRating' | 'mutashabihatDensity' | 'tajweedComplexity'>): number {
  const base = Number.isFinite(q.difficultyRating) ? q.difficultyRating : 0;
  return Number((base + (MUTASHABIHAT_WEIGHT[q.mutashabihatDensity] ?? 0) + (TAJWEED_WEIGHT[q.tajweedComplexity] ?? 0)).toFixed(3));
}

export interface ParticipantEnergy {
  participantId: string;
  questionCount: number;
  totalEnergy: number;
  averageEnergy: number;
}

export interface FairDrawParityReport {
  version: string;
  participantCount: number;
  participants: ParticipantEnergy[];
  meanTotalEnergy: number;
  /** Max − min of participant totals, as an absolute value. */
  totalEnergySpread: number;
  /** Widest pairwise gap as a fraction of the mean total (0 = perfect parity). */
  maxRelativeDelta: number;
  /** The two most unequal participants and their totals. */
  worstPair?: { a: ParticipantEnergy; b: ParticipantEnergy; relativeDelta: number };
  toleranceFraction: number;
  status: 'BALANCED' | 'REVIEW';
  statement: string;
}

function summarize(selection: { participantId: string; questions: Pick<QuestionPoolItem, 'difficultyRating' | 'mutashabihatDensity' | 'tajweedComplexity'>[] }): ParticipantEnergy {
  const total = selection.questions.reduce((s, q) => s + questionEnergy(q), 0);
  const count = selection.questions.length;
  return { participantId: selection.participantId, questionCount: count, totalEnergy: Number(total.toFixed(3)), averageEnergy: Number((count ? total / count : 0).toFixed(3)) };
}

/**
 * Measure cognitive-energy parity across a cohort's FairDraw selections.
 * @param toleranceFraction max acceptable pairwise gap as a fraction of the mean (default 0.15 = 15%).
 */
export function analyzeFairDrawParity(
  selections: Array<Pick<QuestionSelection, 'participantId' | 'questions'>>,
  toleranceFraction = 0.15,
): FairDrawParityReport {
  const participants = selections.map(summarize).sort((a, b) => a.totalEnergy - b.totalEnergy);
  const n = participants.length;
  const meanTotal = n ? participants.reduce((s, p) => s + p.totalEnergy, 0) / n : 0;
  const lo = participants[0];
  const hi = participants[n - 1];
  const spread = n ? Number((hi.totalEnergy - lo.totalEnergy).toFixed(3)) : 0;
  const maxRelativeDelta = meanTotal > 0 ? Number((spread / meanTotal).toFixed(4)) : 0;
  const worstPair = n >= 2 ? { a: lo, b: hi, relativeDelta: maxRelativeDelta } : undefined;
  const status: FairDrawParityReport['status'] = n < 2 || maxRelativeDelta <= toleranceFraction ? 'BALANCED' : 'REVIEW';
  return {
    version: FAIRDRAW_PARITY_VERSION,
    participantCount: n,
    participants,
    meanTotalEnergy: Number(meanTotal.toFixed(3)),
    totalEnergySpread: spread,
    maxRelativeDelta,
    worstPair,
    toleranceFraction,
    status,
    statement:
      status === 'BALANCED'
        ? 'Cohort question sets carry comparable total cognitive energy within tolerance.'
        : 'Cohort question sets differ in total cognitive energy beyond tolerance; consider a re-draw.',
  };
}
