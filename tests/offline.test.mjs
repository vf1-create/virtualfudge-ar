// The service worker: the first visit caches the whole engine, and repeat visits load it from the cache.
import { launch, page, open, BASE, PHONE } from './lib.mjs';

const ENGINE = ['vision_bundle.mjs', 'vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'face_landmarker.task', 'fonts.css', 'Syncopate-400.woff2', 'Syncopate-700.woff2', 'RobotoMono-400.woff2'];

export default async function (check) {
  const b = await launch();
  try {
    const p = await page(b, PHONE);
    await p.goto(BASE);
    const cachedFiles = () => p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname.split('/').pop()); return out; });
    let missing = ENGINE;
    for (let t = Date.now(); missing.length && Date.now() - t < 40000; await p.waitForTimeout(500)) { const c = await cachedFiles(); missing = ENGINE.filter((f) => !c.includes(f)); }
    check('first visit caches the whole engine', !missing.length, 'missing: ' + missing.join(', '));
    await p.reload(); // the page is now controlled by the service worker
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
    const fromSW = new Set();
    p.on('response', (r) => r.fromServiceWorker() && fromSW.add(new URL(r.url()).pathname.split('/').pop()));
    await open(p);
    await p.click('#startBtn', { force: true });
    const face = await p.waitForFunction(() => window.__ar?.faces?.length > 0, null, { timeout: 60000 }).then(() => true, () => false);
    const notCached = ['vision_bundle.mjs', 'vision_wasm_internal.wasm', 'face_landmarker.task'].filter((f) => !fromSW.has(f));
    check('repeat visit loads the engine from the cache', face && !notCached.length, `face=${face} not from cache: ${notCached.join(', ')}`);
    check('offline: no page errors', !p.errs.length, p.errs.join(' | '));
  } finally { await b.close(); }
}
