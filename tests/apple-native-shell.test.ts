import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAppleNativeShell } from '../src/lib/appleNativeShell';

const g = globalThis as any;
const withWindow = (win: any, fn: () => void) => {
  const had = 'window' in g; const prev = g.window;
  g.window = win;
  try { fn(); } finally { if (had) g.window = prev; else delete g.window; }
};

test('isAppleNativeShell is false without a window (SSR/tests)', () => {
  assert.equal(isAppleNativeShell(), false);
});

test('isAppleNativeShell is false on the website and on Android', () => {
  withWindow({}, () => assert.equal(isAppleNativeShell(), false));
  withWindow({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }, () => assert.equal(isAppleNativeShell(), false));
  withWindow({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }, () => assert.equal(isAppleNativeShell(), false));
});

test('isAppleNativeShell is true only for native iOS', () => {
  withWindow({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }, () => assert.equal(isAppleNativeShell(), true));
});

test('marketing page demo entry is a plain /demo link (web and iOS shell alike), with no price or purchase UI', () => {
  const src = fs.readFileSync('src/components/marketing/MarketingSite.tsx', 'utf8');
  assert.match(src, /const DEMO_HREF = '\/demo';/);
  assert.equal((src.match(/href="\/demo"/g) || []).length, 0, 'literal hrefs go through DEMO_HREF');
  assert.match(src, /جرّب العرض التجريبي/);
  // the iOS build must never gain a price/purchase surface through the marketing page
  assert.doesNotMatch(src, /(\bSAR\b|\bUSD\b|\$\s?\d|StoreKit|اشترِ|اشتر الآن|الأسعار)/);
});
