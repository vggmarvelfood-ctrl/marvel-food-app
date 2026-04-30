// ============================================================
//  Marvel Food — Service Worker v6
//  Estrategia: Cache-First para activos estáticos e imágenes
//              Network-First para Firebase / API
// ============================================================

const CACHE_NAME   = 'marvel-food-v7';
const IMG_CACHE    = 'marvel-food-img-v7';

// Activos del shell de la app (siempre disponibles offline)
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// Imágenes críticas del menú (hero + productos principales)
// Se precargan en la instalación para carga instantánea
const PRECACHE_IMAGES = [
  // Hero slider
  'https://i.ibb.co/CsY32Zpc/Hulk-6.jpg',
  'https://i.ibb.co/sp9f92tD/DSC04607.jpg',
  'https://i.ibb.co/gLZH7hJW/DSC04609.jpg',
  'https://i.ibb.co/wNQdcXh6/Dr-Strange-8.jpg',
  'https://i.ibb.co/hRgTKHLs/DSC-4850.jpg',
  'https://i.ibb.co/4B4ZCwF/DSC-4842.jpg',
  // Promos del día (una por día de la semana)
  'https://i.ibb.co/MkC0Czcj/Cheese-1.jpg',
  'https://i.ibb.co/5hNX8tBj/Capitan-America.png',
  'https://i.ibb.co/hJ8F2Cz7/Peter-3.jpg',
  'https://i.ibb.co/9kR57Dqt/Ironman-9.jpg',
  'https://i.ibb.co/gLyNRYd1/Stacker-2.jpg',
  'https://i.ibb.co/N2XJ7FKz/Loki-7.jpg',
  'https://i.ibb.co/LzzZcJDR/Black-Phanter-1.jpg',
  // Productos más pedidos
  'https://i.ibb.co/mrvsKzmn/Hulk-4.jpg',
  'https://i.ibb.co/CpbtZ5JN/Big-Marvel-2.jpg',
  'https://i.ibb.co/YV106Zd/Cap-Marvel-1.jpg',
  'https://i.ibb.co/PZcGwdpx/Stacker-1.jpg',
  'https://i.ibb.co/pBmFm18N/Thanos-6.jpg',
  'https://i.ibb.co/HDJ8x89R/Dr-Strange-3.jpg',
  'https://i.ibb.co/qL7nFvtY/Wanda-1.jpg',
  'https://i.ibb.co/wND2yZMC/Natasha-6.jpg',
  'https://i.ibb.co/4RQG77sj/Visi-n-1.jpg',
  'https://i.ibb.co/2YqP8ZsG/Capit-n-Am-rica-1.jpg',
  'https://i.ibb.co/xrNhmwB/Cheese-2.jpg',
  'https://i.ibb.co/pB5HmKcH/Black-Phanter-4.jpg',
  'https://i.ibb.co/xqLrKdV9/DSC-6847.jpg',
  'https://i.ibb.co/yHn0xtm/Perfekta-2.jpg',
  'https://i.ibb.co/QqCz7g2/Libertad-1.jpg',
  // Combos
  'https://i.ibb.co/VcKrxQt7/Iron-x2-papas.png',
  'https://i.ibb.co/ZzmPkFFY/Hulk-x2-papas.png',
  'https://i.ibb.co/XkMDCmTJ/Peter-x2-papas.png',
  'https://i.ibb.co/nqckgRfQ/Capitan-x2-papas.png',
  // Acompañamientos
  'https://i.ibb.co/9kTJXzVs/Papas.png',
  'https://i.ibb.co/8gPmfwg2/Papas-cheddar.png',
  'https://i.ibb.co/WNj8CzDj/Nuggets-2.jpg',
  'https://i.ibb.co/21dhfds8/Aros-de-cebolla-3.jpg',
  'https://i.ibb.co/TM2GDnzT/Ensalada.png',
  'https://i.ibb.co/fVxV4hw1/DSC0062.jpg',
  // Mapas de sucursales
  'https://i.ibb.co/231rcdfJ/CENTRO.png',
  'https://i.ibb.co/tM1NSHTv/NORTE.png',
  'https://i.ibb.co/1BNnzX5/VGG.png',
  'https://i.ibb.co/84MNBwGC/mapas-2026-5-Funes.png',
  // Otros
  'https://i.ibb.co/rKMLXVhD/Wolverine.png',
  'https://i.ibb.co/bfwDNHq/TV-promo-efectivo-martes.jpg',
];

// Dominios que siempre van a la red (Firebase, APIs, fuentes)
const NETWORK_ONLY = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'fcmregistrations.googleapis.com',
  'www.gstatic.com',          // Firebase SDK (módulos dinámicos)
  'api.emailjs.com',
  'nominatim.openstreetmap.org',
  'api.mercadopago.com',
];

// ── INSTALACIÓN: precargar shell + imágenes críticas ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      // Shell de la app
      caches.open(CACHE_NAME).then(cache =>
        cache.addAll(SHELL_ASSETS).catch(e =>
          console.warn('[SW] Shell precache parcial:', e)
        )
      ),
      // Imágenes del menú (cada una en silencio si falla — CDN externa)
      caches.open(IMG_CACHE).then(cache =>
        Promise.allSettled(
          PRECACHE_IMAGES.map(url =>
            cache.add(url).catch(() => {}) // fallo silencioso por imagen
          )
        )
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ── ACTIVACIÓN: limpiar cachés viejos ─────────────────────────────────────
self.addEventListener('activate', event => {
  const valid = new Set([CACHE_NAME, IMG_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !valid.has(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: lógica por tipo de recurso ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorar peticiones no-GET y chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // 2. Siempre ir a la red para Firebase / APIs críticas
  if (NETWORK_ONLY.some(domain => url.hostname.includes(domain))) return;

  // 3. Imágenes: Cache-First con fallback a red y almacenamiento en caché
  if (/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(url.pathname) ||
      url.hostname === 'i.ibb.co') {
    event.respondWith(
      caches.open(IMG_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // 4. Fuentes de Google: Cache-First
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // 5. Shell de la app: Network-First con fallback al caché
  //    (para que index.html siempre tenga el código más reciente)
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          // IMPORTANTE: clonar ANTES de retornar para evitar
          // "Response body is already used" cuando la promesa
          // de caches.open resuelve después de que el browser
          // ya empezó a consumir el response original.
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, toCache));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
