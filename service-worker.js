const CACHE_NAME = 'marvel-food-v2';
const urlsToCache = [
  './',
  './index.html'
];

// Instalación: pre-cachear el shell de la app
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting(); // Activa el nuevo SW de inmediato
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

// ── Estrategia: NETWORK FIRST ──────────────────────────────
// Siempre busca en la red primero (garantiza precios actualizados
// desde Firebase). Solo usa el caché si no hay conexión.
self.addEventListener('fetch', event => {
  // Solo interceptar peticiones GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Actualizar el caché con la respuesta fresca
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return networkResponse;
      })
      .catch(() => {
        // Sin conexión → servir desde caché
        return caches.match(event.request);
      })
  );
});
