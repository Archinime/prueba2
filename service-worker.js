const CACHE_NAME = 'archinime-cyber-cache-v1';

// Recursos críticos a cachear inmediatamente al instalar
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    // Limpieza de cachés antiguos si cambias la versión de CACHE_NAME
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia: Stale-While-Revalidate
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Aplicar la estrategia a JS, CSS, imágenes y peticiones a jsdelivr
    const isStaticAsset = url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|avif|webp)$/);
    const isCDN = url.hostname.includes('jsdelivr.net');

    if (isStaticAsset || isCDN) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    
                    // Promesa de red: busca el recurso fresco y actualiza el caché
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        // Solo cacheamos respuestas exitosas
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(err => {
                        console.warn('Modo offline: Red inaccesible para', event.request.url);
                    });

                    // Retornamos el caché inmediatamente si existe, si no, esperamos a la red
                    return cachedResponse || fetchPromise;
                });
            })
        );
    }
});