// New-hire journey over the real API: org admin invites -> person signs up (mock Google) -> activates -> gets claims -> /me.
import { tokenFor, users, BASE } from './api-probe.mjs';
import { mockPost, QA_PASSWORD } from './common.mjs';
const org = users.find((u) => u.role === 'org_admin');
const adminTok = await tokenFor(org);
const J = async (method, path, tok, body) => { const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
const email = `new.judge.${Date.now()}@example.com`;
let r = await J('POST', '/api/identity/invitations', adminTok, { email, displayName: 'محكم جديد', requestedRole: 'judge', organizationId: org.orgId, competitionId: users.find((u) => u.role === 'comp_admin' && u.orgId === org.orgId).competitionId, reason: 'اختبار رحلة التفعيل' });
console.log('invite', r.s, Object.keys(r.j || {}));
const inv = r.j?.invitation || r.j;
console.log('invitation status', inv?.status, 'token?', !!(r.j?.activationToken || inv?.activationToken));
// approve if needed
if (inv?.status === 'PENDING_APPROVAL') { r = await J('POST', `/api/identity/invitations/${inv.id}/approve`, adminTok, {}); console.log('approve', r.s, JSON.stringify(r.j).slice(0, 200)); }
const token = r.j?.activationToken || r.j?.invitation?.activationToken || inv?.activationToken;
console.log('token present', !!token);
// the invited person signs up
const su = await mockPost('/v1/accounts:signUp?key=x', { email, password: QA_PASSWORD + '-new', returnSecureToken: true }); const sj = await su.json();
console.log('signup', su.status, !!sj.idToken);
const tok1 = sj.idToken;
console.log('me before activation', (await J('GET', '/api/identity/me', tok1)).s);
if (token) {
  const act = await J('POST', '/api/identity/activate', tok1, { activationToken: token }); console.log('activate', act.s, JSON.stringify(act.j).slice(0, 200));
  // refreshed token should now carry claims
  const rr = await mockPost('/v1/token?key=x', `grant_type=refresh_token&refresh_token=${sj.refreshToken}`, 'application/x-www-form-urlencoded'); const tj = await rr.json();
  const claims = JSON.parse(Buffer.from(tj.id_token.split('.')[1], 'base64url'));
  console.log('claims after activation', { role: claims.role, org_id: claims.org_id, competition_id: claims.competition_id });
  console.log('me after activation', JSON.stringify((await J('GET', '/api/identity/me', tj.id_token)).j?.identity));
  const reuse = await J('POST', '/api/identity/activate', tj.id_token, { activationToken: token }); console.log('token reuse refused', reuse.s);
}
