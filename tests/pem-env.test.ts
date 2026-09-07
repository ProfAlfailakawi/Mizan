import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { decodePemFromEnv } from '../server/pem';

const { privateKey } = crypto.generateKeyPairSync('ed25519');
const REAL_PEM = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

test('a PEM with real newlines is returned usable', () => {
  assert.doesNotThrow(() => crypto.createPrivateKey(decodePemFromEnv(REAL_PEM)));
});

test('a PEM stored on one line with escaped newlines is decoded', () => {
  // الشكل الذي يخزّنه كل مدير أسرار تقريبًا — كان يفشل بصمت فيعطّل توقيع الثقة.
  const oneLine = REAL_PEM.replace(/\n/g, '\\n');
  assert.doesNotThrow(() => crypto.createPrivateKey(decodePemFromEnv(oneLine)));
});

test('a quoted, escaped PEM is decoded', () => {
  const quoted = `"${REAL_PEM.replace(/\n/g, '\\n')}"`;
  assert.doesNotThrow(() => crypto.createPrivateKey(decodePemFromEnv(quoted)));
});

test('windows line endings are normalised', () => {
  const crlf = REAL_PEM.replace(/\n/g, '\\r\\n');
  assert.doesNotThrow(() => crypto.createPrivateKey(decodePemFromEnv(crlf)));
});

test('absent or empty values yield an empty string, never a broken key', () => {
  assert.equal(decodePemFromEnv(undefined), '');
  assert.equal(decodePemFromEnv(''), '');
  assert.equal(decodePemFromEnv('   '), '');
});
