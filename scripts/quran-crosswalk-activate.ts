/*
 * Canonical ↔ native crosswalk activation.
 *
 * PINNED UPSTREAM DATA → FREEZE LOCALLY → SHA-256 → VALIDATE SCHEMA → GENERATE FORWARD MAPPING
 * → COMPARE 114 TARGET COUNTS WITH THE MIZAN PINNED PACKAGE → ONLY THEN EMIT ACTIVE EVIDENCE.
 *
 * Nothing here activates a reading on a partial match.  A single mismatched surah blocks the
 * whole counting system, and the rawis served by it stay out of the generated evidence module.
 */

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
import { QURAN_WS_BOUNDARY_SOURCE } from '../src/lib/quran-count-boundary-source';

/**
 * Each entry is one *independent* claim.  `basri` is deliberately listed twice: Mizan carries two
 * package-derived Yaqub count identities and neither is assumed equal to the generic upstream
 * system — each is proved, or blocked, on its own 114 surahs.
 */
export const CROSSWALK_CANDIDATE_SYSTEMS = [
  { sourceSystem: 'dimashqi', nativeSystem: 'DIMASHQI' as QuranNativeCountSystemId, rawis: ['hisham', 'ibn-dhakwan'] },
  { sourceSystem: 'madani-first', nativeSystem: 'MADANI_AWWAL' as QuranNativeCountSystemId, rawis: ['ibn-wardan', 'ibn-jammaz'] },
  { sourceSystem: 'basri', nativeSystem: 'BASRI_YAQUB_RUWAYS' as QuranNativeCountSystemId, rawis: ['ruways'] },
  { sourceSystem: 'basri', nativeSystem: 'BASRI_YAQUB_RAWH' as QuranNativeCountSystemId, rawis: ['rawh'] },
  /*
   * الروايات المُسلَّمة من مرآة المجمع: ترقيمُها مقيسٌ من بايتاتها، فتُجرَّب كلٌّ منها على
   * النظام المنشور المتوقَّع لها. وما لم يطابق ١١٤/١١٤ لا يُفعَّل ولا يُقرَّب — ويُسمَّى
   * في التقرير بسورته، فيعرف المالك ما الذي يلزمه بالضبط بدل «غير جاهز».
   */
  { sourceSystem: 'madani-last', nativeSystem: 'MADANI_AKHIR' as QuranNativeCountSystemId, rawis: ['warsh', 'qalun'] },
  { sourceSystem: 'makki', nativeSystem: 'MAKKI_IBN_KATHIR_DELIVERY' as QuranNativeCountSystemId, rawis: ['al-bazzi', 'qunbul'] },
  { sourceSystem: 'basri', nativeSystem: 'BASRI_ABU_AMR_DELIVERY' as QuranNativeCountSystemId, rawis: ['al-duri-abu-amr', 'al-susi'] },
] as const;

export const GENERATED_EVIDENCE_PATH = 'src/lib/quran-crosswalk-boundary-evidence.generated.ts';

function gitBlobSha1(bytes: Buffer): string {
  return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
}

/** Reads the frozen in-repo bytes only.  No network, on purpose. */
export function loadFrozenBoundaryBytes(repoRoot = process.cwd()): Buffer {
  const file = path.resolve(repoRoot, QURAN_WS_BOUNDARY_SOURCE.localPath);
  if (!fs.existsSync(file)) throw new Error(`QURAN_WS_BOUNDARY_FROZEN_COPY_MISSING:${QURAN_WS_BOUNDARY_SOURCE.localPath}`);
  return fs.readFileSync(file);
}

export function verifyFrozenBytes(bytes: Buffer): { sha256: string; gitBlobSha1: string } {
  if (bytes.length !== QURAN_WS_BOUNDARY_SOURCE.byteLength) {
    throw new Error(`QURAN_WS_BOUNDARY_SIZE_MISMATCH:${bytes.length}:${QURAN_WS_BOUNDARY_SOURCE.byteLength}`);
  }
  const blob = gitBlobSha1(bytes);
  if (blob !== QURAN_WS_BOUNDARY_SOURCE.gitBlobSha1) {
    throw new Error(`QURAN_WS_BOUNDARY_GIT_BLOB_MISMATCH:${blob}`);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== QURAN_WS_BOUNDARY_SOURCE.sha256) {
    throw new Error(`QURAN_WS_BOUNDARY_SHA256_MISMATCH:${sha256}`);
  }
  return { sha256, gitBlobSha1: blob };
}

