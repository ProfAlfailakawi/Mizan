import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeAwardPolicy, publicPrizes, DEFAULT_AWARD_POLICY } from '../src/lib/award-places';

const withPrizes = () => ({
  ...DEFAULT_AWARD_POLICY,
  places: [
    { ...DEFAULT_AWARD_POLICY.places[0], prizeArabic: '٥٠٠ د.ك ودرع', prizeEnglish: '500 KWD and a trophy' },
    { ...DEFAULT_AWARD_POLICY.places[1], prizeArabic: '٣٠٠ د.ك' },
    { ...DEFAULT_AWARD_POLICY.places[2] },
  ],
});

test('prize text survives normalization (it used to be stripped by the whitelist)', () => {
  const n = normalizeAwardPolicy(withPrizes());
  assert.equal(n.places[0].prizeArabic, '٥٠٠ د.ك ودرع');
  assert.equal(n.places[0].prizeEnglish, '500 KWD and a trophy');
  assert.equal(n.places[2].prizeArabic, undefined, 'an empty prize is absent, not an empty string');
});

test('only announced prizes are public, in rank order, in the viewer\'s language with a fallback', () => {
  assert.deepEqual(publicPrizes(withPrizes(), true).map(p => [p.rank, p.prize]), [[1, '٥٠٠ د.ك ودرع'], [2, '٣٠٠ د.ك']]);
  assert.deepEqual(publicPrizes(withPrizes(), false).map(p => [p.rank, p.prize]), [[1, '500 KWD and a trophy'], [2, '٣٠٠ د.ك']], 'a missing English prize falls back to the Arabic text');
});

test('a competition with no prizes shows none (no empty section)', () => {
  assert.deepEqual(publicPrizes(DEFAULT_AWARD_POLICY, true), []);
  assert.deepEqual(publicPrizes(undefined, true), []);
});

test('public prize text is cleaned and capped: hidden direction marks cannot spoof the page', () => {
  const dirty = { ...DEFAULT_AWARD_POLICY, places: [{ ...DEFAULT_AWARD_POLICY.places[0], prizeArabic: '‮١٠٠​\n' + 'x'.repeat(200) }] };
  const out = publicPrizes(dirty, true)[0].prize;
  assert.ok(!/[‪-‮​\u0000-\u001f]/.test(out));
  assert.ok(out.length <= 80);
});

test('wiring: the editor writes the field and the landing page renders only announced prizes', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  assert.match(read('src/components/admin/CompetitionOverview.tsx'), /prizeArabic:e\.target\.value/);
  const landing = read('src/components/public/CompetitionLanding.tsx');
  assert.match(landing, /publicPrizes\(competition\.policy\?\.results\?\.awards, ar\)/);
  assert.match(landing, /prizes\.length > 0 && \(/);
});
