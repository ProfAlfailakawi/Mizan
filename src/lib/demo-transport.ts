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

export function readDemoSessionId(): string {
  try {
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
  const original = window.fetch.bind(window);
  window.fetch = function mizanDemoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let sessionId = '';
    try { sessionId = readDemoSessionId(); } catch { /* يمضي الطلب كما هو */ }
    if (!sessionId || !isOwnApiRequest(input)) return original(input, init);
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
