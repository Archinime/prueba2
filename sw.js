// Service Worker con nombre de caché único (basado en timestamp)
// Cada vez que se modifica este archivo, la caché anterior se invalida automáticamente.
const CACHE_NAME = 'archinime-os-v' + Date.now();

const urlsToCache = [
  './',
  'index.html',
  'styles-index.css',
  'Logo_Archinime.avif'
];

// Instalación: cachea lo básico
self.addEventListener('install', event => {
  self.skipWaiting();
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
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});