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
  assert.match(css, /@media \(min-width:640px\) and \(max-width:759\.98px\) and \(min-height:520px\),\s*\(orientation:landscape\) and \(min-width:640px\) and \(max-width:1000px\) and \(min-height:520px\) and \(max-height:720px\)\{/);
  assert.match(css, /--duo-spine:clamp\(28px,3\.6vw,36px\)/);
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
