/*
 * نقل معرّف الصندوق التجريبي — في ترويسة، لا في كعكة.
 *
 * Firebase Hosting يحذف كل كعكةٍ من الطلبات الممرَّرة إلى Cloud Run إلا `__session`، و`/api/**`
 * هنا تمرّ بهذا الطريق (انظر firebase.json). فالمعرّف يسافر في `x-mizan-demo`، ويُحفظ في
 * `sessionStorage` فلكل لسانٍ صندوقه (فتحُ الموقع في لسانٍ آخر لا يُدخل صاحبَه عرضًا لم يطلبه).
 *
 * `fetch` يُرقَّع مرةً واحدة هنا، لا عند كل نداء: ترويسةٌ تنقص من نداءٍ واحد تعني طلبًا يخرج من
 * الصندوق إلى المخزن الحقيقي، وهذا ما لا يجوز أن يعتمد على انتباه من يضيف نداءً غدًا. ويُستورد
 * هذا الملف من `main.tsx` ومن `store.ts` معًا، والتوابع تُقيَّم قبل مستورديها، فالتركيب يسبق
 * أي التقاطٍ لـ`window.fetch`.
 *
 * الصيغة `demo_` + 64 ست عشري — نفسها التي يتحقق منها الخادم (server/demo-sandbox.ts).
 * السكربت الخارجي `public/demo-entry.js` (الرابط المباشر /demo) يكرّر الثوابت نفسها، ويفحص
 * `scripts/verify-demo-entry.mjs` تطابقها.
 */
export const DEMO_HEADER = 'x-mizan-demo';
export const DEMO_ID_STORAGE_KEY = 'mizan_demo_server_id_v1';
export const DEMO_FLAG_STORAGE_KEY = 'mizan_demo_active_v1';
const DEMO_ID_PATTERN = /^demo_[0-9a-f]{64}$/;

/* بناءٌ أُطفئ فيه العرض (VITE_DISABLE_DEMO_MODE) لا يحمل معرّفًا ولا يرسله — نفس قراءة store.ts المباشرة. */
function buildAllowsDemo(): boolean {
  try { return import.meta.env.VITE_DISABLE_DEMO_MODE !== 'true'; } catch { return true; }
}

export function readDemoSessionId(): string {
  try {
    /* المعرّف لا يُرسل إلا ما دامت راية العرض مرفوعة في هذا اللسان وبناءُ الواجهة يسمح بالعرض. */
    if (!buildAllowsDemo() || window.sessionStorage.getItem(DEMO_FLAG_STORAGE_KEY) !== 'true') return '';
    const value = String(window.sessionStorage.getItem(DEMO_ID_STORAGE_KEY) || '').trim();
    return DEMO_ID_PATTERN.test(value) ? value : '';
  } catch {
    return '';
  }
}

export function rememberDemoSessionId(id: unknown): boolean {
  const value = String(id || '').trim();
  if (!DEMO_ID_PATTERN.test(value)) return false;
  try { window.sessionStorage.setItem(DEMO_ID_STORAGE_KEY, value); return true; } catch { return false; }
}

export function forgetDemoSessionId(): void {
  try { window.sessionStorage.removeItem(DEMO_ID_STORAGE_KEY); } catch { /* لا يمنع الخروج */ }
}

