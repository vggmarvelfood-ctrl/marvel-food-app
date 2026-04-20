const CACHE_NAME = 'marvel-food-v3';
const urlsToCache = ['/', '/index.html'];

// Instalación
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activación: elimina cachés viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Estrategia NETWORK FIRST ──────────────────────────
// Siempre va a la red primero → precios de Firebase siempre frescos.
// Solo usa el caché si no hay conexión.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
