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

test('marketing page renders the /demo link only behind isAppleNativeShell()', () => {
  const src = fs.readFileSync('src/components/marketing/MarketingSite.tsx', 'utf8');
  const matches = src.match(/href="\/demo"/g) || [];
  assert.equal(matches.length, 1);
  assert.match(src, /isAppleNativeShell\(\) && <a href="\/demo"/);
  assert.match(src, /جرّب العرض التجريبي/);
});
