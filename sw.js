// Nombre de caché dinámico basado en timestamp (se genera cada vez que se actualiza el SW)
const CACHE_NAME = 'archinime-os-v' + Date.now();

const urlsToCache = [
  './',
  'index.html',
  'styles-index.css',
  'Logo_Archinime.avif'
];

// Instalación: cachea lo básico
self.addEventListener('install', event => {
  self.skipWaiting(); // Fuerza a activarse inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Activación: elimina todas las cachés antiguas (cualquier nombre que no sea el actual)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eliminando caché antigua:', cacheName);
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
        // Si la red responde, actualiza la caché y devuelve la respuesta
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // Si falla la red, devuelve desde caché
        return caches.match(event.request);
      })
  );
});