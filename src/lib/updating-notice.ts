/*
 * «نُحدّث البرنامج» داخل التطبيق.
 *
 * أثناء النشر تجيب واجهةُ Google الأمامية طلباتِ /api بصفحة HTML إنجليزية (500/502/503/504)
 * لا يكتبها خادمُ ميزان — خادمُنا يجيب /api بـJSON دائمًا، أو بجسمٍ فارغ لأصلٍ ثنائيّ. فكانت
 * الشاشات تقرأ صفحةَ الخطأ كأنها عطلٌ في البرنامج.
 *
 * هنا يُعرف ذلك الجواب، ويظهر شريطٌ هادئ واحد أسفل الشاشة، ويسأل /api/health كل ثلاث
 * ثوانٍ (ويتباطأ إلى خمس عشرة) حتى يعود الخادم فيختفي ويُطلَق حدثُ SERVER_BACK_EVENT.
 *
 * المراقبةُ لا تغيّر شيئًا: الجوابُ نفسه يعود إلى من طلبه كما جاء، فلا يتبدّل سلوكُ أيّ شاشة
 * ولا طابورُ إعادة المحاولة ولا مسارُ التحكيم. الذي يُضاف شريطٌ فقط.
 */

const UPDATING_STATUSES = new Set([500, 502, 503, 504]);

export const UPDATING_MESSAGE = 'نُحدّث البرنامج الآن ✨ لحظاتٍ ونعود.';
export const UPDATING_MESSAGE_EN = 'Updating MIZAN ✨ back in a moment.';
/** يُطلق على window حين يعود الخادم. */
export const SERVER_BACK_EVENT = 'mizan:server-back';
export const HEALTH_URL = '/api/health';

/**
 * جوابُ المنصّة لا جوابُ ميزان: 5xx بصفحة HTML. الجسمُ الفارغ (أصلٌ ثنائيّ تعذّر) وJSON
 * (خطأٌ كتبه الخادم) يبقيان خطأَ البرنامج كما هما.
 */
export const isPlatformUpdating = (status: number, contentType: string | null | undefined): boolean =>
  UPDATING_STATUSES.has(status) && /text\/html/i.test(String(contentType || ''));

const nextDelay = (tries: number) => Math.min(15_000, Math.round(3000 * Math.pow(1.3, Math.max(0, tries - 5))));

let notice: HTMLElement | null = null;
const waiting = new Set<() => void>();

/**
 * يُظهر الشريطَ مرّةً واحدة مهما تكرّر الطلب، ويسأل `probe` حتى يجيب، فيخفيه وينادي
 * `onBack` ومن سبقه.
 */
export function showUpdatingNotice(probe: () => Promise<boolean>, onBack?: () => void): void {
  if (onBack) waiting.add(onBack);
  if (notice || typeof document === 'undefined' || !document.body) return;
  const ar = !(document.documentElement.lang || 'ar').toLowerCase().startsWith('en');
  const bar = document.createElement('div');
  bar.className = 'mizan-updating-notice';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.dir = ar ? 'rtl' : 'ltr';
  bar.textContent = ar ? UPDATING_MESSAGE : UPDATING_MESSAGE_EN;
  bar.style.cssText = [
    'position:fixed', 'inset-inline:0', 'bottom:max(18px,env(safe-area-inset-bottom))', 'margin:0 auto', 'width:max-content', 'max-width:calc(100vw - 32px)',
    'z-index:2147483000', 'padding:11px 18px', 'border-radius:14px', 'font-family:var(--font-arabic,inherit)', 'font-size:14px', 'font-weight:600', 'line-height:1.6',
    'background:var(--surface,#fffefb)', 'color:var(--ink,#171b18)', 'border:1px solid var(--line,#dfded7)',
    'box-shadow:0 14px 36px rgb(18 63 53 / .16)', 'text-align:center', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(bar);
  notice = bar;
  let tries = 0;
  const ask = async () => {
    const back = await probe().catch(() => false);
    if (!back) { tries++; window.setTimeout(ask, nextDelay(tries)); return; }
    bar.remove();
    notice = null;
    const callbacks = [...waiting];
    waiting.clear();
    callbacks.forEach(callback => { try { callback(); } catch { /* منتظرٌ واحد لا يوقف البقية */ } });
    window.dispatchEvent(new Event(SERVER_BACK_EVENT));
  };
  window.setTimeout(ask, 3000);
}

/** هل يجيب الخادمُ أصلًا؟ يُسأل بالـfetch الأصلي، من وراء المراقِب. */
export function serverAnswers(fetcher: typeof fetch = fetch): Promise<boolean> {
  return fetcher(HEALTH_URL, { cache: 'no-store', credentials: 'same-origin' }).then(response => response.ok, () => false);
}

const isOwnApi = (input: RequestInfo | URL): boolean => {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch { return false; }
};

let watching = false;

/**
 * يراقب طلباتِ /api من نطاقنا وحدها: إن جاء جوابُ المنصّة أظهر الشريط. لا يلمس الطلب ولا
 * الجواب، ولا طلباتِ Firebase أو أيَّ نطاقٍ آخر.
 */
export function installUpdatingWatch(): void {
  if (watching || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  watching = true;
  const nativeFetch = window.fetch.bind(window);
  const probe = () => serverAnswers(nativeFetch);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const pending = nativeFetch(input, init);
    if (!isOwnApi(input)) return pending;
    return pending.then(response => {
      if (isPlatformUpdating(response.status, response.headers.get('content-type'))) showUpdatingNotice(probe);
      return response;
    });
  }) as typeof window.fetch;
}
