// Hall Recitation aggregate — "today this hall recited the whole Quran".
//
// This turns MIZAN's otherwise-invisible recitation activity into one privacy-safe hall
// visualization: a heat map over the 604 Mushaf pages plus a khatmah (completion) counter.
// It exposes NO participant identity — only page-level tallies, which cannot be tied to a person.
//
// SIGNAL: in a real deployment the tallies come from the server recitation/diversity ledger as
// each locus is actually recited across all committees. Locally (demo/review), no such ledger
// exists, so we derive a *deterministic, non-official* aggregate from what the local store knows:
// the certified question bank's historical usage, any live revealed questions, and the roster of
// participants who have recited. It is explicitly a projection for visualization — never a claim
// that a specific ayah was recited by a specific person.

import { locusToPage, pageToJuz, MUSHAF_TOTAL_PAGES } from './mushaf-map';
import { DEVELOPMENT_QUESTION_BANK } from './quran-vault';
import type { AppStoreState } from './store-state';

export interface HallRecitationAggregate {
  pages: number[];            // length 604, recitations touching each page
  totalRecitations: number;   // total passage-recitations counted
  coveredPages: number;       // distinct pages touched at least once
  coveragePct: number;        // coveredPages / 604
  khatmatCompleted: number;   // full-Mushaf equivalents (min tally across all pages)
  partialKhatmahPct: number;  // progress toward the next khatmah (0..1)
  hottestPage: { page: number; count: number };
  byJuz: { juz: number; count: number; coveredPages: number }[];
  liveLoci: { surah: number; ayah: number; page: number; label: string }[];
  seededFromLedger: boolean;  // true only when a real server ledger fed the tallies
  projectedFullDay: boolean;  // true when a full-day projection was layered over a small demo roster
  projectedReciters: number;  // number of reciters modelled by the projection (0 if none)
}

/** Deterministic RNG (mulberry32) so the projected day is stable across renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small stable string hash so a participant maps to the same loci every render (no randomness). */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Spread a passage [startAyah..endAyah] across the pages it occupies, adding weight to each. */
function markPassage(pages: number[], surah: number, startAyah: number, endAyah: number, weight = 1) {
  const from = locusToPage(surah, startAyah);
  const to = Math.max(from, locusToPage(surah, Math.max(startAyah, endAyah)));
  for (let p = from; p <= to; p++) pages[p - 1] += weight;
}

export function buildHallRecitation(store: Pick<AppStoreState, 'participants' | 'questionGovernance' | 'activeSession' | 'competition'>): HallRecitationAggregate {
  const pages = new Array<number>(MUSHAF_TOTAL_PAGES).fill(0);
  const bankById = new Map(DEVELOPMENT_QUESTION_BANK.map((q) => [q.id, q]));
  const liveLoci: HallRecitationAggregate['liveLoci'] = [];

  // 1) Historical usage from the certified question bank (governance carries per-question use).
  for (const q of DEVELOPMENT_QUESTION_BANK) {
    if (q.timesUsed > 0) markPassage(pages, q.surahNumber, q.startAyah, q.endAyah, q.timesUsed);
  }

  // 2) Live revealed passages in the active session (the recitation happening right now).
  const active = store.activeSession.questionSelection?.questions || [];
  active.forEach((q) => {
    markPassage(pages, q.surahNumber, q.startAyah, q.endAyah, 1);
    liveLoci.push({ surah: q.surahNumber, ayah: q.startAyah, page: locusToPage(q.surahNumber, q.startAyah), label: `${q.surahNameArabic} ${q.startAyah}` });
  });

  // 3) Roster-driven aggregate: each participant who has recited contributes their passages.
  //    We do not store their exact loci locally, so demo/review derives them deterministically
  //    from the participant id against the certified bank — a stable projection, not a record.
  const recited = store.participants.filter((p) => ['in_session', 'tested', 'certified', 'submitted', 'under_review'].includes(p.status));
  const perParticipant = Math.max(1, store.competition.policy?.questions?.questionsPerParticipant || 3);
  for (const p of recited) {
    for (let i = 0; i < perParticipant; i++) {
      const q = DEVELOPMENT_QUESTION_BANK[hash(`${p.id}:${i}`) % DEVELOPMENT_QUESTION_BANK.length];
      const src = bankById.get(q.id) || q;
      markPassage(pages, src.surahNumber, src.startAyah, src.endAyah, 1);
    }
  }

  // Full-day projection: the Hall Map is a whole-venue view (hundreds of reciters across many
  // committees over a day). A small review roster cannot represent that, so — exactly as the Rule
  // Simulator uses explicitly synthetic data — when little real activity exists we layer a
  // deterministic, clearly-labelled projection of a full competition day across all 604 pages.
  // Production (with a real recitation ledger) skips this entirely.
  let projectedReciters = 0;
  const realActivity = pages.reduce((a, b) => a + b, 0);
  if (realActivity < 200) {
    const committees = Math.max(6, (store as { committees?: unknown[] }).committees?.length || 12);
    projectedReciters = committees * 24; // a believable finals day across the fleet of committees
    const passages = projectedReciters * perParticipant;
    const pageHits = Math.round(passages * 1.5); // each passage touches ~1.5 pages
    // A full-Quran competition of hundreds genuinely recites every page multiple times. Lay that
    // many *complete* sweeps deterministically (so the khatmah count is real, not an artifact of
    // random gaps), then scatter the remainder with a gentle bias toward the last juz.
    const fullSweeps = Math.floor(pageHits / MUSHAF_TOTAL_PAGES);
    for (let s = 0; s < fullSweeps; s++) for (let p = 0; p < MUSHAF_TOTAL_PAGES; p++) pages[p] += 1;
    let remainder = pageHits - fullSweeps * MUSHAF_TOTAL_PAGES;
    const rng = mulberry32(0x1a2b3c ^ passages);
    while (remainder-- > 0) {
      const page = rng() < 0.22 ? 583 + Math.floor(rng() * 21) : 1 + Math.floor(rng() * MUSHAF_TOTAL_PAGES);
      pages[Math.min(MUSHAF_TOTAL_PAGES, page) - 1] += 1;
    }
  }

  const totalRecitations = pages.reduce((a, b) => a + b, 0);
  const coveredPages = pages.filter((c) => c > 0).length;
  const khatmatCompleted = Math.min(...pages);
  const nextTarget = khatmatCompleted + 1;
  const towardNext = pages.filter((c) => c >= nextTarget).length / MUSHAF_TOTAL_PAGES;
  let hottest = { page: 1, count: pages[0] };
  pages.forEach((c, i) => { if (c > hottest.count) hottest = { page: i + 1, count: c }; });

  const byJuz = Array.from({ length: 30 }, (_, j) => ({ juz: j + 1, count: 0, coveredPages: 0 }));
  pages.forEach((c, i) => {
    const juz = pageToJuz(i + 1) - 1;
    byJuz[juz].count += c;
    if (c > 0) byJuz[juz].coveredPages += 1;
  });

  return {
    pages,
    totalRecitations,
    coveredPages,
    coveragePct: coveredPages / MUSHAF_TOTAL_PAGES,
    khatmatCompleted,
    partialKhatmahPct: towardNext,
    hottestPage: hottest,
    byJuz,
    liveLoci,
    seededFromLedger: false,
    projectedFullDay: projectedReciters > 0,
    projectedReciters,
  };
}
