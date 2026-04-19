const CACHE_NAME = 'marvel-food-v1';
const urlsToCache = [
  './tienda marvel.html'
];

// Instalación: guardamos el archivo principal
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptar peticiones: Busca en internet primero, si falla, usa el caché
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});