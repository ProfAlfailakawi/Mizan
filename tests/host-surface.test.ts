/*
 * وجه المضيف يقرّر ما يُعرض. خطأٌ هنا يعني إمّا صفحة بيع أمام محكّم، أو شاشة دخول
 * أمام مشترٍ — وكلاهما فادح، فتُثبَّت القسمة هنا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { hostSurface } from '../src/lib/host-surface';

test('mizan is the public marketing face, admin is the owner console', () => {
  assert.equal(hostSurface('mizan.dr-alfailakawi.com'), 'marketing');
  assert.equal(hostSurface('MIZAN.dr-alfailakawi.com'), 'marketing');
  assert.equal(hostSurface('admin.dr-alfailakawi.com'), 'admin');
});

test('the web.app site maps to the marketing and admin surfaces', () => {
  assert.equal(hostSurface('mizan-quran.web.app'), 'marketing');
  // the owner console is a path on the marketing host, not a separate site
  assert.equal(hostSurface('mizan-quran.web.app', '/admin'), 'admin');
  assert.equal(hostSurface('mizan-quran.web.app', '/admin/tenants'), 'admin');
  assert.equal(hostSurface('mizan-quran.web.app', '/administrators'), 'marketing');
  assert.equal(hostSurface('mizan-quran.web.app', '/'), 'marketing');
  // the project default site stays the tenant application, as before
  assert.equal(hostSurface('mizan-f2ce3.web.app'), 'app');
});

test('every other host is a tenant application, and localhost stays the app', () => {
  for (const h of ['jiha.dr-alfailakawi.com', 'a.dr-alfailakawi.com', 'localhost', '127.0.0.1', '']) {
    assert.equal(hostSurface(h), 'app');
  }
});

test('a tenant cannot claim the reserved labels', () => {
  const store = fs.readFileSync('server/tenant-store.ts', 'utf8');
  const reserved = store.slice(store.indexOf('RESERVED_SUBDOMAINS'));
  for (const label of ['mizan', 'admin', 'mizan-quran']) assert.match(reserved, new RegExp(`'${label}'`));
});
