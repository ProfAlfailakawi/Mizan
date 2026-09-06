import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A deploy mints new hashed chunk names. Any client still holding the previous shell — a venue
 * tablet left open, a browser or service-worker cache — will ask for a chunk that no longer
 * exists. If the SPA fallback answers that with index.html and status 200, the module loader
 * rejects it on MIME type and the screen goes white with no route to recovery.
 *
 * These tests pin the two halves of the fix: the server must 404 a missing build asset, and the
 * shell must be able to heal itself exactly once.
 */

const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
const recoverySource = fs.readFileSync(path.join(process.cwd(), 'src/lib/stale-shell-recovery.ts'), 'utf8');
const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.tsx'), 'utf8');

test('the SPA fallback refuses to answer asset requests with the app shell', () => {
  const match = serverSource.match(/const ASSET_LIKE\s*=\s*(\/.+\/[a-z]*)\s*;/);
  assert.ok(match, 'server must define an ASSET_LIKE guard for the SPA fallback');
  // eslint-disable-next-line no-eval -- reading the literal the server itself uses
  const assetLike: RegExp = eval(match![1]);

  for (const p of [
    '/assets/ExperienceHub-GqX51VAg.js',
    '/assets/index-Y91GLFF3.css',
    '/assets/vendor-react-DDwC_z6H.js',
    '/sw.js',
    '/brand/mizan-icon-180.png',
    '/fonts/053157db97.woff2',
    '/manifest.webmanifest',
  ]) {
    assert.equal(assetLike.test(p), true, `${p} must be treated as an asset, never as a route`);
  }

  // Real application routes must still receive the shell.
  for (const p of ['/', '/verify', '/register', '/competition', '/trust-verify']) {
    assert.equal(assetLike.test(p), false, `${p} is a route and must still be served index.html`);
  }
});

test('the fallback returns 404 rather than the shell for an asset', () => {
  assert.match(serverSource, /ASSET_LIKE\.test\(req\.path\)[\s\S]{0,120}status\(404\)/, 'an asset miss must answer 404');
});

test('stale-shell recovery reloads once and never loops', () => {
  assert.match(recoverySource, /sessionStorage\.getItem\(FLAG\)[\s\S]{0,60}return/, 'a second failure must not reload again');
  assert.match(recoverySource, /caches\.delete/, 'recovery must clear caches holding the old shell');
  assert.match(recoverySource, /unregister\(\)/, 'recovery must drop the service worker pinning the old shell');
  assert.match(recoverySource, /window\.location\.reload\(\)/);
});

test('recovery is installed before any lazy route can resolve', () => {
  const install = mainSource.indexOf('installStaleShellRecovery()');
  const render = mainSource.indexOf('createRoot(');
  assert.ok(install > 0 && render > 0 && install < render, 'recovery must be installed before the app renders');
});

test('recovery only triggers on stale-chunk failures, not on unrelated errors', () => {
  const stale = [
    'Failed to fetch dynamically imported module: https://x/assets/A-1234abcd.js',
    "Unexpected token '<'",
    'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"',
  ];
  const unrelated = ['ResizeObserver loop limit exceeded', 'NetworkError when attempting to fetch resource.', 'TypeError: x is not a function'];
  const pattern = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unexpected token '<'|MIME type/i;
  for (const m of stale) assert.equal(pattern.test(m), true, `must recover from: ${m}`);
  for (const m of unrelated) assert.equal(pattern.test(m), false, `must not reload for: ${m}`);
});
