/* ============================================================
   sw.js - Archinime OS Service Worker
   Estrategia híbrida con control absoluto sobre catálogo.js y banners.js
   VERSIÓN 155 - FORZAR ACTUALIZACIÓN
   ============================================================ */

const CACHE_STATIC = 'archinime-static-v155';
const CACHE_DYNAMIC = 'archinime-dynamic-v155';
const CACHE_IMAGES = 'archinime-images-v155';
const CACHE_FONTS = 'archinime-fonts-v155';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/anime-detail.html',
  '/video-player.html',
  '/manifest.json',
  '/Logo_Archinime.avif',
  '/Logo_Archinime.png',
  '/invitado.avif',
  '/galaxia-morado1.avif',
  '/chica_corriendo.gif',
  '/youtube.avif'
];

self.addEventListener('install', event => {
  console.log('[SW] Instalando v155...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Precaching recursos estáticos');
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => console.warn('[SW] Error en precache:', err))
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activando v155...');
  const currentCaches = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_IMAGES, CACHE_FONTS];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[SW] Eliminando caché obsoleta:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const request = event.request;
  if (request.method !== 'GET') return;

  // === CATÁLOGO Y BANNERS SIEMPRE FRESCOS ===
  if (url.pathname.endsWith('/catalogo.js') || url.pathname.endsWith('/banners.js')) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_DYNAMIC).then(cache => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // HTML -> network-first
  if (request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Fuentes, CSS, JS -> stale-while-revalidate
  if (request.destination === 'font' || request.destination === 'style' || request.destination === 'script') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Imágenes, vídeos -> stale-while-revalidate
  if (request.destination === 'image' || request.destination === 'video') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // API / Firestore -> solo red
  if (url.origin.includes('firestore') || url.origin.includes('googleapis') || url.pathname.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Resto -> network-first
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_DYNAMIC);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cachedResponse = await cache.match(request);
    return cachedResponse || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cacheName = getCacheNameForRequest(request);
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {});

  return cachedResponse || fetchPromise;
}

function getCacheNameForRequest(request) {
  const dest = request.destination;
  if (dest === 'image' || dest === 'video') return CACHE_IMAGES;
  if (dest === 'font') return CACHE_FONTS;
  if (dest === 'style' || dest === 'script') return CACHE_STATIC;
  return CACHE_DYNAMIC;
}

// Push
self.addEventListener('push', event => {
  let data = { title: 'Archinime', body: 'Nueva actualización', icon: '/Logo_Archinime.png' };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/Logo_Archinime.png',
      badge: '/Logo_Archinime.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});