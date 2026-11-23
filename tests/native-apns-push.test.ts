/**
 * تنبيهات iOS (APNs): المرسل بعميل HTTP/2 محاكًى (لا شبكة)، وتوكنات الأجهزة، وإرسال الإشعارات
 * الشخصية من مركز الإشعارات، والمسارات، وفتح الرابط عند اللمس. المفتاح يُولَّد عند التشغيل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { generateKeyPairSync, verify } from 'node:crypto';
import express from 'express';
import { APNS_PRODUCTION_ORIGIN, APNS_SANDBOX_ORIGIN, apnsConfigFromEnv, createApnsSender, type ApnsClientLike } from '../server/apns-push';
import { NativePushTokenStore, createNativePush, personalRecipients, pushUrlFor, registerNativePushRoutes } from '../server/native-push';
import { NotificationCenterRepository } from '../server/notification-center';
import { navigateToPushUrl, isNativePushAvailable } from '../src/lib/nativePush';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const P8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ENV = { APNS_KEY_P8: P8.replace(/\n/g, '\\n'), APNS_KEY_ID: 'KEYID12345', APNS_TEAM_ID: 'TEAMID1234', APNS_TOPIC: 'com.dralfailakawi.mizan' };
const T1 = 'ab'.repeat(32), T2 = 'cd'.repeat(32), T3 = 'ef'.repeat(32);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-apns-'));

type Call = { origin: string; headers: Record<string, string>; body: string };
function fakeApple(answer: (token: string) => { status: number; body?: string } | 'hang') {
  const calls: Call[] = [];
  const connect = (origin: string): ApnsClientLike => {
    const client = new EventEmitter() as any;
    client.request = (headers: Record<string, string>) => {
      const req = new EventEmitter() as any;
      const call: Call = { origin, headers, body: '' };
      calls.push(call);
      req.setEncoding = () => undefined;
      req.end = (body: string) => {
        call.body = body;
        const r = answer(String(headers[':path']).split('/').pop() || '');
        if (r === 'hang') return;
        setImmediate(() => { req.emit('response', { ':status': r.status }); if (r.body) req.emit('data', r.body); req.emit('end'); });
      };
      return req;
    };
    client.close = () => undefined;
    return client;
  };
  return { calls, connect };
}

test('missing env → silent no-op, no connection', async () => {
  assert.equal(apnsConfigFromEnv({}), null);
  assert.equal(apnsConfigFromEnv({ ...ENV, APNS_TEAM_ID: '' }), null);
  const apple = fakeApple(() => ({ status: 200 }));
  const s = createApnsSender({ env: () => ({}), connect: apple.connect });
  const r = await s.send(T1, { title: 't' });
  assert.equal(r.skipped, true); assert.equal(apple.calls.length, 0); assert.equal(s.configured(), false);
});

test('request: HTTP/2 headers, ES256 provider token, payload with url', async () => {
  const apple = fakeApple(() => ({ status: 200 }));
  const s = createApnsSender({ env: () => ENV, connect: apple.connect, now: () => 1_800_000_000_000 });
  const r = await s.send(T1.toUpperCase(), { title: 'عنوان', body: 'نص', url: '#identity?tab=x', tag: 'identity' }, { collapseId: 'n1' });
  assert.ok(r.ok);
  const c = apple.calls[0];
  assert.equal(c.origin, APNS_PRODUCTION_ORIGIN);
  assert.equal(c.headers[':path'], `/3/device/${T1}`);
  assert.equal(c.headers['apns-topic'], 'com.dralfailakawi.mizan');
  assert.equal(c.headers['apns-push-type'], 'alert');
  assert.equal(c.headers['apns-collapse-id'], 'n1');
  const [h, p, sig] = c.headers.authorization.replace('bearer ', '').split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'ES256', kid: 'KEYID12345' });
  assert.equal(JSON.parse(Buffer.from(p, 'base64url').toString()).iss, 'TEAMID1234');
  assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
  const body = JSON.parse(c.body);
  assert.equal(body.aps.alert.title, 'عنوان'); assert.equal(body.url, '#identity?tab=x');
  const sb = fakeApple(() => ({ status: 200 }));
  await createApnsSender({ env: () => ({ ...ENV, APNS_ENV: 'sandbox' }), connect: sb.connect }).send(T1, { title: 't' });
  assert.equal(sb.calls[0].origin, APNS_SANDBOX_ORIGIN);
});

test('dead tokens: 410 / BadDeviceToken / Unregistered are gone; 500 and timeout are not', async () => {
  const answers: Record<string, any> = { [T1]: { status: 410, body: '{"reason":"Unregistered"}' }, [T2]: { status: 400, body: '{"reason":"BadDeviceToken"}' }, [T3]: { status: 500, body: '{"reason":"InternalServerError"}' } };
  const apple = fakeApple(t => answers[t]);
  const s = createApnsSender({ env: () => ENV, connect: apple.connect });
  assert.equal((await s.send(T1, { title: 't' })).gone, true);
  assert.equal((await s.send(T2, { title: 't' })).gone, true);
  const r3 = await s.send(T3, { title: 't' }); assert.equal(r3.gone, false); assert.equal(r3.ok, false);
  const hang = createApnsSender({ env: () => ENV, connect: fakeApple(() => 'hang').connect, timeoutMs: 20 });
  const r4 = await hang.send(T1, { title: 't' }); assert.equal(r4.error, 'timeout'); assert.equal(r4.gone, false);
});

test('notification center → personal notifications pushed to the user devices; dead token dropped', async () => {
  const dir = tmp();
  const center = new NotificationCenterRepository(dir);
  const store = new NativePushTokenStore(dir);
  store.register('u1', T1); store.register('u1', T2); store.register('u2', T3);
  const apple = fakeApple(t => t === T2 ? { status: 410, body: '{"reason":"Unregistered"}' } : { status: 200 });
  const push = createNativePush(store, createApnsSender({ env: () => ENV, connect: apple.connect }), () => undefined);
  const done: Promise<any>[] = [];
  center.onPublished(n => { done.push(push.deliver(n)); });
  center.system({ title: 'تم تفعيل دخولك', body: 'جاهز', category: 'identity', target: { type: 'user', userId: 'u1' }, actionHref: '#', dedupeKey: 'k1' });
  center.system({ title: 'مكرر', body: 'x', target: { type: 'user', userId: 'u1' }, dedupeKey: 'k1' }); // deduplicated → no push
  center.system({ title: 'للجهة', body: 'x', target: { type: 'organization', organizationId: 'o1' } }); // not personal
  const reports = await Promise.all(done);
  assert.equal(reports.length, 2);
  assert.deepEqual(reports[0], { sent: 1, failed: 0, removed: 1 });
  assert.deepEqual(reports[1], { sent: 0, failed: 0, removed: 0 });
  assert.deepEqual(store.tokensFor('u1'), [T1]);
  assert.equal(apple.calls.length, 2);
  assert.ok(apple.calls.every(c => c.headers[':path'] !== `/3/device/${T3}`));
});

test('no APNs env → deliver is a no-op and tokens are kept', async () => {
  const dir = tmp(); const store = new NativePushTokenStore(dir); store.register('u1', T1);
  const apple = fakeApple(() => ({ status: 410 }));
  const push = createNativePush(store, createApnsSender({ env: () => ({}), connect: apple.connect }));
  const r = await push.deliver({ id: 'n', title: 't', body: 'b', category: 'admin', priority: 'normal', target: { type: 'users', userIds: ['u1'] }, createdBy: 'x', createdByRole: 'x', createdAt: '' });
  assert.deepEqual(r, { sent: 0, failed: 0, removed: 0 }); assert.equal(apple.calls.length, 0); assert.deepEqual(store.tokensFor('u1'), [T1]);
});

test('recipients and url helpers', () => {
  assert.deepEqual(personalRecipients({ target: { type: 'users', userIds: ['a', 'b', 'a'] } }), ['a', 'b']);
  assert.deepEqual(personalRecipients({ target: { type: 'role', role: 'judge' } }), []);
  assert.equal(pushUrlFor({ actionHref: '#identity?tab=1' }), '#identity?tab=1');
  assert.equal(pushUrlFor({ actionHref: 'https://evil.example' }), '#');
  assert.equal(pushUrlFor({ actionHref: '//evil.example' }), '#');
});

test('routes: subscribe/unsubscribe for the signed-in user; bad token rejected', async () => {
  const dir = tmp(); const store = new NativePushTokenStore(dir);
  const app = express(); app.use(express.json());
  registerNativePushRoutes(app, { requireUser: (req: any, _res, next) => { req.mizanIdentity = { uid: 'u9' }; next(); }, store: () => store });
  const server = app.listen(0); const port = (server.address() as any).port;
  const post = (p: string, body: unknown) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/api/push/subscribe-native', { token: 'nope' })).status, 400);
    assert.equal((await post('/api/push/subscribe-native', { token: T1 })).status, 200);
    assert.deepEqual(store.tokensFor('u9'), [T1]);
    assert.equal((await post('/api/push/unsubscribe-native', { token: T1 })).status, 200);
    assert.deepEqual(store.tokensFor('u9'), []);
  } finally { server.close(); }
});

test('tap opens the target inside the app; external links ignored; web has no native push', () => {
  const loc = { hash: '', assigned: '', assign(u: string) { this.assigned = u; } };
  assert.ok(navigateToPushUrl('#identity?tab=passwords', loc)); assert.equal(loc.hash, 'identity?tab=passwords');
  assert.ok(navigateToPushUrl('/verify', loc)); assert.equal(loc.assigned, '/verify');
  assert.equal(navigateToPushUrl('https://evil.example', loc), false);
  assert.equal(navigateToPushUrl('//evil.example', loc), false);
  assert.equal(isNativePushAvailable(), false);
});

test('switch is native-only and wired into the notification center; shell has APNs plumbing', () => {
  const sw = fs.readFileSync('src/components/layout/NativePushSwitch.tsx', 'utf8');
  assert.match(sw, /if \(!visible\) return null;/);
  assert.match(sw, /'فعّل التنبيهات'/);
  assert.match(sw, /role="switch"/);
  assert.match(fs.readFileSync('src/components/layout/NotificationCenter.tsx', 'utf8'), /<NativePushSwitch api=\{api\} ar=\{ar\}\/>/);
  assert.match(fs.readFileSync('src/App.tsx', 'utf8'), /installNativePushNavigation\(\)/);
  assert.match(fs.readFileSync('apple/ios/App/App/App.entitlements', 'utf8'), /<key>aps-environment<\/key>\s*<string>production<\/string>/);
  assert.match(fs.readFileSync('apple/ios/App/App/Info.plist', 'utf8'), /<string>remote-notification<\/string>/);
  assert.match(fs.readFileSync('apple/ios/App/App/AppDelegate.swift', 'utf8'), /capacitorDidRegisterForRemoteNotifications/);
  assert.match(fs.readFileSync('apple/ios/App/CapApp-SPM/Package.swift', 'utf8'), /CapacitorPushNotifications/);
  assert.match(fs.readFileSync('apple/ios/App/App.xcodeproj/project.pbxproj', 'utf8'), /CODE_SIGN_ENTITLEMENTS = App\/App.entitlements;/);
});
