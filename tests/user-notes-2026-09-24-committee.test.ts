import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { contestantCueSequence, passageTransitionPlan, TRANSITION_PHRASES_AR } from '../src/lib/judging-integrity';

/*
 * ملاحظاتُ اللجنة (٢٤ سبتمبر ٢٠٢٦):
 *   ـ عباراتُ الإنهاء إذا اختيرت كلُّها: تتنوّع للمتسابق الواحد بلا تكرار، ولا تُسمع السلسلةُ
 *     نفسها من كلّ متسابق.
 */

const ALL = TRANSITION_PHRASES_AR.map((_, i) => i);

test('all phrases selected: one contestant never hears the same phrase twice before the set is exhausted', () => {
  for (let c = 0; c < 300; c += 1) {
    const seq = contestantCueSequence(ALL, `participant-${c}`, ALL.length);
    assert.equal(new Set(seq).size, ALL.length, `participant-${c}: ${seq}`);
  }
});

test('contestants do not all hear the same order', () => {
  const firsts = new Set(Array.from({ length: 40 }, (_, c) => contestantCueSequence(ALL, `p-${c}`, 1)[0]));
  assert.ok(firsts.size >= 5, `only ${firsts.size} distinct opening phrases across 40 contestants`);
  const orders = new Set(Array.from({ length: 40 }, (_, c) => contestantCueSequence(ALL, `p-${c}`, 3).join(',')));
  assert.ok(orders.size >= 35);
});

test('never the same phrase twice in a row — within a contestant, across cycles, or across contestants', () => {
  for (const selected of [[2, 5], [0, 3, 6], ALL]) {
    let last: number | undefined;
    for (let c = 0; c < 100; c += 1) {
      const seq = contestantCueSequence(selected, `k-${c}`, 7, last);
      assert.notEqual(seq[0], last, `contestant k-${c} opened with the phrase that closed the previous one`);
      for (let i = 1; i < seq.length; i += 1) assert.notEqual(seq[i], seq[i - 1], `${selected}: ${seq}`);
      for (let i = 0; i + selected.length <= seq.length; i += selected.length) {
        assert.equal(new Set(seq.slice(i, i + selected.length)).size, selected.length, 'each cycle uses every selected phrase once');
      }
      last = seq[seq.length - 1];
    }
  }
});

test('the order is deterministic: a reload mid-contestant replays the same plan', () => {
  const cue = { enabled: true, selectedPhraseIndexes: ALL };
  const run = () => [0, 1, 2, 3].map(q => passageTransitionPlan({ isLastQuestion: q === 3, ar: true, cue, variantSeed: q, contestantKey: 'participant-42', previousIndex: 4 }).variantIndex);
  assert.deepEqual(run(), run());
  assert.equal(new Set(run()).size, 4);
  assert.notEqual(run()[0], 4);
});

test('a single selected phrase is simply that phrase; no key keeps the legacy rotation', () => {
  const one = passageTransitionPlan({ isLastQuestion: false, ar: true, cue: { selectedPhraseIndexes: [3] }, variantSeed: 2, contestantKey: 'x', previousIndex: 3 });
  assert.equal(one.phrase, TRANSITION_PHRASES_AR[3]);
  const legacy = passageTransitionPlan({ isLastQuestion: false, ar: true, cue: { selectedPhraseIndexes: [2, 5] }, variantSeed: 1 });
  assert.equal(legacy.variantIndex, 5);
});

