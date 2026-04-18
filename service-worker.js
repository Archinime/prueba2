const CACHE_NAME = 'archinime-cyber-cache-v2';

// Recursos críticos a cachear al instalar
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

// Estrategia: Stale-While-Revalidate para recursos estáticos y CDN
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const isStaticAsset = url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|avif|webp)$/);
    const isCDN = url.hostname.includes('jsdelivr.net');

    if (isStaticAsset || isCDN) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(err => {
                        console.warn('Modo offline: Red inaccesible para', event.request.url);
                    });
                    return cachedResponse || fetchPromise;
                });
            })
        );
    }
});