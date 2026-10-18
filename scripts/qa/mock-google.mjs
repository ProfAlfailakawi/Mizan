// Mock of the Google endpoints the browser SDKs talk to, plus a TLS reverse proxy to the Firestore
// emulator. Chromium is launched with --host-resolver-rules so *.googleapis.com lands here.
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ensureKeys, MOCK_PORT, FIRESTORE_PORT, PROJECT_ID, QA_PASSWORD, USERS_FILE, KID } from './common.mjs';

const keys = ensureKeys();
const privateKey = fs.readFileSync(keys.jwtKey, 'utf8');
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

let usersCache = { mtime: 0, byEmail: new Map(), byUid: new Map() };
function users() {
  try {
    const st = fs.statSync(USERS_FILE);
    if (st.mtimeMs !== usersCache.mtime) {
      const rows = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      usersCache = { mtime: st.mtimeMs, byEmail: new Map(rows.map((u) => [u.email.toLowerCase(), u])), byUid: new Map(rows.map((u) => [u.uid, u])) };
    }
  } catch { /* no users yet */ }
  return usersCache;
}
// Runtime-registered accounts (sign-ups performed in the browser).
const runtime = new Map();
const findByEmail = (e) => users().byEmail.get(String(e).toLowerCase()) || runtime.get(String(e).toLowerCase());
const findByUid = (u) => users().byUid.get(u) || [...runtime.values()].find((x) => x.uid === u);

export function mintToken(u, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`, aud: PROJECT_ID, auth_time: now, user_id: u.uid, sub: u.uid, iat: now, exp: now + ttl,
    email: u.email, email_verified: true, name: u.name,
    firebase: { identities: { email: [u.email] }, sign_in_provider: 'password', ...(u.mfa ? { sign_in_second_factor: 'totp' } : {}) },
  };
  if (u.role) payload.role = u.role;
  if (u.orgId) payload.org_id = u.orgId;
  if (u.competitionId) payload.competition_id = u.competitionId;
  if (u.operatorId) payload.operator_id = u.operatorId;
  const head = b64({ alg: 'RS256', kid: KID, typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const session = (u) => ({ idToken: mintToken(u), refreshToken: `rt.${u.uid}`, expiresIn: '3600', localId: u.uid, email: u.email, displayName: u.name, registered: true });
const lookupUser = (u) => ({ localId: u.uid, email: u.email, displayName: u.name, emailVerified: true, passwordHash: 'x', providerUserInfo: [{ providerId: 'password', federatedId: u.email, email: u.email, rawId: u.email }], validSince: '0', lastLoginAt: String(Date.now()), createdAt: '1700000000000', lastRefreshAt: new Date().toISOString() });
const fail = (res, code, message) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code, message, errors: [{ message }] } })); };
const send = (res, obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = https.createServer({ key: fs.readFileSync(keys.tlsKey), cert: fs.readFileSync(keys.tlsCrt) }, (req, res) => {
  const host = String(req.headers.host || '').split(':')[0];
  if (host.startsWith('firestore.')) {
    const p = http.request({ host: '127.0.0.1', port: FIRESTORE_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${FIRESTORE_PORT}` } }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
    p.on('error', () => { try { res.writeHead(502); res.end(); } catch {} });
    res.on('close', () => p.destroy());
    req.pipe(p);
    return;
  }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'https://x');
    const ctype = String(req.headers['content-type'] || '');
    let body = {};
    try { body = ctype.includes('json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw)); } catch { /* */ }
    const p = url.pathname;
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
    res.setHeader('access-control-allow-origin', '*');
    if (p.endsWith('/accounts:signInWithPassword')) {
      const u = findByEmail(body.email);
      if (!u) return fail(res, 400, 'EMAIL_NOT_FOUND');
      if (body.password !== (u.password || QA_PASSWORD)) return fail(res, 400, 'INVALID_LOGIN_CREDENTIALS');
      if (u.disabled) return fail(res, 400, 'USER_DISABLED');
      return send(res, session(u));
    }
    if (p.endsWith('/accounts:signUp')) {
      if (findByEmail(body.email)) return fail(res, 400, 'EMAIL_EXISTS');
      if (String(body.password || '').length < 6) return fail(res, 400, 'WEAK_PASSWORD : Password should be at least 6 characters');
      const u = { uid: `qa-new-${crypto.randomBytes(6).toString('hex')}`, email: String(body.email).toLowerCase(), name: String(body.email).split('@')[0], password: body.password, runtime: true };
      runtime.set(u.email, u);
      return send(res, session(u));
    }
    if (p.endsWith('/accounts:lookup')) {
      const t = String(body.idToken || '');
      try {
        const uid = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub;
        const u = findByUid(uid);
        if (u) return send(res, { users: [lookupUser(u)] });
      } catch { /* */ }
      return fail(res, 400, 'INVALID_ID_TOKEN');
    }
    if (p.endsWith('/accounts:sendOobCode')) return send(res, { email: body.email });
    if (p.endsWith('/token') || p.includes('/v1/token')) {
      const rt = String(body.refresh_token || '');
      const u = findByUid(rt.replace(/^rt\./, ''));
      if (!u) return fail(res, 400, 'TOKEN_EXPIRED');
      const s = session(u);
      return send(res, { access_token: s.idToken, expires_in: '3600', token_type: 'Bearer', refresh_token: s.refreshToken, id_token: s.idToken, user_id: u.uid, project_id: '1' });
    }
    if (p.includes('/accounts:update') || p.includes('/accounts:delete') || p.includes('/accounts:signInWithCustomToken')) return fail(res, 400, 'OPERATION_NOT_ALLOWED');
    if (p.endsWith('/getProjectConfig') || p.includes('recaptcha')) return send(res, {});
    return fail(res, 404, 'NOT_FOUND');
  });
});
server.listen(MOCK_PORT, '127.0.0.1', () => console.log(`mock-google listening on https://127.0.0.1:${MOCK_PORT}`));
