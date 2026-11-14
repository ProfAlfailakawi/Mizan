#!/usr/bin/env node
/*
 * بوّابة بناء: يسقط البناء إن غاب مدخل العرض المعزول أو نقلُ معرّفه أو جدارُ الخادم.
 * (على نموذج scripts/verify-demo-entry.mjs في ميراس.)
 */
import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');
const fail = [];
const must = (cond, msg) => { if (!cond) fail.push(msg); };

const server = read('server.ts');
const sandbox = read('server/demo-sandbox.ts');
const transport = read('src/lib/demo-transport.ts');
const entryJs = read('public/demo-entry.js');
const portal = read('src/components/auth/AuthPortal.tsx');
const main = read('src/main.tsx');
const store = read('src/lib/store.ts');
const app = read('src/App.tsx');
const guard = read('server/production-config-guard.ts');

// الخادم: الجدار أول ما يُركَّب على /api، قبل قارئ JSON وقبل المحدِّد العام وكل مسار.
const gateAt = server.indexOf("app.use('/api',createDemoGate(");
must(gateAt > 0, 'server.ts must mount createDemoGate on /api');
must(gateAt < server.indexOf("app.use(express.json("), 'demo gate must precede express.json');
must(gateAt < server.indexOf("app.use('/api',async(req,res,next)=>{"), 'demo gate must precede the global rate limiter');
for (const route of ["'/api/demo/enter'", "'/api/demo/reset'", "'/api/demo/config'", "app.get('/demo'"]) must(server.includes(route), `server.ts must register ${route}`);
must(/MIZAN_DEMO_ENABLED/.test(sandbox) && /!==\s*'false'/.test(sandbox), 'kill switch MIZAN_DEMO_ENABLED=false must exist (default on)');
must(/DEMO_SANDBOX_ISOLATED/.test(sandbox) && /DEMO_PASSTHROUGH/.test(sandbox), 'gate must be deny-by-default with an explicit pass-through list');
must(/maxSandboxes/.test(sandbox) && /enterPerIpPerMin/.test(sandbox) && /ttlMs/.test(sandbox), 'cap, per-IP rate limit and TTL must exist');
// لا سقوط إلى المخزن الحقيقي: كل ما عدا المرور الصريح يُرفض، ولا next() بعده.
must(!/MIZAN_ENABLE_DEMO_SEED/.test(sandbox), 'sandbox must not depend on the real-store demo seed switch');
must(/DEMO_SEED_ENABLED_IN_PRODUCTION/.test(guard), 'production guard must still block MIZAN_ENABLE_DEMO_SEED');

// العميل: ترويسة لا كعكة، تُركَّب أولًا، بالصيغة نفسها على الطرفين.
must(/x-mizan-demo/.test(transport) && /x-mizan-demo/.test(sandbox), 'header name must match on both sides');
const pat = /\^demo_\[0-9a-f\]\{64\}\$/;
must(pat.test(transport) && pat.test(sandbox) && pat.test(entryJs), 'id format demo_ + 64 hex must be validated in transport, server and /demo entry');
for (const key of ['mizan_demo_server_id_v1', 'mizan_demo_active_v1', 'mizan_os_store_v1__demo_v1']) must(transport.includes(key) && entryJs.includes(key), `storage key ${key} must match in transport and public/demo-entry.js`);
must(!/document\.cookie/.test(transport) && !/Set-Cookie/i.test(sandbox), 'sandbox id must not travel in a cookie (Firebase Hosting strips them)');
must(/sessionStorage/.test(transport), 'id must be per-tab (sessionStorage)');
must(/^import '\.\/lib\/demo-transport';/m.test(main), 'main.tsx must import demo-transport first');
must(/from '\.\/demo-transport'/.test(store), 'store.ts must import demo-transport');
must(app.includes("hostSurface()==='marketing'&&!IS_DEMO_SESSION"), 'a demo session must not render the marketing surface');

// الواجهة: زرٌّ بنص ظاهر في كل فروع شاشة الدخول (دخول/دعوة/تحقق بخطوتين).
const uses = (portal.match(/<DemoEntry /g) || []).length;
must(uses >= 2, `DemoEntry must render in the main and MFA branches (found ${uses})`);
must(/جرّب النسخة التجريبية/.test(portal), 'Arabic demo button text missing');
must(!/!activating&&<div className="mt-5 pt-4/.test(portal), 'demo entry must not be hidden during invitation activation');
must(/enterDemoSessionIsolated/.test(portal), 'portal must use the isolated entry');

// الصفحة التسويقية العامة: مدخلٌ ظاهر إلى /demo في الشريط والبطل والقسم.
const marketing = read('src/components/marketing/MarketingSite.tsx');
must(/const DEMO_HREF = '\/demo'/.test(marketing) && (marketing.match(/href=\{DEMO_HREF\}/g) || []).length >= 3, 'marketing page must link to /demo from header, hero and its demo section');

if (fail.length) { console.error('verify-demo-entry FAILED:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('verify-demo-entry: ok');
