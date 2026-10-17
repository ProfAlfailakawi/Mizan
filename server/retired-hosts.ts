import type { RequestHandler } from 'express';

/*
 * mizan.<النطاق> وadmin.<النطاق> كانا وجهَي التسويق واللوحة. الوضع الجديد: كلاهما على
 * mizan-quran.web.app (واللوحة تحت /admin). فتُحوَّل طلبات التصفح القديمة إلى هناك.
 * جهات العملاء (<جهة>.<النطاق>) لا تُمسّ، ولا فحوص الصحة.
 */
export const NEW_PUBLIC_ORIGIN = 'https://mizan-quran.web.app';

const EXEMPT = /^\/(api\/(ready|health)|healthz|ready)(\/|$)/;

export function retiredHostTarget(host: string, baseDomain: string, pathAndQuery: string): string | null {
  const h = String(host || '').trim().toLowerCase().split(':')[0];
  const base = String(baseDomain || '').trim().toLowerCase();
  if (!base) return null;
  if (h === `mizan.${base}`) return `${NEW_PUBLIC_ORIGIN}${pathAndQuery}`;
  if (h === `admin.${base}`) {
    const rest = pathAndQuery === '/' ? '' : pathAndQuery;
    return `${NEW_PUBLIC_ORIGIN}/admin${rest.startsWith('/admin') ? rest.slice('/admin'.length) : rest}`;
  }
  return null;
}

/*
 * زيارة مباشرة لرابط الخدمة (…run.app) بلا ترويسة x-forwarded-host: لا تمرّ من Hosting ولا من
 * الـWorker، فهي الرابط القديم. تُحوَّل (GET/HEAD فقط، فلا تنكسر خطافات الدفع) إلى النطاق الجديد.
 * مفتاحها متغير `MIZAN_REDIRECT_RUN_APP_TO`؛ غيابه يعني لا تحويل، وحذفه يتراجع فوراً.
 */
export function directRunAppTarget(host: string, forwardedHost: string, to: string, pathAndQuery: string): string | null {
  const origin = String(to || '').trim().replace(/\/+$/, '');
  if (!origin || String(forwardedHost || '').trim()) return null;
  const h = String(host || '').trim().toLowerCase().split(':')[0];
  return h.endsWith('.run.app') ? `${origin}${pathAndQuery}` : null;
}

export function retiredHosts(baseDomain: () => string): RequestHandler {
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || EXEMPT.test(req.path)) return next();
    const forwarded = String(req.headers['x-forwarded-host'] || '');
    const host = forwarded || String(req.headers.host || '');
    const target = retiredHostTarget(host, baseDomain(), req.originalUrl)
      ?? directRunAppTarget(String(req.headers.host || ''), forwarded, process.env.MIZAN_REDIRECT_RUN_APP_TO || '', req.originalUrl);
    if (!target) return next();
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, target);
  };
}
