import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldFallbackToRedirect, POPUP_FALLBACK_CODES } from '../src/lib/sso-fallback';

test('popup falls back to redirect on exactly the three environment errors', () => {
  assert.deepEqual([...POPUP_FALLBACK_CODES].sort(), ['auth/operation-not-supported-in-this-environment', 'auth/popup-blocked', 'auth/web-storage-unsupported']);
  for (const code of POPUP_FALLBACK_CODES) assert.equal(shouldFallbackToRedirect({ code }), true);
  for (const code of ['auth/popup-closed-by-user', 'auth/unauthorized-domain', 'auth/network-request-failed']) assert.equal(shouldFallbackToRedirect({ code }), false);
  assert.equal(shouldFallbackToRedirect(null), false);
});

test('wiring: portal uses the fallback helper, startup completes redirects, authDomain stays as configured', () => {
  const portal = fs.readFileSync('src/components/auth/AuthPortal.tsx', 'utf8');
  assert.match(portal, /signInWithProvider\(provider\)/);
  assert.doesNotMatch(portal, /signInWithPopup/);
  assert.match(fs.readFileSync('src/lib/useMizanAuth.ts', 'utf8'), /completeRedirectSignIn\(\)/);
  assert.match(fs.readFileSync('src/lib/firebase.ts', 'utf8'), /authDomain: env\.VITE_FIREBASE_AUTH_DOMAIN \|\| config\.authDomain \|\| undefined,/);
});
