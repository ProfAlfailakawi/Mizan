import test from 'node:test';
import assert from 'node:assert/strict';
import { MutashabihatEngine, normalizeQuranWord } from '../server/quran-mutashabihat';
import { DifficultyEngine, balancePacks } from '../server/quran-difficulty';
import { calibrateJudges, normalizedRankScenario } from '../server/judge-calibration';

/**
 * These engines advise humans; they never mark an error or move a score. The tests below pin the
 * properties that keep that promise honest: findings must be real text facts, a thin sample must
 * not brand a judge, and a claimed balance must be measured rather than asserted.
 */

// حزمة مصغّرة على هيئة صفوف المجمع: سورتان تشتركان في مقطع ثم تفترقان.
const ROWS = [
  { sora: 1, sora_name_ar: 'الأولى', aya_no: 1, page: 1, line_start: 1, line_end: 1, jozz: 1, aya_text: 'وما الله بغافل عما تعملون ١' },
  { sora: 1, sora_name_ar: 'الأولى', aya_no: 2, page: 1, line_start: 2, line_end: 2, jozz: 1, aya_text: 'ولكم في القصاص حياة ٢' },
  { sora: 2, sora_name_ar: 'الثانية', aya_no: 1, page: 2, line_start: 1, line_end: 1, jozz: 1, aya_text: 'وما الله بغافل عما يعملون ١' },
  { sora: 2, sora_name_ar: 'الثانية', aya_no: 2, page: 2, line_start: 2, line_end: 2, jozz: 1, aya_text: 'إن الله على كل شيء قدير ٢' },
];

test('normalization strips ayah numbers and unifies hamza forms without touching the displayed text', () => {
  assert.equal(normalizeQuranWord('١'), '');
  assert.equal(normalizeQuranWord('ٱلَّذِينَ'), normalizeQuranWord('الذين'));
  assert.equal(normalizeQuranWord('إن'), normalizeQuranWord('ان'));
});

test('mutashabihat radar reports the real competing position, not a guess', () => {
  const engine = new MutashabihatEngine(ROWS, [3, 4]);
  const matches = engine.similarPhrasesForAyah(1, 1);
  assert.ok(matches.length > 0, 'the shared opening phrase must be found');
  const occ = matches[0].occurrences;
  assert.ok(occ.some((o) => o.surah === 2 && o.ayah === 1), 'the competing position is surah 2');
  // لا يُبلَّغ عن الموضع نفسه كأنه متشابه مع ذاته
  assert.ok(!occ.some((o) => o.surah === 1 && o.ayah === 1));
});

test('a phrase unique in the corpus produces no match', () => {
  const engine = new MutashabihatEngine(ROWS, [3, 4]);
  assert.equal(engine.similarPhrasesForAyah(2, 2).length, 0);
});

test('divergence points expose the fork and both competing next words', () => {
  const engine = new MutashabihatEngine(ROWS, [3, 4]);
  const points = engine.divergencePoints(1, 1, 1, { phraseSize: 4, nameOf: (s) => (s === 2 ? 'الثانية' : 'الأولى') });
  assert.equal(points.length, 1);
  const p = points[0];
  assert.equal(normalizeQuranWord(p.expectedWord), normalizeQuranWord('تعملون'));
  assert.equal(p.branches.length, 1);
  assert.equal(normalizeQuranWord(p.branches[0].nextWord), normalizeQuranWord('يعملون'));
  assert.equal(p.branches[0].surahNameArabic, 'الثانية');
});

test('divergence never reports a branch whose next word is identical', () => {
  const identical = [
    { sora: 1, aya_no: 1, page: 1, jozz: 1, aya_text: 'الحمد لله رب العالمين ١' },
    { sora: 2, aya_no: 1, page: 2, jozz: 1, aya_text: 'الحمد لله رب العالمين ١' },
  ];
  const engine = new MutashabihatEngine(identical, [4]);
  assert.equal(engine.divergencePoints(1, 1, 1, { phraseSize: 4 }).length, 0);
});

