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
  | { state: 'NOT_CONFIGURED'; hosts: string[] }
  | { state: 'AUTHORIZED'; hosts: string[]; referrersAdded: string[]; authDomainsAdded: string[] }
  | { state: 'FAILED'; reason: string; hosts: string[] };

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* أطول اسم مضيف في DNS ‏253 محرفًا. ما تجاوزه ليس مضيفًا، فيُقصّ قبل أي عمل عليه. */
const MAX_HOST_LENGTH = 253;

/**
 * يُطبَّع المضيف قبل أي مقارنة: الفروق في الحالة أو المسافات تُنتج تكرارًا صامتًا في القائمة.
 *
 * بلا تعابير نمطية عمدًا. المدخل يصل من جسم الطلب قبل أي تحقق، ونمطٌ غير مثبَّت البداية
 * مثل ‎/\/.*$/‎ يجرّب كل موضع: نصٌّ من آلاف الشرطات يجعل الكلفة تربيعية فيعلّق الخادم.
 * عمليات النصوص هنا خطّية، والطول مقصوص أولًا فيبقى العمل محدودًا مهما كان المدخل.
 */
export function normalizeHost(raw: string): string {
  let host = String(raw ?? '').trim().toLowerCase();
  if (host.length > MAX_HOST_LENGTH * 4) host = host.slice(0, MAX_HOST_LENGTH * 4);
  if (host.startsWith('https://')) host = host.slice(8);
  else if (host.startsWith('http://')) host = host.slice(7);
  const slash = host.indexOf('/');
  if (slash >= 0) host = host.slice(0, slash);
  while (host.endsWith('.')) host = host.slice(0, -1);
  return host.length > MAX_HOST_LENGTH ? '' : host;
}

/** تحقّق خطّي من شكل المضيف: تقسيمٌ على النقاط وفحص كل مقطع، بلا تراجع نمطي. */
export function isPlausibleHost(host: string): boolean {
  if (!host || host.length > MAX_HOST_LENGTH) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    for (const ch of label) {
      const ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '-';
      if (!ok) return false;
    }
  }
  const tld = labels[labels.length - 1];
  if (tld.length < 2) return false;
  for (const ch of tld) if (ch < 'a' || ch > 'z') return false;
  return true;
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

  /**
   * يضيف المُحيلات الناقصة في قراءة واحدة وكتابة واحدة.
   *
   * القائمة تُستبدل لا يُضاف إليها، فكل نطاق بقراءةٍ وكتابةٍ مستقلّتين يعني أن نطاقين في
   * الطلب نفسه يقرآن القائمة ذاتها ثم يكتب كلٌّ نسخته: فيمحو الثاني ما أضافه الأول، ويُبلَّغ
   * عن نجاحهما معًا. قراءةٌ واحدة لكل النطاقات تُلغي هذا التسابق من أصله.
   */
  private async addReferrers(hosts: string[]): Promise<string[]> {
    const url = `https://apikeys.googleapis.com/v2/${this.config.apiKeyResource}`;
    const key = await this.call(url, { method: 'GET' }) as { restrictions?: { browserKeyRestrictions?: { allowedReferrers?: string[] } } };
    const current = key.restrictions?.browserKeyRestrictions?.allowedReferrers ?? [];
    /* تغطية قائمة بأنماط عامة: لا يُضاف ما هو مشمول أصلًا حتى لا تنتفخ القائمة بلا فائدة. */
    const missing = hosts.filter(host => !current.some(entry => entry === referrerPattern(host) || matchesReferrer(entry, host)));
    if (!missing.length) return [];
    await this.call(`${url}?updateMask=restrictions.browserKeyRestrictions.allowedReferrers`, {
      method: 'PATCH',
      body: JSON.stringify({ restrictions: { browserKeyRestrictions: { allowedReferrers: [...current, ...missing.map(referrerPattern)] } } }),
    });
    return missing;
  }

  /** النطاقات المصرّح بها في المصادقة، وهي تخصّ مسارات OAuth المنبثقة. القراءة والكتابة مرة واحدة. */
  private async addAuthorizedDomains(hosts: string[]): Promise<string[]> {
    const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(this.config.projectId)}/config`;
    const config = await this.call(url, { method: 'GET' }) as { authorizedDomains?: string[] };
    const current = config.authorizedDomains ?? [];
    const known = new Set(current.map(entry => normalizeHost(entry)));
    const missing = hosts.filter(host => !known.has(host));
    if (!missing.length) return [];
    await this.call(`${url}?updateMask=authorizedDomains`, {
      method: 'PATCH',
      body: JSON.stringify({ authorizedDomains: [...current, ...missing] }),
    });
    return missing;
  }

  /**
   * يُبلِّغ Google بنطاقات الطلب كلها معًا. إضافة المُحيلات أولًا لأنها التي تعطّل كل شيء حين
   * تغيب، ثم النطاقات المصرّح بها. فشل الثانية بعد نجاح الأولى يُبلَّغ فشلًا: النظام سيعمل
   * والدخول المنبثق لا، وهذا نصف نجاح لا يجوز أن يُعرض نجاحًا.
   */
  async authorize(rawHosts: string | string[]): Promise<DomainAuthorizationOutcome> {
    const requested = (Array.isArray(rawHosts) ? rawHosts : [rawHosts]).map(normalizeHost);
    const hosts = [...new Set(requested)];
    const invalid = hosts.filter(host => !isPlausibleHost(host));
    if (invalid.length || !hosts.length) return { state: 'FAILED', reason: 'HOST_INVALID', hosts: invalid };
    try {
      const referrersAdded = await this.addReferrers(hosts);
      const authDomainsAdded = await this.addAuthorizedDomains(hosts);
      return { state: 'AUTHORIZED', hosts, referrersAdded, authDomainsAdded };
    } catch (err) {
      return { state: 'FAILED', reason: err instanceof Error ? err.message : 'GOOGLE_CALL_FAILED', hosts };
    }
  }
}

/** يطابق نمط مُحيل مسجَّلًا مع مضيف، بما في ذلك أنماط النجمة التي تغطّي نطاقات فرعية. */
export function matchesReferrer(pattern: string, host: string): boolean {
  /* النمط يأتي من قائمة Google، وتُطبَّق عليه المعالجة الخطّية نفسها لا تعبيرًا نمطيًا. */
  let cleaned = String(pattern ?? '').trim().toLowerCase();
  if (cleaned.length > MAX_HOST_LENGTH * 4) cleaned = cleaned.slice(0, MAX_HOST_LENGTH * 4);
  if (cleaned.startsWith('https://')) cleaned = cleaned.slice(8);
  else if (cleaned.startsWith('http://')) cleaned = cleaned.slice(7);
  const slash = cleaned.indexOf('/');
  if (slash >= 0) cleaned = cleaned.slice(0, slash);
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
