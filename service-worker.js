/* service-worker.js - safer precache + network fallback */
const CACHE_NAME = 'treevol-static-v1';
const PRECACHE_URLS = [
  'index.html',
  'manifest.json',
  'style.css',
  'script.js',
  'book_data.json',
  'offline.html',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'favicon.ico'
];

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // try to addAll but avoid failing entire install if one asset missing
      const addResults = await Promise.allSettled(
        PRECACHE_URLS.map(u => fetch(u, {cache: 'no-store'}).then(r => {
          if (!r.ok) throw new Error('Fetch failed: ' + u + ' (' + r.status + ')');
          return cache.put(u, r.clone());
        }))
      );
      // Optional: log which assets failed
      const failed = addResults
        .map((r,i) => ({res:r, url: PRECACHE_URLS[i]}))
        .filter(x => x.res.status === 'rejected');
      if (failed.length) {
        console.warn('SW install — some assets failed to cache:', failed.map(f => f.url));
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestURL = new URL(event.request.url);

  // navigation requests -> network first, fallback to cache/offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(resp => {
        // put fresh index in cache
        if (requestURL.origin === location.origin) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resp.clone()));
        }
        return resp;
      }).catch(() => caches.match('index.html').then(r => r || caches.match('offline.html')))
    );
    return;
  }

  // for other GETs: network first, fallback to cache
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
