import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sendHeartbeat } from '../src/lib/ops-heartbeat';

/*
 * الوصلة الناقصة بين تعثّر المستخدم وعلم المالك. نقطة الاستقبال على الخادم كانت موجودة ولوحة
 * المالك تقرأ منها، ولا شيء في المتصفح يرسل إليها: الخطأ يُعرض للمتأثّر ثم يموت عنده. هذه
 * الاختبارات تحرس العقد الذي لا يُرى في الشاشة — أنه يرسل، وأنه لا يؤذي حين لا يستطيع.
 */

const jsonFetch = (status: number, seen: { body?: any; headers?: any } = {}) =>
  (async (_url: string, init: any) => { seen.body = JSON.parse(String(init.body)); seen.headers = init.headers; return new Response('{}', { status }) }) as any;

test('a degraded session reaches the owner with its fault code and nothing more', async () => {
  const seen: { body?: any } = {};
  const outcome = await sendHeartbeat(
    { subjectId: 'u1', competitionId: 'c1', role: 'judge', name: 'محكّم', status: 'DEGRADED', meta: { errorCode: 'CLOUD_WRITE_FAILED' } },
    { token: async () => 't', fetcher: jsonFetch(202, seen) },
  );
  assert.equal(outcome, 'SENT');
  assert.equal(seen.body.status, 'DEGRADED');
  assert.equal(seen.body.meta.errorCode, 'CLOUD_WRITE_FAILED');
  // لا اسم متسابق ولا درجة ولا هوية: النبضة تقول «تعثّر هنا»، لا ماذا كان يُقيَّم.
  assert.deepEqual(Object.keys(seen.body.meta), ['errorCode']);
});

test('an unconfigured telemetry backend stops the beat instead of retrying forever', async () => {
  for (const status of [503, 501]) {
    assert.equal(
      await sendHeartbeat({ subjectId: 'u1', status: 'ONLINE' }, { token: async () => 't', fetcher: jsonFetch(status) }),
      'NOT_CONFIGURED',
      'a missing backend is not a fault to keep hammering',
    );
  }
});

test('the beat never becomes the failure it reports', async () => {
  // نبضة فاشلة أهون من شاشة معطّلة: كل تعثّر هنا يُبتلع ولا يُرمى إلى الواجهة.
  const thrown = await sendHeartbeat({ subjectId: 'u1', status: 'ONLINE' }, { token: async () => 't', fetcher: (async () => { throw new Error('offline') }) as any });
  assert.equal(thrown, 'SKIPPED');
  const tokenFailed = await sendHeartbeat({ subjectId: 'u1', status: 'ONLINE' }, { token: async () => { throw new Error('no token') }, fetcher: jsonFetch(202) });
  assert.equal(tokenFailed, 'SKIPPED');
  const anonymous = await sendHeartbeat({ subjectId: 'u1', status: 'ONLINE' }, { token: async () => undefined, fetcher: jsonFetch(202) });
  assert.equal(anonymous, 'SKIPPED', 'an unauthenticated visitor is never reported as a subject');
  const noSubject = await sendHeartbeat({ subjectId: '', status: 'ONLINE' }, { token: async () => 't', fetcher: jsonFetch(202) });
  assert.equal(noSubject, 'SKIPPED');
});

test('the client posts to the route the server actually serves', () => {
  const client = fs.readFileSync('src/lib/ops-heartbeat.ts', 'utf8');
  const server = fs.readFileSync('server.ts', 'utf8');
  const route = /fetcher\('([^']+)'/.exec(client)?.[1];
  assert.ok(route, 'the heartbeat must name a route');
  assert.ok(server.includes(`app.post('${route}'`), `server.ts must serve ${route}`);
});

test('the application wires the beat, or the owner learns nothing', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /useOpsHeartbeat\(/, 'a heartbeat nobody calls is the same silence it was written to end');
  assert.match(app, /errorCode:\s*activePersistenceError\?\.code/, 'the fault the user sees must be the fault the owner is told');
});
