// Authorization probe against the running QA server: every API route is called (a) without a token and
// (b) with the least-privileged staff token (a participant) and (c) with a judge token. Anything that answers
// 2xx/5xx where a refusal is expected is printed. Routes intentionally public are allow-listed below.
import fs from 'node:fs';
import { loadUsers } from './browser.mjs';
import { MOCK_PORT, APP_PORT, QA_PASSWORD } from './common.mjs';
const BASE = `http://127.0.0.1:${APP_PORT}`;
const users = loadUsers();
async function tokenFor(u) {
  const r = await fetch(`https://127.0.0.1:${MOCK_PORT}/v1/accounts:signInWithPassword?key=x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: QA_PASSWORD }), dispatcher: undefined });
  return (await r.json()).idToken;
}
export { tokenFor, users, BASE };
if (process.argv[1].endsWith('api-probe.mjs')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const src = fs.readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
  const routes = [...src.matchAll(/app\.(get|post|put|patch|delete)\('(\/api\/[^']*)'/g)].map((m) => [m[1].toUpperCase(), m[2]]);
  const publicOk = /^\/api\/(public|version|time|health|capabilities)|\/webhook|password-reset\/(request|validate|used)|invitation\/preview|\/payments\//;
  const participant = users.find((u) => u.role === 'participant'); const judge = users.find((u) => u.role === 'judge'); const guardian = users.find((u) => u.role === 'guardian');
  const toks = { none: '', participant: await tokenFor(participant), judge: await tokenFor(judge), guardian: await tokenFor(guardian) };
  const bad = [];
  for (const [method, p] of routes) {
    if (publicOk.test(p)) continue;
    const url = BASE + p.replace(/:[A-Za-z]+/g, 'x');
    for (const [who, tok] of Object.entries(toks)) {
      try {
        const res = await fetch(url, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' });
        const status = res.status;
        const okRefusal = [401, 403, 404, 405, 400, 413, 423, 429].includes(status);
        // a staff-only route answering 400 for a participant is acceptable only if auth came first; flag 2xx and 5xx
        if (status >= 500 || (status >= 200 && status < 300)) bad.push(`${who.padEnd(11)} ${method} ${p} -> ${status}`);
        else if (!okRefusal) bad.push(`${who.padEnd(11)} ${method} ${p} -> ${status} (unexpected)`);
      } catch (e) { bad.push(`${who} ${method} ${p} -> ERR ${e.message}`); }
    }
  }
  console.log(`routes probed: ${routes.length}`); console.log(bad.length ? bad.join('\n') : 'no unexpected answers');
}