/** Fail-closed schema parse.  Malformed data never reaches the mapper. */
export function parseBoundaryDocument(bytes: Buffer): BoundaryPrimitiveDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('QURAN_WS_BOUNDARY_JSON_INVALID');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('QURAN_WS_BOUNDARY_DOCUMENT_INVALID');
  const document = parsed as BoundaryPrimitiveDocument;
  if (document._version !== QURAN_WS_BOUNDARY_SOURCE.datasetVersion) {
    throw new Error(`QURAN_WS_BOUNDARY_VERSION_MISMATCH:${String(document._version)}`);
  }
  if (document._reference_system !== QURAN_WS_BOUNDARY_SOURCE.referenceSystem) {
    throw new Error(`QURAN_WS_BOUNDARY_REFERENCE_MISMATCH:${String(document._reference_system)}`);
  }
  if (!Array.isArray(document._counting_system_order) || document._counting_system_order.length === 0) {
    throw new Error('QURAN_WS_BOUNDARY_SYSTEM_ORDER_INVALID');
  }
  if (!document.surahs || typeof document.surahs !== 'object' || Array.isArray(document.surahs)) {
    throw new Error('QURAN_WS_BOUNDARY_SURAHS_INVALID');
  }
  for (const [surahKey, ayahs] of Object.entries(document.surahs)) {
    const surah = Number(surahKey);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
      throw new Error(`QURAN_WS_BOUNDARY_SURAH_KEY_INVALID:${surahKey}`);
    }
    if (!ayahs || typeof ayahs !== 'object' || Array.isArray(ayahs)) {
      throw new Error(`QURAN_WS_BOUNDARY_SURAH_BODY_INVALID:${surahKey}`);
    }
    for (const [ayahKey, primitive] of Object.entries(ayahs)) {
      const ayah = Number(ayahKey);
      if (!Number.isInteger(ayah) || ayah < 1 || ayah > ayahCountOf(surah)) {
        throw new Error(`QURAN_WS_BOUNDARY_AYAH_KEY_INVALID:${surahKey}:${ayahKey}`);
      }
      if (!primitive || typeof primitive !== 'object' || Array.isArray(primitive)) {
        throw new Error(`QURAN_WS_BOUNDARY_PRIMITIVE_INVALID:${surahKey}:${ayahKey}`);
      }
      const points = [...(primitive.internal ?? []), ...(primitive.end ? [primitive.end] : [])];
      if (primitive.internal !== undefined && !Array.isArray(primitive.internal)) {
        throw new Error(`QURAN_WS_BOUNDARY_INTERNAL_INVALID:${surahKey}:${ayahKey}`);
      }
      for (const point of points) {
        if (!point || typeof point !== 'object' || !Array.isArray(point.counted_by) || point.counted_by.length === 0) {
          throw new Error(`QURAN_WS_BOUNDARY_POINT_INVALID:${surahKey}:${ayahKey}`);
        }
        for (const system of point.counted_by) {
          if (typeof system !== 'string' || !document._counting_system_order!.includes(system)) {
            throw new Error(`QURAN_WS_BOUNDARY_POINT_SYSTEM_UNKNOWN:${surahKey}:${ayahKey}:${String(system)}`);
          }
        }
      }
    }
  }
  return document;
}

export interface SystemValidation {
  sourceSystem: string;
  nativeSystem: QuranNativeCountSystemId;
  rawis: readonly string[];
  exact114: boolean;
  mismatches: Array<{ surah: number; generated: number; expected: number }>;
}

export interface ActivationResult {
  integrity: { sha256: string; gitBlobSha1: string };
  validations: SystemValidation[];
  activated: Array<{ config: (typeof CROSSWALK_CANDIDATE_SYSTEMS)[number]; mapping: ForwardBoundaryMapping }>;
}

/** The full pipeline, reusable from tests so the proof is not script-only. */
export function runCrosswalkActivation(repoRoot = process.cwd()): ActivationResult {
  const bytes = loadFrozenBoundaryBytes(repoRoot);
  const integrity = verifyFrozenBytes(bytes);
  const document = parseBoundaryDocument(bytes);
  const mappingCache = new Map<string, ForwardBoundaryMapping>();
  const validations: SystemValidation[] = [];
  const activated: ActivationResult['activated'] = [];

  for (const config of CROSSWALK_CANDIDATE_SYSTEMS) {
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
      mismatches: comparison.mismatches,
    });
    if (comparison.exact) activated.push({ config, mapping });
  }

  return { integrity, validations, activated };
}

interface GeneratedEvent { a: number; s: number; m: 0 | 1; w: string[] }

function eventsFor(mapping: ForwardBoundaryMapping): {
  divergentSurahs: number[];
  events: Record<number, GeneratedEvent[]>;
  targetCounts: number[];
} {
  const divergentSurahs: number[] = [];
  const events: Record<number, GeneratedEvent[]> = {};
  const targetCounts: number[] = [];
  for (const surah of mapping.surahs) {
    targetCounts.push(surah.targetAyahCount);
    if (surah.targetAyahCount === surah.canonicalAyahCount) continue;
    divergentSurahs.push(surah.surah);
    const rows: GeneratedEvent[] = [];
    for (const entry of surah.ayahs) {
      const splits = entry.targetAyahs.length - 1;
      if (splits === 0 && !entry.mergesWithNext) continue;
      rows.push({ a: entry.canonicalAyah, s: splits, m: entry.mergesWithNext ? 1 : 0, w: entry.sourceAnchors });
    }
    events[surah.surah] = rows;
  }
  return { divergentSurahs, events, targetCounts };
}

