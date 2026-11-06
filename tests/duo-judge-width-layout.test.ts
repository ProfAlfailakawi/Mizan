import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * iPhone Duo: قرار التخطيط من عرض النافذة لا من نوع الجهاز. قمرة المحكّم تكون ورقةً ولوحةً
 * جنبًا إلى جنب من ٦٠٠px، فلا يأخذ المطويّ المفتوح (٦٦٩) ولا ٩٥١ تخطيط الهاتف المكدّس.
 * يفحص مصدر الواجهة فقط؛ لا يمسّ التقييم ولا العدالة.
 */
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const judge = readFileSync(new URL('../src/components/judge/JudgeOS.tsx', import.meta.url), 'utf8');

test('judge cockpit goes two-pane from 600px, not 1024px', () => {
  assert.match(css, /@media \(min-width:600px\)\{\s*\.mizan-judge-os\{ grid-template-columns:minmax\(0,1fr\) clamp\(248px,34vw,344px\)/);
  assert.match(css, /@media \(min-width:600px\)\{ \.mizan-judge-deck\{ border-top:0; border-inline-start/);
  assert.doesNotMatch(css, /@media \(min-width:1024px\)\{ \.mizan-judge-deck\{ border-top:0/);
});

test('the stacked-phone deck cap applies only below 600px', () => {
  assert.match(css, /@media \(max-width:599\.98px\)\{\s*\.mizan-judge-deck\{ max-height:52dvh \}/);
});

test('entry gates use safe centring so overflow cannot cover the gate rail', () => {
  assert.match(css, /\.mizan-judge-gate\{ align-content:safe center/);
  assert.equal((judge.match(/className="mizan-judge-gate /g) || []).length, 4);
});