test('difficulty vector is bounded and reflects measured mutashabihat density', () => {
  const m = new MutashabihatEngine(ROWS, [3, 4]);
  const d = new DifficultyEngine(ROWS, m);
  const shared = d.vector(1, 1, 1);   // آية داخل مقطع متكرر
  const unique = d.vector(2, 2, 2);   // آية فريدة
  for (const v of [shared, unique]) {
    for (const k of ['mutashabihat', 'rareWords', 'endingSimilarity', 'waqfSensitivity', 'score'] as const) {
      assert.ok(v[k] >= 0 && v[k] <= 1, `${k} must stay within 0..1`);
    }
  }
  assert.ok(shared.mutashabihat > unique.mutashabihat, 'the repeated passage must score higher on mutashabihat');
});

test('pack balancing reports the achieved spread instead of claiming equality', () => {
  const packs = [1.0, 1.001, 1.002, 2.0].map((totalDifficulty) => ({ items: [totalDifficulty], totalDifficulty }));
  const tight = balancePacks(packs, 3, { toleranceRatio: 0.005 });
  assert.equal(tight.achieved, true);
  assert.ok(tight.spreadRatio <= 0.005);

  const impossible = balancePacks([{ items: [1], totalDifficulty: 1 }, { items: [5], totalDifficulty: 5 }], 2, { toleranceRatio: 0.005 });
  assert.equal(impossible.achieved, false, 'an unreachable target must be reported, not faked');
});

test('judge calibration separates a hawk from a dove using peer comparison', () => {
  const observations = [] as any[];
  for (let p = 1; p <= 10; p++) {
    observations.push({ judgeId: 'hawk', sessionId: 's', participantId: `p${p}`, score: 90 });
    observations.push({ judgeId: 'dove', sessionId: 's', participantId: `p${p}`, score: 98 });
    observations.push({ judgeId: 'mid', sessionId: 's', participantId: `p${p}`, score: 94 });
  }
  const report = calibrateJudges(observations);
  const by = Object.fromEntries(report.judges.map((j) => [j.judgeId, j]));
  assert.equal(by.hawk.tendency, 'HAWK');
  assert.equal(by.dove.tendency, 'DOVE');
  assert.equal(by.mid.tendency, 'BALANCED');
  assert.equal(report.advisoryOnly, true);
});

test('a judge with a thin record is never branded — shrinkage holds them near balanced', () => {
  const observations = [
    { judgeId: 'new', sessionId: 's', participantId: 'p1', score: 80 },
    { judgeId: 'peer', sessionId: 's', participantId: 'p1', score: 95 },
    { judgeId: 'peer2', sessionId: 's', participantId: 'p1', score: 95 },
  ];
  const report = calibrateJudges(observations);
  const newJudge = report.judges.find((j) => j.judgeId === 'new')!;
  assert.equal(newJudge.tendency, 'INSUFFICIENT_DATA');
  assert.ok(Math.abs(newJudge.shrunkBias) < Math.abs(newJudge.rawBias), 'shrinkage must pull a thin sample toward balanced');
  assert.ok(newJudge.confidence < 0.2);
});

test('rank scenario is a comparison only: it keeps the actual ranking alongside the normalized one', () => {
  const observations = [
    { judgeId: 'hawk', sessionId: 's', participantId: 'a', score: 90 },
    { judgeId: 'dove', sessionId: 's', participantId: 'a', score: 92 },
    { judgeId: 'hawk', sessionId: 's', participantId: 'b', score: 91 },
    { judgeId: 'dove', sessionId: 's', participantId: 'b', score: 91 },
  ];
  const rows = normalizedRankScenario(observations, calibrateJudges(observations));
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.actualScore) && Number.isFinite(r.normalizedScore));
    assert.ok(r.actualRank >= 1 && r.normalizedRank >= 1);
  }
});
