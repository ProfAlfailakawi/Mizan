import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalPassage } from '../server/alignment/canonical';
import { MutashabihatMap, liveNearTie } from '../server/alignment/mutashabihat';
import { AlignmentEngine } from '../server/alignment/engine';
import { DEFAULT_CONFIG } from '../server/alignment/types';
import { ReferenceTemplateBackend } from '../server/alignment/acoustic/reference-template';
import { synthReference, synthContestant } from '../server/alignment/benchmark/synth';
import { frameParams, feedPcm } from './_alignment-harness';

// Mutashābihāt early-warning (§29). A passage with a repeated phrase is genuinely confusable: the
// repeated words share signatures ⇒ identical synthetic acoustics ⇒ the REAL decoder produces a
// real near-tie, and the engine surfaces MUTASHABIH_RISK pointing at the other occurrence.

// A development, NON-OFFICIAL passage crafted to contain an obvious internal repeat.
function repeatedPassage() {
  return buildCanonicalPassage('hafs', [
    { surah: 2, ayah: 1, text: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَقِنَا عَذَابَ النَّارِ ثُمَّ رَبَّنَا آتِنَا فِي الدُّنْيَا نَصِيبًا' },
  ]);
}

test('static map: an internal repeated n-gram raises risk and pairs the occurrences', () => {
  const passage = repeatedPassage();
  const map = MutashabihatMap.build(passage, { minGram: 3, maxGram: 5 });
  // "رَبَّنَا آتِنَا فِي الدُّنْيَا" occurs twice → those words must carry risk and reference each other.
  const risky = map.perWord.filter(w => w.risk > 0);
  assert.ok(risky.length >= 6, `expected repeated words to be flagged, got ${risky.length}`);
  assert.ok(map.windows.length >= 1, 'at least one risk window');
  const anyPaired = map.perWord.some(w => w.confusableWith.some(r => r.kind === 'internal-repeat' && r.globalWordIndex !== undefined));
  assert.ok(anyPaired, 'a flagged word should reference its look-alike occurrence');
});

test('curated cross-loci are honoured', () => {
  const passage = repeatedPassage();
  const map = MutashabihatMap.build(passage, {
    curated: [{ fromGlobalWordIndex: 0, toGlobalWordIndex: 1, similarSurah: 3, similarAyah: 26, label: 'يشبه آل عمران ٢٦' }],
  });
  const ref = map.perWord[0].confusableWith.find(r => r.kind === 'curated');
  assert.ok(ref && ref.surah === 3 && ref.ayah === 26 && ref.label);
});

test('liveNearTie fires only for a close, distant competitor', () => {
  assert.ok(liveNearTie({ bestWord: 10, competingWord: 40, competingGap: 0.05, gapThreshold: 0.12, minDistanceWords: 3 }));
  assert.equal(liveNearTie({ bestWord: 10, competingWord: 11, competingGap: 0.05, gapThreshold: 0.12, minDistanceWords: 3 }), null); // too near
  assert.equal(liveNearTie({ bestWord: 10, competingWord: 40, competingGap: 0.6, gapThreshold: 0.12, minDistanceWords: 3 }), null); // gap too wide
  assert.equal(liveNearTie({ bestWord: 10, competingWord: null, competingGap: 0.0, gapThreshold: 0.12, minDistanceWords: 3 }), null);
});

test('engine emits MUTASHABIH_RISK end-to-end on a real repeated-phrase recitation', () => {
  const passage = repeatedPassage();
  const ref = synthReference(passage, 280, 0.01);
  const backend = ReferenceTemplateBackend.build({ reading: 'hafs', pcm: ref.pcm, sampleRate: ref.sampleRate, wordBoundariesMs: ref.wordBoundariesMs, ...frameParams() });
  const engine = new AlignmentEngine(
    { sessionId: 'm', readingId: 'hafs', surah: 2, startAyah: 1, endAyah: 1, expectedStartWordIndex: 0, canonicalTextHash: passage.canonicalTextHash, canonicalPackageVersion: 'dev' },
    passage, backend, DEFAULT_CONFIG,
  );
  const script = passage.words.map(w => ({ kind: 'read' as const, globalWordIndex: w.globalWordIndex, durationMs: 280 }));
  const contestant = synthContestant(passage, script, { pitchScale: 1.03, noise: 0.03 });
  const events = feedPcm(engine, contestant.pcm, contestant.sampleRate);

  const risks = events.filter(e => e.eventType === 'MUTASHABIH_RISK');
  assert.ok(risks.length >= 1, 'a repeated-phrase recitation must raise at least one MUTASHABIH_RISK');
  for (const r of risks) {
    assert.equal(r.scoreDelta, 0);                 // evidence only
    assert.equal(r.authority, 'HUMAN_ONLY');
    assert.ok(Array.isArray(r.confusable) && r.confusable.length >= 1, 'must carry the confusable loci');
    assert.ok(r.confusable!.every(c => ['internal-repeat', 'curated', 'live-near-tie'].includes(c.kind)));
  }
});
