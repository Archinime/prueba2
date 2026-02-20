const CACHE_VERSION = 'archinime-v1.0';
const CACHE_ASSETS = 'archinime-assets-cache';
const CACHE_DATA = 'archinime-data-cache';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles-index.css',
  '/script-index.js',
  '/index-data.js',
  '/animaciones.js',
  '/musica_fondo.js',
  '/notification-system.js',
  '/pwa-handler.js',
  '/Logo_Archinime.avif',
  '/galaxia-morado1.avif',
  '/manifest.json'
];

// Instalar y cachear assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_ASSETS).then(cache => {
      console.log('✓ Cacheando assets...');
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.log('⚠ Algunos assets no pudieron cachearse:', err);
      });
    })
  );
  self.skipWaiting(); // Activar inmediatamente
});

// Activar y limpiar caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_ASSETS && cacheName !== CACHE_DATA) {
            console.log('🗑️ Limpiando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Tomar control inmediatamente
});

// Estrategia: Network First para datos, Cache First para assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Archivos de datos (JSON, JS de datos)
  if (url.pathname.includes('-data.js') || url.pathname.includes('.json')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (!response.ok) throw new Error('Network error');
          const clone = response.clone();
          caches.open(CACHE_DATA).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || new Response('Offline - data not available', { status: 503 });
          });
        })
    );
  }
  // Assets (CSS, imágenes, etc)
  else if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          if (!response.ok) return cached || response;
          
          const clone = response.clone();
          caches.open(CACHE_ASSETS).then(cache => {
            cache.put(request, clone);
          });
          return response;
        }).catch(() => cached);
      })
    );
  }
});

// Notificar a los clientes cuando hay actualización
self.addEventListener('controllerchange', () => {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'CACHE_UPDATED',
        message: 'Datos precargados para carga rápida en próximas visitas'
      });
    });
  });
});