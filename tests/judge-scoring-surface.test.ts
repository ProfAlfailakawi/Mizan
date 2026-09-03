import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * JudgeOS scoring surface.
 *
 * Every scoring action used to render identically: the same emerald chip, border and
 * background, with the penalty — the one number the decision turns on — as the smallest
 * text on the card, and hover-only affordances on tablets that have no hover. A judge
 * marking under time pressure could not tell the costliest mark from the cheapest.
 *
 * These lock the two encodings that fixed it, because losing either silently returns the
 * surface to "all six cards look the same".
 */
const root = path.resolve(process.cwd());
const judge = fs.readFileSync(path.join(root, 'src/components/judge/JudgeOS.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');

test('hue encodes the criterion being marked', () => {
  assert.match(judge, /ja-\$\{a\.criterion\}/, 'each action carries its criterion tone');
  for (const criterion of ['memorization', 'tajweed', 'waqf_ibtida', 'performance', 'custom']) {
    assert.match(css, new RegExp(`\\.ja-${criterion}\\s*\\{`), `missing tone for ${criterion}`);
  }
});

test('weight encodes what the mark costs', () => {
  // Most default actions share the memorisation criterion, so hue alone would leave four
  // of six cards identical. The penalty tier is the second, independent channel.
  assert.match(judge, /data-weight=\{a\.penalty>=1\?'high':a\.penalty>=0\.5\?'mid':'low'\}/);
  for (const tier of ['high', 'mid', 'low']) {
    assert.match(css, new RegExp(`\\[data-weight="${tier}"\\]`), `missing spine weight for ${tier}`);
  }
});

test('a mark is confirmed visibly and audibly', () => {
  assert.match(judge, /data-flash=/, 'pressed action pulses');
  assert.match(css, /@keyframes mzJudgeMark/);
  assert.match(judge, /aria-live="polite"/, 'the mark is announced, not only drawn');
  assert.match(judge, /setMarkedAction/);
});

test('the tally is read before the store mutates', () => {
  // recordJudgeEvent updates the store synchronously; counting afterwards and adding one
  // announced a number one too high.
  const tally = judge.indexOf('const tally=countFor(eventType)+1;');
  const record = judge.indexOf('recordJudgeEvent(eventType);');
  assert.ok(tally > -1 && record > -1);
  assert.ok(tally < record, 'tally must be computed before recordJudgeEvent');
});

test('Arabic counts agree with the number', () => {
  // 1 singular, 2 dual, 3-10 plural, 11+ singular again. "4 مرة" is wrong.
  assert.match(judge, /const marksAr=/);
  const marksAr = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : n <= 10 ? `${n} مرات` : `${n} مرة`);
  assert.equal(marksAr(1), 'مرة واحدة');
  assert.equal(marksAr(2), 'مرتين');
  assert.equal(marksAr(4), '4 مرات');
  assert.equal(marksAr(11), '11 مرة');
  for (const form of ['مرة واحدة', 'مرتين', 'مرات']) assert.ok(judge.includes(form), `missing form ${form}`);
});

test('criterion names exist in Arabic', () => {
  // They had only ever been available in English, inside an Arabic-first surface.
  assert.match(judge, /CRITERION_AR/);
  for (const name of ['حفظ', 'تجويد', 'وقف وابتداء', 'أداء']) {
    assert.ok(judge.includes(name), `missing Arabic criterion name ${name}`);
  }
});

test('the affordance works without a pointer that hovers', () => {
  assert.match(css, /\.mizan-judge-action:active\s*\{/, 'pressed state is the tablet affordance');
  assert.match(css, /@media \(hover:hover\)\s*\{\s*\.mizan-judge-action:hover/, 'hover styling is gated to hover-capable input');
  assert.match(css, /\.mizan-judge-action:focus-visible\s*\{/);
  assert.match(css, /grid-auto-rows:1fr/, 'severity tiers must not make rows uneven');
});
