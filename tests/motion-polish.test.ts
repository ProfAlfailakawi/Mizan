import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { brandEase, motionAllowed } from '../src/components/dna/useMotion';

const read = (p: string) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
/** Drops /* ... *\/ comments by scanning (no regex replace, so nothing can be left half-stripped). */
function stripCssComments(css: string): string {
  let out = '';
  let at = 0;
  while (at < css.length) {
    const open = css.indexOf('/*', at);
    if (open === -1) { out += css.slice(at); break; }
    out += css.slice(at, open);
    const close = css.indexOf('*/', open + 2);
    if (close === -1) break;
    at = close + 2;
  }
  return out;
}

const dna = read('components/dna/dna.css');
const index = read('index.css');
const beauty = read('beauty-pass.css');

test('brandEase follows the brand curve: fixed ends, monotonic, ease-out shaped', () => {
  assert.equal(brandEase(0), 0);
  assert.equal(brandEase(1), 1);
  let prev = 0;
  for (let i = 1; i <= 20; i += 1) {
    const v = brandEase(i / 20);
    assert.ok(v >= prev - 1e-9, 'monotonic');
    prev = v;
  }
  assert.ok(brandEase(0.25) > 0.5, 'front-loaded like cubic-bezier(.22,.75,.22,1)');
});

test('motion is off without a browser (SSR / node / jsdom-less tests render the final state)', () => {
  assert.equal(motionAllowed(), false);
});

test('primitives decide their first frame synchronously and never leave content hidden by default', () => {
  const hook = read('components/dna/useMotion.ts');
  // armed only when motion may run and the key has not played; everything else starts at the final state
  assert.match(hook, /enabled && motionAllowed\(\) && !\(playKey && journeyAlreadyPlayed\(drawKey\(playKey\)\)\) \? 'pending' : null/);
  assert.match(hook, /armed0 \? 'wait' : 'rest'/);
  assert.match(hook, /data-mizan-motion/);
  // unmeasurable element and hidden tab fall back to the final state
  assert.match(hook, /setPhase\(null\)/);
  assert.match(hook, /document\.hidden/);
  // after the first play a count only ever shows the live value
  assert.match(hook, /stage === 'rest' \? value : shown/);
});

test('css: the kit current node is static at rest; the one-shot halo is gated on data-just (opt-in)', () => {
  const current = dna.match(/\.dna-stepi\[data-state='current'\] \.dna-node \{[^}]*\}/)?.[0] ?? '';
  assert.match(current, /animation: none/);
  assert.doesNotMatch(current, /infinite/);
  assert.match(dna, /\.dna-steps:not\(\[data-journey\]\) \.dna-stepi\[data-just\] \.dna-node::after/);
  assert.match(dna, /@keyframes dna-halo \{/, 'old keyframes stay defined (nothing is deleted)');
});

test('css: every new one-shot effect is final-state-at-once under both reduced-motion switches', () => {
  for (const sel of ['[data-mz-flash]', '.dna-drawx', '.dna-drawy', '.dna-drawblock', '.dna-panelfade', '.dna-pageglow[data-rose]', '.dna-goldhalo[data-halo]::after']) {
    assert.ok(dna.includes(`  ${sel}`) || dna.includes(`  ${sel},`), `prefers-reduced-motion covers ${sel}`);
    assert.ok(dna.includes(`html[data-mizan-motion='reduced'] ${sel}`), `app switch covers ${sel}`);
  }
});

test('css: new motion only touches transform / opacity / dashoffset / outline colour (no box-shadow keyframes)', () => {
  const block = dna.slice(dna.indexOf('/* ---------- calm one-shot motion'), dna.indexOf('/* ---------- motion safety'));
  const keyframes: string[] = [];
  for (let at = block.indexOf('@keyframes'); at !== -1; at = block.indexOf('@keyframes', at + 1)) {
    let depth = 0, end = block.indexOf('{', at);
    for (let i = end; i < block.length; i += 1) {
      if (block[i] === '{') depth += 1;
      if (block[i] === '}' && --depth === 0) { end = i; break; }
    }
    keyframes.push(block.slice(at, end + 1));
  }
  assert.ok(keyframes.length >= 8);
  for (const k of keyframes) assert.doesNotMatch(k, /box-shadow|filter|blur|width|height/, k.slice(0, 40));
});

