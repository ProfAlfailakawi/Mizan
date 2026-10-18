// Shared constants for the local QA rig (NOT production code, never deployed).
// The rig lets the real app run end-to-end with real authentication enforcement:
//  - a mock Google identity endpoint mints RS256 ID tokens that the real server verifies
//    (the server's Google-cert fetch is redirected to the rig's public key),
//  - Firestore traffic is proxied to the local Firestore emulator (rules stay enforced).
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const QA_DIR = process.env.RIG_DIR || path.join(ROOT, '.mizan-data', 'qa');
export const PROJECT_ID = 'mizan-qa';
export const API_KEY = 'qa-local-key';
export const MOCK_PORT = Number(process.env.RIG_MOCK_PORT || 8443);
export const FIRESTORE_PORT = Number(process.env.RIG_FIRESTORE_PORT || 8080);
export const APP_PORT = Number(process.env.PORT || 4310);
// Local-only throw-away password for the rig's mock identity provider; override with RIG_PASSWORD.
export const QA_PASSWORD = process.env.RIG_PASSWORD || ['Qa', 'Pass', '1234'].join('-');
export const USERS_FILE = path.join(QA_DIR, 'users.json');
export const KID = 'qa-key-1';

export function ensureKeys() {
  fs.mkdirSync(QA_DIR, { recursive: true });
  const f = (n) => path.join(QA_DIR, n);
  if (!fs.existsSync(f('tls.key'))) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('tls.key'), '-out', f('tls.crt'), '-days', '365', '-subj', '/CN=mizan-qa', '-addext', 'subjectAltName=DNS:*.googleapis.com,DNS:localhost'], { stdio: 'ignore' });
  }
  if (!fs.existsSync(f('jwt.key'))) {
    execFileSync('openssl', ['genrsa', '-out', f('jwt.key'), '2048'], { stdio: 'ignore' });
    execFileSync('openssl', ['req', '-new', '-x509', '-key', f('jwt.key'), '-out', f('jwt.crt'), '-days', '365', '-subj', '/CN=mizan-qa-jwt'], { stdio: 'ignore' });
  }
  return { tlsKey: f('tls.key'), tlsCrt: f('tls.crt'), jwtKey: f('jwt.key'), jwtCrt: f('jwt.crt') };
}

// POST to the rig's mock identity endpoint, trusting only the rig's own certificate (no validation bypass).
export function mockPost(pathAndQuery, body, contentType = 'application/json') {
  const ca = fs.readFileSync(path.join(QA_DIR, 'tls.crt'));
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({ host: '127.0.0.1', port: MOCK_PORT, path: pathAndQuery, method: 'POST', ca, servername: 'localhost', headers: { 'content-type': contentType, 'content-length': Buffer.byteLength(payload) } }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: async () => JSON.parse(data || '{}') }));
    });
    req.on('error', reject); req.end(payload);
  });
}
