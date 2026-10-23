// Caches the big engine files (face tracking WASM, model, fonts) so repeat visits and
// booth tablets start instantly. App files (HTML/JS/CSS) always come from the network,
// so published edits show up right away. If you replace anything in vendor/, bump CACHE.
const CACHE = 'vf-engine-v2';
const ENGINE = /\/vendor\/(mediapipe|models|fonts)\//;
// fetched on install so even the first visit leaves a complete cache behind
const PRECACHE = [
  'vendor/mediapipe/vision_bundle.mjs',
  'vendor/mediapipe/wasm/vision_wasm_internal.js',
  'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  'vendor/models/face_landmarker.task',
  'vendor/fonts/fonts.css',
  'vendor/fonts/Syncopate-400.woff2',
  'vendor/fonts/Syncopate-700.woff2',
  'vendor/fonts/RobotoMono-400.woff2',
];
// revalidate with the server (a cheap 304 when unchanged) instead of trusting the HTTP cache,
// so a bumped CACHE really picks up replaced files
const fresh = (req) => fetch(new Request(req, { cache: 'no-cache' }));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) =>
    Promise.all(PRECACHE.map((p) => fresh(new URL(p, self.registration.scope)).then((res) => res.ok && cache.put(res.url, res)).catch(() => {}))),
  ).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('vf-engine-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !ENGINE.test(url.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fresh(e.request);
    if (res.ok && res.status === 200) cache.put(e.request, res.clone());
    return res;
  }));
});