test('the judge screen passes the contestant and remembers the last phrase across contestants', () => {
  const src = fs.readFileSync('src/components/judge/JudgeOS.tsx', 'utf8');
  assert.match(src, /contestantKey:participant\?\.id\|\|activeSession\.sessionId/);
  assert.match(src, /previousIndex:cueMemory\.before/);
  assert.match(src, /sessionStorage\.setItem\('mizan:cue-memory'/);
  /* ولكلّ عبارةٍ مقطعُها المسجَّل بترتيبها — فيطابق الصوتُ النصَّ المختار. */
  for (const i of ALL) assert.ok(fs.existsSync(`public/audio/cues/cue-${i}.wav`), `cue-${i}.wav`);
});

/*
 *   ـ «أوّلُ آية» سطرٌ واحد على الأكثر: من الآيات ما يطول جدًّا.
 */
import { AVERAGE_LINE_WORDS, cutTimeMs, energyFrames, OPENING_FADE_MS, openingRecordingFor, OPENING_RECORDING_BY_READING, planOpeningCut, snapToQuiet } from '../src/lib/opening-cue';
import { kfgqpcAudioKeys } from '../server/kfgqpc-delivery';
import { splitAyahWords } from '../src/lib/word-timing';

const W = (n: number) => Array.from({ length: n }, (_, i) => `كلمة${i}`);

test('an ayah that ends on its own line is heard whole', () => {
  const cut = planOpeningCut({ words: W(6), lines: [3, 3, 3, 3, 3, 3], lineWords: 10 });
  assert.deepEqual(cut, { lastWord: 5, whole: true, reason: 'FITS_ONE_LINE' });
});

test('a long ayah stops at the last word of its first printed line', () => {
  const lines = [...Array(7).fill(4), ...Array(10).fill(5), ...Array(10).fill(6), ...Array(3).fill(7)];
  const cut = planOpeningCut({ words: W(30), lines, lineWords: 10 });
  assert.deepEqual(cut, { lastWord: 6, whole: false, reason: 'LINE_END' });
});

test('an ayah that starts at the end of a line gets one line’s worth — never more', () => {
  const lines = [4, 4, ...Array(10).fill(5), ...Array(10).fill(6)];
  const cut = planOpeningCut({ words: W(22), lines, lineWords: 10 });
  assert.equal(cut.reason, 'LINE_LENGTH');
  assert.equal(cut.lastWord + 1, 10, 'ten words: a single line’s length');
});

test('a waqf sign after mid-line is where the reciter pauses, so the cut lands there', () => {
  /* آيةُ الدَّين: «… إِلَىٰٓ أَجَلٖ مُّسَمّٗى فَٱكۡتُبُوهُۚ وَلۡيَكۡتُب …» */
  const text = 'يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوٓاْ إِذَا تَدَايَنتُم بِدَيۡنٍ إِلَىٰٓ أَجَلٖ مُّسَمّٗى فَٱكۡتُبُوهُۚ وَلۡيَكۡتُب بَّيۡنَكُمۡ كَاتِبُۢ بِٱلۡعَدۡلِۚ';
  const words = splitAyahWords(text).map(w => w.text);
  const lines = words.map((_, i) => (i < 11 ? 1 : 2));
  const cut = planOpeningCut({ words, lines, lineWords: 11 });
  assert.equal(cut.reason, 'WAQF');
  assert.equal(words[cut.lastWord], 'فَٱكۡتُبُوهُۚ');
});

test('«لا» (ۙ) is not a place to stop', () => {
  const words = W(12); words[8] = 'أُوْلَٰٓئِكَۙ';
  const cut = planOpeningCut({ words, lines: words.map((_, i) => (i < 10 ? 1 : 2)), lineWords: 10 });
  assert.equal(cut.reason, 'LINE_END');
  assert.equal(cut.lastWord, 9);
});

test('without a page layout the line is estimated from the ayah’s span, or the Madinah average', () => {
  assert.equal(planOpeningCut({ words: W(9), lineSpan: 1 }).whole, true);
  const spanned = planOpeningCut({ words: W(128), lineSpan: 13 });
  assert.equal(spanned.reason, 'ESTIMATED_LINE');
  assert.ok(spanned.lastWord + 1 >= 8 && spanned.lastWord + 1 <= 12, `${spanned.lastWord + 1} words`);
  assert.equal(planOpeningCut({ words: W(40) }).lastWord + 1, AVERAGE_LINE_WORDS);
  assert.equal(planOpeningCut({ words: W(5) }).whole, true);
});

test('the stop time is the end of the last word — or mid-segment when the next word shares it', () => {
  const words = [{ startMs: 0, endMs: 400 }, { startMs: 400, endMs: 900 }, { startMs: 900, endMs: 1500 }];
  assert.equal(cutTimeMs(words, { lastWord: 1, whole: false, reason: 'LINE_END' }), 900);
  assert.equal(cutTimeMs(words, { lastWord: 1, whole: true, reason: 'FITS_ONE_LINE' }), undefined);
  const shared = [{ startMs: 0, endMs: 400 }, { startMs: 400, endMs: 1200 }, { startMs: 400, endMs: 1200 }];
  assert.equal(cutTimeMs(shared, { lastWord: 1, whole: false, reason: 'LINE_END' }), 800);
});

test('the cut snaps to the quietest moment near the estimate', () => {
  const energy = new Float32Array(200).fill(0.3);
  energy[60] = 0.01; /* سكتةٌ عند ١٢١٠ مللي ثانية */
  energy[20] = 0.0; /* وسكتةٌ أبعدُ من نافذة البحث — لا تُختار */
  assert.equal(snapToQuiet(energy, 20, 1000), 1210);
  assert.equal(snapToQuiet(new Float32Array(0), 20, 1000), 1000);
  /* سكتةُ وقفٍ من ١٠٠٠ إلى ١٤٠٠ مللي ثانية: يُوقف بعد أوّلها بقدر الخفض، فيقع الخفضُ كلُّه في الصمت. */
  const pause = new Float32Array(200).fill(0.3);
  for (let i = 50; i < 70; i += 1) pause[i] = 0.001;
  const at = snapToQuiet(pause, 20, 1000);
  assert.ok(at - OPENING_FADE_MS >= 1000 && at <= 1400, `stopped at ${at}ms: the fade must lie inside the pause`);
  /* وسكتةٌ أقصرُ من الخفض (٨٠ مللي ثانية): يُوقف في وسطها. */
  const brief = new Float32Array(200).fill(0.3);
  for (let i = 50; i < 54; i += 1) brief[i] = 0.001;
  assert.equal(snapToQuiet(brief, 20, 1000), 1040);
  const frames = energyFrames(new Float32Array([0, 0, 1, 1]), 100, 20);
  assert.equal(frames.length, 2);
  assert.equal(frames[0], 0);
  assert.equal(frames[1], 1);
});

test('the opening cue plays the contestant’s own reading, from a recording the server actually serves', () => {
  for (const [reading, recording] of Object.entries(OPENING_RECORDING_BY_READING)) {
    assert.ok(kfgqpcAudioKeys(recording, 2, 255).length > 0, `${reading} → ${recording} has no delivery path`);
    /* والاسمُ وحده (hafs) ليس مسارًا — وكان هو ما يُرسَل فيعود ٤٠٤ دائمًا. */
    assert.equal(kfgqpcAudioKeys(reading, 2, 255).length, 0);
  }
  assert.equal(openingRecordingFor('khalaf-hamzah'), undefined, 'no cross-riwayah fallback');
  const src = fs.readFileSync('src/components/judge/JudgeOS.tsx', 'utf8');
  assert.match(src, /fetchOfficialAyahAudio\(recording,surah,q\.startAyah\)/);
  assert.doesNotMatch(src, /fetchOfficialAyahAudio\(readingKey/);
  assert.match(src, /watchStop\(player,\(\)=>stopMs,finish\)/);
  assert.match(src, /onClick=\{\(\)=>void playOpeningAudio\(true\)\}/, 'the judge can replay the cue');
  const surface = fs.readFileSync('src/components/judge/OfficialMushafSurface.tsx', 'utf8');
  assert.match(surface, /prepareOpeningCut\(audioId,first\.surah,first\.ayah\)/);
});

test('the quarter-hizb sign «۞» is not a word: highlight, audio and page layout count the same words', () => {
  const text = '۞ إِنَّ ٱللَّهَ لَا يَسۡتَحۡيِۦٓ أَن يَضۡرِبَ مَثَلٗا مَّا';
  const words = splitAyahWords(text);
  assert.equal(words[0].text, 'إِنَّ');
  assert.equal(words.length, 8);
});
