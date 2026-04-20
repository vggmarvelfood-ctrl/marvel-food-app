// ═══════════════════════════════════════════════════════════
//  Marvel Food — Service Worker v4
//  Estrategia: Cache-first para assets propios,
//              BYPASS total para requests externos
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'marvel-food-v4';

// Solo se cachean los archivos que VIVEN EN TU PROPIO DOMINIO
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/manifest.json'
];

// Dominios externos que el SW NUNCA debe interceptar
// (Firebase, Google Fonts, CDNs de imágenes, etc.)
const BYPASS_ORIGINS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'firebasestorage.googleapis.com',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'i.ibb.co',
  'photon.komoot.io',
  'geocode.maps.co',
  'nominatim.openstreetmap.org',
  'api.emailjs.com'
];

// ── Instalación ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll uno por uno para que un fallo no rompa todo
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(e => console.warn('[SW] No se pudo cachear:', url, e))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activación ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: lógica de respuesta ───────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Solo interceptar GET
  if (event.request.method !== 'GET') return;

  // 2. BYPASS para dominios externos — el navegador los maneja directo
  if (BYPASS_ORIGINS.some(origin => url.hostname.includes(origin))) return;

  // 3. BYPASS para rutas de Vercel/API internas que no son assets
  if (url.pathname.startsWith('/api/')) return;

  // 4. Para assets propios: Network First con timeout de 4s
  //    Si la red falla o tarda → sirve desde caché
  event.respondWith(
    Promise.race([
      // Red con timeout de 4 segundos
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('timeout')), 4000);
        fetch(event.request)
          .then(response => {
            // Solo cachear respuestas válidas same-origin
            if (response && response.ok && response.type === 'basic') {
              const clone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clone))
                .catch(() => {}); // silenciar errores de cache
            }
            resolve(response);
          })
          .catch(reject);
      })
    ]).catch(() => {
      // Timeout o error de red → buscar en caché
      return caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          // Si es navegación y no hay caché, devolver index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          // Para otros assets, devolver respuesta vacía en vez de error
          return new Response('', { status: 408, statusText: 'Offline' });
        });
    })
  );
});