/** الترويسة لا تُرسل إلا إلى /api/ في أصل هذا الموقع — لا يُسلَّم المعرّف لجهةٍ أخرى. */
function isOwnApiRequest(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/*
 * قراءاتٌ عامةٌ يطلبها هيكلُ التطبيق عند كل إقلاع (العلامة، والجهة، والمسابقة المنشورة)، وهي
 * تقرأ بيانات جهاتٍ حقيقية فيرفضها جدارُ الخادم على الصندوق دائمًا بـ403 `DEMO_SANDBOX_ISOLATED`
 * (server/demo-sandbox.ts). فكان كلُّ زائرٍ للعرض يرسلها ويتلقّى الرفضَ نفسَه في سجلّ المتصفّح.
 * يُجاب عنها هنا بالجواب نفسه بلا رحلةٍ إلى الشبكة: الحكمُ لا يتغيّر (الجدارُ يبقى في الخادم،
 * والمستدعون يرون 403 كما كانوا)، ويغيب الضجيج. ويثبت `tests/demo-transport-isolated-reads.test.ts`
 * أن الخادم يرفض كلَّ ما يُطابق هنا، فلا يُحجب محليًّا ما كان الخادمُ سيسمح به.
 */
const DEMO_ISOLATED_PUBLIC_READS: RegExp[] = [
  /^\/api\/public\/brand$/,
  /^\/api\/public\/tenant$/,
  /^\/api\/public\/competitions\/[^/]+$/,
];

export function isDemoIsolatedPublicRead(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return DEMO_ISOLATED_PUBLIC_READS.some((re) => re.test(path));
}

function requestMethodAndPath(input: RequestInfo | URL, init?: RequestInit): { method: string; path: string } {
  const isRequest = typeof Request !== 'undefined' && input instanceof Request;
  const raw = isRequest ? (input as Request).url : String(input);
  const method = String(init?.method || (isRequest ? (input as Request).method : 'GET')).toUpperCase();
  return { method, path: new URL(raw, window.location.href).pathname };
}

/** انتهى الصندوق على الخادم (مهلة أو إعادة تشغيل): يُترك العرض بدل شاشاتٍ ملأى بالأخطاء. */
function leaveExpiredSandbox(): void {
  try {
    for (const key of [DEMO_ID_STORAGE_KEY, DEMO_FLAG_STORAGE_KEY, 'mizan_os_store_v1__demo_v1', 'mizan_demo_role_v1', 'mizan_demo_quorum_v1']) window.sessionStorage.removeItem(key);
  } catch { /* لا يمنع */ }
  window.location.reload();
}

let installed = false;

export function installDemoTransport(): void {
  if (installed) return;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  /* معرّفٌ يتيم (راية غائبة أو العرض مُطفأ في هذا البناء) يُمحى عند الإقلاع فلا يلاحق طلبات حقيقية. */
  try {
    if ((!buildAllowsDemo() || window.sessionStorage.getItem(DEMO_FLAG_STORAGE_KEY) !== 'true') && window.sessionStorage.getItem(DEMO_ID_STORAGE_KEY)) forgetDemoSessionId();
  } catch { /* لا يمنع */ }
  const original = window.fetch.bind(window);
  window.fetch = function mizanDemoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let sessionId = '';
    try { sessionId = readDemoSessionId(); } catch { /* يمضي الطلب كما هو */ }
    if (!sessionId || !isOwnApiRequest(input)) return original(input, init);
    try {
      const { method, path } = requestMethodAndPath(input, init);
      if (isDemoIsolatedPublicRead(method, path)) {
        return Promise.resolve(new Response(JSON.stringify({ code: 'DEMO_SANDBOX_ISOLATED' }), { status: 403, headers: { 'content-type': 'application/json' } }));
      }
    } catch { /* يمضي الطلب إلى الخادم، وجدارُه يحكم */ }
    try {
      let call: Promise<Response>;
      if (typeof Request !== 'undefined' && input instanceof Request && !init) {
        const headers = new Headers(input.headers);
        headers.set(DEMO_HEADER, sessionId);
        call = original(new Request(input, { headers }));
      } else {
        const headers = new Headers(init?.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined));
        headers.set(DEMO_HEADER, sessionId);
        call = original(input, { ...init, headers });
      }
      return call.then((res) => {
        if (res.status === 410 && !String(new URL(res.url || window.location.href, window.location.href).pathname).startsWith('/api/demo/reset')) {
          res.clone().json().then((b: { code?: string }) => { if (b?.code === 'DEMO_SANDBOX_EXPIRED') leaveExpiredSandbox(); }).catch(() => {});
        }
        return res;
      });
    } catch {
      return original(input, init);
    }
  } as typeof window.fetch;
}

export type DemoEnterResult = 'ok' | 'offline' | 'disabled' | 'busy';

/**
 * يطلب صندوقًا من الخادم ويحفظ معرّفه. `offline` = لا اتصال بالخادم: يبقى العرض المحلي الصرف
 * ممكنًا (لا يلمس الخادم أصلًا). `disabled`/`busy` = الخادم رفض (مفتاح الإطفاء أو السقف): لا دخول.
 */
export async function requestServerSandbox(): Promise<DemoEnterResult> {
  try {
    const res = await window.fetch('/api/demo/enter', { method: 'POST' });
    if (res.status === 404) return 'disabled';
    if (res.status === 429 || res.status === 503) return 'busy';
    if (!res.ok) return 'offline';
    const body = (await res.json()) as { sessionId?: string };
    return rememberDemoSessionId(body?.sessionId) ? 'ok' : 'offline';
  } catch {
    return 'offline';
  }
}

export function resetServerSandbox(): void {
  const id = readDemoSessionId();
  if (!id) return;
  void window.fetch('/api/demo/reset', { method: 'POST' }).catch(() => {});
}

installDemoTransport();
