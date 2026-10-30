/*
 * «نُحدّث البرنامج» بدل صفحة Google الإنجليزية أثناء النشر.
 *
 *   U1) sw.js: تنقّلٌ يعود 500/502/503/504 ← صفحةُ التحديث (503، no-store)؛ والنجاحُ والتحويلُ يمرّان.
 *   U2) لا يمسّ /api (طلبًا ولا تنقّلًا) ولا غيرَ GET، ولا يحفظ جوابَ 5xx، ولا يحفظ صفحةَ التحديث غلافًا؛
 *       والانقطاعُ يفتح الغلافَ المحفوظ كما كان (القاعة تعمل دون اتصال)، وصفحةُ التحديث له حين لا غلاف.
 *   U3) التثبيتُ يحفظها في ذاكرة الإصدار؛ والتنقّلُ الناجح يعيد حفظها؛ وختمُ البناء باقٍ.
 *   U4) الصفحة: مستقلّة، RTL، نهاري/ليلي، تسأل /api/health كل ٣ ثوانٍ وتتباطأ، ولا تدور في حلقة.
 *   U5) الخادم: لهذه الصفحة وحدها CSP تسمح بسكربتها ببصمته، مسجّلةٌ قبل الملفات الثابتة.
 *   U6) التطبيق: 5xx بصفحة HTML على /api ← شريطٌ هادئ، والجوابُ يعود كما هو؛ وحارسا الإقلاع
 *       والاستعادة يسألان الخادم قبل أيّ مسح.
 *   U7) scripts/verify-pwa.mjs ما زال ينجح.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { isPlatformUpdating, installUpdatingWatch, UPDATING_MESSAGE, SERVER_BACK_EVENT } from '../src/lib/updating-notice';
import { inlineScriptOf, updatingPageCsp } from '../server/updating-page';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const ORIGIN = 'https://mizan.dr-alfailakawi.com';
const PAGE = read('public/updating.html');
const pathOf = (key: any) => new URL(typeof key === 'string' ? key : key.url, ORIGIN).pathname;
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const GOOGLE_502 = '<html><title>Error 502 (Server Error)!!1</title><p>Error: Server Error. Please try again in 30 seconds.</p></html>';
const CACHE = 'mizan-shell-__BUILD_ID__';

type Net = (pathname: string) => Promise<Response>;
/** sw.js in a sandbox with an in-memory Cache Storage that records every write. */
function worker(net: Net, options: { online?: boolean } = {}) {
  const source = read('public/sw.js');
  const handlers: Record<string, (event: any) => void> = {};
  const store = new Map<string, Map<string, Response>>();
  const writes: Array<{ cache: string; key: string; status: number }> = [];
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      put: async (key: any, response: Response) => { writes.push({ cache: name, key: pathOf(key), status: response.status }); entries.set(pathOf(key), response.clone()); },
      match: async (key: any) => entries.get(pathOf(key))?.clone(),
      addAll: async (list: string[]) => { for (const item of list) { const r = await net(pathOf(item)); if (!r.ok) throw new TypeError('addAll'); entries.set(pathOf(item), r); } },
      keys: async () => [...entries.keys()].map(k => ({ url: `${ORIGIN}${k}` })),
      delete: async (key: any) => entries.delete(pathOf(key)),
    };
  };
  const caches = {
    open, keys: async () => [...store.keys()], delete: async (name: string) => store.delete(name),
    match: async (key: any) => { for (const entries of store.values()) { const hit = entries.get(pathOf(key)); if (hit) return hit.clone(); } return undefined; },
  };
  const self: any = {
    addEventListener: (type: string, fn: any) => { handlers[type] = fn; },
    skipWaiting() {}, clients: { claim() {} }, navigator: { onLine: options.online ?? true },
  };
  vm.runInNewContext(source, { self, location: { origin: ORIGIN }, URL, Response, Promise, JSON, String, caches, fetch: (request: any) => net(pathOf(request)) });
  const lifecycle = async (type: string, data?: unknown) => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const request = async (pathname: string, init: { mode?: string; method?: string } = {}) => {
    let answer: Promise<Response> | null = null;
    handlers.fetch({
      request: { url: `${ORIGIN}${pathname}`, mode: init.mode ?? 'navigate', method: init.method ?? 'GET' },
      respondWith: (p: Promise<Response>) => { answer = p; },
    });
    let response: Response | null | undefined = null, error: unknown = null;
    try { response = answer ? await answer : null; } catch (e) { error = e; }
    await tick(); await tick(); await tick();
    return { answered: answer !== null, response, error };
  };
  return { lifecycle, request, store, writes, open };
}

