import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * iPhone Duo — صفحتا الكتاب (جولة 2026-11-14). يفحص المصدر فقط: التخطيط CSS خالص، والمكوّن
 * لا يقرأ عرض الشاشة، فلا يُعاد تركيب شيءٍ عند الطيّ والفتح (التسجيل والتشغيل لا يتوقّفان).
 */
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const spread = readFileSync(new URL('../src/components/layout/Spread.tsx', import.meta.url), 'utf8');
const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('the inner-screen spread is one media query that leaves iPad and desktop untouched', () => {
  assert.match(css, /@media screen and \(min-width:640px\) and \(max-width:720px\) and \(min-height:520px\),\s*screen and \(orientation:landscape\) and \(min-width:640px\) and \(max-width:1000px\) and \(min-height:520px\) and \(max-height:720px\)\{/);
  assert.match(css, /--duo-spine:clamp\(28px,3\.6vw,36px\)/);
});

test('Duo != iPad: every book query is screen-scoped, portrait <= 720px wide, landscape <= 1000px wide', () => {
  const queries = css.match(/@media[^{]*min-width:640px[^{]*min-height:520px[^{]*\{/g) ?? [];
  assert.ok(queries.length >= 3, 'the three book queries exist');
  for (const q of queries) {
    for (const alt of q.replace(/^@media\s*/, '').replace(/\{$/, '').split(',')) {
      assert.match(alt.trim(), /^screen and /, `not screen-scoped: ${alt}`);
      const max = Number(/max-width:([\d.]+)px/.exec(alt)?.[1]);
      const landscape = /orientation:landscape/.test(alt);
      assert.ok(max <= (landscape ? 1000 : 720), `book query allows an iPad width (${max}px): ${alt}`);
    }
  }
  // iPad probe sizes never reach the portrait/landscape ranges
  const duo = (w: number, h: number) => (w >= 640 && w <= 720 && h >= 520) || (w > h && w >= 640 && w <= 1000 && h >= 520 && h <= 720);
  for (const [w, h] of [[744,1133],[768,1024],[810,1080],[820,1180],[834,1112],[834,1194],[1024,1366],[1133,744],[1024,768],[1080,810],[1180,820],[1112,834],[1194,834],[1366,1024],
    [744,1040],[768,920],[768,950],[810,990],[820,1090],[834,1020],[1024,690],[1133,660],[1180,735]]) assert.equal(duo(w, h), false, `${w}x${h}`);
  for (const [w, h] of [[669,867],[669,520],[660,800],[700,900],[720,900],[951,585],[880,585],[1000,600]]) assert.equal(duo(w, h), true, `${w}x${h}`);
});

test('Spread decides nothing from the viewport in JavaScript', () => {
  assert.doesNotMatch(spread, /matchMedia|innerWidth|resize|useEffect|useState/);
  assert.match(spread, /data-duo/);
});

test('the main screens are composed as two pages', () => {
  for (const file of ['components/judge/JudgeOS.tsx', 'components/participant/ParticipantDashboard.tsx', 'components/head-judge/HeadJudgeInbox.tsx',
    'components/operations/CommandCenter.tsx', 'components/admin/RolePortals.tsx', 'components/admin/SaaSWorkspace.tsx',
    'components/public/DiscoverDirectory.tsx', 'components/public/PassportView.tsx']) {
    assert.match(read(file), /<Spread /, file);
  }
  assert.match(read('components/admin/CompetitionOverview.tsx'), /mz-spread mz-spread-index/);
  assert.match(read('components/auth/AuthPortal.tsx'), /mz-login-book/);
});

test('the judge cockpit splits at the spine, and a real hinge still wins', () => {
  const inner = css.indexOf('/* 3) صفحتا الكتاب');
  const hinge = css.indexOf('/* 4) وضع الكتاب مع مفصلٍ');
  assert.ok(inner > 0 && hinge > inner, 'the hinge rules come after the spread so they override it');
  assert.match(css, /\.mizan-judge-os\{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); column-gap:var\(--duo-spine\) \}/);
});

test('laptop posture keeps controls at the bottom with space reserved for them', () => {
  assert.match(css, /body:has\(\.mz-el-mnav\)\{ padding-bottom:calc\(3\.6rem/);
  assert.match(css, /body:has\(\.mz-leaf-b > \.mizan-tabs\)\{ padding-bottom:calc\(3\.75rem/);
});
