/* Eureka Hair App — service worker.
   App shell is precached on install; hashed build assets are cached on first
   use; navigations go network-first and fall back to the cached shell so the
   app still opens offline. Bump CACHE whenever the shell list changes. */
const CACHE = 'eureka-shell-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

/* Every build asset is hashed, so the list cannot be hardcoded. Vite's build
   manifest names them all; parsing index.html is the fallback, and it at least
   covers the entry bundle so the app can boot. Without this the first load
   requests the entry before the worker controls the page, and a later offline
   reload renders nothing. */
async function precacheAssets(cache) {
  try {
    const manifest = await (await fetch('/.vite/manifest.json', { cache: 'no-cache' })).json();
    const urls = new Set();
    for (const entry of Object.values(manifest)) {
      if (entry.file) urls.add(`/${entry.file}`);
      for (const css of entry.css ?? []) urls.add(`/${css}`);
      for (const asset of entry.assets ?? []) urls.add(`/${asset}`);
    }
    if (urls.size) {
      await Promise.all([...urls].map((url) => cache.add(url).catch(() => undefined)));
      return;
    }
  } catch {
    /* fall through to reading the shell HTML */
  }
  try {
    const html = await (await cache.match('/index.html')).text();
    const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)));
  } catch {
    /* the app still works online; the next visit will try again */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      await precacheAssets(cache);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App navigations: try the network, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html', { ignoreVary: true })),
    );
    return;
  }

  // Hashed build output never changes, so cache-first is safe.
  // `ignoreVary` matters: the dev/preview server answers with `Vary: Origin`,
  // and a module-script request carries different headers from the plain one
  // used to precache it — without this every asset would miss and the app
  // would not boot offline. The URL hash already makes these responses unique.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((hit) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || refresh;
    }),
  );
});
