const V = 'ciclo-v5';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon.svg', 'baby3d.js', 'vendor/three.module.min.js'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
// sempre busca a versão mais nova no servidor (revalida o cache do navegador); só usa a cópia guardada se estiver sem internet
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(V).then(ch => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
