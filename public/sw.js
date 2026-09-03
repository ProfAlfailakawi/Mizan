const CACHE='mizan-shell-v4';

/* Hashed build assets: "Name-a1B2c3D4.js". Every deploy mints new hashes, and the old
   entries used to stay cached forever because activate() only drops *other* cache names.
   With route-level code splitting that leak grew from one stale file per deploy to ~30,
   which matters on a venue tablet that is never wiped. Whenever a fresh asset is cached,
   drop the superseded hashes of the same file. */
const ASSET=/\/assets\/(.+)-[A-Za-z0-9_-]{8}\.(js|css)$/;
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

self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/index.html'])).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;if(req.mode==='navigate'){e.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('/index.html',copy));return r}).catch(()=>caches.match('/index.html')));return;}const url=new URL(req.url);if(url.origin===location.origin)e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>putAsset(c,req,copy));}return r})));});
