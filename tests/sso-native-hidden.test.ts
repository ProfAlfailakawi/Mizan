import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ssoOffered } from '../src/lib/sso-fallback';

test('SSO is hidden in the iOS app and offered on the website', () => {
  assert.equal(ssoOffered(true), false);
  assert.equal(ssoOffered(false), true);
});

test('AuthPortal gates discovery, handler and button on the native check; password sign-in is untouched', () => {
  const src = fs.readFileSync('src/components/auth/AuthPortal.tsx', 'utf8');
  assert.match(src, /if\(!ssoOffered\(isAppleNativeShell\(\)\)\|\|!\/\\\.\/\.test\(domain\)\)\{setSso\(null\);return\}/);
  assert.match(src, /if\(!sso\|\|!ssoOffered\(isAppleNativeShell\(\)\)\)return;/);
  assert.match(src, /\{sso&&ssoOffered\(isAppleNativeShell\(\)\)&&<Button/);
  assert.match(src, /signInWithEmailAndPassword\(auth,email,password\)/);
});
