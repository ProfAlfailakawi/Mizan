/**
 * تنبيهات تطبيق iOS الأصلي (APNs)، على نمط schedule-kw.
 *
 * داخل قشرة iOS لا يوجد Web Push، فيسجّل التطبيق جهازه لدى Apple ويحصل على توكن (hex)، ويحفظه
 * الخادم ويرسل إليه عبر HTTP/2 بمفتاح .p8 يُقرأ من البيئة وحدها:
 *
 *   APNS_KEY_P8   محتوى المفتاح (يقبل \n بدل الأسطر)
 *   APNS_KEY_ID   معرّف المفتاح
 *   APNS_TEAM_ID  معرّف الفريق
 *   APNS_TOPIC    معرّف حزمة التطبيق (com.dralfailakawi.mizan)
 *   APNS_ENV      اختياري: sandbox لبناء المطوّر، وغيره production (TestFlight وApp Store)
 *
 * إن غاب أيٌّ منها فلا يُرسل شيء ولا يُسجَّل خطأ. التوكن الذي تردّه Apple بـ 410 أو BadDeviceToken
 * أو Unregistered يُعدّ ميتًا (gone) فيُحذف. لا مفتاح ولا معرّف مكتوب هنا.
 */
import { createHash, sign as signBytes } from 'crypto';
import http2 from 'node:http2';

export interface PushMessage { title: string; body?: string; url?: string; tag?: string }

export const APNS_PRODUCTION_ORIGIN = 'https://api.push.apple.com';
export const APNS_SANDBOX_ORIGIN = 'https://api.sandbox.push.apple.com';
export const APNS_TTL_SECONDS = 24 * 60 * 60;
/** Apple تطلب تجديد توكن المزوّد كل 20–60 دقيقة. */
export const APNS_JWT_REFRESH_SECONDS = 40 * 60;
const APNS_TIMEOUT_MS = 10_000;

export const APNS_TOKEN_PATTERN = /^[0-9a-fA-F]{64,200}$/;

export interface ApnsConfig { key: string; keyId: string; teamId: string; topic: string; origin: string }
type Env = Record<string, string | undefined>;

export function apnsConfigFromEnv(env: Env = process.env): ApnsConfig | null {
  const key = String(env.APNS_KEY_P8 || '').replace(/\\n/g, '\n').trim();
  const keyId = String(env.APNS_KEY_ID || '').trim();
  const teamId = String(env.APNS_TEAM_ID || '').trim();
  const topic = String(env.APNS_TOPIC || '').trim();
  if (!key || !keyId || !teamId || !topic) return null;
  return { key, keyId, teamId, topic, origin: String(env.APNS_ENV || '').trim().toLowerCase() === 'sandbox' ? APNS_SANDBOX_ORIGIN : APNS_PRODUCTION_ORIGIN };
}

const b64url = (data: string | Uint8Array): string => Buffer.from(data).toString('base64url');

