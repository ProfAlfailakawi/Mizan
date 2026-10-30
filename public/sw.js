/* بصمة البناء تُطبع هنا عند البناء (scripts/build-stamp.mjs).
   بايتات هذا الملف يجب أن تتغيّر مع كل إصدار، وإلا لم يرَ المتصفح تحديثًا أصلًا
   ولم تعلم التبويبات المفتوحة بشيء. */
const BUILD='__BUILD_ID__';
const CACHE='mizan-shell-'+BUILD;
/* The fonts are served from our own origin now, so they fall under the same-origin
   rule below and the separate cross-origin font cache is gone. Leaving it out of KEEP
   is deliberate: activate() drops any cache not listed, which reclaims what the old
   Google Fonts cache held. */
const KEEP=[CACHE];

/* Hashed build assets: "Name-a1B2c3D4.js". Every deploy mints new hashes, and the old
   entries used to stay cached forever because activate() only drops *other* cache names.
   With route-level code splitting that leak grew from one stale file per deploy to ~30,
   which matters on a venue tablet that is never wiped. Whenever a fresh asset is cached,
   drop the superseded hashes of the same file. */
const ASSET=/\/assets\/(.+)-[A-Za-z0-9_-]{8}\.(js|css)$/;
/* الأصول المبصومة بهاش في اسمها هي وحدها التي تُقدَّم من الكاش مباشرة: اسمها يتغيّر مع
   بايتاتها، فالنسخة القديمة مستحيلة بالبناء. كل ما عداها يمرّ على الشبكة أولًا. */
const HASHED=/\/assets\/.+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$|[.-][A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|png|jpe?g|webp|avif|svg)$/;
async function putAsset(cache,request,response){
 await cache.put(request,response);
 const current=new URL(request.url).pathname.match(ASSET);
 if(!current)return;
 for(const key of await cache.keys()){
  if(key.url===request.url)continue;
  const old=new URL(key.url).pathname.match(ASSET);
  if(old&&old[1]===current[1]&&old[2]===current[2]) await cache.delete(key);
 }
}

/*
 * «نُحدّث البرنامج» بدل صفحة Google الإنجليزية.
 *
 * أثناء النشر يتبدّل الخادم، فتجيب واجهةُ Google الأمامية عن التنقّل بصفحة
 * «Error: Server Error … try again in 30 seconds» لا يكتبها خادمُ ميزان. الصفحةُ البديلة
 * (/updating.html) تُحفظ عند التثبيت في ذاكرة هذا الإصدار نفسها، وتُقدَّم للتنقّل وحده —
 * لا لـ/api ولا لغير GET ولا لجوابٍ ناجح — حين يعود 500/502/503/504. ولا يُحفظ جوابُ
 * 5xx في أيّ ذاكرة هنا أبدًا.
 *
 * والانقطاعُ لا يُعامَل معاملةَ النشر: جهازُ القاعة قد يكون «متّصلًا» بشبكةٍ لا تبلغ
 * الإنترنت، والتحكيمُ يستمرّ دون اتصال. فالانقطاعُ يفتح الغلافَ المحفوظ كما كان، ولا
 * تُقدَّم صفحةُ التحديث له إلا حين لا غلافَ محفوظًا والجهازُ يقول إنه متّصل.
 */
const UPDATING_PAGE='/updating.html';
const isUpdatingStatus=s=>s===500||s===502||s===503||s===504;
const storeUpdatingPage=()=>fetch(UPDATING_PAGE,{cache:'no-store',credentials:'same-origin'}).then(r=>{
 if(r.ok&&(r.headers.get('content-type')||'').includes('text/html'))return caches.open(CACHE).then(c=>c.put(UPDATING_PAGE,r));
}).catch(()=>{});
/* مُسحت الذاكرةُ (تعافٍ أو تحديث)؟ تُعاد بعد أول تنقّلٍ ناجح، ولا يُنتظر ذلك. */
const refillUpdatingPage=()=>caches.open(CACHE).then(c=>c.match(UPDATING_PAGE)).then(hit=>hit?undefined:storeUpdatingPage()).catch(()=>{});
const updatingResponse=()=>caches.open(CACHE).then(c=>c.match(UPDATING_PAGE)).then(page=>page?page.text().then(body=>new Response(body,{status:503,statusText:'Service Unavailable',headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'5','X-Mizan-Updating':'1'}})):null).catch(()=>null);

self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/index.html'])).catch(()=>{}).then(storeUpdatingPage));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>!KEEP.includes(k)).map(k=>caches.delete(k)))));self.clients.claim();});

self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;
 /* طلبات التنقل (HTML) دائمًا من الشبكة وبـ cache:"no-store": الغلاف المخزّن يسمّي حزمًا
    حذفها النشر التالي. الكاش احتياط لانقطاع الاتصال لا غير. */
 if(req.mode==='navigate'){
  /* صفحةُ التحديث نفسها لا تُحفظ غلافًا للتطبيق، وتنقّلُ /api (تنزيلُ ملفٍّ مثلًا) لا يُبدَّل جوابُه. */
  const path=new URL(req.url).pathname,own=path===UPDATING_PAGE,api=path.indexOf('/api/')===0;
  e.respondWith(fetch(req.url,{cache:'no-store',credentials:'same-origin',redirect:'follow'})
   .then(r=>{
    if(r&&!api&&isUpdatingStatus(r.status))return updatingResponse().then(page=>page||r);
    if(r&&r.ok&&!own){const copy=r.clone();caches.open(CACHE).then(c=>c.put('/index.html',copy));void refillUpdatingPage()}
    return r;
   })
   .catch(()=>caches.match('/index.html').then(shell=>shell||(api||(self.navigator&&self.navigator.onLine===false)?undefined:updatingResponse().then(page=>page||undefined)))));
  return;
 }
 const url=new URL(req.url);
 if(url.origin!==location.origin)return;
 // نقطة الإصدار لا تُخزَّن أبدًا: هي الحقيقة التي يُقارن بها.
 if(url.pathname==='/api/version'){e.respondWith(fetch(req,{cache:'no-store'}));return;}
 if(HASHED.test(url.pathname)){
  e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>putAsset(c,req,copy))}return r})));
  return;
 }
 // بقية أصول نفس الأصل: الشبكة أولًا، والكاش احتياطًا عند انقطاع الاتصال.
 // وخطٌّ أو أيقونةٌ طُلبت أثناء النشر فجاءت صفحةُ خطأ المنصّة: النسخةُ المحفوظة أفضل. و/api يبقى كما جاء.
 e.respondWith(fetch(req).then(r=>{if(r.ok&&url.pathname.indexOf('/api/')!==0){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy))}else if(isUpdatingStatus(r.status)&&url.pathname.indexOf('/api/')!==0)return caches.match(req).then(hit=>hit||r);return r}).catch(()=>caches.match(req)));
});