/** The network as the platform answers mid-deploy; the page and the shell were reachable at install. */
const deploying = (status: number | 'drop'): Net => async pathname => {
  if (pathname === '/updating.html') return html(PAGE);
  if (status === 'drop') throw new TypeError('Failed to fetch');
  return html(GOOGLE_502, status);
};
const isUpdatingPage = async (response: Response | null | undefined) =>
  Boolean(response) && response!.status === 503 && response!.headers.get('cache-control') === 'no-store'
  && /text\/html/.test(response!.headers.get('content-type') || '') && (await response!.clone().text()).includes('نُحدّث البرنامج الآن');

test('U1 a 5xx navigation gets the updating page; success and redirects pass through', async () => {
  for (const status of [500, 502, 503, 504]) {
    const sw = worker(deploying(status));
    await sw.lifecycle('install');
    for (const p of ['/', '/competition/abc', '/verify/XYZ']) {
      assert.equal(await isUpdatingPage((await sw.request(p)).response), true, `${status} ${p}`);
    }
  }
  const sw = worker(async pathname => pathname === '/updating.html' ? html(PAGE) : html(`<p>${pathname}</p>`));
  await sw.lifecycle('install');
  const ok = await sw.request('/competition/abc');
  assert.equal(ok.response?.status, 200);
  assert.equal(await ok.response!.text(), '<p>/competition/abc</p>');
  const redirect = worker(async () => new Response(null, { status: 302, headers: { Location: '/x' } }));
  assert.equal((await redirect.request('/old')).response?.status, 302);
  const notFound = worker(async pathname => pathname === '/updating.html' ? html(PAGE) : html('nf', 404));
  await notFound.lifecycle('install');
  assert.equal((await notFound.request('/nope')).response?.status, 404, 'a 404 is not a deploy');
});

test('U2 /api, non-GET and stored copies are untouched; a dropped navigation keeps the offline shell', async () => {
  const sw = worker(deploying(502));
  await sw.lifecycle('install');
  const api = await sw.request('/api/public/competitions/latest', { mode: 'cors' });
  assert.equal(api.response?.status, 502);
  assert.equal(await isUpdatingPage(api.response), false, '/api fetches keep their answer');
  const apiNav = await sw.request('/api/certificates/abc.pdf');
  assert.equal(apiNav.response?.status, 502, 'an /api navigation keeps its answer');
  assert.equal((await sw.request('/competition/abc', { method: 'POST' })).answered, false, 'non-GET is not intercepted');
  assert.deepEqual(sw.writes.filter(w => w.status >= 500), [], 'no 5xx is ever stored');

  const fine = worker(async pathname => pathname === '/updating.html' ? html(PAGE) : html(`<p>${pathname}</p>`));
  await fine.lifecycle('install');
  fine.writes.length = 0;
  await fine.request('/updating.html');
  assert.equal(fine.writes.some(w => w.key === '/index.html'), false, 'the updating page never becomes the app shell');
  await fine.request('/competition/abc');
  assert.equal(fine.writes.some(w => w.key === '/index.html'), true, 'app navigations still refresh the shell');

  // Venue tablet on a network that reaches nothing: the stored shell opens, as before.
  const venue = worker(async pathname => {
    if (pathname === '/updating.html') return html(PAGE);
    if (pathname === '/' || pathname === '/index.html') return html('<p>app shell</p>');
    throw new TypeError('Failed to fetch');
  });
  await venue.lifecycle('install');
  const shell = await venue.request('/competition/abc');
  assert.equal(await shell.response?.text(), '<p>app shell</p>');

  // No shell stored yet and the device says it is online: the updating page.
  const fresh = worker(async pathname => { if (pathname === '/updating.html') return html(PAGE); throw new TypeError('Failed to fetch'); });
  await fresh.lifecycle('install');
  assert.equal(await isUpdatingPage((await fresh.request('/competition/abc')).response), true);
  const offline = worker(async pathname => { if (pathname === '/updating.html') return html(PAGE); throw new TypeError('offline'); }, { online: false });
  await offline.lifecycle('install');
  assert.equal(await isUpdatingPage((await offline.request('/competition/abc')).response), false, 'truly offline is not called an update');

  // A font asked for mid-deploy is answered from the stored copy.
  const font = worker(deploying(502));
  await (await font.open(CACHE)).put('/fonts/fonts.css', new Response('/* cached */', { status: 200 }));
  const answered = await font.request('/fonts/fonts.css', { mode: 'no-cors' });
  assert.equal(answered.response?.status, 200);
  assert.equal(await answered.response!.text(), '/* cached */');
  const icon = worker(deploying(502));
  assert.equal((await icon.request('/brand/x.png', { mode: 'no-cors' })).response?.status, 502, 'nothing stored: the answer as it came');
});

