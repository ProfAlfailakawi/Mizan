import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveAuthDomain, SAME_ORIGIN_AUTH_HOSTS, shouldFallbackToRedirect, POPUP_FALLBACK_CODES } from '../src/lib/auth-domain';

const CFG = 'mizan-f2ce3.firebaseapp.com';

test('authDomain follows the serving host only when it is on the explicit allowlist', () => {
  assert.equal(resolveAuthDomain(CFG, 'mizan-quran.web.app'), 'mizan-quran.web.app');
  assert.equal(resolveAuthDomain(CFG, 'MIZAN-QURAN.WEB.APP'), 'mizan-quran.web.app');
  assert.deepEqual([...SAME_ORIGIN_AUTH_HOSTS], ['mizan-quran.web.app']);
});

test('unknown hosts, tenants and look-alikes keep the configured authDomain', () => {
  for (const h of ['localhost', 'acme.dr-alfailakawi.com', 'mizan-quran.web.app.evil.com', 'evil-mizan-quran.web.app', '']) {
    assert.equal(resolveAuthDomain(CFG, h), CFG, h);
  }
  assert.equal(resolveAuthDomain(undefined, 'localhost'), undefined);
});

test('extra hosts can be added by build config, nothing else is inferred', () => {
  assert.equal(resolveAuthDomain(CFG, 'mizan.example.com', 'mizan.example.com, other.example.com'), 'mizan.example.com');
  assert.equal(resolveAuthDomain(CFG, 'x.example.com', 'mizan.example.com'), CFG);
});

test('popup falls back to redirect on exactly the three environment errors', () => {
  assert.deepEqual([...POPUP_FALLBACK_CODES].sort(), ['auth/operation-not-supported-in-this-environment', 'auth/popup-blocked', 'auth/web-storage-unsupported']);
  for (const code of POPUP_FALLBACK_CODES) assert.equal(shouldFallbackToRedirect({ code }), true);
  for (const code of ['auth/popup-closed-by-user', 'auth/unauthorized-domain', 'auth/network-request-failed']) assert.equal(shouldFallbackToRedirect({ code }), false);
  assert.equal(shouldFallbackToRedirect(null), false);
});

test('wiring: firebase.ts resolves the domain, the portal uses the fallback helper, startup completes redirects', () => {
  assert.match(fs.readFileSync('src/lib/firebase.ts', 'utf8'), /resolveAuthDomain\(/);
  const portal = fs.readFileSync('src/components/auth/AuthPortal.tsx', 'utf8');
  assert.match(portal, /signInWithProvider\(provider\)/);
  assert.doesNotMatch(portal, /signInWithPopup/);
  assert.match(fs.readFileSync('src/lib/useMizanAuth.ts', 'utf8'), /completeRedirectSignIn\(\)/);
});

test('CSP lets the auth iframe load from self and firebaseapp.com', () => {
  const server = fs.readFileSync('server.ts', 'utf8');
  assert.match(server, /frame-src 'self' https:\/\/\*\.firebaseapp\.com/);
});
