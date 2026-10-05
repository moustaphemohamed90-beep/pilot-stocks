/* Pilote Stocks : permet d'ouvrir l'application sans réseau une fois visitée.
   Stratégie « réseau d'abord » : la version en ligne est toujours prioritaire. */
const CACHE = 'pilote-stocks-v0.3.1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'assets/icon.svg', 'assets/icon-192.png', 'assets/fonts/fonts.css',
  'assets/vendor/chart.umd.js', 'assets/vendor/xlsx.full.min.js', 'assets/vendor/jspdf.umd.min.js', 'assets/exemple-donnees.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
