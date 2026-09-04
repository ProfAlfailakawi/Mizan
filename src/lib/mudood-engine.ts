/*
 * Proportional Mudood (elongation) engine.
 *
 * Tajweed measures a madd in ḥarakāt (2 / 4 / 6), not in absolute seconds: a fast muḥaqqiq
 * and a slow murattil both recite a 6-ḥaraka madd "correctly" at very different clock times.
 * Judging a madd by an absolute stopwatch is therefore wrong. This engine measures a madd
 * against the reciter's OWN tempo — one ḥaraka unit derived from their natural cadence — and
 * reports how many ḥarakāt the elongation actually lasted, with a tolerance band.
 *
 * NON-NEGOTIABLE (consistent with AI_INTEGRITY.md): this is advisory only. It never changes a
 * score; it hands the human judge a measurement expressed in the reciter's own units. There is
 * no certified acoustic claim here beyond duration ratio, which is why formant/tafkhim analysis
 * is deliberately NOT part of it.
 */

export const MUDOOD_ENGINE_VERSION = 'MIZAN-MUDOOD-1';

/**
 * Derive one ḥaraka unit (ms) from samples of the reciter's own natural (ṭabīʿī, 2-ḥaraka)
 * madd, or any samples whose ḥaraka count is known. Uses the median to resist outliers.
 */
export function harakaUnitMs(samples: Array<{ durationMs: number; harakat: number }>): number | null {
  const perHaraka = samples
    .filter(s => s.durationMs > 0 && s.harakat > 0)
    .map(s => s.durationMs / s.harakat)
    .sort((a, b) => a - b);
  if (!perHaraka.length) return null;
  const mid = Math.floor(perHaraka.length / 2);
  const median = perHaraka.length % 2 ? perHaraka[mid] : (perHaraka[mid - 1] + perHaraka[mid]) / 2;
  return Number(median.toFixed(2));
}

export interface MaddVerdict {
  version: string;
  observedMs: number;
  harakaUnitMs: number;
  observedHarakat: number;
  expectedHarakat: number;
  deltaHarakat: number;
  toleranceHarakat: number;
  within: boolean;
  direction: 'short' | 'long' | 'on-measure';
  scoreAuthority: 'HUMAN_ONLY';
  canAffectScore: false;
  note: string;
}

/**
 * Classify one elongation against its expected ḥaraka count, in the reciter's own units.
 * @param toleranceHarakat half-width of the acceptable band, in ḥarakāt (default 0.5).
 */
export function classifyMadd(observedMs: number, unitMs: number, expectedHarakat: number, toleranceHarakat = 0.5): MaddVerdict {
  if (!(unitMs > 0)) throw new Error('MUDOOD_UNIT_INVALID');
  const observedHarakat = Number((observedMs / unitMs).toFixed(2));
  const deltaHarakat = Number((observedHarakat - expectedHarakat).toFixed(2));
  const within = Math.abs(deltaHarakat) <= toleranceHarakat;
  const direction: MaddVerdict['direction'] = deltaHarakat > toleranceHarakat ? 'long' : deltaHarakat < -toleranceHarakat ? 'short' : 'on-measure';
  return {
    version: MUDOOD_ENGINE_VERSION,
    observedMs: Number(observedMs.toFixed(2)),
    harakaUnitMs: Number(unitMs.toFixed(2)),
    observedHarakat,
    expectedHarakat,
    deltaHarakat,
    toleranceHarakat,
    within,
    direction,
    scoreAuthority: 'HUMAN_ONLY',
    canAffectScore: false,
    note:
      direction === 'on-measure'
        ? `Elongation held ~${observedHarakat} ḥarakāt against an expected ${expectedHarakat}, measured in the reciter's own tempo.`
        : `Elongation held ~${observedHarakat} ḥarakāt versus an expected ${expectedHarakat} (${direction}); advisory only — the judge decides.`,
  };
}
