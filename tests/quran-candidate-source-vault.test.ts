import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { CandidateQuranSourceVault } from '../server/quran-candidate-source-vault';
import { candidateSourceForRawi } from '../src/lib/quran-candidate-sources';

function hishamPayload() {
  const source = candidateSourceForRawi('hisham');
  assert.ok(source);
  const table: Record<string, { id: number; text: string }[]> = {};
  let remaining = source.expectedVerseCount;
  for (let surah = 1; surah <= source.expectedSurahCount; surah++) {
    const left = source.expectedSurahCount - surah;
    const count = surah === source.expectedSurahCount ? remaining : 1;
    assert.ok(count >= 1 && remaining - count >= left);
    table[String(surah)] = Array.from({ length: count }, (_, index) => ({ id: index + 1, text: `نص ${surah}:${index + 1}` }));
    remaining -= count;
  }
  assert.equal(remaining, 0);
  return zlib.deflateRawSync(Buffer.from(JSON.stringify(table), 'utf8'));
}

test('candidate source vault stays fail-closed until the committee approves the exact package hash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-quran-candidate-'));
  try {
    const sourcePath = path.join(root, 'QiraahHisham.json.deflate');
    fs.writeFileSync(sourcePath, hishamPayload());
    const vault = new CandidateQuranSourceVault(path.join(root, 'vault'));
    const manifest = vault.ingest({ rawiId: 'hisham', sourcePath, ingestedBy: 'test-importer' });

    assert.equal(manifest.review.state, 'PENDING_SCHOLAR_REVIEW');
    assert.equal(manifest.actualSurahCount, 114);
    assert.equal(manifest.actualVerseCount, 6226);
    assert.match(manifest.compressedSha256, /^[0-9a-f]{64}$/);
    assert.match(manifest.normalizedSha256, /^[0-9a-f]{64}$/);
    assert.throws(() => vault.verses('hisham'), /QURAN_CANDIDATE_NOT_APPROVED/);
    assert.throws(
      () => vault.review({ rawiId: 'hisham', state: 'APPROVED', reviewerId: 'committee-1', expectedPackageHash: 'wrong' }),
      /QURAN_CANDIDATE_REVIEW_PACKAGE_HASH_MISMATCH/,
    );

    const approved = vault.review({
      rawiId: 'hisham',
      state: 'APPROVED',
      reviewerId: 'committee-1',
      expectedPackageHash: manifest.packageHash,
      note: 'fixture approval',
    });
    assert.equal(approved.review.state, 'APPROVED');
    assert.equal(vault.verses('hisham').length, 6226);
    assert.equal(vault.reviewPacket('hisham').automaticApproval, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('approved candidate bytes are re-hashed on every read and tampering fails closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-quran-candidate-tamper-'));
  try {
    const sourcePath = path.join(root, 'QiraahHisham.json.deflate');
    fs.writeFileSync(sourcePath, hishamPayload());
    const vaultRoot = path.join(root, 'vault');
    const vault = new CandidateQuranSourceVault(vaultRoot);
    const manifest = vault.ingest({ rawiId: 'hisham', sourcePath, ingestedBy: 'test-importer' });
    vault.review({ rawiId: 'hisham', state: 'APPROVED', reviewerId: 'committee-1', expectedPackageHash: manifest.packageHash });

    const dataPath = path.join(vaultRoot, 'hisham', 'verses.json');
    fs.appendFileSync(dataPath, ' ');
    assert.throws(() => vault.verses('hisham'), /QURAN_CANDIDATE_NORMALIZED_HASH_MISMATCH/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
