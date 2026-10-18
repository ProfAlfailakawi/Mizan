import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GlobalRateLimiter } from '../server/global-rate-limit';

const tok = (u: string) => `Bearer ${'a'.repeat(30)}.${u}.${'b'.repeat(30)}`;
const verify = async (t: string) => { const uid = t.split('.')[1]; if (!uid || uid === 'bad') throw new Error('invalid'); return { uid }; };

test('a hall of authenticated devices behind one IP does not share one bucket', async () => {
  const l = new GlobalRateLimiter({ windowMs: 60_000, anonymousMax: 5, authenticatedMax: 3, verify, now: () => 1000 });
  for (let u = 0; u < 300; u++) for (let i = 0; i < 3; i++) assert.equal((await l.check(tok('u' + u), '10.0.0.1')).allowed, true);
  assert.equal((await l.check(tok('u0'), '10.0.0.1')).allowed, false, 'one user still has a ceiling');
  assert.equal((await l.check(tok('u1'), '10.0.0.1')).allowed, false);
});

test('anonymous traffic is still limited per IP', async () => {
  const l = new GlobalRateLimiter({ windowMs: 60_000, anonymousMax: 3, authenticatedMax: 100, verify, now: () => 1000 });
  for (let i = 0; i < 3; i++) assert.equal((await l.check(undefined, '1.1.1.1')).allowed, true);
  assert.equal((await l.check(undefined, '1.1.1.1')).allowed, false);
  assert.equal((await l.check(undefined, '2.2.2.2')).allowed, true);
});

test('forged or unverifiable tokens cannot buy a fresh bucket: they fall back to the IP limit', async () => {
  const l = new GlobalRateLimiter({ windowMs: 60_000, anonymousMax: 3, authenticatedMax: 100, verify, now: () => 1000 });
  const results: boolean[] = [];
  for (let i = 0; i < 6; i++) results.push((await l.check(`Bearer ${'x'.repeat(30)}.bad.${i}${'y'.repeat(20)}`, '9.9.9.9')).allowed);
  assert.deepEqual(results, [true, true, true, false, false, false]);
  assert.equal((await l.check('Bearer short', '9.9.9.9')).scope, 'ip');
});

test('the window resets, and the verified-token cache avoids re-verifying', async () => {
  let t = 0, calls = 0;
  const l = new GlobalRateLimiter({ windowMs: 1000, anonymousMax: 1, authenticatedMax: 2, verify: async (x) => { calls++; return verify(x); }, now: () => t });
  assert.equal((await l.check(tok('a'), 'ip')).allowed, true);
  assert.equal((await l.check(tok('a'), 'ip')).allowed, true);
  assert.equal((await l.check(tok('a'), 'ip')).allowed, false);
  assert.equal(calls, 1);
  t = 1500;
  assert.equal((await l.check(tok('a'), 'ip')).allowed, true);
});

test('server wiring: the limits are configurable and documented', () => {
  const server = fs.readFileSync('server.ts', 'utf8');
  assert.match(server, /RATE_LIMIT_MAX\|\|3000/);
  assert.match(server, /RATE_LIMIT_MAX_AUTHENTICATED\|\|1500/);
  assert.match(server, /new GlobalRateLimiter\(/);
  const env = fs.readFileSync('.env.example', 'utf8');
  assert.match(env, /RATE_LIMIT_MAX/);
  assert.match(env, /RATE_LIMIT_MAX_AUTHENTICATED/);
});
