/*
 * Pinned ayah-count boundary source used only by ingestion/review tooling.
 * Competition runtime never reaches GitHub for this data.
 */

export const QURAN_WS_BOUNDARY_SOURCE = {
  authority: 'QURAN_WS_QIRAAT_AYAH_MAP',
  role: 'AYAH_ALIGNMENT_AUTHORITY',
  repository: 'quran-ws/qiraat-ayah-map',
  commit: 'a9b4d345f3e1d0e9282711c5e09f24119b17e4e1',
  path: 'data/book-boundary-primitives.json',
  gitBlobSha1: '19d933f2dcb0778172923d44083aad1b4351816c',
  sha256: '63f7bed237871b174a342d5a88688302c06929105af8dc3c3810b4e795a7e6f1',
  byteLength: 51_714,
  /**
   * Frozen copy of the pinned upstream bytes inside this repository.  Ingestion and every
   * verification test read this path, never github.com, so the crosswalk can be rebuilt and
   * re-proved offline on competition day.
   */
  localPath: 'quran-sources/crosswalk/quran-ws/book-boundary-primitives.json',
  localManifestPath: 'quran-sources/crosswalk/quran-ws/MANIFEST.json',
  datasetVersion: '0.1.0',
  referenceSystem: 'kufi',
  systems: ['madani-first', 'madani-last', 'makki', 'basri', 'dimashqi', 'kufi'] as const,
} as const;

export const QURAN_WS_BOUNDARY_RAW_URL =
  `https://raw.githubusercontent.com/${QURAN_WS_BOUNDARY_SOURCE.repository}/${QURAN_WS_BOUNDARY_SOURCE.commit}/${QURAN_WS_BOUNDARY_SOURCE.path}`;

export type QuranWsBoundarySystem = (typeof QURAN_WS_BOUNDARY_SOURCE.systems)[number];
