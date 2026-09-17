import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BoundaryMappingError,
  buildForwardBoundaryMapping,
  compareForwardCounts,
  type BoundaryPrimitiveDocument,
} from '../src/lib/quran-count-boundary-mapping';
import { QURAN_WS_BOUNDARY_SOURCE } from '../src/lib/quran-count-boundary-source';

const fixture = (): BoundaryPrimitiveDocument => ({
  _version: 'fixture',
  _reference_system: 'kufi',
  _counting_system_order: ['target', 'kufi'],
  surahs: {
    '1': {
      '1': {
        internal: [{ word: 'داخل', counted_by: ['target'] }],
        // The target counts the internal point but omits this Kufic end: split + merge coexist.
        end: { word: 'نهاية', counted_by: ['kufi'] },
      },
    },
  },
});

const canonicalCount = (surah: number) => (surah === 1 ? 2 : 1);

test('boundary mapping preserves split and merge as independent facts', () => {
  const mapping = buildForwardBoundaryMapping(fixture(), 'target', canonicalCount);
  const first = mapping.surahs[0].ayahs[0];
  const second = mapping.surahs[0].ayahs[1];

  assert.equal(first.status, 'SPLIT_AND_MERGE');
  assert.equal(first.mergesWithNext, true);
  assert.deepEqual(first.targetAyahs, [1, 2]);
  // Because the first Kufic end is omitted, the next canonical ayah starts in target ayah 2.
  assert.equal(second.targetAyah, 2);
  assert.equal(mapping.surahs[0].targetAyahCount, 2);
});

test('114-surah count comparison is fail-closed and names every mismatch', () => {
  const mapping = buildForwardBoundaryMapping(fixture(), 'target', canonicalCount);
  const exactCounts = Array.from({ length: 114 }, (_, index) => (index === 0 ? 2 : 1));
  assert.deepEqual(compareForwardCounts(mapping, exactCounts), { exact: true, mismatches: [] });

  const wrong = [...exactCounts];
  wrong[9] = 2;
  const comparison = compareForwardCounts(mapping, wrong);
  assert.equal(comparison.exact, false);
  assert.deepEqual(comparison.mismatches, [{ surah: 10, generated: 1, expected: 2 }]);
});

test('an explicitly disputed end that does not include Kufic is rejected', () => {
  const broken = fixture();
  broken.surahs['1']['1'].end = { word: 'نهاية', counted_by: ['target'] };
  assert.throws(
    () => buildForwardBoundaryMapping(broken, 'target', canonicalCount),
    (error: unknown) => error instanceof BoundaryMappingError && error.code === 'BOUNDARY_END_MISSING_KUFI:1:1',
  );
});

test('quran-ws evidence source is pinned to an immutable commit and exact blob', () => {
  assert.match(QURAN_WS_BOUNDARY_SOURCE.commit, /^[0-9a-f]{40}$/);
  assert.match(QURAN_WS_BOUNDARY_SOURCE.gitBlobSha1, /^[0-9a-f]{40}$/);
  assert.equal(QURAN_WS_BOUNDARY_SOURCE.byteLength, 51_714);
  assert.equal(QURAN_WS_BOUNDARY_SOURCE.referenceSystem, 'kufi');
  assert.ok(QURAN_WS_BOUNDARY_SOURCE.systems.includes('dimashqi'));
  assert.ok(QURAN_WS_BOUNDARY_SOURCE.systems.includes('madani-first'));
  assert.ok(QURAN_WS_BOUNDARY_SOURCE.systems.includes('basri'));
});
