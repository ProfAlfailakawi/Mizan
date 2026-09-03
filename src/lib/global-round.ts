// Global Synchronized Round — one sealed question, many halls, one Merkle root.
//
// MIZAN's server-held Question Escrow already guarantees that a question's plaintext is never
// exposed in any hall until that hall's own participant is present and its panel reaches quorum.
// That same primitive makes a *distributed* final possible: the same sealed capsule is provisioned
// to N halls worldwide; each hall opens it only under its local presence+quorum; and every hall's
// sealed result digest folds into ONE Merkle root, so the whole event has a single verifiable
// integrity anchor without any hall seeing another's questions or results early.
//
// This module builds the coordination VIEW-MODEL and the merged root. The cryptographic escrow
// and result sealing are the existing server primitives; here we model the fleet and fold digests.

import { buildMerkleTree, hashCanonical } from './trust-protocol';

export type HallStage = 'sealed' | 'present' | 'quorum' | 'revealed' | 'reciting' | 'submitted';

export interface GlobalHall {
  id: string;
  city: string;
  cityArabic: string;
  country: string;
  flag: string;
  participants: number;
  stage: HallStage;
  localTime: string;      // wall clock label (halls span time zones)
  resultDigest?: string;  // present once the hall has sealed its local result
}

const STAGE_ORDER: HallStage[] = ['sealed', 'present', 'quorum', 'revealed', 'reciting', 'submitted'];

/** Deterministic fleet of halls for the distributed final (stable across renders). */
const HALL_SEED: Array<Omit<GlobalHall, 'stage' | 'localTime' | 'resultDigest' | 'participants'> & { participants: number; utc: number }> = [
  { id: 'mkk', city: 'Makkah', cityArabic: 'مكة المكرمة', country: 'SA', flag: '🇸🇦', participants: 12, utc: 3 },
  { id: 'cai', city: 'Cairo', cityArabic: 'القاهرة', country: 'EG', flag: '🇪🇬', participants: 11, utc: 2 },
  { id: 'ist', city: 'Istanbul', cityArabic: 'إسطنبول', country: 'TR', flag: '🇹🇷', participants: 10, utc: 3 },
  { id: 'kul', city: 'Kuala Lumpur', cityArabic: 'كوالالمبور', country: 'MY', flag: '🇲🇾', participants: 12, utc: 8 },
  { id: 'jkt', city: 'Jakarta', cityArabic: 'جاكرتا', country: 'ID', flag: '🇮🇩', participants: 14, utc: 7 },
  { id: 'kar', city: 'Karachi', cityArabic: 'كراتشي', country: 'PK', flag: '🇵🇰', participants: 13, utc: 5 },
  { id: 'dka', city: 'Dhaka', cityArabic: 'دكا', country: 'BD', flag: '🇧🇩', participants: 12, utc: 6 },
  { id: 'lag', city: 'Lagos', cityArabic: 'لاغوس', country: 'NG', flag: '🇳🇬', participants: 9, utc: 1 },
  { id: 'kan', city: 'Kano', cityArabic: 'كانو', country: 'NG', flag: '🇳🇬', participants: 10, utc: 1 },
  { id: 'lon', city: 'London', cityArabic: 'لندن', country: 'GB', flag: '🇬🇧', participants: 8, utc: 1 },
  { id: 'par', city: 'Paris', cityArabic: 'باريس', country: 'FR', flag: '🇫🇷', participants: 7, utc: 2 },
  { id: 'ber', city: 'Berlin', cityArabic: 'برلين', country: 'DE', flag: '🇩🇪', participants: 7, utc: 2 },
  { id: 'nyc', city: 'New York', cityArabic: 'نيويورك', country: 'US', flag: '🇺🇸', participants: 8, utc: -4 },
  { id: 'tor', city: 'Toronto', cityArabic: 'تورنتو', country: 'CA', flag: '🇨🇦', participants: 6, utc: -4 },
  { id: 'dxb', city: 'Dubai', cityArabic: 'دبي', country: 'AE', flag: '🇦🇪', participants: 11, utc: 4 },
  { id: 'doh', city: 'Doha', cityArabic: 'الدوحة', country: 'QA', flag: '🇶🇦', participants: 9, utc: 3 },
  { id: 'kwt', city: 'Kuwait', cityArabic: 'الكويت', country: 'KW', flag: '🇰🇼', participants: 10, utc: 3 },
  { id: 'amm', city: 'Amman', cityArabic: 'عمّان', country: 'JO', flag: '🇯🇴', participants: 9, utc: 3 },
  { id: 'rab', city: 'Rabat', cityArabic: 'الرباط', country: 'MA', flag: '🇲🇦', participants: 8, utc: 1 },
  { id: 'tun', city: 'Tunis', cityArabic: 'تونس', country: 'TN', flag: '🇹🇳', participants: 8, utc: 1 },
];

/**
 * Build the fleet at a given "progress" (0..1). Halls advance through the stages at slightly
 * different rates (they span time zones and paces), which is exactly the coordination challenge
 * the escrow solves: reveal is always local, the anchor is always global.
 */
export async function buildGlobalRound(progress: number, questionCapsuleId: string): Promise<{
  halls: GlobalHall[];
  mergedRoot: string;
  submittedCount: number;
  revealedCount: number;
  totalParticipants: number;
  capsuleId: string;
}> {
  const halls: GlobalHall[] = HALL_SEED.map((h, i) => {
    // Deterministic per-hall offset so the fleet looks alive but is stable for a given progress.
    const phase = ((i * 37) % 100) / 100;
    const local = Math.min(1, Math.max(0, progress * 1.25 - phase * 0.35));
    const idx = Math.min(STAGE_ORDER.length - 1, Math.floor(local * STAGE_ORDER.length));
    const stage = STAGE_ORDER[idx];
    const hh = ((24 + 14 + h.utc) % 24).toString().padStart(2, '0');
    return { id: h.id, city: h.city, cityArabic: h.cityArabic, country: h.country, flag: h.flag, participants: h.participants, stage, localTime: `${hh}:00` };
  });

  // Each submitted hall contributes a sealed result digest; those fold into one Merkle root.
  const digests: string[] = [];
  for (const h of halls) {
    if (h.stage === 'submitted') {
      const digest = await hashCanonical({ hall: h.id, capsule: questionCapsuleId, participants: h.participants, sealed: true });
      h.resultDigest = digest;
      digests.push(digest);
    }
  }
  const tree = digests.length ? await buildMerkleTree(digests) : null;
  const mergedRoot = tree ? tree.root : '';

  return {
    halls,
    mergedRoot,
    submittedCount: halls.filter((h) => h.stage === 'submitted').length,
    revealedCount: halls.filter((h) => ['revealed', 'reciting', 'submitted'].includes(h.stage)).length,
    totalParticipants: halls.reduce((a, h) => a + h.participants, 0),
    capsuleId: questionCapsuleId,
  };
}

export const HALL_COUNT = HALL_SEED.length;
