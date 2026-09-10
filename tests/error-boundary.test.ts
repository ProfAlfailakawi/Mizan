import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * الشاشة البيضاء: لم يكن في التطبيق حارس أخطاء واحد، فأي استثناء أثناء الرسم يُسقط الشجرة
 * كلها إلى فراغ صامت — لا رسالة للمستخدم ولا أثر لمن يصلح. والأسوأ أن العطل غالبًا يأتي من
 * الحالة المحفوظة على الجهاز، فيتكرر مع كل إعادة تحميل ولا ينجو منه إلا من يفتح نافذة خفية.
 */

const boundary = fs.readFileSync('src/components/design-system/AppErrorBoundary.tsx', 'utf8');
const entry = fs.readFileSync('src/main.tsx', 'utf8');

test('the whole app sits inside the boundary', () => {
  assert.match(entry, /<AppErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/,
    'a boundary that wraps only part of the tree leaves the rest able to go blank');
  assert.match(boundary, /static getDerivedStateFromError/, 'it must actually catch render errors');
});

test('the fallback speaks Arabic and never blames the user’s account', () => {
  for (const phrase of ['تعذّر عرض الشاشة على هذا الجهاز', 'لا في حسابك ولا في بياناتك']) {
    assert.ok(boundary.includes(phrase), `missing reassurance: ${phrase}`);
  }
  // ولا يُعرض أثر المكدّس للمستخدم: رسالة قصيرة تكفي، والتفصيل في سجل المتصفح.
  assert.doesNotMatch(boundary, /componentStack\}/, 'a stack trace is not a message to a user');
});

test('the user can recover without knowing what an incognito window is', () => {
  /* هذا بالضبط ما تفعله النافذة الخفية — تبدأ بذاكرة نظيفة — ولكن بزرّ واحد. */
  assert.match(boundary, /localStorage\.removeItem/, 'the fallback must clear the state that caused the crash');
  assert.match(boundary, /window\.location\.reload/, 'and reload afterwards');
  assert.match(boundary, /STORAGE_KEYS = \[STORAGE_KEY\]/, 'it must clear the key the app actually persists to');
  // ولا يُمسّ الخادم: المسح محلي بحت.
  assert.doesNotMatch(boundary, /deleteDoc|setDoc|fetch\(/, 'recovery must never touch server data');
});

test('the crash reaches the owner instead of dying on the affected screen', () => {
  assert.match(boundary, /sendHeartbeat\(/, 'a crash nobody hears about is a crash nobody fixes');
  assert.match(boundary, /RENDER_CRASH/, 'and it must be distinguishable from other faults');
  // بلا بيانات شخصية: رمز العطل ورسالته المقتضبة فقط.
  const beat = /void sendHeartbeat\(\{[\s\S]*?\}\)/.exec(boundary)?.[0] || '';
  assert.doesNotMatch(beat, /currentUser|email|participant|fullName/, 'the report carries no personal data');
});

test('the key the boundary clears is the key the store writes', () => {
  // مفتاحان مختلفان يعني زرّ تعافٍ لا يُعافي: يمسح شيئًا ويُبقي العطل.
  const state = fs.readFileSync('src/lib/store-state.ts', 'utf8');
  const storeKey = /export const STORAGE_KEY\s*=\s*'([^']+)'/.exec(state)?.[1];
  assert.ok(storeKey, 'the store must name its storage key');
  /* والأمتن أن يُستورد لا يُنسخ، فلا يفترقان أصلًا متى غُيّر المفتاح. */
  assert.match(boundary, /import \{ STORAGE_KEY \} from '\.\.\/\.\.\/lib\/store-state'/,
    'the boundary must import the key rather than hardcode a copy of it');
});
