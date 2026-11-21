import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/*
 * iPhone Duo — ركن الودجت. الحجز الثابت القديم (96px × 31vh) كان يُفعَّل بالمقاس وحده لكل شاشةٍ ليست Duo، فالتقط
 * كل iPhone طولي ونوافذ iPad والحاسوب الضيقة (ترويسة بارتفاع ~300px وشريط فارغ يمينها). أُزيل: على iPhone Duo
 * تُحجز المنطقة بما يبلغه iOS (`env(safe-area-inset-*)` في src/duo-pattern.css)، وخارجه لا حجز.
 * هذا الاختبار يفشل إن عاد حجزٌ ثابت يصل إلى شاشةٍ عادية.
 */
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cssFiles = (dir: string): string[] => readdirSync(new URL(`../src/${dir}`, import.meta.url), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? cssFiles(`${dir}${e.name}/`) : e.name.endsWith('.css') ? [`${dir}${e.name}`] : []);

test('the widget variables are 0 by default (base layer)', () => {
  assert.match(css, /--duo-widget-w: 0px; --duo-widget-gap: 0px; --duo-widget-h: 0px;/);
  assert.doesNotMatch(css, /--duo-cutout/, 'the old 116px cutout is gone');
});

test('no fixed widget reservation is reachable outside a real Duo', () => {
  for (const f of cssFiles('')) {
    const s = strip(read(f));
    // every rule that sets a widget variable to something other than 0 is gated on data-device="duo"
    for (const m of s.matchAll(/([^{}]*)\{[^{}]*--duo-widget-(?:w|gap|h)\s*:\s*(?!\s|0px)[^;]+;/g)) {
      const selector = m[1].trim();
      assert.match(selector, /^(html|:root)\[data-device="duo"\]/, `${f}: ${selector} sets a widget variable without the Duo gate`);
    }
    assert.doesNotMatch(s, /--duo-widget-w\s*:\s*96px/, `${f}: the fixed 96px box is back`);
    // and nothing scoped to "not the Duo" sizes or pads itself by the widget box
    assert.doesNotMatch(s, /:not\(\[data-device="duo"\]\)[^{]*\{[^}]*var\(--duo-widget-/, `${f}: a non-Duo rule reads the widget box`);
  }
});

test('on the Duo the reservation is what iOS reports, never a fixed box', () => {
  const duo = strip(read('duo-pattern.css'));
  assert.match(duo, /html\[data-device="duo"\]\{[^}]*--duo-widget-w:env\(safe-area-inset-right,0px\)/);
  assert.match(duo, /--duo-widget-h:env\(safe-area-inset-top,0px\)/);
  assert.match(read('main.tsx'), /duo-pattern\.css/);
});

test('the debug page loads only with ?duo-debug=1 and can be calibrated live', () => {
  assert.match(read('lib/duo-debug.ts'), /duo-w[\s\S]*duo-h/);
  const main = read('main.tsx');
  assert.match(main, /duo-debug/);
  assert.match(main, /import\(['"]\.\/lib\/duo-debug['"]\)/);
});
