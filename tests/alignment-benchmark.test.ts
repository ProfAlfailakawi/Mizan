import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine } from './_alignment-harness';
import { devHafsPassage, positionForGlobalIndex } from '../server/alignment/canonical';
import { synthContestant, scriptNormal, scriptSlow, scriptFast, scriptFromMiddle } from '../server/alignment/benchmark/synth';
import { makeGoldenFromSynthTruth, GoldenSession } from '../server/alignment/benchmark/golden';
import { runGolden, evaluateGates } from '../server/alignment/benchmark/runner';

// The benchmark harness IS part of the deliverable (§38). It runs the REAL engine over golden
// synthetic sessions and reports measured metrics + a production-gate decision. Because the audio is
// synthetic, the gate recommendation is capped at SHADOW_ONLY (§49) — human accuracy is unmeasured.

function goldenFor(passage: ReturnType<typeof devHafsPassage>, scenario: string, script: ReturnType<typeof scriptNormal>): { golden: GoldenSession; pcm: Uint8Array } {
  const contestant = synthContestant(passage, script, { pitchScale: 1.03, noise: 0.03 });
  const golden = makeGoldenFromSynthTruth(
    { id: `g-${scenario}`, reading: 'hafs', surah: 2, startAyah: passage.startAyah, endAyah: passage.endAyah, scenario, source: 'synthetic', sampleRate: contestant.sampleRate },
    contestant.truth,
    (g) => { const p = positionForGlobalIndex(passage, g)!; return { surah: p.surah, ayah: p.ayah, wordIndex: p.wordIndex }; },
  );
  return { golden, pcm: contestant.pcm };
}

test('benchmark: multiple scenarios score and produce a gate report', () => {
  const passage = devHafsPassage(256, 256);
  const scenarios: [string, ReturnType<typeof scriptNormal>][] = [
    ['normal', scriptNormal(passage, 280)],
    ['slow', scriptSlow(passage)],
    ['fast', scriptFast(passage)],
    ['from-middle', scriptFromMiddle(passage, Math.floor(passage.words.length / 2), 280)],
  ];
  const results = scenarios.map(([name, script]) => {
    const { engine } = buildEngine({ startAyah: 256, endAyah: 256, wordMs: 280 });
    const { golden, pcm } = goldenFor(passage, name, script);
    const { result } = runGolden(engine, golden, pcm, 100);
    return result;
  });

  for (const r of results) {
    // Sanity: the runner actually scored samples and produced finite metrics.
    assert.ok(r.samples > 0, `${r.scenario}: scored samples`);
    assert.ok(r.ayahAccuracy >= 0 && r.ayahAccuracy <= 1);
    assert.ok(Number.isFinite(r.meanPositionErrorWords));
    // On this synthetic set the tracker should keep most positions within ±1 word.
    assert.ok(r.wordAccuracyTol1 >= 0.6, `${r.scenario}: ±1-word accuracy ${r.wordAccuracyTol1.toFixed(2)} should be ≥0.6`);
  }

  const gate = evaluateGates(results, undefined, { syntheticOnly: true });
  assert.equal(gate.recommendation, 'SHADOW_ONLY', 'synthetic benchmark must never recommend LIVE_ASSIST');
  assert.ok(gate.aggregate.ayahAccuracy >= 0.8, `aggregate ayah accuracy ${gate.aggregate.ayahAccuracy.toFixed(2)}`);
});

test('benchmark: confidence is higher when correct than when wrong (calibration signal)', () => {
  const passage = devHafsPassage(256, 256);
  const { engine } = buildEngine({ startAyah: 256, endAyah: 256, wordMs: 280 });
  const { golden, pcm } = goldenFor(passage, 'normal', scriptNormal(passage, 280));
  const { result } = runGolden(engine, golden, pcm, 100);
  if (result.confidenceWhenWrong > 0) {
    assert.ok(result.confidenceWhenCorrect >= result.confidenceWhenWrong - 0.05,
      `confidence-correct ${result.confidenceWhenCorrect.toFixed(2)} vs wrong ${result.confidenceWhenWrong.toFixed(2)}`);
  }
});
