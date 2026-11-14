import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { wordAtOffset } from '../src/lib/word-hit';
import { splitAyahWords } from '../src/lib/word-timing';

const AYAH = 'تَبَٰرَكَ ٱلَّذِى بِيَدِهِ ٱلْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَىْءٍ قَدِيرٌ';

test('an offset inside a word returns that word, numbered from 1 by the shared splitter', () => {
  const words = splitAyahWords(AYAH);
  words.forEach(w => {
    const mid = Math.floor((w.start + w.end) / 2);
    const hit = wordAtOffset(AYAH, mid)!;
    assert.equal(hit.word, w.index + 1);
    assert.equal(hit.text, AYAH.slice(w.start, w.end));
  });
  assert.equal(words.length, 9);
});

test('the first and last character of a word belong to it', () => {
  const w = splitAyahWords(AYAH)[3];
  assert.equal(wordAtOffset(AYAH, w.start)!.word, 4);
  assert.equal(wordAtOffset(AYAH, w.end - 1)!.word, 4);
});

test('a finger on the gap between two words goes to the nearer one, never to a stranger', () => {
  const [a, b] = splitAyahWords(AYAH);
  const gap = a.end; // the space itself
  const hit = wordAtOffset(AYAH, gap)!;
  assert.ok(hit.word === 1 || hit.word === 2);
  assert.ok(b.start - a.end <= 2);
});

test('far outside any word is not a touch on a word: null, no guess', () => {
  assert.equal(wordAtOffset(AYAH, AYAH.length + 5), null);
  assert.equal(wordAtOffset(AYAH, -1), null);
  assert.equal(wordAtOffset(AYAH, NaN), null);
  assert.equal(wordAtOffset('', 0), null);
  assert.equal(wordAtOffset('   ', 1), null);
});

test('the ayah-number glyph is not a word', () => {
  const t = 'ٱلْحَمْدُ لِلَّهِ ۝١';
  assert.equal(splitAyahWords(t).length, 2);
  assert.equal(wordAtOffset(t, t.length + 3), null);
});

/* حراسةُ الربط: فقدان أيٍّ منها يُرجع الضغطة المطوّلة إلى ميزةٍ لا تعمل بصمت. */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
test('wiring: surface → sheet → hook → store → menu', () => {
  const sheet = read('src/components/judge/MushafSheet.tsx');
  assert.match(sheet, /useWordLongPress\(/);
  assert.match(sheet, /data-word-marking/);
  assert.match(sheet, /userSelect: 'none'/, 'text selection is disabled while listening, or the long press selects instead');
  assert.match(sheet, /mizan-mark-major/);
  const surface = read('src/components/judge/OfficialMushafSurface.tsx');
  assert.match(surface, /surah=\{delivery\?\.surah\} onWordLongPress=\{onWordLongPress\} wordMarks=\{wordMarks\}/);
  const judge = read('src/components/judge/JudgeOS.tsx');
  assert.match(judge, /onWordLongPress=\{canMarkWords/);
  assert.match(judge, /recordJudgeEventWithEvidence\(a\.eventType,a,wordTarget\)/);
  assert.match(judge, /direct_score'&&activeSession\.questionPhase==='RECITING'&&!activeSession\.isLocked/, 'marking is gated like the buttons');
  const store = read('src/lib/store.ts');
  assert.match(store, /recordJudgeEvent = \(type: JudgeEventType, locus\?/);
  assert.match(store, /\.\.\.\(validLocus \? \{ locus: validLocus \} : \{\}\)/);
  assert.match(read('src/index.css'), /::highlight\(mizan-mark-major\)/);
});
