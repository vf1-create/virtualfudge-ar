// Caches the big, versioned engine files (face tracking WASM, model, fonts) so repeat
// visits and booth tablets start instantly. App files (HTML/JS/CSS) always come from
// the network, so published edits show up right away.
const CACHE = 'vf-engine-v1';
const ENGINE = /\/vendor\/(mediapipe|models|fonts)\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('vf-engine-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !ENGINE.test(url.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok && res.status === 200) cache.put(e.request, res.clone());
    return res;
  }));
});