test('U3 install stores the page in this release cache; a good navigation refills it', async () => {
  const source = read('public/sw.js');
  const sw = worker(deploying(502));
  await sw.lifecycle('install');
  assert.equal(sw.store.get(CACHE)?.has('/updating.html'), true);
  await (await sw.open('mizan-shell-old')).put('/x', new Response('x'));
  await sw.lifecycle('activate');
  assert.equal(sw.store.has(CACHE) && !sw.store.has('mizan-shell-old'), true, 'activate keeps it and drops old releases');
  assert.match(source, /const BUILD='__BUILD_ID__';/);

  const empty = worker(async pathname => pathname === '/updating.html' ? html(PAGE) : html(GOOGLE_502, 502));
  assert.equal((await empty.request('/')).response?.status, 502, 'nothing stored: no worse than before');
  const refill = worker(async pathname => pathname === '/updating.html' ? html(PAGE) : html('<p>ok</p>'));
  await refill.request('/');
  assert.equal(refill.store.get(CACHE)?.has('/updating.html'), true);
});

test('U4 the page is standalone, RTL, light/dark, polls /api/health with backoff and never loops', async () => {
  assert.doesNotMatch(PAGE, /https?:\/\//i);
  assert.doesNotMatch(PAGE, /\bsrc=|<link\b|@import/i);
  for (const u of PAGE.match(/url\("([^"]+)"\)/g) || []) assert.match(u, /^url\("\/fonts\//);
  for (const u of PAGE.match(/url\("\/fonts\/([^"]+)"\)/g) || []) {
    const file = /\/fonts\/([^"]+)/.exec(u)![1];
    assert.equal(fs.existsSync(path.join('public/fonts', file)), true, `${file} exists`);
  }
  assert.match(PAGE, /<html lang="ar" dir="rtl">/);
  assert.match(PAGE, /prefers-color-scheme:dark/);
  assert.match(PAGE, /prefers-reduced-motion/);
  assert.match(PAGE, /<title>نُحدّث البرنامج · ميزان<\/title>/);
  for (const text of ['نُحدّث البرنامج الآن ✨', 'لحظاتٍ ونعود', 'أعد المحاولة الآن']) assert.ok(PAGE.includes(text), text);

  const script = inlineScriptOf(PAGE) || '';
  const run = (options: { health: boolean[]; recent?: number[]; pathname?: string; online?: boolean }) => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const asked: string[] = [];
    const nodes: Record<string, any> = {};
    const node = (id: string) => (nodes[id] ??= { textContent: '', addEventListener() {} });
    const store: Record<string, string> = options.recent ? { 'mizan-updating-reloads': JSON.stringify(options.recent) } : {};
    const location = { pathname: options.pathname ?? '/competition/abc', reloads: 0, replaced: '', reload() { this.reloads++; }, replace(url: string) { this.replaced = url; } };
    let call = 0;
    vm.runInNewContext(script, {
      document: { getElementById: node, addEventListener() {}, hidden: false },
      window: { addEventListener() {} }, navigator: { onLine: options.online ?? true }, location,
      sessionStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
      fetch: (url: string, init: any) => { asked.push(`${url}|${init?.cache}`); const ok = options.health[Math.min(call++, options.health.length - 1)]; return Promise.resolve({ ok }); },
      AbortController, JSON, Date, Math,
    });
    const step = async () => { const timer = timers.filter(t => t.ms !== 8000).shift()!; timers.splice(timers.indexOf(timer), 1); timer.fn(); await tick(); await tick(); return timer.ms; };
    return { asked, location, nodes, step };
  };
  {
    const page = run({ health: [false, false, true] });
    const delays = [await page.step(), await page.step(), await page.step()];
    assert.deepEqual(delays, [3000, 3000, 3000]);
    assert.equal(page.asked.every(a => a === '/api/health|no-store'), true);
    assert.equal(page.location.reloads, 1, 'reopens the same URL once the server answers');
  }
  {
    const page = run({ health: [false] });
    const delays: number[] = [];
    for (let i = 0; i < 16; i++) delays.push(await page.step());
    assert.equal(delays[0], 3000);
    assert.ok(delays[delays.length - 1] > 3000 && delays.every(ms => ms <= 15000) && delays.every((ms, i) => i === 0 || ms >= delays[i - 1]), String(delays));
    assert.equal(page.location.reloads, 0);
  }
  {
    const now = Date.now();
    const page = run({ health: [true], recent: [now - 5000, now - 4000, now - 3000] });
    assert.equal(await page.step(), 30000, 'three reloads in two minutes: once every half minute');
    assert.match(page.nodes.lead.textContent, /وقتًا أطول/);
  }
  {
    const page = run({ health: [true], pathname: '/updating.html' });
    await page.step();
    assert.equal(page.location.replaced, '/');
    assert.equal(page.location.reloads, 0);
  }
  {
    const page = run({ health: [true], online: false });
    await page.step();
    assert.equal(page.asked.length, 0);
    assert.match(page.nodes.title.textContent, /لا اتصال/);
  }
});

test('U5 the server gives the page its own CSP, hashed from the file, before static files', () => {
  const csp = updatingPageCsp(PAGE)!;
  const hash = crypto.createHash('sha256').update(inlineScriptOf(PAGE)!, 'utf8').digest('base64');
  assert.ok(csp.includes(`script-src 'sha256-${hash}'`));
  assert.ok(csp.includes("default-src 'none'") && csp.includes("connect-src 'self'") && csp.includes("frame-ancestors 'none'"));
  assert.doesNotMatch(csp, /unsafe-inline'[^;]*script|script-src[^;]*unsafe/);
  assert.equal(updatingPageCsp('<script>a</script><script>b</script>'), null, 'one inline script only');
  const server = read('server.ts');
  const route = server.indexOf('app.get(UPDATING_PAGE_PATH');
  assert.ok(route > 0 && route < server.indexOf('app.use(staticCompression())'));
});

test('U6 the app shows one calm bar for a platform 5xx and hands the response back untouched', async () => {
  assert.equal(isPlatformUpdating(502, 'text/html; charset=UTF-8'), true);
  assert.equal(isPlatformUpdating(503, 'text/html'), true);
  assert.equal(isPlatformUpdating(503, 'application/json; charset=utf-8'), false, 'our own JSON errors stay ours');
  assert.equal(isPlatformUpdating(502, ''), false, 'a bodiless 502 from a binary route stays ours');
  assert.equal(isPlatformUpdating(404, 'text/html'), false);
  assert.ok(UPDATING_MESSAGE.includes('نُحدّث البرنامج'));

  const timers: Array<() => void> = [];
  const appended: any[] = [];
  const events: string[] = [];
  let healthy = false;
  const answer = (pathname: string) => pathname === '/api/health'
    ? new Response('{}', { status: healthy ? 200 : 502, headers: { 'Content-Type': healthy ? 'application/json' : 'text/html' } })
    : html(GOOGLE_502, 502);
  const g = globalThis as any;
  const saved = { window: g.window, document: g.document };
  try {
    g.window = {
      location: { href: `${ORIGIN}/competition/abc`, origin: ORIGIN },
      fetch: async (input: any) => answer(new URL(typeof input === 'string' ? input : input.url, ORIGIN).pathname),
      setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
      dispatchEvent: (event: Event) => { events.push(event.type); return true; },
    };
    g.document = {
      documentElement: { lang: 'ar' },
      body: { appendChild: (el: any) => appended.push(el) },
      createElement: () => ({ style: {}, setAttribute() {}, remove() { (this as any).removed = true; } }),
    };
    installUpdatingWatch();
    const first = await g.window.fetch('/api/public/competitions/latest');
    assert.equal(first.status, 502, 'the caller still gets the platform answer');
    assert.equal(await first.text(), GOOGLE_502);
    await g.window.fetch('/api/public/competitions/latest');
    await g.window.fetch('https://firestore.googleapis.com/v1/x');
    assert.equal(appended.length, 1, 'one bar however many requests');
    assert.equal(appended[0].textContent, UPDATING_MESSAGE);
    timers.shift()!(); await tick(); await tick();
    assert.equal(appended[0].removed, undefined, 'stays while the server is away');
    healthy = true;
    timers.shift()!(); await tick(); await tick();
    assert.equal(appended[0].removed, true);
    assert.deepEqual(events, [SERVER_BACK_EVENT]);
  } finally { g.window = saved.window; g.document = saved.document; }

  const appUpdate = read('src/lib/app-update.ts');
  assert.match(appUpdate, /addEventListener\(SERVER_BACK_EVENT, \(\) => \{ void checkForUpdate\(\); \}\)/);
  const main = read('src/main.tsx');
  assert.ok(main.indexOf('installUpdatingWatch()') > 0 && main.indexOf('installUpdatingWatch()') < main.indexOf('createRoot('));

  const recovery = read('src/lib/stale-shell-recovery.ts');
  const body = recovery.slice(recovery.indexOf('async function recover()'));
  assert.ok(body.indexOf('await serverAnswers()') > 0 && body.indexOf('await serverAnswers()') < body.indexOf('caches.delete') && body.indexOf('await serverAnswers()') < body.indexOf('sessionStorage.setItem(FLAG'),
    'stale-shell recovery asks the server before it wipes anything');
});

test('U6 the boot guard waits for a deploying server instead of wiping the worker', async () => {
  const guard = read('public/boot-guard.js');
  const run = async (health: boolean[]) => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const log = { unregistered: 0, deleted: 0, reloads: 0, flag: null as string | null };
    let call = 0;
    const context: any = {
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); },
      sessionStorage: { getItem: () => log.flag, setItem: (_k: string, v: string) => { log.flag = v; } },
      location: { reload: () => { log.reloads++; } },
      navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { log.unregistered++; } }] } },
      caches: { keys: async () => ['mizan-shell-x'], delete: async () => { log.deleted++; } },
      fetch: async () => ({ ok: health[Math.min(call++, health.length - 1)] }),
      Promise, Math,
    };
    context.window = context;
    vm.runInNewContext(guard, context);
    const step = async () => { const t = timers.shift()!; t.fn(); for (let i = 0; i < 6; i++) await tick(); return t.ms; };
    return { step, log, timers };
  };
  const down = await run([false, false, true]);
  assert.equal(await down.step(), 8000);
  assert.equal(down.log.deleted + down.log.unregistered, 0, 'server away: nothing wiped');
  assert.equal(await down.step(), 3000);
  await down.step();
  assert.equal(down.log.reloads, 1);
  assert.equal(down.log.deleted + down.log.unregistered, 0);
  assert.equal(down.log.flag, null, 'the one-shot recovery is still available afterwards');

  const up = await run([true]);
  await up.step();
  assert.equal(up.log.flag, '1');
  assert.ok(up.log.deleted > 0 && up.log.unregistered > 0 && up.log.reloads === 1, 'server answers: the stale-shell recovery runs as before');
});

test('U7 scripts/verify-pwa.mjs still passes', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-pwa.mjs'], { encoding: 'utf8' });
  assert.ok(output.length >= 0);
});
