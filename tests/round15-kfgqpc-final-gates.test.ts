import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p:string)=>fs.readFileSync(p,'utf8');

test('verify mode is a real fail-closed gate, not a no-op',()=>{
  const s=read('scripts/kfgqpc-ingest.ts');
  assert.match(s,/VERIFY_NOT_READY/);
  assert.match(s,/if\(doVerify&&!doUpload&&!doReport\)\{assertResultsReady\(results\)/);
});

test('font sync can require all six official font sets',()=>{
  const s=read('scripts/kfgqpc-font-sync.ts');
  assert.match(s,/--require-all/);
  assert.match(s,/FONT_SET_NOT_READY/);
});

test('heavy discovery requires all identity tokens and rejects tied candidates',()=>{
  const s=read('scripts/kfgqpc-heavy-acquire.ts');
  assert.match(s,/matched!==t\.tokens\.length/);
  assert.match(s,/AMBIGUOUS_OFFICIAL_CANDIDATES/);
  assert.match(s,/identityTokens/);
});

test('upload build runs postflight only after verified upload',()=>{
  const s=read('cloudbuild-assets-upload.yaml');
  assert.match(s,/kfgqpc-font-sync\.ts --require-all/);
  assert.match(s,/kfgqpc-ingest\.ts --verify/);
  assert.match(s,/kfgqpc-ingest\.ts --upload --resume/);
  assert.match(s,/kfgqpc-postflight\.ts/);
  assert.ok(s.indexOf('kfgqpc-postflight.ts')>s.indexOf('kfgqpc-ingest.ts --upload --resume'));
});
