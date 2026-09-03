// Mutashābihāt (similar-passages) risk map (§29).
//
// The Quran contains many near-identical phrasings. Deciding position on words alone is unsafe
// there. This module precomputes, for the EXPECTED passage, WHERE the wording looks like another
// locus, and pairs that static map with the decoder's LIVE competing-hypothesis signal so the head
// judge is warned exactly when a reciter enters a confusable stretch.
//
// STRICT HONESTY: this flags SIMILARITY as evidence for a human. It never says the reciter erred,
// never changes a score, and it is reading-locked (built from this reading's canonical text only).
//
// Two static sources:
//   1. internal-repeat — repeated/near-repeated word n-grams WITHIN the passage (detected here).
//   2. curated — known cross-sūrah look-alikes supplied by scientific governance (optional table).
// Plus one live source (evaluated in the engine): 'live-near-tie' from the decoder's competingGap.

import { CanonicalPassage } from './canonical';
import { ConfusableRef } from './types';

export interface CuratedConfusable {
  /** Range in THIS passage (global word indices, inclusive) that looks like an external locus. */
  fromGlobalWordIndex: number;
  toGlobalWordIndex: number;
  similarSurah: number;
  similarAyah: number;
  similarWordIndex?: number;
  label: string; // e.g. "يشبه آل عمران ٢٦" — a human, scholar-authored note
}

export interface WordRisk {
  globalWordIndex: number;
  risk: number;              // 0..1 static confusability of the wording at this word
  confusableWith: ConfusableRef[];
}

export interface RiskWindow {
  fromGlobalWordIndex: number;
  toGlobalWordIndex: number;
  peakRisk: number;
  confusableWith: ConfusableRef[];
}

export interface MutashabihatMapOptions {
  minGram?: number;      // shortest repeated n-gram considered (default 3)
  maxGram?: number;      // longest (default 5)
  allowOneSub?: boolean; // also catch near-repeats differing by one word (default true)
  riskThreshold?: number; // window-forming threshold on per-word risk (default 0.34)
  curated?: CuratedConfusable[];
}

export class MutashabihatMap {
  readonly perWord: WordRisk[];
  readonly windows: RiskWindow[];

  private constructor(perWord: WordRisk[], windows: RiskWindow[]) {
    this.perWord = perWord;
    this.windows = windows;
  }

  riskAt(globalWordIndex: number): WordRisk | undefined {
    return this.perWord[globalWordIndex];
  }

  /** The risk window (if any) that contains this word — used for debounced entry detection. */
  windowContaining(globalWordIndex: number): RiskWindow | undefined {
    return this.windows.find(w => globalWordIndex >= w.fromGlobalWordIndex && globalWordIndex <= w.toGlobalWordIndex);
  }

