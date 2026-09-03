import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preload=fs.readFileSync('scripts/kfgqpc-fetch-fallback.cjs','utf8');
const upload=fs.readFileSync('cloudbuild-assets-upload.yaml','utf8');
const audit=fs.readFileSync('cloudbuild-assets.yaml','utf8');

test('KFGQPC fallback stays fail-closed to official HTTPS hosts',()=>{
  assert.match(preload,/u\.protocol !== 'https:'+/);
  assert.match(preload,/host === 'qurancomplex\.gov\.sa'/);
  assert.match(preload,/host\.endsWith\('\.qurancomplex\.gov\.sa'\)/);
  assert.match(preload,/KFGQPC_FALLBACK_NON_OFFICIAL_URL/);
  assert.doesNotMatch(preload,/--location\b|['"]-L['"]/);
});

test('curl compatibility transport uses IPv4 retries without bypassing redirect validation',()=>{
  assert.match(preload,/--ipv4/);
  assert.match(preload,/--http1\.1/);
  assert.match(preload,/--retry-all-errors/);
  assert.match(preload,/current = officialUrl\(new URL\(location, current\)\.toString\(\)\)/);
});

test('asset Cloud Builds preload compatibility transport only after tests',()=>{
  for(const config of [upload,audit]){
    const testAt=config.indexOf('npm test');
    const preloadAt=config.indexOf('kfgqpc-fetch-fallback.cjs');
    assert.ok(testAt>=0 && preloadAt>testAt);
    assert.match(config,/ca-certificates curl/);
    assert.match(config,/--dns-result-order=ipv4first/);
  }
});
