const CACHE_PREFIX = 'honest-academy-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;

const APP_FILES = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './fonts/Chillax-Variable.woff2',
    './fonts/GEDinkum-Bold.ttf',
    './honest-annotator/honest-annotator.css',
    './honest-annotator/honest-annotator.js',
    './vendor/pdf.min.mjs',
    './vendor/pdf.worker.min.mjs',
    './vendor/pdfjs-LICENSE.txt'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names
                    .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true })
            .then(cachedResponse => {
                if (cachedResponse) return cachedResponse;

                return fetch(event.request)
                    .then(networkResponse => {
                        if (networkResponse.ok) {
                            const cachedCopy = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, cachedCopy));
                        }
                        return networkResponse;
                    })
                    .catch(async () => {
                        if (event.request.mode === 'navigate') {
                            const offlinePage = await caches.match('./index.html');
                            if (offlinePage) return offlinePage;
                        }
                        return Response.error();
                    });
            })
    );
});