function emitGeneratedModule(result: ActivationResult): { source: string; artifactSha256: string } {
  const payload = result.activated.map(({ config, mapping }) => {
    const { divergentSurahs, events, targetCounts } = eventsFor(mapping);
    return {
      sourceSystem: config.sourceSystem,
      nativeSystem: config.nativeSystem,
      rawis: [...config.rawis],
      targetCounts,
      divergentSurahs,
      events,
    };
  });
  const canonical = JSON.stringify(payload);
  const artifactSha256 = createHash('sha256').update(canonical).digest('hex');

  const header = `/*
 * GENERATED — do not edit by hand.  Regenerate with: npm run quran:crosswalk-activate
 *
 * Derived from the frozen, pinned upstream boundary primitives.  Only counting systems whose
 * generated 114 per-surah target counts match the pinned Mizan reading package byte-for-byte are
 * present here; a single mismatched surah keeps a system — and every rawi it serves — out of this
 * file entirely.  Rawi identity is never deduplicated: readings that share a counting system still
 * carry their own rows at runtime.
 */

import { QURAN_WS_BOUNDARY_SOURCE } from './quran-count-boundary-source';
import type { QuranNativeCountSystemId } from './quran-native-count-systems';

/** One disputed boundary: canonical ayah, how many extra native ayahs it splits into, whether it merges forward. */
export interface GeneratedBoundaryEvent {
  /** canonical (Kufic) ayah number */
  a: number;
  /** number of *additional* native ayahs created inside this canonical ayah */
  s: number;
  /** 1 = the native ayah continues into the next canonical ayah */
  m: 0 | 1;
  /** anchoring words as published upstream */
  w: readonly string[];
}

export interface GeneratedBoundarySystem {
  sourceSystem: string;
  nativeSystem: QuranNativeCountSystemId;
  rawis: readonly string[];
  /** generated native ayah count per surah (1..114) — proved equal to the pinned package counts */
  targetCounts: readonly number[];
  /** surahs whose native count differs from the canonical count; only these need evidenced rows */
  divergentSurahs: readonly number[];
  events: Readonly<Record<number, readonly GeneratedBoundaryEvent[]>>;
}

export const BOUNDARY_EVIDENCE_BUILD = {
  protocol: 'MIZAN-CROSSWALK-BOUNDARY-EVIDENCE-1',
  generator: 'scripts/quran-crosswalk-activate.ts',
  upstreamRepository: QURAN_WS_BOUNDARY_SOURCE.repository,
  upstreamCommit: QURAN_WS_BOUNDARY_SOURCE.commit,
  upstreamPath: QURAN_WS_BOUNDARY_SOURCE.path,
  frozenLocalPath: QURAN_WS_BOUNDARY_SOURCE.localPath,
  sourceSha256: ${JSON.stringify(result.integrity.sha256)},
  generatedArtifactSha256: ${JSON.stringify(artifactSha256)},
} as const;

export const GENERATED_BOUNDARY_SYSTEMS: readonly GeneratedBoundarySystem[] = ${JSON.stringify(payload, null, 2)};
`;
  return { source: header, artifactSha256 };
}

function main() {
  const repoRoot = process.cwd();
  const result = runCrosswalkActivation(repoRoot);
  const { source, artifactSha256 } = emitGeneratedModule(result);
  fs.writeFileSync(path.resolve(repoRoot, GENERATED_EVIDENCE_PATH), source);

  const report = {
    protocol: 'MIZAN-QURAN-WS-CROSSWALK-ACTIVATION-1',
    source: {
      repository: QURAN_WS_BOUNDARY_SOURCE.repository,
      commit: QURAN_WS_BOUNDARY_SOURCE.commit,
      upstreamPath: QURAN_WS_BOUNDARY_SOURCE.path,
      frozenLocalPath: QURAN_WS_BOUNDARY_SOURCE.localPath,
      ...result.integrity,
    },
    generatedArtifactSha256: artifactSha256,
    validations: result.validations,
    activatedSystems: result.activated.map(a => a.config.nativeSystem),
    activatedRawis: result.activated.flatMap(a => [...a.config.rawis]),
    blockedRawis: result.validations.filter(v => !v.exact114).flatMap(v => [...v.rawis]),
    rule: 'A counting system is activated only on an exact 114/114 per-surah match against the pinned Mizan package counts. Partial matches activate nothing.',
  };
  fs.mkdirSync(path.resolve(repoRoot, 'artifacts'), { recursive: true });
  fs.writeFileSync(
    path.resolve(repoRoot, 'artifacts/quran-ws-crosswalk-activation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );

  for (const row of result.validations) {
    console.log(
      `${row.rawis.join(', ')}: ${row.sourceSystem} -> ${row.nativeSystem}: ` +
      (row.exact114
        ? 'ACTIVATED (114/114)'
        : `BLOCKED (${row.mismatches.length} mismatched surahs: ${row.mismatches.map(m => `${m.surah}:${m.generated}!=${m.expected}`).join(', ')})`),
    );
  }
  console.log(`source sha256           : ${result.integrity.sha256}`);
  console.log(`generated artifact sha256: ${artifactSha256}`);
  console.log(`wrote ${GENERATED_EVIDENCE_PATH}`);
}

if (process.argv[1] && process.argv[1].endsWith('quran-crosswalk-activate.ts')) main();
