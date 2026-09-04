import type { MutashabihatTrapRecord } from '../types';

/*
 * Mutashabihat radar (head-judge advisory).
 *
 * When a reciter hesitates on a verse that has near-identical twins elsewhere in the Muṣḥaf,
 * the head judge currently just writes "hesitation". This turns the pre-approved similarity map
 * (MutashabihatTrapRecord — reviewed and APPROVED by the scientific committee, never model
 * output) into an instant read of *which* competing loci pull on the memory at that spot.
 *
 * It is a lookup over approved data, shown to the head judge only. It never scores, never
 * appears on the public broadcast during the recitation, and surfaces only APPROVED map
 * entries so nothing speculative reaches a decision.
 */

export const MUTASHABIHAT_RADAR_VERSION = 'MIZAN-MUTASHABIHAT-RADAR-1';

export interface RadarLocus { surah: number; ayah: number }
export interface RadarCompetitor {
  locus: RadarLocus;
  evidenceKind: MutashabihatTrapRecord['similarityEvidence']['kind'];
  score: number;
  reference?: string;
}
export interface MutashabihatRadar {
  version: string;
  at: RadarLocus;
  competitors: RadarCompetitor[];
  competitorCount: number;
  strongest?: RadarCompetitor;
}

const sameLocus = (a: RadarLocus, b: { surah: number; ayah: number }) => a.surah === b.surah && a.ayah === b.ayah;

/**
 * Build the radar for a hesitation locus from the approved trap map.
 * Only APPROVED records are considered; REVIEW_MAP entries are ignored so nothing unreviewed
 * is ever surfaced to a judge. Matches are bidirectional (expected↔possible) since the memory
 * pull runs both ways, and are ranked by similarity strength.
 */
export function buildMutashabihatRadar(at: RadarLocus, map: MutashabihatTrapRecord[]): MutashabihatRadar {
  const seen = new Set<string>();
  const competitors: RadarCompetitor[] = [];
  for (const rec of map) {
    if (rec.status !== 'APPROVED') continue;
    let other: { surah: number; ayah: number } | null = null;
    if (sameLocus(at, rec.expected)) other = rec.possible;
    else if (sameLocus(at, rec.possible)) other = rec.expected;
    if (!other) continue;
    const key = `${other.surah}:${other.ayah}`;
    if (seen.has(key)) continue;
    seen.add(key);
    competitors.push({
      locus: { surah: other.surah, ayah: other.ayah },
      evidenceKind: rec.similarityEvidence.kind,
      score: typeof rec.similarityEvidence.score === 'number' ? rec.similarityEvidence.score : 0,
      reference: rec.similarityEvidence.reference,
    });
  }
  competitors.sort((a, b) => b.score - a.score);
  return {
    version: MUTASHABIHAT_RADAR_VERSION,
    at,
    competitors,
    competitorCount: competitors.length,
    strongest: competitors[0],
  };
}
