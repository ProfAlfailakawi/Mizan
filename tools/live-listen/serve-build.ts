/*
 * بناءٌ محلّيٌّ من الواجهة على خادم الإنتاج — لقياس تعديلٍ قبل أن يُدمج.
 *
 * يُقدِّم مجلّدَ `vite build` كما هو، ويمرّر كلَّ `/api/…` إلى الإنتاج بلا تغيير: فالتعديلُ في
 * الواجهة يُقاس على المستمع الحقيقيّ نفسه، وبالمقياس نفسه، قبل أن يصل طالبًا. هكذا قِيست نافذةُ
 * اللحاق (#282) قبل دمجها: ٢٫٨–٦٫٥ ثوانٍ خلف القارئ، مقابل أكثر من خمسين على المنشور حينها.
 *
 *   npx vite build --outDir /tmp/dist-new
 *   npx tsx tools/live-listen/serve-build.ts /tmp/dist-new 5613
 *   npx tsx tools/live-listen/run.ts --base http://127.0.0.1:5613 …
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [distArg, portArg = '5613', upstream = 'https://new.dr-alfailakawi.com'] = process.argv.slice(2);
if (!distArg) { console.error('usage: serve-build.ts <dist-dir> [port] [upstream]'); process.exit(2); }
const dist = path.resolve(distArg);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
};
/* ما لا يُمرَّر: رؤوسُ الاتّصال، ومصدرُ الصفحة المحلّيّة (فالخادم يرى طلبًا من غير متصفّحٍ على نطاقه). */
const HOP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer']);

http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://local');
  if (url.pathname.startsWith('/api/')) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && typeof v === 'string') headers[k] = v;
    try {
      const r = await fetch(upstream + url.pathname + url.search, {
        method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      });
      const out: Record<string, string> = {};
      r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v; });
      res.writeHead(r.status, out);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'SERVE_BUILD_UPSTREAM_FAILED', message: String(e) }));
    }
    return;
  }
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(Number(portArg), '127.0.0.1', () => console.log(`serving ${dist} on http://127.0.0.1:${portArg} → ${upstream}`));
