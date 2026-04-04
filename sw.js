const CACHE_NAME = 'archinime-os-v2';

// Archivos básicos a cachear (solo los esenciales)
const urlsToCache = [
  './',
  'index.html',
  'styles-index.css',
  'Logo_Archinime.avif'
];

// Instalación: cachea solo lo básico
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Activación: limpia cachés viejas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Estrategia: Network First (siempre intenta ir a la red primero)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Actualiza la caché con la nueva respuesta
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // Si falla la red, busca en caché
        return caches.match(event.request);
      })
  );
});