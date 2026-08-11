// HeroPad service worker — minimal offline cache for the app shell.
// ----------------------------------------------------------------
// Strategy:
//   - On install, precache the home shell + brand assets.
//   - On fetch, network-first for HTML/JS (so updates ship quickly), cache-
//     first for images / fonts (don't refetch character art on every page).
//
// We bump CACHE_VERSION whenever we want to evict old caches.

// Precache ONLY the shell. Brand art used to be listed here, which meant a
// customer opening /loyalty on café cellular downloaded ~11 MB of images they
// would never see, competing with the live-stamp polling for bandwidth. The
// cache-first image rule below still caches art the moment it is actually
// used, so nothing is lost offline.
const CACHE_VERSION = 'heropad-v2';
const PRECACHE = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isImage = /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(url.pathname);

  if (isImage) {
    // Cache-first for images.
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Network-first for everything else (HTML, JS, JSON).
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
