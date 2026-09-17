/*
 * Pure adapter for scholar-facing ayah-boundary primitives.
 *
 * It deliberately does NOT mutate Mizan's active crosswalk.  Its job is to turn a pinned
 * boundary dataset into a deterministic Kufic -> target-count proposal and to expose enough
 * structure for a later evidence gate to compare it with the exact Mizan source package.
 */

export interface BoundaryPoint {
  word?: string;
  counted_by: string[];
}

export interface BoundaryPrimitive {
  internal?: BoundaryPoint[];
  end?: BoundaryPoint;
}

export interface BoundaryPrimitiveDocument {
  _version?: string;
  _reference_system?: string;
  _counting_system_order?: string[];
  surahs: Record<string, Record<string, BoundaryPrimitive>>;
}

export type ForwardBoundaryStatus = 'MAPPED' | 'MERGED' | 'SPLIT' | 'SPLIT_AND_MERGE';

export interface ForwardBoundaryEntry {
  canonicalAyah: number;
  targetAyah: number;
  targetAyahs: number[];
  status: ForwardBoundaryStatus;
  mergesWithNext: boolean;
  sourceAnchors: string[];
}

export interface ForwardBoundarySurah {
  surah: number;
  canonicalAyahCount: number;
  targetAyahCount: number;
  ayahs: ForwardBoundaryEntry[];
}

export interface ForwardBoundaryMapping {
  sourceSystem: 'kufi';
  targetSystem: string;
  surahs: ForwardBoundarySurah[];
}

export class BoundaryMappingError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'BoundaryMappingError';
    this.code = code;
  }
}

function assertDocument(document: BoundaryPrimitiveDocument, targetSystem: string): void {
  if (!document || typeof document !== 'object' || !document.surahs || typeof document.surahs !== 'object') {
    throw new BoundaryMappingError('BOUNDARY_DOCUMENT_INVALID');
  }
  if (document._reference_system !== 'kufi') {
    throw new BoundaryMappingError('BOUNDARY_REFERENCE_SYSTEM_NOT_KUFI');
  }
  const systems = document._counting_system_order;
  if (!Array.isArray(systems) || !systems.includes('kufi') || !systems.includes(targetSystem)) {
    throw new BoundaryMappingError('BOUNDARY_TARGET_SYSTEM_UNKNOWN');
  }
}

function countedBy(point: BoundaryPoint | undefined, system: string): boolean {
  return !!point && Array.isArray(point.counted_by) && point.counted_by.includes(system);
}

/**
 * Mirrors the quran-ws forward-generation semantics:
 * - an internal boundary counted by the target creates one additional target ayah (split),
 * - a Kufic end omitted by the target means the canonical ayah merges with the next one,
 * - split and merge are independent and may coexist on the same canonical ayah.
 */
export function buildForwardBoundaryMapping(
  document: BoundaryPrimitiveDocument,
  targetSystem: string,
  canonicalAyahCountOf: (surah: number) => number,
): ForwardBoundaryMapping {
  assertDocument(document, targetSystem);
  const surahs: ForwardBoundarySurah[] = [];

  for (let surah = 1; surah <= 114; surah += 1) {
    const canonicalAyahCount = canonicalAyahCountOf(surah);
    if (!Number.isInteger(canonicalAyahCount) || canonicalAyahCount <= 0) {
      throw new BoundaryMappingError(`BOUNDARY_CANONICAL_COUNT_INVALID:${surah}`);
    }

    const primitiveAyahs = document.surahs[String(surah)] || {};
    const ayahs: ForwardBoundaryEntry[] = [];
    let currentTargetAyah = 1;

    for (let canonicalAyah = 1; canonicalAyah <= canonicalAyahCount; canonicalAyah += 1) {
      const primitive = primitiveAyahs[String(canonicalAyah)];
      const internal = Array.isArray(primitive?.internal) ? primitive!.internal! : [];
      const splitPoints = internal.filter(point => countedBy(point, targetSystem));

      // An omitted target system on an explicitly disputed Kufic end is a merge.  When there is
      // no `end` primitive, the ordinary Kufic end is implicit and remains counted by the target.
      let mergesWithNext = false;
      if (primitive?.end) {
        if (!countedBy(primitive.end, 'kufi')) {
          throw new BoundaryMappingError(`BOUNDARY_END_MISSING_KUFI:${surah}:${canonicalAyah}`);
        }
        mergesWithNext = !countedBy(primitive.end, targetSystem);
      }

      const targetAyahs = Array.from(
        { length: splitPoints.length + 1 },
        (_, index) => currentTargetAyah + index,
      );
      const status: ForwardBoundaryStatus = splitPoints.length > 0
        ? (mergesWithNext ? 'SPLIT_AND_MERGE' : 'SPLIT')
        : (mergesWithNext ? 'MERGED' : 'MAPPED');

      const sourceAnchors = [
        ...splitPoints.map(point => `internal:${String(point.word || '').trim() || '?'}`),
        ...(primitive?.end ? [`end:${String(primitive.end.word || '').trim() || '?'}`] : []),
      ];

      ayahs.push({
        canonicalAyah,
        targetAyah: currentTargetAyah,
        targetAyahs,
        status,
        mergesWithNext,
        sourceAnchors,
      });

      currentTargetAyah += splitPoints.length + (mergesWithNext ? 0 : 1);
    }

    surahs.push({
      surah,
      canonicalAyahCount,
      targetAyahCount: currentTargetAyah - 1,
      ayahs,
    });
  }

  return { sourceSystem: 'kufi', targetSystem, surahs };
}

export interface CountComparison {
  exact: boolean;
  mismatches: Array<{ surah: number; generated: number; expected: number }>;
}

/** Fail-closed comparison against counts extracted from the exact Mizan reading package. */
export function compareForwardCounts(
  mapping: ForwardBoundaryMapping,
  expectedCounts: readonly number[],
): CountComparison {
  if (expectedCounts.length !== 114) {
    throw new BoundaryMappingError('BOUNDARY_EXPECTED_COUNTS_MUST_HAVE_114_SURAHS');
  }
  const mismatches: CountComparison['mismatches'] = [];
  for (const surah of mapping.surahs) {
    const expected = expectedCounts[surah.surah - 1];
    if (surah.targetAyahCount !== expected) {
      mismatches.push({ surah: surah.surah, generated: surah.targetAyahCount, expected });
    }
  }
  return { exact: mismatches.length === 0, mismatches };
}
