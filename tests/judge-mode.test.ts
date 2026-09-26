import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/index.css', 'utf8');
const judge = fs.readFileSync('src/components/judge/JudgeOS.tsx', 'utf8');
const control = fs.readFileSync('src/components/judge/JudgeModeControl.tsx', 'utf8');

test('judge mode: default adds no attribute, so the current cockpit is unchanged', () => {
  assert.match(control, /'data-judge-mode': prefs\.enabled \? 'on' : undefined/);
  assert.match(control, /'data-judge-theme': prefs\.theme === 'default' \? undefined : prefs\.theme/);
  assert.match(judge, /className="mizan-judge-os" data-peek=\{peek\?'true':'false'\} \{\.\.\.judgeMode\.attrs\}/);
});

test('judge mode: preference is per device and storage failures never break the screen', () => {
  assert.match(control, /try \{\s*const raw = window\.localStorage\.getItem/);
  assert.match(control, /try \{ window\.localStorage\.setItem/);
});

test('judge mode: every judge-mode/theme rule is scoped to the JudgeOS root attributes', () => {
  const start = css.indexOf('وضع المحكّم وسماته');
  const block = css.slice(start, css.indexOf('العرض المبسّط لوليّ الأمر'));
  const selectors = block.replace(/\/\*[\s\S]*?\*\//g, '').match(/^[^{}@\n][^{}]*(?=\{)/gm) || [];
  for (const sel of selectors) {
    const parts: string[] = []; let depth = 0, cur = '';
    for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    parts.push(cur);
    for (const part of parts) {
      const p = part.trim();
      if (!p || /^(from|to|\d+%)/.test(p)) continue;
      assert.match(p, /data-judge-(mode|theme)|mizan-judge-mode/, `unscoped selector: ${p}`);
    }
  }
  assert.match(block, /\[data-judge-mode="on"\][^{]*\{ font-size:max\(16px, 1em\) \}/);
  assert.match(block, /min-height:44px/);
});

const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const vars = (theme: string) => {
  const m = css.match(new RegExp(`\\.mizan-judge-os\\[data-judge-theme="${theme}"\\]\\{([^}]*)\\}`));
  assert.ok(m, theme);
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):(#[0-9a-fA-F]{6})/g)].map(x => [x[1], x[2]]));
};

test('hall-lighting theme text reaches 7:1, night theme reaches 4.5:1', () => {
  for (const [theme, floor] of [['hall', 7], ['night', 4.5]] as const) {
    const v = vars(theme);
    for (const fg of ['venue-ink', 'venue-muted', 'venue-faint', 'jc-gold']) {
      for (const bg of ['venue', 'venue-deep']) {
        const r = ratio(v[fg], v[bg]);
        assert.ok(r >= floor, `${theme}: ${fg} on ${bg} = ${r.toFixed(2)}`);
      }
    }
    assert.ok(ratio(v['jc-paper-ink'], v['jc-paper']) >= floor, `${theme}: paper`);
  }
});
