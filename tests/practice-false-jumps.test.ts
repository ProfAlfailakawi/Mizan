/*
 * قفزاتٌ كاذبة قِيست في متصفّحٍ حقيقيّ (العفاسي، الرحمن 1–30، الوجه 532):
 *
 * ـ كلمةٌ واحدةٌ طابقت («لا» من «ألا تطغوا»، الآية 8) قفزت بالجبهة إلى 20:3، فصار ما قبلها أحمر.
 * ـ لازمةُ الآية 13 («فبأيّ آلاء ربّكما تكذّبان») قفزت بالجبهة إلى لازمة 21 على الوجه.
 * ـ `LOCKED` على 33:15 والصوتُ في الآية 7 علّم ثمانين كلمةً «مقروءة» دفعةً واحدة.
 * ـ وفي «اختبر حفظك» انكشف الوجهُ كلُّه ما دام إذنُ الميكروفون يُسأل.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FAR_JUMP_RUN_WORDS, credibleFrontier, followFrontier, liveJudgment } from '../src/lib/live-judging';
import { OPEN_ROUGH_GATE, ROUGH_CONFIRM_MS, ROUGH_JUMP_WORDS, admitRough } from '../src/lib/rough-position';
import type { ExpectedWord, HeardWord, Mistake } from '../src/lib/recitation-diff';

const OPEN = { word: 'OPEN', tashkeel: 'CLOSED' } as const;
const heardOf = (words: string[]): HeardWord[] => words.map(text => ({ text, confidence: 0.95 }));

/* بدايةُ الوجه 532 كما هي — المرجُ والبرزخُ ثمّ اللازمة. */
const FACE = ['مرج', 'البحرين', 'يلتقيان', 'بينهما', 'برزخ', 'لا', 'يبغيان',
  'فبأي', 'ءالاء', 'ربكما', 'تكذبان', 'يخرج', 'منهما', 'اللؤلؤ', 'والمرجان',
  'فبأي', 'ءالاء', 'ربكما', 'تكذبان', 'وله', 'الجوار', 'المنشات', 'في', 'البحر', 'كالاعلام'];
const expected: ExpectedWord[] = FACE.map((text, index) => ({ index, text }));

const miss = (...indices: number[]): Mistake[] => indices.map(wordIndex => ({ kind: 'substituted', wordIndex, expected: '', heard: '', confidence: 0.9 }) as Mistake);

test('one isolated matching word does not move the frontier', () => {
  /* 0–4 سُمع غيرُها، و5 («لا») طابقت وحدها، فالجبهةُ لا تُقبل هناك. */
  assert.equal(credibleFrontier(miss(0, 1, 2, 3, 4), 5, -1), -1);
});

test('a run of two matching words moves the frontier, one step at a time from the start', () => {
  assert.equal(credibleFrontier([], 1, -1), 1);
  assert.equal(credibleFrontier([], 0, -1), 0, 'the first word of the face is its own run');
});

test('a far jump needs a run longer than the refrain', () => {
  /* الجبهةُ عند 6، والجوابُ يقول 18 (لازمةٌ من أربع كلمات بعد ما لم يُسمع). */
  assert.equal(credibleFrontier(miss(7, 8, 9, 10, 11, 12, 13, 14), 18, 6), 6);
  /* ولو اتّصلت السلسلةُ ستَّ كلماتٍ فأكثر قُبلت. */
  assert.equal(credibleFrontier([], 18, 6), 18);
  assert.ok(FAR_JUMP_RUN_WORDS > 4, 'the refrain alone must never be enough');
});

test('going back to repeat an ayah is never blocked', () => {
  assert.equal(credibleFrontier([], 3, 10), 3);
});

test('reading the face in order still follows word by word', () => {
  let trusted = -1;
  for (let n = 1; n <= FACE.length; n += 1) {
    const f = followFrontier(expected, heardOf(FACE.slice(0, n)), trusted);
    assert.equal(f, n - 1, `after ${n} words`);
    trusted = Math.max(trusted, f);
  }
});

test('an off-page ayah that shares one word turns nothing red', () => {
  /* «ألا تطغوا في الميزان» — «لا» و«في» على الوجه، والباقي لا. */
  const live = liveJudgment(expected, heardOf(['الا', 'تطغوا', 'في', 'الميزان']), OPEN, undefined, -1);
  assert.deepEqual(live.settled, [], 'no word may be marked before the reader reaches it');
  assert.ok(live.frontier < 5, `frontier jumped to ${live.frontier}`);
});

test('a far LOCKED waits for a second answer before it moves the pen', () => {
  const first = admitRough(79, 5, OPEN_ROUGH_GATE, 1000);
  assert.equal(first.accept, false, '80 words ahead on a single answer');
  const confirmed = admitRough(81, 5, first.gate, 1000 + ROUGH_CONFIRM_MS - 1);
  assert.equal(confirmed.accept, true, 'a close second answer confirms it');
  const stale = admitRough(81, 5, first.gate, 1000 + ROUGH_CONFIRM_MS + 1);
  assert.equal(stale.accept, false, 'a late second answer does not');
  const elsewhere = admitRough(40, 5, first.gate, 2000);
  assert.equal(elsewhere.accept, false, 'nor does one pointing elsewhere');
});

test('a near LOCKED, or a step back, is accepted at once', () => {
  assert.equal(admitRough(5 + ROUGH_JUMP_WORDS, 5, OPEN_ROUGH_GATE, 0).accept, true);
  assert.equal(admitRough(2, 20, OPEN_ROUGH_GATE, 0).accept, true);
});

test('a far LOCKED that is not accepted never becomes the anchor', () => {
  const source = readFileSync(new URL('../src/components/participant/MushafListens.tsx', import.meta.url), 'utf8');
  assert.match(source, /admitted\?\.accept && out\.alignmentState === 'LOCKED'[^\n]*lastGlobal\.current = /);
  assert.doesNotMatch(source, /\n\s*if \(out\.alignmentState === 'LOCKED' && Number\.isInteger\(out\.globalIndex\)\) lastGlobal\.current/);
});

test('the veil stays on while the microphone permission is asked', () => {
  const source = readFileSync(new URL('../src/components/participant/MushafListens.tsx', import.meta.url), 'utf8');
  assert.match(source, /\(stage === 'ready' \|\| stage === 'asking'\) && veiled/);
});
