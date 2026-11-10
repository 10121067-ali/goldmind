// App shell: network-first (always the newest version when online),
// falling back to the cached copy when offline. Market data is never cached here.
const CACHE = 'goldmind-v7';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/ai.js', './js/config.js', './js/data.js', './js/engine.js', './js/i18n.js',
  './js/indicators.js', './js/levels.js', './js/service.js', './js/store.js', './js/strategies.js',
  './js/tv.js', './js/ui.js', './js/views/home.js', './js/views/analysis.js', './js/views/strategies.js',
  './js/views/settings.js', './js/views/today.js', './js/calendar.js', './js/dayforecast.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // A navigate-mode Request can't take an init, so refetch by URL; 'no-cache'
    // makes the browser revalidate instead of serving a stale HTTP-cache copy.
    fetch(e.request.url, { cache: 'no-cache' }).then((res) => {
      if (!res.ok) return res;
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
