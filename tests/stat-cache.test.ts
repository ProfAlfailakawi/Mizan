import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StatCachedJson } from '../server/stat-cache';

test('StatCachedJson parses once, then re-parses after an atomic rewrite', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'statcache-'));
  const file = path.join(dir, 's.json');
  fs.writeFileSync(file, JSON.stringify({ n: 1 }));
  let parses = 0;
  const c = new StatCachedJson<{ n: number }>(file, (raw) => { parses++; return JSON.parse(raw); });
  assert.equal(c.get().n, 1); assert.equal(c.get().n, 1);
  assert.equal(parses, 1, 'second read is served from memory');
  const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ n: 2 })); fs.renameSync(tmp, file);
  assert.equal(c.get().n, 2);
  assert.equal(parses, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('identity lookup no longer rewrites the whole identity file on every request', () => {
  const src = fs.readFileSync('server/identity-governance.ts', 'utf8');
  assert.equal(/identityForUid[\s\S]{0,200}this\.cleanup\(s\);this\.write\(s\)/.test(src), false);
  assert.match(src, /private cleanup\(s:State\):boolean/);
});
