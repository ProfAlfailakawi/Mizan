import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ayahCountOf } from '../src/lib/quran-canon';
import {
  NATIVE_SURAH_AYAH_COUNTS,
  type QuranNativeCountSystemId,
} from '../src/lib/quran-native-count-systems';
import {
  buildForwardBoundaryMapping,
  compareForwardCounts,
  type BoundaryPrimitiveDocument,
  type ForwardBoundaryMapping,
} from '../src/lib/quran-count-boundary-mapping';
import {
  QURAN_WS_BOUNDARY_RAW_URL,
  QURAN_WS_BOUNDARY_SOURCE,
} from '../src/lib/quran-count-boundary-source';

const SYSTEMS = [
  { sourceSystem: 'dimashqi', nativeSystem: 'DIMASHQI' as QuranNativeCountSystemId, rawis: ['hisham', 'ibn-dhakwan'] },
  { sourceSystem: 'madani-first', nativeSystem: 'MADANI_AWWAL' as QuranNativeCountSystemId, rawis: ['ibn-wardan', 'ibn-jammaz'] },
  // Mizan deliberately has two package-derived Yaqub count identities.  Generic `basri` is never
  // assumed to equal either: each is compared independently across all 114 surahs below.
  { sourceSystem: 'basri', nativeSystem: 'BASRI_YAQUB_RUWAYS' as QuranNativeCountSystemId, rawis: ['ruways'] },
  { sourceSystem: 'basri', nativeSystem: 'BASRI_YAQUB_RAWH' as QuranNativeCountSystemId, rawis: ['rawh'] },
] as const;

function argValue(prefix: string): string | undefined {
  const item = process.argv.find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : undefined;
}

function gitBlobSha1(bytes: Buffer): string {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

async function loadPinnedBytes(): Promise<Buffer> {
  const local = argValue('--source-file=');
  if (local) return fs.readFileSync(path.resolve(local));
  const response = await fetch(QURAN_WS_BOUNDARY_RAW_URL, {
    headers: { 'user-agent': 'mizan-quran-crosswalk-intake/1.0' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`QURAN_WS_BOUNDARY_FETCH_FAILED:${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function verifyPinnedBytes(bytes: Buffer): { gitBlobSha1: string; sha256: string } {
  if (bytes.length !== QURAN_WS_BOUNDARY_SOURCE.byteLength) {
    throw new Error(`QURAN_WS_BOUNDARY_SIZE_MISMATCH:${bytes.length}:${QURAN_WS_BOUNDARY_SOURCE.byteLength}`);
  }
  const blob = gitBlobSha1(bytes);
  if (blob !== QURAN_WS_BOUNDARY_SOURCE.gitBlobSha1) {
    throw new Error(`QURAN_WS_BOUNDARY_GIT_BLOB_MISMATCH:${blob}:${QURAN_WS_BOUNDARY_SOURCE.gitBlobSha1}`);
  }
  return { gitBlobSha1: blob, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function parseDocument(bytes: Buffer): BoundaryPrimitiveDocument {
  let parsed: BoundaryPrimitiveDocument;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as BoundaryPrimitiveDocument;
  } catch {
    throw new Error('QURAN_WS_BOUNDARY_JSON_INVALID');
  }
  if (parsed._version !== QURAN_WS_BOUNDARY_SOURCE.datasetVersion) {
    throw new Error(`QURAN_WS_BOUNDARY_VERSION_MISMATCH:${String(parsed._version)}`);
  }
  if (parsed._reference_system !== QURAN_WS_BOUNDARY_SOURCE.referenceSystem) {
    throw new Error(`QURAN_WS_BOUNDARY_REFERENCE_MISMATCH:${String(parsed._reference_system)}`);
  }
  return parsed;
}

function divergentSurahs(mapping: ForwardBoundaryMapping): number[] {
  return mapping.surahs
    .filter(row => row.targetAyahCount !== row.canonicalAyahCount)
    .map(row => row.surah);
}

function reviewRows(rawiId: string, mapping: ForwardBoundaryMapping) {
  const divergent = new Set(divergentSurahs(mapping));
  return mapping.surahs.flatMap(surah => {
    if (!divergent.has(surah.surah)) return [];
    return surah.ayahs.map(entry => ({
      rawiId,
      canonical: { surah: surah.surah, ayah: entry.canonicalAyah },
      native: entry.targetAyahs.length === 1
        ? { surah: surah.surah, ayah: entry.targetAyah }
        : { surah: surah.surah, ayahStart: entry.targetAyahs[0], ayahEnd: entry.targetAyahs.at(-1) },
      relation: entry.status,
      mergesWithNext: entry.mergesWithNext,
      evidence: [
        `${QURAN_WS_BOUNDARY_SOURCE.authority}@${QURAN_WS_BOUNDARY_SOURCE.commit}:${QURAN_WS_BOUNDARY_SOURCE.path}`,
        `kufi:${surah.surah}:${entry.canonicalAyah}->${mapping.targetSystem}:${entry.targetAyahs.join('-')}`,
        ...entry.sourceAnchors,
      ],
      active: false,
    }));
  });
}

async function main() {
  const bytes = await loadPinnedBytes();
  const integrity = verifyPinnedBytes(bytes);
  const document = parseDocument(bytes);
  const mappingCache = new Map<string, ForwardBoundaryMapping>();
  const validations = [];
  const candidates = [];

  for (const config of SYSTEMS) {
    let mapping = mappingCache.get(config.sourceSystem);
    if (!mapping) {
      mapping = buildForwardBoundaryMapping(document, config.sourceSystem, ayahCountOf);
      mappingCache.set(config.sourceSystem, mapping);
    }
    const comparison = compareForwardCounts(mapping, NATIVE_SURAH_AYAH_COUNTS[config.nativeSystem]);
    validations.push({
      sourceSystem: config.sourceSystem,
      nativeSystem: config.nativeSystem,
      rawis: config.rawis,
      exact114: comparison.exact,
      mismatchCount: comparison.mismatches.length,
      mismatches: comparison.mismatches,
    });
    if (comparison.exact) {
      for (const rawiId of config.rawis) candidates.push(...reviewRows(rawiId, mapping));
    }
  }

  const report = {
    protocol: 'MIZAN-QURAN-WS-CROSSWALK-VALIDATION-1',
    generatedAt: new Date().toISOString(),
    source: { ...QURAN_WS_BOUNDARY_SOURCE, ...integrity },
    validations,
    rule: 'Rows are review candidates only. No row is activated by this script. A reading is eligible only when its 114 per-surah target counts exactly match the pinned Mizan package counts.',
  };

  const outDir = path.resolve('artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'quran-ws-crosswalk-validation.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'quran-ws-crosswalk-candidates.json'), JSON.stringify({
    protocol: 'MIZAN-QURAN-WS-CROSSWALK-CANDIDATES-1',
    sourceCommit: QURAN_WS_BOUNDARY_SOURCE.commit,
    sourceSha256: integrity.sha256,
    active: false,
    rows: candidates,
  }, null, 2) + '\n');

  for (const row of validations) {
    console.log(`${row.rawis.join(', ')}: ${row.sourceSystem} -> ${row.nativeSystem}: ${row.exact114 ? 'MATCH 114/114' : `BLOCKED (${row.mismatchCount} mismatched surahs)`}`);
  }
  console.log(`source sha256: ${integrity.sha256}`);
  console.log(`review candidates: ${candidates.length} (all active:false)`);

  if (process.argv.includes('--require-all-six') && validations.some(row => !row.exact114)) {
    process.exitCode = 2;
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
