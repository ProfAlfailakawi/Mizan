import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSafeSegments,
  buildKey,
  quranPackageKey,
  quranSourceKey,
  tenantBrandingKey,
  tenantExportKey,
  globalHafsAudioKey,
  sha256Hex,
  integrityFor,
  verifyIntegrity,
  readPackageManifestFiles,
  R2KeyError,
} from '../server/r2-object-layout';

test('keys are built from trusted segments and reject path traversal', () => {
  assert.equal(buildKey('quran', 'packages', 'hisham', 'v1', 'manifest.json'), 'quran/packages/hisham/v1/manifest.json');
  for (const bad of ['..', '.', 'a/b', 'a\\b', '../etc', '', ' ', 'x'.repeat(200)]) {
    assert.throws(() => assertSafeSegments(['quran', bad]), (e: unknown) => e instanceof R2KeyError, `rejects ${JSON.stringify(bad)}`);
  }
});

test('certified package and source keys are immutable versioned paths', () => {
  assert.equal(quranPackageKey('warsh', 'v1'), 'quran/packages/warsh/v1/manifest.json');
  assert.equal(quranPackageKey('warsh', 'v2', 'index.json'), 'quran/packages/warsh/v2/index.json');
  // a new version is a new path, never an overwrite of v1
  assert.notEqual(quranPackageKey('warsh', 'v1'), quranPackageKey('warsh', 'v2'));
  assert.equal(quranSourceKey('QURANPEDIA', '2026-09-15', 'dump.json'), 'quran/sources/quranpedia/2026-09-15/dump.json');
});

test('tenant assets and exports are scoped under the tenant id', () => {
  assert.equal(tenantBrandingKey('tenant-a', 'v1', 'logo.png'), 'tenants/tenant-a/branding/v1/logo.png');
  assert.equal(tenantExportKey('tenant-a', 'comp-1', 'results.pdf'), 'exports/tenant-a/comp-1/results.pdf');
  assert.equal(globalHafsAudioKey('hafs-muaiqly', 'v1', '001001.mp3'), 'audio/hafs/hafs-muaiqly/v1/001001.mp3');
  // a malicious tenant id cannot escape its prefix
  assert.throws(() => tenantBrandingKey('../tenant-b', 'v1', 'logo.png'), (e: unknown) => e instanceof R2KeyError);
});

test('integrity is computed as SHA-256, never trusted from ETag alone', () => {
  const bytes = Buffer.from('MIZAN');
  const expected = integrityFor('quran/packages/hafs/v1/manifest.json', bytes, 'application/json');
  assert.equal(expected.sha256, sha256Hex(bytes));
  assert.equal(expected.sizeBytes, 5);

  // matching size + hash → ok
  assert.deepEqual(verifyIntegrity(expected, { sizeBytes: 5, sha256: expected.sha256 }), { ok: true });
  // size mismatch → fail closed
  assert.equal(verifyIntegrity(expected, { sizeBytes: 4, sha256: expected.sha256 }).code, 'R2_OBJECT_SIZE_MISMATCH');
  // hash mismatch → fail closed
  assert.equal(verifyIntegrity(expected, { sizeBytes: 5, sha256: 'deadbeef' }).code, 'R2_OBJECT_INTEGRITY_FAILED');
  // missing hash on a hashed object → unverified, fail closed
  assert.equal(verifyIntegrity(expected, { sizeBytes: 5 }).code, 'R2_OBJECT_SHA256_UNVERIFIED');
});

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

test('a package manifest is read only when every file is verifiable', () => {
  const files = readPackageManifestFiles({
    sourceFiles: [
      { name: 'index.json', sha256: SHA_A, sizeBytes: 12, contentType: 'application/json' },
      { path: 'surahs/001.json', contentSha256: SHA_B.toUpperCase(), size: 34 },
    ],
  });
  assert.equal(files.length, 2);
  assert.deepEqual(files[0], { name: 'index.json', sha256: SHA_A, sizeBytes: 12, contentType: 'application/json' });
  // الهجاء البديل مقبول، والبصمة تُخفَّض حالةً
  assert.deepEqual(files[1], { name: 'surahs/001.json', sha256: SHA_B, sizeBytes: 34 });
  // ويُقبل المفتاح files كذلك
  assert.equal(readPackageManifestFiles({ files: [{ name: 'a.json', sha256: SHA_A, sizeBytes: 0 }] }).length, 1);
});

test('an unverifiable manifest entry fails closed rather than passing a hollow check', () => {
  const bad: [string, unknown][] = [
    ['MANIFEST_FILES_MISSING', {}],
    ['MANIFEST_FILES_MISSING', null],
    ['MANIFEST_FILES_MISSING', { sourceFiles: 'nope' }],
    ['MANIFEST_FILE_NAME_MISSING_AT_0', { files: [{ sha256: SHA_A, sizeBytes: 1 }] }],
    ['MANIFEST_FILE_SHA256_INVALID:a.json', { files: [{ name: 'a.json', sizeBytes: 1 }] }],
    ['MANIFEST_FILE_SHA256_INVALID:a.json', { files: [{ name: 'a.json', sha256: 'deadbeef', sizeBytes: 1 }] }],
    ['MANIFEST_FILE_SIZE_INVALID:a.json', { files: [{ name: 'a.json', sha256: SHA_A }] }],
    ['MANIFEST_FILE_SIZE_INVALID:a.json', { files: [{ name: 'a.json', sha256: SHA_A, sizeBytes: -1 }] }],
  ];
  for (const [code, manifest] of bad) {
    assert.throws(() => readPackageManifestFiles(manifest),
      (e: unknown) => e instanceof R2KeyError && e.code === code,
      `${code} for ${JSON.stringify(manifest)}`);
  }
});
