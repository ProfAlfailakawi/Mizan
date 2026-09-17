import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * البيئة التجريبية بُنيت ببياناتها وعزلها كاملًا، ثم لم يكن يمكن دخولها إطلاقًا:
 * بوابة الموظفين تردّ كل من لا يحمل جلسة Firebase، والصندوق التجريبي لا يحمل واحدة
 * ولن يحملها أبدًا. فالزائر يضغط زر العرض، تُرفع الراية، تُعاد الصفحة… ويعود إلى
 * شاشة الدخول نفسها. لا خطأ في الأنواع ولا في البناء ولا في أي اختبار.
 *
 * هذه الاختبارات تثبّت شرطَي الدخول: أن البوابة تُمرّر البيئة التجريبية، وأن
 * المصادقة تبقى مفروضة على كل ما عداها.
 */

const app = fs.readFileSync('src/App.tsx', 'utf8');
const store = fs.readFileSync('src/lib/store.ts', 'utf8');
const types = fs.readFileSync('src/types/index.ts', 'utf8');

test('the staff gate lets a demo session through', () => {
  assert.match(
    app,
    /if\(requireAuth&&!signedIn&&!IS_DEMO_SESSION\) return <AuthPortal\/>;/,
    'without this the demo button returns the visitor to the sign-in screen',
  );
});

test('authentication stays mandatory for every real session', () => {
  // الاستثناء للبيئة التجريبية وحدها؛ لا يُشترى دخولها بإضعاف المصادقة.
  assert.match(app, /const requireAuth=true/, 'requireAuth must remain unconditionally true');
  assert.equal(/requireAuth\s*=\s*(?!true)/.test(app), false, 'requireAuth must not be computed');
});

test('the demo role switch refuses to act outside the demo', () => {
  const start = store.indexOf('export function setDemoRole');
  assert.ok(start > 0, 'setDemoRole must exist');
  const body = store.slice(start, start + 400);
  assert.match(body, /if \(!IS_DEMO_SESSION\) return false;/, 'the refusal must be the first thing it does');
  // تبديل الدور المحلي متقاعد في الجلسة الحقيقية، ويبقى متقاعدًا.
  assert.match(store, /const switchRole = \(_role: Role\) => false;/, 'real sessions must not gain a local role switch');
});

test('every role in the product is reachable in the demo', () => {
  const union = types.slice(types.indexOf('export type Role ='), types.indexOf('export interface User'));
  const roles = [...union.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.ok(roles.length >= 18, `expected the full role union, parsed ${roles.length}`);

  const listed = new Set(
    [...store.matchAll(/export const DEMO_(?:TENANT|PLATFORM)_ROLES: Role\[\] = \[([\s\S]*?)\];/g)]
      .flatMap(m => [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1])),
  );
  const missing = roles.filter(role => !listed.has(role));
  assert.deepEqual(missing, [], `roles with no way into the demo: ${missing.join(', ')}`);
});
