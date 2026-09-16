import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LISTEN_BUTTON_LABEL_AR,
  globalHafsAudioProfile,
  audioProfileForReading,
  requiresAyahLevelSyncOnly,
  DEFAULT_GLOBAL_HAFS_RECITER,
} from '../src/lib/global-hafs-audio';
import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';

test('the listen button label is literally "استمع إلى الآية" — no "بحفص", no warning', () => {
  assert.equal(LISTEN_BUTTON_LABEL_AR, 'استمع إلى الآية');
});

test('every one of the twenty readings gets the same global-Hafs audio profile', () => {
  assert.equal(CANONICAL_RAWI_IDS.length, 20);
  for (const rawiId of CANONICAL_RAWI_IDS) {
    const profile = audioProfileForReading(rawiId);
    assert.ok(profile, `audio profile for ${rawiId}`);
    assert.equal(profile!.id, 'global-hafs');
    assert.equal(profile!.reading, 'hafs', `audio identity is Hafs for text ${rawiId}`);
  }
});

test('audio identity is independent of text identity — Hafs audio never implies Hafs text', () => {
  // hisham text still asks for Hafs audio; that does not make the text Hafs.
  const hisham = audioProfileForReading('hisham')!;
  assert.equal(hisham.reading, 'hafs');
  // non-Hafs readings must play at ayah granularity only (no misleading word sync).
  assert.equal(hisham.nonHafsSyncGranularity, 'AYAH');
  assert.ok(requiresAyahLevelSyncOnly('hisham'));
  assert.ok(!requiresAyahLevelSyncOnly('hafs'));
});

test('the reciter is configurable but defaults to a confirmed Hafs reciter', () => {
  assert.equal(globalHafsAudioProfile().reciterId, DEFAULT_GLOBAL_HAFS_RECITER.id);
  const custom = globalHafsAudioProfile({ MIZAN_GLOBAL_HAFS_RECITER_ID: 'hafs-hudhaifi' });
  assert.equal(custom.reciterId, 'hafs-hudhaifi');
  assert.equal(custom.reading, 'hafs');
});

test('an unknown rawi yields no audio profile — fail closed', () => {
  assert.equal(audioProfileForReading('not-a-rawi'), undefined);
});