export function apnsProviderToken(config: Pick<ApnsConfig, 'key' | 'keyId' | 'teamId'>, nowSeconds: number): string {
  const head = `${b64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))}.${b64url(JSON.stringify({ iss: config.teamId, iat: nowSeconds }))}`;
  const signature = signBytes('sha256', Buffer.from(head), { key: config.key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${b64url(signature)}`;
}

/** العنوان والنص، والرابط (داخل الموقع) في url ليفتحه التطبيق عند اللمس. */
export function apnsPayload(message: PushMessage): string {
  return JSON.stringify({
    aps: { alert: { title: message.title, ...(message.body ? { body: message.body } : {}) }, sound: 'default', ...(message.tag ? { 'thread-id': message.tag } : {}) },
    ...(message.url ? { url: message.url } : {}),
  });
}

export interface ApnsResult { ok: boolean; gone: boolean; status: number; skipped?: boolean; error?: string }

export interface ApnsRequestLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  setEncoding?(encoding: string): unknown;
  end(body?: string): unknown;
}
export interface ApnsClientLike {
  request(headers: Record<string, string>): ApnsRequestLike;
  on(event: string, listener: (...args: any[]) => void): unknown;
  close(): unknown;
}
export type ApnsConnect = (origin: string) => ApnsClientLike;
export interface ApnsSenderOptions { env?: () => Env; connect?: ApnsConnect; now?: () => number; timeoutMs?: number }

const DEAD_REASONS = /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i;

export function createApnsSender(options: ApnsSenderOptions = {}) {
  const readEnv = options.env || (() => process.env);
  const connect: ApnsConnect = options.connect || (origin => http2.connect(origin) as unknown as ApnsClientLike);
  const clock = options.now || Date.now;
  const timeoutMs = options.timeoutMs ?? APNS_TIMEOUT_MS;
  let cached: { jwt: string; issuedAt: number; seed: string } | null = null;

  const providerToken = (config: ApnsConfig): string => {
    const nowSeconds = Math.floor(clock() / 1000);
    const seed = `${config.keyId}|${config.teamId}|${createHash('sha256').update(config.key).digest('hex')}`;
    if (cached && cached.seed === seed && nowSeconds - cached.issuedAt < APNS_JWT_REFRESH_SECONDS) return cached.jwt;
    const jwt = apnsProviderToken(config, nowSeconds);
    cached = { jwt, issuedAt: nowSeconds, seed };
    return jwt;
  };

  return {
    configured: (): boolean => apnsConfigFromEnv(readEnv()) !== null,
    send(token: string, message: PushMessage, extra: { collapseId?: string; urgent?: boolean } = {}): Promise<ApnsResult> {
      const config = apnsConfigFromEnv(readEnv());
      if (!config) return Promise.resolve({ ok: false, gone: false, status: 0, skipped: true });
      if (!APNS_TOKEN_PATTERN.test(token)) return Promise.resolve({ ok: false, gone: true, status: 0, error: 'bad token' });
      let jwt: string;
      try { jwt = providerToken(config); } catch (error: any) { return Promise.resolve({ ok: false, gone: false, status: 0, error: `key: ${String(error?.message || error)}` }); }
      const nowSeconds = Math.floor(clock() / 1000);
      return new Promise<ApnsResult>(resolve => {
        let settled = false;
        let client: ApnsClientLike | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (result: ApnsResult) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          try { client?.close(); } catch { /* مغلق سلفًا */ }
          resolve(result);
        };
        try {
          client = connect(config.origin);
          client.on('error', (error: any) => finish({ ok: false, gone: false, status: 0, error: `conn: ${String(error?.message || error)}` }));
          timer = setTimeout(() => finish({ ok: false, gone: false, status: 0, error: 'timeout' }), timeoutMs);
          const request = client.request({
            ':method': 'POST',
            ':path': `/3/device/${token.toLowerCase()}`,
            authorization: `bearer ${jwt}`,
            'apns-topic': config.topic,
            'apns-push-type': 'alert',
            'apns-priority': extra.urgent === false ? '5' : '10',
            'apns-expiration': String(nowSeconds + APNS_TTL_SECONDS),
            ...(extra.collapseId ? { 'apns-collapse-id': extra.collapseId.slice(0, 64) } : {}),
            'content-type': 'application/json',
          });
          let status = 0;
          let text = '';
          request.on('response', (headers: Record<string, any>) => { status = Number(headers?.[':status'] || 0); });
          request.setEncoding?.('utf8');
          request.on('data', (chunk: string) => { text += chunk; });
          request.on('end', () => {
            if (status === 200) { finish({ ok: true, gone: false, status }); return; }
            let reason = '';
            try { reason = String(JSON.parse(text).reason || ''); } catch { reason = text.slice(0, 120); }
            finish({ ok: false, gone: status === 410 || DEAD_REASONS.test(reason), status, error: reason || undefined });
          });
          request.on('error', (error: any) => finish({ ok: false, gone: false, status: 0, error: `req: ${String(error?.message || error)}` }));
          request.end(apnsPayload(message));
        } catch (error: any) {
          finish({ ok: false, gone: false, status: 0, error: String(error?.message || error) });
        }
      });
    },
  };
}

export type ApnsSender = ReturnType<typeof createApnsSender>;
