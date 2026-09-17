import assert from 'node:assert/strict';
import test from 'node:test';
import { TEN_QIRAAT_GRAPH } from '../src/lib/scientific-core';
import {
  REFERENCE_AUDIO_BUTTON_AR,
  REFERENCE_AUDIO_ID,
  referenceAudioPolicy,
} from '../src/lib/reference-audio-policy';

test('all twenty rawis use the same Hafs reference audio identity', () => {
  assert.equal(TEN_QIRAAT_GRAPH.length, 20);
  for (const reading of TEN_QIRAAT_GRAPH) {
    const policy = referenceAudioPolicy(reading.rawiId);
    assert.equal(policy.audioId, REFERENCE_AUDIO_ID);
    assert.equal(policy.audioId, 'hafs-muaiqly');
    assert.equal(policy.evidenceForDisplayedReading, false);
    assert.equal(policy.canAffectScore, false);
  }
});

test('Hafs word timing is never projected onto non-Hafs text', () => {
  for (const reading of TEN_QIRAAT_GRAPH) {
    assert.equal(referenceAudioPolicy(reading.rawiId).mayProjectWordTiming, reading.rawiId === 'hafs');
  }
});

test('Arabic listen button label is exact', () => {
  assert.equal(REFERENCE_AUDIO_BUTTON_AR, 'استمع إلى الآية');
});
