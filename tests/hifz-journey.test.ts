import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { attemptBurden, faceWeights, type FaceAttempt } from '../src/lib/face-memory';
import { amendFaceAttempt, loadFaceAttempts, loadJourneyLedger, MAX_REMEMBERED_ATTEMPTS, rememberFaceAttempt } from '../src/lib/face-review';
import { hardWords, journeySummary, JUZ_START_PAGES, neediestPage, pageMemory, streakDays } from '../src/lib/hifz-journey';

/*
 * «رحلةُ حفظك» — ما يتفوّق به ميزان على «ترتيل» في المراجعة:
 * سجلُّ الكلمات المتعثَّر فيها (في الجهاز وحده)، وخريطةُ المصحف، والسلسلة، والكلماتُ الصعبة —
 * وكلُّها تغذّي الوجهَ التالي نفسَه، لا عرضًا منفصلًا عنه.
 */

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-24T12:00:00');
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const word = (i: number, k: 'skipped' | 'substituted' | 'vowel' | 'tajweed' = 'skipped') => ({ i, s: 2, a: 255, t: 'ٱلۡقَيُّومُۚ', k });

function stubStorage() {
  const box = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (box.has(k) ? box.get(k)! : null),
      setItem: (k: string, v: string) => { box.set(k, v); },
      removeItem: (k: string) => { box.delete(k); },
    },
  };
  return box;
}

test('a skipped or replaced word weighs on the next draw — not only the follow-along marks', () => {
  const clean: FaceAttempt = { page: 42, at: at(1), marks: [] };
  const slipped: FaceAttempt = { page: 43, at: at(1), marks: [], words: [word(3), word(9, 'substituted')] };
  assert.equal(attemptBurden(clean), 0);
  assert.equal(attemptBurden(slipped), 2);
  const weight = faceWeights([clean, slipped], NOW);
  assert.ok(weight(43) > weight(42) * 2, 'the page where words fell comes back sooner');
  const storm: FaceAttempt = { page: 44, at: at(1), marks: [], words: Array.from({ length: 30 }, (_, i) => word(i)) };
  assert.equal(attemptBurden(storm), 4, 'one chaotic recitation cannot swallow the draw');
});

test('the map: weak, needs review, solid — from the same decayed weight that picks the next face', () => {
  const attempts: FaceAttempt[] = [
    { page: 1, at: at(1), marks: [] },
    { page: 2, at: at(1), marks: [], words: [word(1), word(2), word(3)] },
    { page: 3, at: at(1), marks: [], words: [word(1)] },
    { page: 4, at: at(30), marks: [] },
    { page: 5, at: at(60), marks: [], words: [word(1), word(2), word(3)] },
  ];
  const m = pageMemory(attempts, NOW);
  assert.equal(m.get(1)?.state, 'strong');
  assert.equal(m.get(2)?.state, 'weak');
  assert.equal(m.get(3)?.state, 'review');
  assert.equal(m.get(4)?.state, 'review', 'three weeks untouched needs review even if it was clean');
  assert.equal(m.get(5)?.state, 'review', 'an old stumble fades — but a page left two months still needs review');
  assert.equal(m.has(6), false);
  assert.equal(pageMemory([{ page: 7, at: at(-2), marks: [] }], NOW).size, 0, 'a future clock is ignored');
});

test('the streak counts consecutive days to today — or to yesterday before today’s recitation', () => {
  const days = (...d: number[]) => d.map(x => ({ page: 1, at: at(x), marks: [] }));
  assert.equal(streakDays(days(0, 1, 2, 4), NOW), 3);
  assert.equal(streakDays(days(1, 2), NOW), 2, 'not broken in the morning before you recite');
  assert.equal(streakDays(days(2, 3), NOW), 0);
  assert.equal(streakDays([], NOW), 0);
  const s = journeySummary([...days(0, 1), { page: 9, at: at(0), marks: [], words: [word(1), word(2), word(3)] }], NOW);
  assert.deepEqual([s.pages, s.weak, s.week, s.streak], [2, 1, 3, 2]);
});

test('hard words need two separate stumbles, and what you mastered drops by itself', () => {
  const attempts: FaceAttempt[] = [
    { page: 42, at: at(1), marks: [], words: [word(7), word(8, 'tajweed')] },
    { page: 42, at: at(3), marks: [], words: [word(7, 'vowel')] },
    { page: 42, at: at(60), marks: [], words: [word(8, 'tajweed')] },
    { page: 50, at: at(80), marks: [], words: [word(1)] },
    { page: 50, at: at(81), marks: [], words: [word(1)] },
  ];
  const hard = hardWords(attempts, NOW);
  assert.deepEqual(hard.map(h => `${h.page}:${h.index}`), ['42:7', '42:8'], '50:1 is nearly three months old');
  assert.equal(hard[0].times, 2);
  assert.deepEqual(hard[0].kinds, ['skipped', 'vowel']);
  assert.equal(hardWords([{ page: 1, at: at(1), marks: [], words: [word(1), word(1)] }], NOW).length, 0, 'twice in one recitation is one stumble');
});

