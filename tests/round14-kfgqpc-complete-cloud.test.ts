import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {isOfficialKfgqpcHostname,isOfficialKfgqpcUrl,assertOfficialKfgqpcUrl,canonicalAyahKey,SURAH_AYAH_COUNTS,safeArchiveEntry} from '../server/kfgqpc-authority';

test('KFGQPC authority accepts only HTTPS qurancomplex.gov.sa and its real subdomains',()=>{
  for(const u of ['https://qurancomplex.gov.sa/','https://download.qurancomplex.gov.sa/a.zip','https://fonts.qurancomplex.gov.sa/','https://qc-dev.qurancomplex.gov.sa/quran-audios/','https://dm.qurancomplex.gov.sa/'])assert.equal(isOfficialKfgqpcUrl(u),true,u);
  for(const u of ['http://qurancomplex.gov.sa/','https://qurancomplex.gov.sa.evil.example/a','https://evil-qurancomplex.gov.sa.example/a','https://example.com/'])assert.equal(isOfficialKfgqpcUrl(u),false,u);
  assert.equal(isOfficialKfgqpcHostname('x.y.qurancomplex.gov.sa'),true);assert.throws(()=>assertOfficialKfgqpcUrl('https://example.com/a'),/KFGQPC_SOURCE_URL_NOT_OFFICIAL/);
});

test('canonical Quran ayah contract is exactly 6236 ayat and rejects impossible pairs',()=>{
  assert.equal(SURAH_AYAH_COUNTS.length,114);assert.equal(SURAH_AYAH_COUNTS.reduce((a,b)=>a+b,0),6236);
  assert.equal(canonicalAyahKey(1,1),'001/001');assert.equal(canonicalAyahKey(2,286),'002/286');assert.equal(canonicalAyahKey(114,6),'114/006');assert.throws(()=>canonicalAyahKey(2,287),/INVALID_QURAN_AYAH/);
});

test('archive path policy rejects zip-slip and absolute entries',()=>{
  assert.equal(safeArchiveEntry('folder/001.mp3'),true);assert.equal(safeArchiveEntry('../secret'),false);assert.equal(safeArchiveEntry('/etc/passwd'),false);assert.equal(safeArchiveEntry('a/../../b'),false);
});

test('audit Cloud Build cannot upload to R2; upload build is explicit and Secret Manager backed',()=>{
  const root=path.resolve(process.cwd());const audit=fs.readFileSync(path.join(root,'cloudbuild-assets.yaml'),'utf8');const upload=fs.readFileSync(path.join(root,'cloudbuild-assets-upload.yaml'),'utf8');
  assert.equal(audit.includes('kfgqpc-ingest.ts --upload'),false);assert.equal(audit.includes('R2_SECRET_ACCESS_KEY'),false);assert.match(audit,/kfgqpc-heavy-acquire\.ts --root/);
  assert.match(upload,/kfgqpc-heavy-acquire\.ts --full/);assert.match(upload,/kfgqpc-font-sync\.ts --upload/);assert.match(upload,/kfgqpc-ingest\.ts --upload --resume/);assert.match(upload,/Secret|secretManager/);assert.equal(upload.includes('VITE_R2_'),false);
});

test('heavy asset source overrides are namespaced and never secrets',()=>{
  const script=fs.readFileSync(path.resolve(process.cwd(),'scripts/kfgqpc-heavy-acquire.ts'),'utf8');
  for(const key of ['KFGQPC_MUSHAF_PAGES_URL','KFGQPC_FONT_HAFS_URL','KFGQPC_AUDIO_HAFS_URL','KFGQPC_AUDIO_SUSI_URL','KFGQPC_AUDIO_DURI_URL','KFGQPC_AUDIO_WARSH_URL'])assert.match(script,new RegExp(key));
  assert.equal(script.includes('VITE_'),false);assert.match(script,/assertOfficialKfgqpcUrl/);assert.match(script,/AUDIO_CANONICAL_COVERAGE_FAILED/);assert.match(script,/MUSHAF_604_VALIDATION_FAILED/);
});

test('font sync writes the primary key contract consumed by delivery routes',()=>{const script=fs.readFileSync(path.resolve(process.cwd(),'scripts/kfgqpc-font-sync.ts'),'utf8');assert.match(script,/primary\$\{path\.extname\(primary\)/);assert.match(script,/delivery\/fonts\/hafs\/v13/);});
