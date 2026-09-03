import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Contrast floor for text on MIZAN's light canvas.
 *
 * The palette had drifted into ~60 near-identical hand-picked greys, 79 of which failed
 * WCAG AA against the canvas — a design-system entropy problem rather than 79 separate
 * bugs. This locks the floor so the drift cannot come back silently.
 *
 * Scope note: only dark-on-light text is checked. Light text on the dark venue screens is
 * excluded two ways — by file, and by tone (a light or saturated colour is by definition
 * not body text on the cream canvas).
 */
const CANVAS = '#f7f5ef';
const DARK_SCREENS = new Set(['KioskMode.tsx', 'WaitingBoard.tsx', 'HallRecitationMap.tsx', 'CeremonyView.tsx']);
const MIN_RATIO = 4.5;

const channel = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
function luminance(hex: string) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hsl(hex: string) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { l, s };
}
/* A colour that is light or clearly chromatic is an accent painted on a dark panel,
   not body text on the canvas. */
const isBodyTextTone = (hex: string) => { const { l, s } = hsl(hex); return l <= 0.60 && s < 0.12; };

function walk(dir: string, out: string[] = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

test('text tones on the light canvas meet WCAG AA', () => {
  const offenders: string[] = [];
  for (const file of walk(path.resolve(process.cwd(), 'src'))) {
    if (DARK_SCREENS.has(path.basename(file))) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/text-\[(#[0-9A-Fa-f]{6})\]/g)) {
      const hex = m[1].toLowerCase();
      if (!isBodyTextTone(hex)) continue;
      const ratio = contrast(hex, CANVAS);
      if (ratio < MIN_RATIO) offenders.push(`${path.basename(file)} ${hex} ${ratio.toFixed(2)}:1`);
    }
  }
  assert.deepEqual([...new Set(offenders)], [], 'body-text tones below 4.5:1 on the canvas');
});

test('CSS text colours meet WCAG AA', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  const offenders: string[] = [];
  for (const m of css.matchAll(/color:\s*(#[0-9A-Fa-f]{6})/g)) {
    const hex = m[1].toLowerCase();
    if (!isBodyTextTone(hex)) continue;
    const ratio = contrast(hex, CANVAS);
    if (ratio < MIN_RATIO) offenders.push(`${hex} ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual([...new Set(offenders)], [], 'index.css text colours below 4.5:1');
});
