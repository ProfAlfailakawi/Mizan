/* Mizan PWA service worker — offline-first for the app shell. */
const CACHE = 'mizan-v1';
const ASSETS = [
  './',
  './index.html',
  './broadcast.html',
  './styles.css',
  './home.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg',
  './icons/logo.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Network-first for navigations, cache-first for assets.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => { cachePut(req, res.clone()); return res; }))
  );
});

function cachePut(req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    caches.open(CACHE).then(c => c.put(req, res)).catch(() => {});
  }
}