  static build(passage: CanonicalPassage, options: MutashabihatMapOptions = {}): MutashabihatMap {
    const minGram = options.minGram ?? 3;
    const maxGram = options.maxGram ?? 5;
    const allowOneSub = options.allowOneSub ?? true;
    const threshold = options.riskThreshold ?? 0.34;
    const sigs = passage.words.map(w => w.signature);
    const N = sigs.length;

    // Rarity: rare words carry more discriminative weight, so a repeat built of rare words is a
    // stronger confusability signal than one built of very common particles (§28).
    const sigCount = new Map<string, number>();
    for (const s of sigs) sigCount.set(s, (sigCount.get(s) || 0) + 1);
    const rarity = (s: string) => (sigCount.get(s) === 1 ? 1 : sigCount.get(s)! <= 3 ? 0.6 : 0.3);

    const risk = new Float64Array(N);
    const refs: ConfusableRef[][] = Array.from({ length: N }, () => []);

    // Index every k-gram (exact) → list of start indices; a group with >1 member is a repeat.
    for (let k = minGram; k <= maxGram; k++) {
      if (k > N) break;
      const exact = new Map<string, number[]>();
      const gapped = new Map<string, number[]>(); // one-substitution buckets (position wildcarded)
      for (let i = 0; i + k <= N; i++) {
        const win = sigs.slice(i, i + k);
        const key = win.join('|');
        (exact.get(key) || exact.set(key, []).get(key)!).push(i);
        if (allowOneSub && k >= 4) {
          for (let p = 0; p < k; p++) {
            const gk = k + ':' + win.map((s, idx) => (idx === p ? '*' : s)).join('|');
            (gapped.get(gk) || gapped.set(gk, []).get(gk)!).push(i);
          }
        }
      }
      const weight = k / maxGram; // longer shared phrase ⇒ higher confusability
      const applyGroup = (starts: number[], kind: ConfusableRef['kind']) => {
        if (starts.length < 2) return;
        for (const i of starts) {
          const avgRarity = (sigs.slice(i, i + k).reduce((a, s) => a + rarity(s), 0) / k);
          for (let j = i; j < i + k; j++) risk[j] = Math.min(1, risk[j] + weight * avgRarity * 0.6);
          // Record the OTHER occurrences as confusable partners (dedup by start).
          for (const other of starts) {
            if (other === i) continue;
            if (!refs[i].some(r => r.globalWordIndex === other)) {
              const w = passage.words[other];
              refs[i].push({ kind, globalWordIndex: other, surah: w.surah, ayah: w.ayah, wordIndex: w.wordIndex });
            }
          }
        }
      };
      for (const starts of exact.values()) applyGroup(starts, 'internal-repeat');
      if (allowOneSub && k >= 4) for (const starts of gapped.values()) applyGroup([...new Set(starts)], 'internal-repeat');
    }

    // Curated cross-sūrah look-alikes (scholar-supplied, optional).
    for (const c of options.curated || []) {
      for (let g = c.fromGlobalWordIndex; g <= c.toGlobalWordIndex && g < N; g++) {
        risk[g] = Math.min(1, risk[g] + 0.7);
        refs[g].push({ kind: 'curated', surah: c.similarSurah, ayah: c.similarAyah, wordIndex: c.similarWordIndex, label: c.label });
      }
    }

    const perWord: WordRisk[] = passage.words.map((w, i) => ({
      globalWordIndex: i,
      risk: Math.round(risk[i] * 100) / 100,
      confusableWith: dedupeRefs(refs[i]),
    }));

    // Group contiguous high-risk words into windows for debounced "entered a confusable stretch".
    const windows: RiskWindow[] = [];
    let cur: RiskWindow | null = null;
    for (let i = 0; i < N; i++) {
      if (risk[i] >= threshold) {
        if (!cur) cur = { fromGlobalWordIndex: i, toGlobalWordIndex: i, peakRisk: risk[i], confusableWith: [...perWord[i].confusableWith] };
        else { cur.toGlobalWordIndex = i; cur.peakRisk = Math.max(cur.peakRisk, risk[i]); cur.confusableWith.push(...perWord[i].confusableWith); }
      } else if (cur) { cur.confusableWith = dedupeRefs(cur.confusableWith); windows.push(cur); cur = null; }
    }
    if (cur) { cur.confusableWith = dedupeRefs(cur.confusableWith); windows.push(cur); }

    return new MutashabihatMap(perWord, windows);
  }
}

function dedupeRefs(refs: ConfusableRef[]): ConfusableRef[] {
  const seen = new Set<string>();
  const out: ConfusableRef[] = [];
  for (const r of refs) {
    const key = `${r.kind}:${r.globalWordIndex ?? ''}:${r.surah ?? ''}:${r.ayah ?? ''}:${r.wordIndex ?? ''}`;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out.slice(0, 6);
}

/**
 * Live near-tie evaluator: given the decoder's best word, competing word and gap, decide whether
 * the reciter is at a live acoustic confusability (a strong, DISTANT competitor). Independent of the
 * static map — this catches look-alikes the static index missed (e.g. reordered mirror phrases).
 */
export function liveNearTie(input: {
  bestWord: number;
  competingWord: number | null;
  competingGap: number;
  gapThreshold: number;
  minDistanceWords: number;
}): ConfusableRef | null {
  if (input.competingWord === null) return null;
  const distance = Math.abs(input.competingWord - input.bestWord);
  if (input.competingGap <= input.gapThreshold && distance >= input.minDistanceWords) {
    return { kind: 'live-near-tie', globalWordIndex: input.competingWord, gap: Math.round(input.competingGap * 100) / 100 };
  }
  return null;
}