test('the teacher’s notes join their attempt later, and a retake replaces them — nothing else is touched', () => {
  stubStorage();
  const first: FaceAttempt = { page: 42, at: at(0), marks: [], words: [word(3)] };
  rememberFaceAttempt('p', 'hafs', first);
  amendFaceAttempt('p', 'hafs', first.at, 42, [word(5, 'vowel'), word(6, 'tajweed')], ['vowel', 'tajweed', 'letter']);
  assert.deepEqual(loadFaceAttempts('p', 'hafs')[0].words?.map(w => `${w.i}${w.k}`), ['3skipped', '5vowel', '6tajweed']);
  amendFaceAttempt('p', 'hafs', first.at, 42, [word(6, 'tajweed')], ['vowel', 'tajweed', 'letter']);
  assert.deepEqual(loadFaceAttempts('p', 'hafs')[0].words?.map(w => `${w.i}${w.k}`), ['3skipped', '6tajweed'], 'the retake cleared the vowel note');
  amendFaceAttempt('p', 'hafs', at(9), 42, [word(1)]);
  assert.equal(loadFaceAttempts('p', 'hafs').length, 1, 'an attempt that was never saved is not created here');
  /* ومحاولةٌ بكلماتٍ مشوّهةٍ تُطرح كلُّها، ولا تُصلَّح بالتخمين. */
  const box = stubStorage();
  box.set('mizan.face-attempts.v1:p:hafs', JSON.stringify([{ page: 1, at: at(0), marks: [], words: [{ i: -1, s: 2, a: 1, t: 'x', k: 'skipped' }] }]));
  assert.deepEqual(loadFaceAttempts('p', 'hafs'), []);
});

test('the journey sits on the practice page, opens your own pages, and says it stays on this device', () => {
  assert.equal(JUZ_START_PAGES.length, 30);
  assert.equal(JUZ_START_PAGES[29], 582);
  const page = fs.readFileSync('src/components/participant/MushafListens.tsx', 'utf8');
  assert.match(page, /<HifzJourney ar=\{ar\} attempts=\{attempts\} ledger=\{ledger\} practisable=\{practisable\}/);
  assert.match(page, /candidates\.find\(c => c\.page === forcedPage\)/, 'only a page in the student’s range opens');
  assert.match(page, /judged\.filter\(m => \(m\.wordIndex as number\) < farthest\)/, 'stopping early is not recorded as forgetting');
  assert.match(page, /amendFaceAttempt\(owner, deliveryReading \|\| '', key\.at, key\.page, teacher, \['vowel', 'tajweed', 'letter'\]\)/);
  const view = fs.readFileSync('src/components/participant/HifzJourney.tsx', 'utf8');
  assert.match(view, /disabled=\{!open\}/);
  assert.match(view, /في هذا الجهاز وحده/);
  assert.doesNotMatch(view, /fetch\(/, 'the journey never leaves the device');
});

test('a hard word drops off once recited cleanly twice past it — a recitation that stopped before it does not count', () => {
  const stumbles: FaceAttempt[] = [
    { page: 42, at: at(5), marks: [], words: [word(7)], reach: 30 },
    { page: 42, at: at(4), marks: [], words: [word(7)], reach: 30 },
  ];
  const clean = (d: number, reach: number): FaceAttempt => ({ page: 42, at: at(d), marks: [], words: [], reach });
  assert.equal(hardWords(stumbles, NOW).length, 1);
  assert.equal(hardWords([...stumbles, clean(2, 30)], NOW).length, 1, 'one clean pass is not yet mastery');
  assert.equal(hardWords([...stumbles, clean(2, 30), clean(1, 5), clean(0, 6)], NOW).length, 1, 'stopping before the word proves nothing');
  assert.equal(hardWords([...stumbles, clean(2, 30), clean(1, 30)], NOW).length, 0, 'mastered');
  const old: FaceAttempt[] = [{ page: 9, at: at(40), marks: [], words: [word(1)] }, { page: 9, at: at(41), marks: [], words: [word(1)] }];
  assert.equal(hardWords(old, NOW).length, 0, 'a month-old stumble is not chased');
});

test('the neediest page follows the draw: a page just recited waits out its cooldown', () => {
  const heavyNow: FaceAttempt = { page: 42, at: new Date(NOW - 3_600_000).toISOString(), marks: [], words: [word(1), word(2), word(3)] };
  const heavyOld: FaceAttempt = { page: 43, at: at(2), marks: [], words: [word(1), word(2)] };
  const all = new Set([42, 43]);
  assert.equal(neediestPage([heavyNow, heavyOld], NOW, all), 43, 'not the page recited an hour ago');
  assert.equal(neediestPage([heavyNow, heavyOld], NOW, all, 43), null, 'nor the face on screen');
  assert.equal(neediestPage([heavyOld], NOW, new Set([42])), null, 'only your own range');
});

test('the map and streak outlive the 200-attempt draw memory', () => {
  stubStorage();
  for (let k = 0; k < MAX_REMEMBERED_ATTEMPTS + 30; k += 1) {
    rememberFaceAttempt('p', 'hafs', { page: 1 + (k % 300), at: new Date(NOW - (MAX_REMEMBERED_ATTEMPTS + 30 - k) * 3_600_000).toISOString(), marks: [] });
  }
  const attempts = loadFaceAttempts('p', 'hafs');
  const ledger = loadJourneyLedger('p', 'hafs');
  assert.equal(attempts.length, MAX_REMEMBERED_ATTEMPTS);
  assert.equal(Object.keys(ledger.pages).length, 230, 'every page ever recited is still on the map');
  assert.equal(pageMemory(attempts, NOW, ledger).size, 230);
  assert.ok(pageMemory(attempts, NOW, ledger).has(1), 'the first page recited did not fall back to «not yet»');
  assert.ok(streakDays(attempts, NOW, ledger) >= 9, 'ten days of hourly recitation stay a streak');
});
