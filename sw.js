const CACHE='hygiene-shell-v2-preview-ready-1';
const FILES=['./','./index.html','./styles.css','./app.js','./ui.js','./core.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const urls=new Set(FILES.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hygiene-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const r=event.request;if(r.method!=='GET'||!urls.has(r.url))return;event.respondWith(caches.open(CACHE).then(async c=>{const saved=await c.match(r);return saved||fetch(r);}));});
