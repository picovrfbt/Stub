// Keeps the app's screens on your device so it opens instantly and works offline.
// Your budget data isn't kept here; it syncs through your Google account.
const CACHE = 'stub-%%BUILD%%'; // stamped on every deploy (see .github/workflows/pages.yml), so updates replace the old copy
const SHELL = ['./', 'index.html', 'core.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  // 'reload' skips the browser's own cache, so a new version never saves an old copy
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // data requests, logos, etc. always go to the network
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // the app itself: always the latest version when online, the saved copy when offline
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(c =>
      fetch(e.request, { cache: 'no-cache' })
        .then(r => { if (r.ok) c.put('./', r.clone()); return r; })
        .catch(() => c.match('./', { ignoreSearch: true }))));
    return;
  }
  // icons etc.: show the saved copy right away and refresh it in the background
  e.respondWith(caches.open(CACHE).then(async c => {
    const saved = await c.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => saved);
    return saved || fresh;
  }));
});
