import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * العرض التجريبي كان يقبع داخل شاشة الدخول وحدها، فلا يراه من يزور الموقع العام.
 * هذه الاختبارات تثبّت أن الصفحة التسويقية تحمل مدخله الظاهر في ثلاثة مواضع
 * (الشريط العلوي، البطل، القسم المخصص) وأنه الرابط المعزول نفسه الذي يخدمه الخادم.
 */
const marketing = fs.readFileSync('src/components/marketing/MarketingSite.tsx', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const portal = fs.readFileSync('src/components/auth/AuthPortal.tsx', 'utf8');

test('marketing page exposes the demo in the header, hero and a dedicated section', () => {
  for (const id of ['header-demo-entry', 'hero-demo-entry', 'section-demo-entry']) {
    assert.match(marketing, new RegExp(`href=\\{DEMO_HREF\\} data-testid="${id}"`), `${id} must link to DEMO_HREF`);
  }
  assert.match(marketing, /id="jarreb"/);
  assert.match(marketing, /جرّب ميزان الآن/);
  assert.match(marketing, /بلا حساب/);
});

test('the marketing entry targets the server-side isolated sandbox route', () => {
  assert.match(marketing, /const DEMO_HREF = '\/demo';/);
  assert.match(server, /app\.get\('\/demo'/);
});

test('the in-app demo button is still present on the sign-in screen', () => {
  assert.match(portal, /enterDemoSessionIsolated/);
  assert.match(portal, /<DemoEntry /);
});

test('the demo links are real anchors with an accessible, visible name', () => {
  const anchors = marketing.match(/<a href=\{DEMO_HREF\}[^>]*>/g) || [];
  assert.equal(anchors.length, 3);
  assert.doesNotMatch(marketing, /<button[^>]*DEMO_HREF/);
});
