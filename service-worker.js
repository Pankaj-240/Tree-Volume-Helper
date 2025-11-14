// service-worker.js - simple precache + network fallback
const CACHE_NAME = 'treevol-static-v1';
const PRECACHE_URLS = [
  '/',               // root (index.html)
  '/index.html',
  '/styles.css',
  '/app.js',
  '/favicon.ico',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
  // add other assets you need offline, e.g. '/data/volumes.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const requestURL = new URL(event.request.url);

  // For navigation requests (user typing URL / clicking link) -> serve network first, fallback to cache -> offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then(resp => resp || caches.match('/offline.html'))
      )
    );
    return;
  }

  // For other requests: try network, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // update cache for same-origin responses
        if (requestURL.origin === location.origin) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
