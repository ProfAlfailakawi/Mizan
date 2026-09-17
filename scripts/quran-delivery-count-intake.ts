/*
 * P14 — native ayah numbering for the mirror-served readings.
 *
 * The tree used to have no in-tree proof of how the eight mirror-served packages number their
 * ayahs, so it announced `UNVERIFIED` and silently resolved every locus one-to-one against the
 * Kufic count.  That assumption is wrong for six of the eight — measured, not guessed.
 *
 * This script reads the pinned delivery artifacts, proves each surah carries a contiguous 1..N,
 * and writes the per-surah counts as frozen evidence.  Re-running it against the same pinned
 * commit must reproduce byte-identical counts; anything else fails closed.
 *
 *   npm run quran:delivery-counts -- --clone=/path/to/quran-data-kfgqpc   (re-measure and verify)
 *   npm run quran:delivery-counts                                          (verify frozen evidence only)
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const KFGQPC_MIRROR_COUNTS_PATH = 'quran-sources/delivery-counts/kfgqpc-mirror/counts.json';
export const KFGQPC_MIRROR_MANIFEST_PATH = 'quran-sources/delivery-counts/kfgqpc-mirror/MANIFEST.json';

export interface FrozenDeliveryCount {
  upstreamPath: string;
  byteLength: number;
  sha256: string;
  rowCount: number;
  malformedRows: number;
  surahsWithGaps: number;
  totalAyahs: number;
  perSurahAyahCounts: number[];
}

export function loadFrozenDeliveryCounts(repoRoot = process.cwd()): Record<string, FrozenDeliveryCount> {
  const file = path.resolve(repoRoot, KFGQPC_MIRROR_COUNTS_PATH);
  if (!fs.existsSync(file)) throw new Error(`KFGQPC_MIRROR_COUNTS_MISSING:${KFGQPC_MIRROR_COUNTS_PATH}`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, FrozenDeliveryCount>;
}

export function loadDeliveryCountManifest(repoRoot = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, KFGQPC_MIRROR_MANIFEST_PATH), 'utf8')) as {
    upstreamRepository: string;
    upstreamCommit: string;
    files: Array<{ rawiId: string; upstreamPath: string; sha256: string; byteLength: number; rowCount: number; totalAyahs: number }>;
  };
}

export interface MeasuredCounts {
  sha256: string;
  byteLength: number;
  rowCount: number;
  malformedRows: number;
  surahsWithGaps: number;
  totalAyahs: number;
  perSurahAyahCounts: number[];
}

/**
 * Measures one delivery package's native numbering from its own bytes.
 *
 * Fails closed rather than guessing: a row without an integer surah/ayah is counted as malformed
 * and a surah that is not a contiguous 1..N is counted as a gap.  A package with either is not
 * evidence of anything.
 */
export function measurePackageCounts(bytes: Buffer): MeasuredCounts {
  let rows: unknown;
  try { rows = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('KFGQPC_MIRROR_PACKAGE_JSON_INVALID'); }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('KFGQPC_MIRROR_PACKAGE_NOT_A_ROW_ARRAY');

  const highest = new Map<number, number>();
  const seen = new Map<number, Set<number>>();
  let malformedRows = 0;

  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const surah = Number(row.sura_no ?? row.sora);
    const ayah = Number(row.aya_no ?? row.aya);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1) {
      malformedRows += 1;
      continue;
    }
    highest.set(surah, Math.max(highest.get(surah) ?? 0, ayah));
    let set = seen.get(surah);
    if (!set) { set = new Set(); seen.set(surah, set); }
    set.add(ayah);
  }

  const perSurahAyahCounts = Array.from({ length: 114 }, (_, i) => highest.get(i + 1) ?? 0);
  let surahsWithGaps = 0;
  for (let surah = 1; surah <= 114; surah += 1) {
    const set = seen.get(surah);
    if (!set || set.size !== perSurahAyahCounts[surah - 1]) surahsWithGaps += 1;
  }

  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
    rowCount: rows.length,
    malformedRows,
    surahsWithGaps,
    totalAyahs: perSurahAyahCounts.reduce((sum, n) => sum + n, 0),
    perSurahAyahCounts,
  };
}

export interface CountVerification {
  rawiId: string;
  matches: boolean;
  reason?: string;
  mismatchedSurahs: Array<{ surah: number; measured: number; frozen: number }>;
}

/** Compares a freshly measured package against the frozen evidence. Any divergence fails closed. */
export function verifyAgainstFrozen(rawiId: string, measured: MeasuredCounts, frozen: FrozenDeliveryCount): CountVerification {
  const mismatchedSurahs: CountVerification['mismatchedSurahs'] = [];
  for (let i = 0; i < 114; i += 1) {
    if (measured.perSurahAyahCounts[i] !== frozen.perSurahAyahCounts[i]) {
      mismatchedSurahs.push({ surah: i + 1, measured: measured.perSurahAyahCounts[i], frozen: frozen.perSurahAyahCounts[i] });
    }
  }
  if (measured.sha256 !== frozen.sha256) {
    return { rawiId, matches: false, reason: `DELIVERY_PACKAGE_SHA256_MISMATCH:${measured.sha256}`, mismatchedSurahs };
  }
  if (measured.malformedRows > 0 || measured.surahsWithGaps > 0) {
    return { rawiId, matches: false, reason: `DELIVERY_PACKAGE_NOT_CONTIGUOUS:${measured.malformedRows}:${measured.surahsWithGaps}`, mismatchedSurahs };
  }
  return { rawiId, matches: mismatchedSurahs.length === 0, mismatchedSurahs };
}

function argValue(prefix: string): string | undefined {
  const item = process.argv.find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : undefined;
}

function main() {
  const repoRoot = process.cwd();
  const frozen = loadFrozenDeliveryCounts(repoRoot);
  const manifest = loadDeliveryCountManifest(repoRoot);
  const clone = argValue('--clone=');

  console.log(`pinned mirror: ${manifest.upstreamRepository}@${manifest.upstreamCommit}`);
  if (!clone) {
    // Without the upstream bytes the frozen evidence is still checked for internal consistency.
    let ok = true;
    for (const [rawiId, entry] of Object.entries(frozen)) {
      const total = entry.perSurahAyahCounts.reduce((sum, n) => sum + n, 0);
      const consistent = total === entry.totalAyahs && entry.perSurahAyahCounts.length === 114
        && entry.malformedRows === 0 && entry.surahsWithGaps === 0;
      if (!consistent) ok = false;
      console.log(`${rawiId}: total=${entry.totalAyahs} sha256=${entry.sha256.slice(0, 16)} ${consistent ? 'CONSISTENT' : 'INCONSISTENT'}`);
    }
    console.log('BLOCKED_BY_EXTERNAL_DATA: pass --clone=<path to a checkout of the pinned mirror commit> to re-measure from the upstream bytes.');
    if (!ok) process.exitCode = 1;
    return;
  }

  let failed = false;
  for (const [rawiId, entry] of Object.entries(frozen)) {
    const file = path.resolve(clone, entry.upstreamPath);
    if (!fs.existsSync(file)) { console.log(`${rawiId}: MISSING ${entry.upstreamPath}`); failed = true; continue; }
    const measured = measurePackageCounts(fs.readFileSync(file));
    const verification = verifyAgainstFrozen(rawiId, measured, entry);
    if (!verification.matches) failed = true;
    console.log(`${rawiId}: ${verification.matches ? 'MATCH 114/114' : `MISMATCH ${verification.reason || ''} ${JSON.stringify(verification.mismatchedSurahs.slice(0, 5))}`}`);
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('quran-delivery-count-intake.ts')) main();
