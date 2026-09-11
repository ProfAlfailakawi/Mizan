import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import rateLimit from 'express-rate-limit';

/*
 * تدقيق النطاق قراءةٌ مصرَّح بها، والمفتاح المؤسسي يقول «من أنت» لا «كم مرة». ومفتاحٌ مسرَّب
 * أو نصٌّ آلي معطوب يستنزف الخادم بآلاف الطلبات ما لم يكن للمسار حدٌّ معلن. رصد CodeQL هذا
 * الطريق حين أُضيف، وهذا الاختبار يمنع عودته.
 */

const server = fs.readFileSync('server.ts', 'utf8');

test('the scope-verification endpoint declares its own rate limit before its authorization', () => {
  const route = server.match(/app\.get\('\/api\/enterprise\/question-runtime\/:sessionId\/scope-verification'[^)]*?,\s*([^,]+),\s*requireEnterpriseKey/);
  assert.ok(route, 'the audit route must exist');
  assert.equal(route![1].trim(), 'enterpriseAuditRateLimit', 'the limiter runs before the key check, so a wrong key costs quota too');
  assert.match(server, /const enterpriseAuditRateLimit:RequestHandler=rateLimit\(\{/, 'the limiter is a real express-rate-limit handler, not a hand-rolled counter');
  assert.match(server, /MIZAN_ENTERPRISE_AUDIT_RATE_LIMIT_MAX/, 'its ceiling is configurable per deployment');
  assert.match(server, /skip:\(\)=>rateLimiterIsGlobal/, 'an external rate-limit backend skips it rather than removing it from the route');
});

test('the configured ceiling is documented for whoever deploys this', () => {
  assert.match(fs.readFileSync('.env.example', 'utf8'), /MIZAN_ENTERPRISE_AUDIT_RATE_LIMIT_MAX=/);
});

test('the limiter really refuses the request past its ceiling', async () => {
  /* التحقق بالتشغيل لا بالقراءة: ثلاث طلبات مسموحة ثم رفض بـ429 ورمز RATE_LIMITED. */
  const app = express();
  const limiter = rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: 'draft-7', legacyHeaders: false, message: { code: 'RATE_LIMITED' }, skip: () => false });
  app.get('/audit', limiter, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch(`http://127.0.0.1:${port}/audit`)).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429], 'the fourth request in the window is refused');
    const refused = await fetch(`http://127.0.0.1:${port}/audit`);
    assert.equal((await refused.json() as { code?: string }).code, 'RATE_LIMITED', 'and it says why, in the code the rest of the API uses');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('an external rate-limit backend skips the counter without dropping the middleware', async () => {
  const app = express();
  const limiter = rateLimit({ windowMs: 60_000, limit: 1, message: { code: 'RATE_LIMITED' }, skip: () => true });
  app.get('/audit', limiter, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    for (let i = 0; i < 4; i++) assert.equal((await fetch(`http://127.0.0.1:${port}/audit`)).status, 200, 'the external backend owns the ceiling, so nothing is refused here');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
