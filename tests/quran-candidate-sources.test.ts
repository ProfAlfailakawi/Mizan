import assert from 'node:assert/strict';
import test from 'node:test';
import { DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { TEN_QIRAAT_GRAPH } from '../src/lib/scientific-core';
import {
  AL_ISLAM_IOS_QIRAAT_COMMIT,
  QURAN_FULL_TEXT_CANDIDATES,
} from '../src/lib/quran-candidate-sources';

test('the candidate source register is exactly the twelve undelivered canonical rawis', () => {
  const delivered = new Set(DELIVERED_RAWI_IDS);
  const missing = TEN_QIRAAT_GRAPH.map(x => x.rawiId).filter(id => !delivered.has(id)).sort();
  const candidates = QURAN_FULL_TEXT_CANDIDATES.map(x => x.rawiId).sort();

  assert.equal(TEN_QIRAAT_GRAPH.length, 20);
  assert.equal(DELIVERED_RAWI_IDS.length, 8);
  assert.equal(QURAN_FULL_TEXT_CANDIDATES.length, 12);
  assert.deepEqual(candidates, missing);
  assert.equal(new Set(candidates).size, 12);
});

test('candidate Quran bytes are pinned and cannot masquerade as delivered or approved', () => {
  assert.match(AL_ISLAM_IOS_QIRAAT_COMMIT, /^[0-9a-f]{40}$/);
  for (const source of QURAN_FULL_TEXT_CANDIDATES) {
    assert.equal(source.upstreamCommit, AL_ISLAM_IOS_QIRAAT_COMMIT);
    assert.equal(source.authority, 'ISLAMWEB_DERIVED');
    assert.equal(source.role, 'FULL_TEXT_CANDIDATE');
    assert.equal(source.reviewState, 'PENDING_SCHOLAR_REVIEW');
    assert.equal(source.permissionState, 'OWNER_REPORTED_PERMISSION');
    assert.match(source.upstreamPath, /^Resources\/Data\/Quran\/Qiraah.+\.json\.deflate$/);
    assert.ok(!DELIVERED_RAWI_IDS.includes(source.rawiId));
  }
});

test('Ishaq and Idris carry the upstream-identical-body review caveat explicitly', () => {
  for (const rawiId of ['ishaq', 'idris']) {
    const source = QURAN_FULL_TEXT_CANDIDATES.find(x => x.rawiId === rawiId);
    assert.ok(source?.caveat);
    assert.match(source.caveat, /إسحاق|إدريس/);
  }
});
