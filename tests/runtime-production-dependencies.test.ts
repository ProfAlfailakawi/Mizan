import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
const workflow = fs.readFileSync(
  path.join(process.cwd(), '.github', 'workflows', 'runtime-dependency-security.yml'),
  'utf8',
);

test('Cloud Run runtime omits peer-only mobile dependencies', () => {
  const runtimeStage = dockerfile.slice(dockerfile.indexOf('FROM node:22.20.0-bookworm-slim AS runtime'));
  assert.ok(runtimeStage.includes('npm ci --omit=dev --omit=peer'),
    'the production image must not auto-install React Native/Metro peers that Mizan never executes');
});

test('dependency security gate audits the exact runtime dependency surface', () => {
  assert.ok(workflow.includes('npm ci --omit=dev --omit=peer'),
    'the security workflow must install the same dependency classes as the runtime image');
  assert.ok(workflow.includes('npm audit --omit=dev --omit=peer --audit-level=high'),
    'the audit must exclude only classes that the runtime image itself excludes');
});

test('the security gate is not weakened with error swallowing or advisory allowlists', () => {
  assert.equal(/continue-on-error/.test(workflow), false);
  assert.equal(/\|\|\s*true/.test(workflow), false);
  assert.equal(/audit-level=(critical|none)/.test(workflow), false,
    'high-severity findings must still fail the production dependency gate');
  assert.equal(/audit-resolve|audit-ci|allowlist|whitelist|ignore-advisory/i.test(workflow), false,
    'do not silence individual advisories instead of fixing the shipped dependency surface');
});

test('build stage still installs peer dependencies for compatibility checks but runtime does not ship them', () => {
  const runtimeMarker = dockerfile.indexOf('FROM node:22.20.0-bookworm-slim AS runtime');
  const buildStage = dockerfile.slice(0, runtimeMarker);
  const runtimeStage = dockerfile.slice(runtimeMarker);
  assert.ok(buildStage.includes('npm ci --ignore-scripts --no-audit --no-fund'));
  assert.ok(runtimeStage.includes('--omit=peer'));
});
