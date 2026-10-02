const APP_CACHE = 'hygiene-shell-v1';
const PREFIX = 'hygiene-shell-';
const FILES = ['./', './index.html', './styles.css', './app.js', './core.js', './config.js', './map.js', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== APP_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const u = new URL(event.request.url), base = new URL(self.registration.scope);
  // Ratings are fetched by the app and always carry an explicit checked time.
  if (event.request.method !== 'GET' || u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./index.html', base).href))); return;
  }
  const allowed = FILES.map(f => new URL(f, base).href);
  if (!allowed.includes(u.href)) return;
  event.respondWith((async () => {
    try { const r = await fetch(event.request); if(r.ok) { const cache=await caches.open(APP_CACHE); await cache.put(event.request,r.clone()); } return r; }
    catch { return await caches.match(event.request) || new Response('Offline',{status:503}); }
  })());
});
