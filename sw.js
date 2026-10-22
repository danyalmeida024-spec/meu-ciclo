const V = 'ciclo-v3';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon.svg', 'baby3d.js', 'vendor/three.module.min.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))));
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(ch => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request))
));