test('calm list: loops became finite or static, and nothing was deleted', () => {
  assert.doesNotMatch(read('components/participant/CompletionSeal.tsx').match(/\.mizan-seal-halo\{[^}]*\}/)?.[0] ?? '', /infinite/);
  assert.match(beauty, /\.mz-bp-atmos::before \{ animation: none/);
  assert.match(beauty, /\.mz-bp-scanline \{ animation: none/);
  assert.match(beauty, /@keyframes mzBpGlow/);
  assert.doesNotMatch(stripCssComments(beauty.match(/@media \(prefers-reduced-motion: no-preference\) \{\s*@keyframes mzBpRise[\s\S]*?\n\}/)?.[0] ?? ''), /mz-bp-stat/);
  assert.doesNotMatch(index.match(/\.mizan-live-pen\{[\s\S]*?\n\}/)?.[0] ?? '', /infinite|mizan-live-breathe/);
  assert.doesNotMatch(index.match(/\.mizan-live-pen::after\{[\s\S]*?\n\}/)?.[0] ?? '', /infinite/);
  assert.match(index, /\.mizan-live-pen\{[\s\S]*?transition:left/, 'the pen still follows the reciter');
  assert.doesNotMatch(index.match(/\.mz-orb-glow \{[^}]*\}/)?.[0] ?? '', /animation:mzGlowDrift/);
  assert.match(index, /@keyframes mzGlowDrift/);
  for (const sel of ['.mzo-orbit{', '.mzo-orbit > *{', '.mzo-float{']) {
    const line = index.split('\n').find((l) => l.includes(sel)) ?? '';
    assert.doesNotMatch(line, /infinite/, sel);
  }
  assert.doesNotMatch(read('components/operations/LiveRecitationMonitor.tsx'), /animate-ping/);
  for (const f of ['WarmupSanctuary', 'TrialRun', 'PracticeStudio']) {
    assert.match(read(`components/participant/${f}.tsx`), /motion-safe:animate-pulse/, f);
  }
});

test('do-not-animate surfaces stay untouched by the new primitives', () => {
  const judge = read('components/judge/JudgeOS.tsx');
  assert.doesNotMatch(judge, /useMotion|DnaCountUp|haloOnChange|flashBadges|data-mz-flash|dna-draw/);
  const registration = read('components/public/RegistrationFlow.tsx');
  assert.doesNotMatch(registration, /useMotion|DnaCountUp|haloOnChange|data-mz-flash/);
  const overview = read('components/admin/CompetitionOverview.tsx');
  const results = overview.split('\n').find((l) => l.includes("'مراحل النتائج'")) ?? '';
  assert.ok(results.includes('DnaStepper'));
  assert.doesNotMatch(results, /haloOnChange|reveal|flashBadges/, 'results seal/publish stages stay still');
  // the ceremony score and the result score never roll digits
  assert.doesNotMatch(read('components/public/CeremonyView.tsx'), /DnaCountUp|countUp/);
  assert.doesNotMatch(read('components/participant/RecitationResultCard.tsx'), /DnaCountUp|useCountUp|countUp/);
  // the Mushaf "From the Mushaf" panel is not wrapped in the crossfade
  const corridor = read('components/public/CorridorScreen.tsx');
  assert.equal((corridor.match(/dna-panelfade/g) ?? []).length, 2);
  assert.doesNotMatch(corridor.slice(corridor.indexOf('const MushafPanel'), corridor.indexOf('/* ── ختمة القاعة')), /dna-panelfade/);
});

test('counts never re-roll: Metric only counts on opt-in, and live Metric uses a tint, not a count', () => {
  const metric = read('components/design-system/Metric.tsx');
  assert.match(metric, /flash\s*\?\s*<DnaFlashValue/);
  assert.match(metric, /countUp\s*\?\s*<DnaCountUp/);
  assert.match(read('operations/CommandCenter.tsx'.replace('operations', 'components/operations')), /<Metric flash /);
});
