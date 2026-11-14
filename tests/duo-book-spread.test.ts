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

const BOOK = '@media screen and (min-width:721px) and (max-width:1000px) and (min-height:520px) and (max-height:960px) and (orientation:landscape){';

test('the book spread is one landscape-only media query that leaves iPad and desktop untouched', () => {
  assert.ok(css.split(BOOK).length - 1 >= 2, 'the spread block and the narrow-page block use the exact shared BOOK condition');
  assert.match(css, /--duo-spine:clamp\(28px,3\.6vw,36px\)/);
});

test('portrait on the inner screen is NOT split: no book branch for portrait, in CSS or in JS', () => {
  // every media query that mentions the old portrait range must be the standalone keep-out, never a spread
  const queries = css.match(/@media[^{]*max-width:720px[^{]*\{/g) ?? [];
  for (const q of queries) {
    for (const alt of q.replace(/^@media\s*/, '').replace(/\{$/, '').split(',')) {
      if (!/max-width:720px/.test(alt)) continue;
      assert.match(alt, /orientation:portrait/, `a 640-720 branch that is not portrait-only: ${alt}`);
      const at = css.indexOf(alt);
      const body = css.slice(at, css.indexOf('\n}', at));
      // portrait is single-column: the only non-standalone portrait rule allowed is the scroller-containment fix
      if (!/:where\(\.overflow-x-auto/.test(body)) assert.match(body, /--duo-cutout-w|mz-hd-wide/, `a portrait 640-720 branch outside the widget keep-out: ${alt}`);
    }
  }
  assert.doesNotMatch(css, /@media[^{]*min-width:640px\) and \(max-width:720px\) and \(min-height:520px\)\s*[,{]/, 'the old portrait book query is gone');
  for (const f of ['components/layout/Spread.tsx', 'components/admin/CompetitionOverview.tsx']) {
    assert.doesNotMatch(read(f), /matchMedia\([^)]*(720|721|1000|960)/, f);
  }
});

test('Duo != iPad: the book is landscape, 721-1000 wide, 520-960 tall; iPad, phones and desktop stay outside', () => {
  const book = (w: number, h: number) => w > h && w >= 721 && w <= 1000 && h >= 520 && h <= 960;
  for (const [w, h] of [[744,1133],[768,1024],[810,1080],[820,1180],[834,1112],[834,1194],[1024,1366],[1133,744],[1024,768],[1080,810],[1180,820],[1112,834],[1194,834],[1366,1024],
    [744,1040],[768,920],[1280,800],[1440,900],[844,390],[932,430],[667,375],[812,375],[669,867],[669,520],[720,900],[382,580],[367,740],[390,844]]) assert.equal(book(w, h), false, `${w}x${h}`);
  for (const [w, h] of [[951,585],[951,669],[951,600],[880,585],[1000,600],[800,560],[722,521],[951,850]]) assert.equal(book(w, h), true, `${w}x${h}`);
});

test('the widget keep-out is defined once, for the inner screen in a tab and when installed, and reserves a 116px corner', () => {
  assert.equal((css.match(/--duo-cutout-w:116px/g) ?? []).length, 1);
  assert.equal((css.match(/--duo-cutout-h:116px/g) ?? []).length, 1);
  const head = css.lastIndexOf('@media', css.indexOf('--duo-cutout-w:116px'));
  const cond = css.slice(head, css.indexOf('{', head));
  const alts = cond.replace(/^@media\s*/, '').split(',');
  assert.equal(alts.length, 2);
  for (const a of alts) assert.match(a, /^\s*screen and \(min-width:/);
  assert.match(alts[0], /min-width:721px\) and \(max-width:1000px\) and \(min-height:520px\) and \(max-height:960px\) and \(orientation:landscape\)/);
  assert.match(alts[1], /min-width:640px\) and \(max-width:720px\) and \(min-height:520px\) and \(max-height:960px\) and \(orientation:portrait\)/);
  // physical right, whatever the direction
  assert.match(css, /\[dir="rtl"\] :is\(header[^{]*\) > :first-child,\s*\[dir="ltr"\][^{]*> :last-child\{ margin-right:var\(--duo-cutout-w\)/);
  // the top bars of the shell avoid it too
  assert.match(read('App.tsx'), /mz-topnote fixed inset-x-0 top-0/);
  assert.match(read('App.tsx'), /mz-topbar fixed top-3/);
});

/* يقيّم شرط @media الحقيقي (من CSS) على مقاسٍ معيّن: min/max-width/height وorientation وscreen فقط، وأي ميزة أخرى تُفشل الاختبار. */
function matches(query: string, w: number, h: number, mode?: string): boolean {
  return query.replace(/^@media\s*/, '').replace(/\{$/, '').split(',').some(alt => alt.trim().split(/\s+and\s+/).every(term => {
    const t = term.trim();
    if (t === 'screen') return true;
    const m = /^\((min|max)-(width|height):(\d+)px\)$/.exec(t);
    if (m) { const v = m[2] === 'width' ? w : h; return m[1] === 'min' ? v >= +m[3] : v <= +m[3]; }
    if (t === '(orientation:landscape)') return w > h;
    if (t === '(orientation:portrait)') return w <= h;
    if (t === `(display-mode:${mode})`) return true;
    throw new Error(`unsupported media term: ${t}`);
  }));
}

test('the keep-out matches the Duo inner screen only, whatever the display mode', () => {
  const head = css.lastIndexOf('@media', css.indexOf('--duo-cutout-w:116px'));
  const cond = css.slice(head, css.indexOf('{', head));
  assert.doesNotMatch(cond, /display-mode/, 'no display-mode in the keep-out condition');
  const portraitOnly = css.slice(css.indexOf('/* الطولي: الشعار'), css.indexOf('/* الطولي: الشعار') + 700).match(/@media[^{]*\{/)![0];
  assert.doesNotMatch(portraitOnly, /display-mode/);
  for (const [w, h] of [[951,669],[951,585],[669,867],[720,900],[640,700],[721,520],[1000,960],[951,850]]) {
    assert.equal(matches(cond, w, h), true, `${w}x${h} keeps out`);
    assert.equal(matches(cond, w, h, 'standalone'), true, `${w}x${h} keeps out when installed`);
  }
  for (const [w, h] of [[390,844],[844,390],[932,430],[430,932],[744,1024],[820,1180],[1024,768],[1180,820],[1280,800],[1440,900],[1366,1024],[367,740],[951,350],[600,350],[669,500],[641,961],[1001,700]]) {
    assert.equal(matches(cond, w, h), false, `${w}x${h} must not keep out`);
    assert.equal(matches(cond, w, h, 'standalone'), false, `${w}x${h} must not keep out when installed`);
  }
  assert.equal(matches(portraitOnly, 669, 867), true);
  assert.equal(matches(portraitOnly, 951, 585), false);
  assert.equal(matches(portraitOnly, 744, 1024), false);
  for (const f of ['components/layout/Spread.tsx', 'App.tsx']) assert.doesNotMatch(read(f), /matchMedia\([^)]*standalone/, f);
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
