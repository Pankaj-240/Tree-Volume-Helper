/* service-worker.js - safe precache + network fallback */

const CACHE_NAME = 'treevol-static-v2'; // bump when you change assets
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

/* helper: trim cache by keeping max entries (optional) */
async function trimCache(cacheName, maxItems){
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems){
      const remove = keys.slice(0, keys.length - maxItems);
      await Promise.all(remove.map(k => cache.delete(k)));
    }
  } catch (e) { /* ignore */ }
}

/* Install: precache resources */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const failed = [];
    for (const url of PRECACHE_URLS){
      try {
        const resp = await fetch(url, {cache: 'no-store'});
        if (!resp || !resp.ok) throw new Error('Fetch failed: ' + url);
        await cache.put(url, resp.clone());
      } catch (err){
        console.warn('SW install: failed to cache', url, err);
        failed.push(url);
      }
    }
    await self.skipWaiting();
  })());
});

/* Activate: clean up old caches */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Fetch: navigation -> network-first with offline fallback. Other GET -> network-first then cache, with icon runtime caching. */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestURL = new URL(event.request.url);

  // Navigation requests (page loads)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          // cache successful navigations from our origin
          if (requestURL.origin === location.origin){
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => {
          // return cached index.html if available, otherwise offline.html
          return caches.match('index.html').then(r => r || caches.match('offline.html'));
        })
    );
    return;
  }

  // For same-origin icons/images -> runtime cache with fallback
  if (requestURL.origin === location.origin && requestURL.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(networkResp => {
            // cache icon for later
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResp.clone());
              // small trim (optional)
              trimCache(CACHE_NAME, 60);
            });
            return networkResp;
          })
          .catch(() => caches.match('icons/icon-192.png')); // fallback icon
      })
    );
    return;
  }

  // Default: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // store in cache for offline use (only same-origin)
        if (requestURL.origin === location.origin){
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
