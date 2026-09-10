import crypto from 'crypto';

/*
 * إبلاغ Google بنطاق جهة جديدة — من لوحة ميزان لا من وحدة تحكّم Google.
 *
 * مفتاح Firebase مقيَّد بمُحيلات HTTP، فأي نطاق ليس في القائمة تُرفض طلباته: الجهة التي
 * ربطت نطاقها ولم يُدرَج يتعطّل نظامها كليًا، والعطل عند Google لا في الكود — فلا يكشفه
 * اختبار ولا تظهر له رسالة مفهومة. وإدخال كل نطاق يدويًا لا يصلح مع عشرات الجهات.
 *
 * قائمتان تُحدَّثان لكل نطاق:
 *   1. مُحيلات مفتاح API — تخصّ كل طلب من المتصفح، فغيابها يعطّل كل شيء.
 *   2. النطاقات المصرّح بها في المصادقة — تخصّ مسارات OAuth المنبثقة وحدها.
 *
 * الخطر الأكبر هنا ليس الفشل بل النجاح الناقص: القائمتان تُستبدلان لا تُضاف إليهما، فمن
 * يكتب نطاقه وحده يمسح نطاقات الجهات الأخرى كلها. لذلك: تُقرأ، ثم يُضاف، ثم تُكتب.
 *
 * وبلا إعداد لا يفشل شيء: يُعاد NOT_CONFIGURED ويبقى الربط يدويًا كما كان.
 */

export interface GoogleAuthorizerConfig {
  clientEmail: string;
  privateKey: string;
  projectId: string;
  /** المسار الكامل للمفتاح: projects/<p>/locations/global/keys/<id> */
  apiKeyResource: string;
}

export type DomainAuthorizationOutcome =
  | { state: 'NOT_CONFIGURED' }
  | { state: 'AUTHORIZED'; referrerAdded: boolean; authDomainAdded: boolean; host: string }
  | { state: 'FAILED'; reason: string; host: string };

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** يُطبَّع المضيف قبل أي مقارنة: الفروق في الحالة أو المسافات تُنتج تكرارًا صامتًا في القائمة. */
export function normalizeHost(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

/** صيغة المُحيل التي تقبلها Google لنطاق كامل. */
export const referrerPattern = (host: string) => `https://${host}/*`;

export class GoogleDomainAuthorizer {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private config: GoogleAuthorizerConfig, private fetchImpl: typeof fetch = fetch) {}

  /* رمز وصول موقّع بحساب الخدمة. يُعاد استخدامه حتى قُبيل انتهائه بدل توقيع طلب لكل نداء. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
      iss: this.config.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
    }));
    const signature = base64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), this.config.privateKey));
    const res = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }).toString(),
    });
    if (!res.ok) throw new Error(`GOOGLE_TOKEN_HTTP_${res.status}`);
    const body = await res.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('GOOGLE_TOKEN_INVALID');
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  private async call(url: string, init: RequestInit) {
    const token = await this.accessToken();
    const res = await this.fetchImpl(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GOOGLE_HTTP_${res.status}:${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }

  /** يضيف المُحيل إلى قائمة المفتاح دون المساس بما فيها. */
  private async addReferrer(host: string): Promise<boolean> {
    const url = `https://apikeys.googleapis.com/v2/${this.config.apiKeyResource}`;
    const key = await this.call(url, { method: 'GET' }) as { restrictions?: { browserKeyRestrictions?: { allowedReferrers?: string[] } } };
    const current = key.restrictions?.browserKeyRestrictions?.allowedReferrers ?? [];
    const wanted = referrerPattern(host);
    /* تغطية قائمة بأنماط عامة: لا يُضاف ما هو مشمول أصلًا حتى لا تنتفخ القائمة بلا فائدة. */
    if (current.some(entry => entry === wanted || matchesReferrer(entry, host))) return false;
    const next = [...current, wanted];
    await this.call(`${url}?updateMask=restrictions.browserKeyRestrictions.allowedReferrers`, {
      method: 'PATCH',
      body: JSON.stringify({ restrictions: { browserKeyRestrictions: { allowedReferrers: next } } }),
    });
    return true;
  }

  /** يضيف النطاق إلى النطاقات المصرّح بها في المصادقة، وهي تخصّ مسارات OAuth المنبثقة. */
  private async addAuthorizedDomain(host: string): Promise<boolean> {
    const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(this.config.projectId)}/config`;
    const config = await this.call(url, { method: 'GET' }) as { authorizedDomains?: string[] };
    const current = config.authorizedDomains ?? [];
    if (current.some(entry => normalizeHost(entry) === host)) return false;
    await this.call(`${url}?updateMask=authorizedDomains`, {
      method: 'PATCH',
      body: JSON.stringify({ authorizedDomains: [...current, host] }),
    });
    return true;
  }

  /**
   * يُبلِّغ Google بالنطاق. إضافة المُحيل أولًا لأنها التي تعطّل كل شيء حين تغيب، ثم النطاق
   * المصرّح به. فشل الثانية بعد نجاح الأولى يُبلَّغ فشلًا: النظام سيعمل والدخول المنبثق لا.
   */
  async authorize(rawHost: string): Promise<DomainAuthorizationOutcome> {
    const host = normalizeHost(rawHost);
    if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { state: 'FAILED', reason: 'HOST_INVALID', host };
    try {
      const referrerAdded = await this.addReferrer(host);
      const authDomainAdded = await this.addAuthorizedDomain(host);
      return { state: 'AUTHORIZED', referrerAdded, authDomainAdded, host };
    } catch (err) {
      return { state: 'FAILED', reason: err instanceof Error ? err.message : 'GOOGLE_CALL_FAILED', host };
    }
  }
}

/** يطابق نمط مُحيل مسجَّلًا مع مضيف، بما في ذلك أنماط النجمة التي تغطّي نطاقات فرعية. */
export function matchesReferrer(pattern: string, host: string): boolean {
  const cleaned = String(pattern || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!cleaned) return false;
  if (cleaned === host) return true;
  if (cleaned.startsWith('*.')) {
    const suffix = cleaned.slice(1); // ".example.com"
    /* «‎*.example.com» عند Google يغطّي النطاقات الفرعية، ولا يغطّي «example.com» نفسه. */
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return false;
}

export function googleDomainAuthorizerFromEnv(env: NodeJS.ProcessEnv = process.env): GoogleDomainAuthorizer | null {
  const raw = String(env.MIZAN_GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  const apiKeyResource = String(env.MIZAN_FIREBASE_API_KEY_RESOURCE || '').trim();
  if (!raw || !apiKeyResource) return null;
  let parsed: { client_email?: string; private_key?: string; project_id?: string };
  try { parsed = JSON.parse(raw); } catch { return null; }
  const clientEmail = String(parsed.client_email || '').trim();
  const privateKey = String(parsed.private_key || '').replace(/\\n/g, '\n').trim();
  const projectId = String(env.MIZAN_FIREBASE_PROJECT_ID || parsed.project_id || '').trim();
  if (!clientEmail || !privateKey || !projectId) return null;
  return new GoogleDomainAuthorizer({ clientEmail, privateKey, projectId, apiKeyResource });
}
