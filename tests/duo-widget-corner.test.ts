import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * iPhone Duo — ركن الودجت (2026-11-14). يفحص المصدر: منطقةٌ واحدة بثلاثة متغيّرات وشرطٍ واحد، وتُقرأ بالاتجاه
 * الفيزيائي. الحارس في المتصفح (`npm run test:duo-widget`, tests/duo-widget-corner.guard.mjs) يقيس التقاطع فعليًّا.
 */
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

/* يقيّم شرط @media الحقيقي (من CSS) على مقاسٍ معيّن: min/max-width/height وorientation وscreen فقط، وأي ميزة أخرى تُفشل الاختبار. */
function matches(query: string, w: number, h: number, mode?: string): boolean {
  return query.replace(/^@media\s*/, '').replace(/\{$/, '').split(',').some(alt => alt.trim().split(/\s+and\s+/).every(term => {
    const t = term.trim();
    if (t === 'screen') return true;
    const m = /^\((min|max)-(width|height):(\d+)px\)$/.exec(t);
    if (m) { const v = m[2] === 'width' ? w : h; return m[1] === 'min' ? v >= +m[3] : v <= +m[3]; }
    if (t === '(orientation:landscape)') return w > h;
    if (t === '(orientation:portrait)') return w <= h;
    if (/^\((horizontal|vertical)-viewport-segments:2\)$/.test(t)) return false; // مفصلٌ حقيقي: لا يُحاكى بمقاس
    if (t === `(display-mode:${mode})`) return true;
    throw new Error(`unsupported media term: ${t}`);
  }));
}

const START = css.indexOf('/* 3ب) ركن الودجت');
const head = css.indexOf('@media', START);
const cond = css.slice(head, css.indexOf('{', head));
const block = css.slice(head, css.indexOf('\n}\n', head));

test('the widget corner is three variables, 0 by default and set once, in one media block', () => {
  assert.ok(START > 0);
  assert.match(css, /--duo-widget-w: 0px; --duo-widget-gap: 0px; --duo-widget-h: 0px;/);
  assert.equal((css.match(/--duo-widget-w:96px/g) ?? []).length, 1);
  assert.match(block, /--duo-widget-gap:8px/);
  assert.match(block, /--duo-widget-h:clamp\(64px,31vh,270px\)/);
  assert.doesNotMatch(css, /--duo-cutout/, 'the old 116px cutout is gone');
  assert.doesNotMatch(cond, /display-mode/, 'tab and installed app behave the same');
  assert.match(cond, /horizontal-viewport-segments:2/);
});

test('physical right, never inline-end, and no new !important', () => {
  assert.match(block, /padding-right:calc\(1rem \+ var\(--duo-widget-w\) \+ var\(--duo-widget-gap\)\)/);
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /padding-inline-end|margin-inline-end|!important/);
});

test('the condition is generic (no exact widths) and covers 457x678, the inferred in-app viewport', () => {
  for (const [w, h] of [[382,580],[470,780],[594,368],[669,867],[951,585],[580,382],[780,470],[368,594],[867,669],[585,951],[669,520],[457,678],[457,760],[440,660],[480,720],[430,932],[382,844],[951,700],[360,640]]) assert.equal(matches(cond, w, h), true, `${w}x${h}`);
  // iPad, wide landscape and desktop stay out
  for (const [w, h] of [[744,1133],[768,1024],[820,1180],[1024,768],[1180,820],[1280,800],[1440,900],[1366,1024],[1001,700]]) assert.equal(matches(cond, w, h), false, `${w}x${h}`);
  assert.doesNotMatch(cond, /min-width:(382|470|457)|max-width:(382|470|457)/, 'no exact Duo widths');
});

test('the surfaces that are not in the header reserve it too', () => {
  for (const s of ['div.mz-topbar', 'div.mz-topnote', '.mz-bp-login', '.mizan-overlay', '.mz-palette-scrim', 'aside.mz-guide-sheet', '.mz-venue-corner']) assert.ok(block.includes(s), s);
  assert.match(read('components/design-system/VenueLockControl.tsx'), /mz-venue-corner fixed top-0 right-0/);
  assert.match(read('App.tsx'), /mz-topnote fixed inset-x-0 top-0/);
});

test('the debug page loads only with ?duo-debug=1 and can be calibrated live', () => {
  assert.match(read('lib/duo-debug.ts'), /duo-w[\s\S]*duo-h/);
  const main = read('main.tsx');
  assert.match(main, /duo-debug/);
  assert.match(main, /import\(['"]\.\/lib\/duo-debug['"]\)/);
});
