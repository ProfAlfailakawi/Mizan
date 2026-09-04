import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMutashabihatRadar, MUTASHABIHAT_RADAR_VERSION } from '../src/lib/mutashabihat-radar';
import type { MutashabihatTrapRecord } from '../src/types';

function trap(over: Partial<MutashabihatTrapRecord>): MutashabihatTrapRecord {
  return {
    id: over.id || 't', competitionId: 'c', sourceManifestId: 'src', qiraah: 'quran', rawi: 'hafs',
    expected: { surah: 2, ayah: 58 }, possible: { surah: 7, ayah: 161 },
    similarityEvidence: { kind: 'TEXTUAL', score: 0.9 }, status: 'APPROVED',
    createdAt: new Date().toISOString(), ...over,
  };
}

test('radar surfaces the competing locus for a hesitation, bidirectionally', () => {
  const map = [trap({})];
  const fwd = buildMutashabihatRadar({ surah: 2, ayah: 58 }, map);
  assert.equal(fwd.version, MUTASHABIHAT_RADAR_VERSION);
  assert.equal(fwd.competitorCount, 1);
  assert.deepEqual(fwd.strongest!.locus, { surah: 7, ayah: 161 });
  const rev = buildMutashabihatRadar({ surah: 7, ayah: 161 }, map);
  assert.deepEqual(rev.strongest!.locus, { surah: 2, ayah: 58 });
});

test('competitors are ranked by similarity score', () => {
  const map = [
    trap({ id: 'a', expected: { surah: 2, ayah: 58 }, possible: { surah: 7, ayah: 161 }, similarityEvidence: { kind: 'TEXTUAL', score: 0.6 } }),
    trap({ id: 'b', expected: { surah: 2, ayah: 58 }, possible: { surah: 20, ayah: 80 }, similarityEvidence: { kind: 'VARIANT_LOCUS', score: 0.95 } }),
  ];
  const r = buildMutashabihatRadar({ surah: 2, ayah: 58 }, map);
  assert.equal(r.competitorCount, 2);
  assert.deepEqual(r.competitors.map(c => c.locus.surah), [20, 7]);
});

test('unreviewed (REVIEW_MAP) entries are never surfaced to a judge', () => {
  const map = [trap({ status: 'REVIEW_MAP' })];
  assert.equal(buildMutashabihatRadar({ surah: 2, ayah: 58 }, map).competitorCount, 0);
});

test('a locus with no twins returns an empty radar', () => {
  assert.equal(buildMutashabihatRadar({ surah: 112, ayah: 1 }, [trap({})]).competitorCount, 0);
});
