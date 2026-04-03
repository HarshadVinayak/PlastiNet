const CACHE_NAME = 'plastinet-shell-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/api.js',
  '/qr.js',
  '/cloe-brain.js',
  '/assets/neon-grid.svg',
  '/assets/app-icon-source.png',
  '/assets/app-icon-192.png',
  '/assets/app-icon-512.png',
  '/assets/app-icon-maskable-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const networkFirstPaths = new Set([
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/api.js',
    '/qr.js',
    '/cloe-brain.js',
    '/manifest.webmanifest'
  ]);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/scan') || url.pathname.startsWith('/registerQR') || url.pathname === '/health') return;

  if (request.mode === 'navigate' || request.destination === 'script' || request.destination === 'style' || networkFirstPaths.has(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          throw new Error(`No cached response for ${url.pathname}`);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      });
    })
  );
});
