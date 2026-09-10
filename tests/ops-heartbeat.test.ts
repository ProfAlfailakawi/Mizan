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

test('a rejected role is not hammered once a minute forever', async () => {
  /*
   * كان المسار يعدّد أدواره بخط اليد فسقطت منه خمسة أدوار حقيقية لها شاشات؛ جلساتها تُرفض
   * 403 كل دقيقة ولا تصل اللوحة أبدًا. الإصلاح من طرفين: قائمة أدوار واحدة على الخادم،
   * ورفضٌ لا يُعاد طرقه على العميل.
   */
  for (const status of [401, 403]) {
    assert.equal(
      await sendHeartbeat({ subjectId: 'u1', status: 'ONLINE' }, { token: async () => 't', fetcher: (async () => new Response('{}', { status })) as any }),
      'NOT_CONFIGURED',
      'a refusal never turns into acceptance by repetition',
    );
  }
});

test('the heartbeat route admits every active role, from one list', () => {
  const governance = fs.readFileSync('server/identity-governance.ts', 'utf8');
  const server = fs.readFileSync('server.ts', 'utf8');
  const union = /export type GovernanceRole=([\s\S]*?);/.exec(governance)?.[1] || '';
  const canonical = /export const ALL_GOVERNANCE_ROLES:GovernanceRole\[\]=\[([\s\S]*?)\];/.exec(governance)?.[1] || '';
  const names = (src: string) => new Set(Array.from(src.matchAll(/'([a-z_]+)'/g), m => m[1]));
  assert.deepEqual([...names(union)].sort(), [...names(canonical)].sort(), 'the canonical list must cover the whole role union');
  assert.match(server, /app\.post\('\/api\/telemetry\/heartbeat',[^)]*requireGovernanceRoles\(ALL_GOVERNANCE_ROLES\)/,
    'a hand-written copy of the role list is how five real roles were dropped');
});

test('an operator-chosen offline session still reports itself', () => {
  // isOffline وضعُ قاعةٍ يختاره المشغّل، لا انقطاعُ شبكةٍ يقيسه المتصفح: حجبُ النبضة عنده
  // كان يمنع الحالة الوحيدة التي من أجلها وُجدت.
  const src = fs.readFileSync('src/lib/ops-heartbeat.ts', 'utf8');
  assert.doesNotMatch(src, /if \(subject\.isOffline\) return;/, 'OFFLINE must be able to leave the browser');
  assert.match(src, /subject\.isOffline \? 'OFFLINE'/, 'and it must still be computed');
});

test('the server reports its own public-registration outages, and only those', () => {
  /* زائر التسجيل غير مسجَّل الدخول عمدًا فلا نبضة من متصفحه؛ والخادم يُبلّغ عن أعطاله هو. */
  const server = fs.readFileSync('server.ts', 'utf8');
  const reporter = /const reportPublicFailure=\(([\s\S]*?)\n  \};/.exec(server)?.[1] || '';
  assert.ok(reporter, 'the public failure reporter must exist');
  assert.match(reporter, /status<500/, 'a wrong email is the applicant’s to fix, not an outage to wake the owner');
  assert.doesNotMatch(reporter, /req\.body|email|phone|name/, 'the report carries a fault code and a scope, never personal data');
  assert.match(server, /catch\(err\)\{reportPublicFailure\(/, 'the register route must route its failures through it');
});

test('the busiest write in the product has a ceiling', () => {
  /*
   * كل جلسة مفتوحة تطرق هذه النقطة مرة كل دقيقة، فهي أكثر كتابةٍ تكرارًا في المنتج وأوسع
   * باب للإغراق إن تُركت بلا سقف. والسقف واسع عمدًا: قاعةٌ خلف عنوان واحد قد تحمل عشرات
   * الأجهزة، فيمنع الإغراق ولا يمسّ تشغيلًا حقيقيًا.
   */
  const server = fs.readFileSync('server.ts', 'utf8');
  assert.match(server, /app\.post\('\/api\/telemetry\/heartbeat',telemetryHeartbeatRateLimit,/,
    'the heartbeat route must be rate limited ahead of its authorization');
  assert.match(server, /const telemetryHeartbeatRateLimit:RequestHandler=rateLimit\(/,
    'and by a real limiter, not a pass-through');
});

test('one role list, not three', () => {
  const server = fs.readFileSync('server.ts', 'utf8');
  assert.match(server, /const governanceRoles=new Set<string>\(ALL_GOVERNANCE_ROLES\)/,
    'a second hand-written copy is a second chance to drop a role');
});
