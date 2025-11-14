/* service-worker.js - safe precache + network fallback (block comments only) */

const CACHE_NAME = 'treevol-static-v1';
const PRECACHE_URLS = [
  'index.html',
  'manifest.json',
  'style.css',
  'script.js',
  'book_data.json',
  'offline.html',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

/* Install: sequential fetch + cache.put with immediate clone */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const failed = [];
    for (const url of PRECACHE_URLS) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response || !response.ok) throw new Error('Fetch failed: ' + url + ' (' + (response && response.status) + ')');
        /* clone immediately and store in cache */
        await cache.put(url, response.clone());
      } catch (err) {
        console.warn('SW install: failed to cache', url, err);
        failed.push(url);
      }
    }
    if (failed.length) console.warn('SW install completed with failures for:', failed);
    await self.skipWaiting();
  })());
});

/* Activate: clear old caches and take control */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Fetch handler: navigation -> network-first with fallback; other resources -> network-first then cache */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestURL = new URL(event.request.url);

  /* navigation requests (page load / address bar) */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if (requestURL.origin === location.origin) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => caches.match('index.html').then(r => r || caches.match('offline.html')))
    );
    return;
  }

  /* other GET requests */
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (requestURL.origin === location.origin) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
