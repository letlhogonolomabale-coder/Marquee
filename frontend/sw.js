// sw.js — minimal offline-shell service worker.
//
// Strategy: cache the app shell (HTML/CSS/JS, which is all one file here)
// so the app opens instantly and works offline; always go to the network
// for API calls (/api/...) so data is never served stale.
//
// Bump CACHE_NAME whenever you change Marquee.html so old clients pick up
// the new version instead of serving a cached copy forever.
const CACHE_NAME = 'marquee-shell-v1';
const SHELL_FILES = ['/', '/Marquee.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls — always hit the network.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful same-origin GET responses.
        if (event.request.method === 'GET' && response.ok && url.origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }).catch(() => caches.match('/Marquee.html'))
  );
});
