import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { DemoSandboxRegistry, createDemoGate, createDemoRoutes, isDemoPassthrough, DEMO_HEADER } from '../server/demo-sandbox';

/*
 * يثبت أن طلبًا يحمل معرّف صندوقٍ تجريبي لا يقرأ ولا يكتب «المخزن الحقيقي».
 * المخزن هنا مسجِّلٌ يعدّ كل لمسة؛ والمسارات المركّبة بعد الجدار هي ما يمثل مسارات server.ts.
 */
async function boot(opts: { enabled?: () => boolean; reg?: DemoSandboxRegistry } = {}) {
  const reg = opts.reg ?? new DemoSandboxRegistry();
  const enabled = opts.enabled ?? (() => true);
  const realStore = { reads: 0, writes: 0, data: { secret: 'REAL-TENANT-DATA' } };
  const app = express();
  app.set('trust proxy', 1);
  const routes = createDemoRoutes(reg, enabled);
  app.use('/api', createDemoGate(reg, enabled));
  app.post('/api/demo/enter', routes.enter);
  app.post('/api/demo/reset', routes.reset);
  app.get('/api/demo/config', routes.config);
  app.use(express.json());
  app.get('/api/health', (_q, r) => r.json({ status: 'ok' }));
  app.get('/api/identity/me', (_q, r) => { realStore.reads++; r.json(realStore.data); });
  app.get('/api/public/competitions/latest', (_q, r) => { realStore.reads++; r.json(realStore.data); });
  app.post('/api/audit/events', (_q, r) => { realStore.writes++; r.json({ ok: true }); });
  app.post('/api/results/seal', (_q, r) => { realStore.writes++; r.json({ ok: true }); });
  app.post('/api/ai/anything', (_q, r) => { realStore.writes++; r.json({ ok: true }); });
  const server = http.createServer(app);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const enter = async () => (await (await fetch(`${base}/api/demo/enter`, { method: 'POST' })).json()).sessionId as string;
  return { base, reg, realStore, enter, close: () => new Promise<void>((ok) => server.close(() => ok())) };
}

test('a demo request can neither read nor write the real store', async () => {
  const s = await boot();
  try {
    const id = await s.enter();
    assert.match(id, /^demo_[0-9a-f]{64}$/);
    const h = { [DEMO_HEADER]: id, 'content-type': 'application/json' };
    for (const [m, p] of [['GET', '/api/identity/me'], ['GET', '/api/public/competitions/latest'], ['POST', '/api/audit/events'], ['POST', '/api/results/seal'], ['POST', '/api/ai/anything'], ['GET', '/api/unknown/future-route']] as const) {
      const r = await fetch(s.base + p, { method: m, headers: h, body: m === 'POST' ? '{}' : undefined });
      assert.equal(r.status, 403, `${m} ${p}`);
      assert.equal((await r.json()).code, 'DEMO_SANDBOX_ISOLATED');
    }
    assert.equal(s.realStore.reads, 0, 'no read reached the real store');
    assert.equal(s.realStore.writes, 0, 'no write reached the real store');
    // ما يمرّ: قراءات لا تمسّ بيانات جهة.
    assert.equal((await fetch(`${s.base}/api/health`, { headers: h })).status, 200);
    // وبلا ترويسة يعمل الخادم كما كان (لا أثر على المستخدم الحقيقي).
    assert.equal((await fetch(`${s.base}/api/identity/me`)).status, 200);
    assert.equal(s.realStore.reads, 1);
  } finally { await s.close(); }
});

test('forged, malformed, unknown and expired ids never fall through to the real store', async () => {
  let t = 0;
  const reg = new DemoSandboxRegistry({ ttlMs: 1000, maxSandboxes: 5, enterPerIpPerMin: 50, maxRequests: 100 }, () => t);
  const s = await boot({ reg });
  try {
    const bad = ['x', 'demo_', `demo_${'g'.repeat(64)}`, `demo_${'a'.repeat(63)}`];
    for (const v of bad) assert.equal((await fetch(`${s.base}/api/identity/me`, { headers: { [DEMO_HEADER]: v } })).status, 403, v);
    const forged = `demo_${'a'.repeat(64)}`;
    assert.equal((await fetch(`${s.base}/api/identity/me`, { headers: { [DEMO_HEADER]: forged } })).status, 410);
    const id = await s.enter();
    t = 5000; // انتهت المهلة
    const r = await fetch(`${s.base}/api/identity/me`, { headers: { [DEMO_HEADER]: id } });
    assert.equal(r.status, 410);
    assert.equal(s.realStore.reads, 0);
  } finally { await s.close(); }
});

test('kill switch: entry is 404 and an existing id is refused', async () => {
  let on = true;
  const s = await boot({ enabled: () => on });
  try {
    const id = await s.enter();
    on = false;
    assert.equal((await fetch(`${s.base}/api/demo/enter`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${s.base}/api/health`, { headers: { [DEMO_HEADER]: id } })).status, 403);
    assert.equal(s.realStore.reads, 0);
  } finally { await s.close(); }
});

test('sandbox cap, per-IP entry rate limit and per-sandbox request budget', async () => {
  const reg = new DemoSandboxRegistry({ ttlMs: 60000, maxSandboxes: 2, enterPerIpPerMin: 3, maxRequests: 3 });
  assert.equal(reg.create('1.1.1.1').ok, true);
  assert.equal(reg.create('1.1.1.1').ok, true);
  const capped = reg.create('1.1.1.1');
  assert.deepEqual(capped.ok ? null : capped.reason, 'CAPACITY');
  const reg2 = new DemoSandboxRegistry({ ttlMs: 60000, maxSandboxes: 100, enterPerIpPerMin: 2, maxRequests: 3 });
  reg2.create('2.2.2.2'); reg2.create('2.2.2.2');
  const limited = reg2.create('2.2.2.2');
  assert.deepEqual(limited.ok ? null : limited.reason, 'RATE_LIMITED');
  assert.equal(reg2.create('3.3.3.3').ok, true, 'another IP is unaffected');
  const made = reg2.create('4.4.4.4'); assert.ok(made.ok);
  if (made.ok) {
    assert.equal(reg2.touch(made.id), 'OK'); assert.equal(reg2.touch(made.id), 'OK'); assert.equal(reg2.touch(made.id), 'OK');
    assert.equal(reg2.touch(made.id), 'BUDGET');
    assert.equal(reg2.reset(made.id), true);
    assert.equal(reg2.touch(made.id), 'OK');
  }
});

test('reset route extends a live sandbox and refuses an unknown one', async () => {
  const s = await boot();
  try {
    const id = await s.enter();
    assert.equal((await fetch(`${s.base}/api/demo/reset`, { method: 'POST', headers: { [DEMO_HEADER]: id } })).status, 200);
    assert.equal((await fetch(`${s.base}/api/demo/reset`, { method: 'POST', headers: { [DEMO_HEADER]: `demo_${'b'.repeat(64)}` } })).status, 410);
  } finally { await s.close(); }
});

test('pass-through list is read-only and tenant-free', () => {
  assert.equal(isDemoPassthrough('GET', '/api/health'), true);
  assert.equal(isDemoPassthrough('POST', '/api/health'), false);
  assert.equal(isDemoPassthrough('GET', '/api/public/kfgqpc/mushaf-layout/1'), true);
  for (const p of ['/api/identity/me', '/api/public/competitions/x', '/api/public/brand', '/api/saas/events', '/api/owner/control-tower', '/api/audit/events']) assert.equal(isDemoPassthrough('GET', p), false, p);
});
