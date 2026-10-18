// Free, local concurrent-clients simulation. ~N devices behind ONE IP (this machine) hit the realistic endpoints for D seconds.
// Staff devices are authenticated (distinct users); participants/guardians use their public journey links (anonymous).
// Usage: node scripts/qa/load-sim.mjs [staffClients=400] [anonClients=300] [seconds=60]
import fs from 'node:fs';
import { loadUsers, BASE } from './browser.mjs';
import { QA_PASSWORD, QA_DIR, mockPost } from './common.mjs';
import path from 'node:path';

const STAFF = Number(process.argv[2] || 400), ANON = Number(process.argv[3] || 300), SECONDS = Number(process.argv[4] || 60);
const users = loadUsers().filter((u) => ['judge', 'head_judge', 'ops_manager', 'exception_host', 'delegation_manager', 'comp_admin', 'broadcast_operator'].includes(u.role)).slice(0, STAFF);
const journeys = JSON.parse(fs.readFileSync(path.join(QA_DIR, 'journeys.json'), 'utf8'));
const lat = [], codes = new Map(), perKind = new Map();
const rec = (kind, ms, status) => { lat.push(ms); codes.set(status, (codes.get(status) || 0) + 1); const k = perKind.get(kind) || { n: 0, ms: [], bad: 0 }; k.n++; k.ms.push(ms); if (status >= 400) k.bad++; perKind.set(kind, k); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (kind, method, url, tok, body) => {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    await r.arrayBuffer(); rec(kind, performance.now() - t0, r.status);
  } catch { rec(kind, performance.now() - t0, 0); }
};
const rss = () => { try { const pid = fs.readFileSync(path.join(QA_DIR, 'pids', 'app'), 'utf8').trim(); const m = /VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8')); return m ? Math.round(Number(m[1]) / 1024) : 0; } catch { return 0; } };

console.log(`signing in ${users.length} staff devices...`);
const toks = [];
for (let i = 0; i < users.length; i += 40) await Promise.all(users.slice(i, i + 40).map(async (u) => { try { const r = await (await mockPost('/v1/accounts:signInWithPassword?key=x', { email: u.email, password: QA_PASSWORD })).json(); if (r.idToken) toks.push(r.idToken); } catch {} }));
console.log(`tokens: ${toks.length}`);
const rssBefore = rss(); let rssPeak = rssBefore;
const end = Date.now() + SECONDS * 1000;
const sampler = setInterval(() => { rssPeak = Math.max(rssPeak, rss()); }, 1000);
const staff = (tok, i) => (async () => { await sleep(Math.random() * 3000); while (Date.now() < end) { await call('staff:me', 'GET', '/api/identity/me', tok); await sleep(800 + Math.random() * 1500); await call('staff:notifications', 'GET', '/api/notifications', tok); await sleep(800 + Math.random() * 1500); if (i % 5 === 0) await call('staff:heartbeat', 'POST', '/api/telemetry/heartbeat', tok, { surface: 'judge' }); await sleep(1000 + Math.random() * 2000); } })();
const anon = (j) => (async () => { await sleep(Math.random() * 3000); while (Date.now() < end) { await call('anon:journey', 'POST', '/api/public/journeys/resolve', '', { competitionId: j.competitionId, audience: 'participant', key: j.journeyToken }); await sleep(10000 + Math.random() * 20000); await call('anon:competition', 'GET', `/api/public/competitions/${j.competitionId}`, ''); await sleep(10000 + Math.random() * 20000); } })();
const jobs = toks.map(staff);
for (let i = 0; i < ANON; i++) jobs.push(anon(journeys[i % journeys.length]));
const t0 = Date.now(); await Promise.all(jobs); clearInterval(sampler);
const total = lat.length;
console.log(`\ndevices: ${toks.length} authenticated staff + ${ANON} anonymous journey clients, all behind one IP, ${SECONDS}s`);
console.log(`requests: ${total} (${Math.round(total / ((Date.now() - t0) / 1000))}/s)   p50=${pct(lat, .5).toFixed(1)}ms p95=${pct(lat, .95).toFixed(1)}ms p99=${pct(lat, .99).toFixed(1)}ms max=${Math.max(...lat).toFixed(0)}ms`);
console.log('status codes:', Object.fromEntries([...codes].sort()));
for (const [k, v] of perKind) console.log(`  ${k.padEnd(22)} n=${String(v.n).padStart(5)} p50=${pct(v.ms, .5).toFixed(1)}ms p95=${pct(v.ms, .95).toFixed(1)}ms errors>=400: ${v.bad}`);
console.log(`server RSS: ${rssBefore} MB -> peak ${rssPeak} MB`);
