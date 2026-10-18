// Cross-tenant / cross-role probes with real tokens. Each case states the expectation; failures are printed.
// Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/qa/tenant-probe.mjs
import { tokenFor, users, BASE } from './api-probe.mjs';
const by = (role, orgIdx = 0, n = 0) => { const orgs = [...new Set(users.filter((u) => u.role === role && u.orgId).map((u) => u.orgId))]; return users.filter((u) => u.role === role && u.orgId === orgs[orgIdx])[n]; };
const call = async (u, method, path, body) => { const tok = await tokenFor(u); const r = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
const results = []; const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  <- ' + detail}`); };

const orgA = by('org_admin', 0), orgB = by('org_admin', 1);
const compB = users.find((u) => u.role === 'comp_admin' && u.orgId === orgB.orgId);
const judgeA = by('judge', 0), partA = by('participant', 0);
const judgeB = by('judge', 1);

// 1. governance listing is tenant-scoped
let r = await call(orgA, 'GET', `/api/identity/governance?organizationId=${orgB.orgId}`);
const foreign = JSON.stringify(r.body || {}).includes(orgB.orgId) && (r.body?.accounts || []).some((a) => a.organizationId === orgB.orgId);
check('org admin cannot list another organisation\'s accounts', !foreign, `status ${r.status}`);
// 2. suspend a foreign account
const acc = (await call(orgB, 'GET', '/api/identity/governance')).body?.accounts?.[0];
if (acc) { r = await call(orgA, 'POST', `/api/identity/accounts/${acc.id}/suspend`, { reason: 'probe' }); check('org admin cannot suspend a foreign account', r.status >= 400, JSON.stringify(r)); }
// 3. invite into a foreign org
r = await call(orgA, 'POST', '/api/identity/invitations', { email: 'x@probe.test', displayName: 'Probe', requestedRole: 'judge', organizationId: orgB.orgId, reason: 'probe probe' });
check('invitation into a foreign organisation is refused or re-scoped to the actor\'s own', r.status >= 400 || r.body?.organizationId === orgA.orgId, JSON.stringify(r).slice(0, 200));
// 4. publish a competition under another org's id
const compIdB = compB.competitionId;
r = await call(orgA, 'POST', `/api/public/competitions/${compIdB}/publish`, { organizationId: orgA.orgId, competition: { id: compIdB, organizationId: orgA.orgId, name: 'hijack', categories: [{ id: 'x' }], status: 'registration_open' } });
check('publish on a competition id owned by another organisation is refused', r.status >= 400, JSON.stringify(r).slice(0, 200));
// 5. delete a foreign competition
r = await call(orgA, 'DELETE', `/api/competitions/${compIdB}`, { organizationId: orgA.orgId });
const still = await fetch(`${BASE}/api/public/competitions/${compIdB}`);
check('deleting a foreign competition id does not erase its public record', still.status === 200, `public status ${still.status}`);
// 6. judge hitting admin/identity endpoints
for (const [m, p] of [['GET', '/api/identity/governance'], ['POST', '/api/identity/invitations'], ['GET', '/api/audit/ledger'], ['GET', '/api/saas/organization'], ['POST', '/api/saas/owner/operators'], ['GET', '/api/owner/telemetry']]) {
  r = await call(judgeA, m, p, m === 'POST' ? {} : undefined); check(`judge denied ${m} ${p}`, r.status === 401 || r.status === 403, String(r.status));
}
// 7. participant calling saas / notifications of others
r = await call(partA, 'GET', '/api/notifications'); check('participant notifications call is scoped (200 own)', r.status === 200, String(r.status));
// 8. comp_admin of org B cannot act on org A's identity
const accA = (await call(orgA, 'GET', '/api/identity/governance')).body?.accounts?.[0];
if (accA) { r = await call(compB, 'POST', `/api/identity/accounts/${accA.id}/suspend`, { reason: 'probe' }); check('comp admin cannot suspend an account of another organisation', r.status >= 400, JSON.stringify(r)); }
// 9. billing admin cannot touch storage, storage admin cannot touch billing
const bill = by('billing_admin', 0), stor = by('storage_admin', 0);
r = await call(bill, 'POST', '/api/saas/organization/storage', { provider: 'amazon_s3', container: 'x', secret: { a: 'b' } }); check('billing admin cannot configure storage', r.status === 403 || r.status === 401, String(r.status));
r = await call(stor, 'POST', '/api/saas/usage/participants', { organizationId: stor.orgId, competitionId: 'x', participantId: 'y' }); check('storage admin metering call handled (no 5xx)', r.status < 500, String(r.status));
// 10. org A requesting org B's saas organisation view
r = await call(orgA, 'GET', `/api/saas/organization?organizationId=${orgB.orgId}`);
check('org admin cannot read another organisation\'s commercial record', !JSON.stringify(r.body || {}).includes(orgB.orgId) || r.status >= 400, JSON.stringify(r).slice(0, 160));
// 11. invalid / expired / forged tokens
for (const [label, tok] of [['garbage', 'abc.def.ghi'], ['empty bearer', ''], ['alg none', Buffer.from('{"alg":"none"}').toString('base64url') + '.' + Buffer.from('{"sub":"x","aud":"mizan-qa"}').toString('base64url') + '.']]) {
  const rr = await fetch(BASE + '/api/identity/me', { headers: { authorization: `Bearer ${tok}` } }); check(`forged token (${label}) is rejected`, rr.status === 401, String(rr.status));
}
const t = await tokenFor(orgA); const [h, p, s] = t.split('.'); const forged = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), role: 'super_admin', org_id: '__platform__' })).toString('base64url')}.${s}`;
const rr2 = await fetch(BASE + '/api/owner/telemetry', { headers: { authorization: `Bearer ${forged}` } }); check('payload-tampered token (role escalated) is rejected', rr2.status === 401, String(rr2.status));
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`);
