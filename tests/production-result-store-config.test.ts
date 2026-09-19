import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const cloudbuild = fs.readFileSync(path.join(root, 'cloudbuild.yaml'), 'utf8');
const integrityBuild = fs.readFileSync(path.join(root, 'cloudbuild-integrity.yaml'), 'utf8');

const deployEnvLine = cloudbuild.split('\n').find(line => line.includes('MIZAN_INTEGRITY_AUTHORITY_DIR=/mnt/authority')) || '';

test('production wires result seal and publication stores to the mounted durable authority volume', () => {
  assert.ok(deployEnvLine.includes('MIZAN_SEAL_REGISTRY_DIR=/mnt/authority/result-seals'),
    'result sealing must not be silently disabled in production');
  assert.ok(deployEnvLine.includes('MIZAN_PUBLICATION_STORE_DIR=/mnt/authority/result-publications'),
    'result publication must not return RESULT_PUBLICATION_NOT_CONFIGURED in production');
  assert.match(integrityBuild, /--add-volume-mount=volume=authority,mount-path=\/mnt\/authority/,
    'the configured paths must live on the persistent authority volume, not container-local disk');
});

test('file-backed result authority stays single-writer until a transactional shared store replaces it', () => {
  const maxInstancesIndex = cloudbuild.indexOf("- '--max-instances'");
  assert.ok(maxInstancesIndex >= 0, 'Cloud Run must explicitly constrain writers while file stores are authoritative');
  const following = cloudbuild.slice(maxInstancesIndex, maxInstancesIndex + 120);
  assert.match(following, /- '1'/,
    'raising max-instances above one would reintroduce seal/publication races across instances');
});

test('production result stores are not placed on known ephemeral container paths', () => {
  for (const name of ['MIZAN_SEAL_REGISTRY_DIR', 'MIZAN_PUBLICATION_STORE_DIR']) {
    const match = deployEnvLine.match(new RegExp(`${name}=([^,']+)`));
    assert.ok(match, `${name} must be configured`);
    assert.ok(match[1].startsWith('/mnt/authority/'), `${name} must use the mounted authority volume`);
    assert.equal(/^\/(tmp|app|workspace|home)(\/|$)/.test(match[1]), false,
      `${name} must not point at an ephemeral Cloud Run filesystem`);
  }
});
