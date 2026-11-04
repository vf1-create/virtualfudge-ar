// Automated checks for the Roland phase two demo. Writes TEST-REPORT.md next to index.html.
//   node a/roland-8dkrxv/tests/run.mjs                 (serves the repo locally on :8092)
//   node a/roland-8dkrxv/tests/run.mjs --base https://vf1-create.github.io/virtualfudge-ar/a/roland-8dkrxv/
// Needs Playwright's Chromium and jsqr on NODE_PATH (npm i jsqr).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const JSQR = require.resolve('jsqr');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.dirname(HERE);
const REPO = path.resolve(DEMO, '../..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
let BASE = arg('--base');
let server;
if (!BASE) {
  server = spawn(process.execPath, [path.join(REPO, 'serve.mjs')], { env: { ...process.env, PORT: '8092' }, stdio: 'ignore' });
  BASE = 'http://localhost:8092/a/roland-8dkrxv/';
  for (let i = 0; i < 50; i++) { if (await fetch(BASE).then((r) => r.ok, () => false)) break; await new Promise((r) => setTimeout(r, 100)); }
}
const LIVE = BASE.startsWith('https://vf1-create.github.io/');
const ORIGIN = new URL(BASE).origin;
const results = [];
const check = (group, name, ok, detail = '') => { results.push({ group, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail ? '  — ' + detail : ''}`); };

const data = JSON.parse(fs.readFileSync(path.join(DEMO, 'data/instruments.json'), 'utf8'));
const ids = data.instruments.map((i) => i.id);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

// every page: collect errors and every request that leaves this origin
async function newPage(opts = {}) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    window.__acCount = 0;
    for (const k of ['AudioContext', 'webkitAudioContext']) {
      const AC = window[k]; if (!AC) continue;
      window[k] = class extends AC { constructor(...a) { super(...a); window.__acCount++; } };
    }
  });
  const p = await ctx.newPage();
  p.errs = []; p.external = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errs.push(m.text()); });
  p.on('request', (r) => { const u = new URL(r.url()); if (!['data:', 'blob:'].includes(u.protocol) && u.origin !== ORIGIN) p.external.push(r.url()); });
  return p;
}
const allErrs = [], allExternal = [];
const done = async (p) => { allErrs.push(...p.errs); allExternal.push(...p.external); await p.context().close(); };

// ── files ──
{
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : files.push(path.relative(DEMO, f)); });
  walk(DEMO);
  const audio = files.filter((f) => /\.(mp3|wav|ogg|oga|m4a|aac|flac|aif|aiff|opus|mid|midi|webm|mp4)$/i.test(f));
  check('Build', 'No audio files in the build', audio.length === 0, audio.join(', '));
  const imgs = files.filter((f) => /\.(png|jpe?g|gif|webp|avif|svg|bmp|tiff?|heic)$/i.test(f));
  const allowed = ['og.png', 'print/placement-mockup.png', 'print/qr-sign-808-4x6.png', ...ids.map((id) => `models/posters/${id}.png`)];
  const extra = imgs.filter((f) => !allowed.includes(f) && !f.startsWith('tests/out/'));
  check('Build', 'Only generated images (og.png, the two print PNGs and a still of each of our own 3D models, all rendered by tools/make-print.mjs); no album art, photos or copied graphics', extra.length === 0, extra.join(', ') || imgs.filter((f) => !f.startsWith('tests/out/')).join(', '));
  const src = files.filter((f) => /\.(html|js|mjs|css|json)$/.test(f) && !f.startsWith('vendor/') && !f.startsWith('tests/'));
  const text = src.map((f) => fs.readFileSync(path.join(DEMO, f), 'utf8')).join('\n');
  check('Build', 'No <audio>, data:audio or sample loading in our code', !/<audio|data:audio|decodeAudioData|\.mp3|\.wav/i.test(text));
  check('Build', 'No remote images or image URLs in our code', !/https?:\/\/[^"'\s]+\.(png|jpe?g|gif|webp|svg)/i.test(text.replace(/vf1-create\.github\.io\/virtualfudge-ar\/a\/roland-8dkrxv\/og\.png/g, '')));
  const paid = /(api\.openai|anthropic\.com|googleapis\.com\/(?!$)|maps\.google|firebase|amplitude|segment\.io|mixpanel|stripe|8thwall|sketchfab|aws|azure|cloudinary|algolia|sentry|google-analytics|googletagmanager)/i;
  check('Build', 'No paid services, APIs, trackers or databases referenced in our code', !paid.test(text), (text.match(paid) || [''])[0]);
  for (const id of ids) {
    const g = fs.statSync(path.join(DEMO, `models/${id}.glb`)).size, u = fs.statSync(path.join(DEMO, `models/${id}.usdz`)).size;
    const pst = path.join(DEMO, `models/posters/${id}.png`);
    check('Models', `${id}: loading picture exists (${fs.existsSync(pst) ? (fs.statSync(pst).size / 1024).toFixed(0) : '–'} KB)`, fs.existsSync(pst) && fs.statSync(pst).size < 200e3);
    check('Models', `${id}.glb ${(g / 1024).toFixed(0)} KB and .usdz ${(u / 1024).toFixed(0)} KB, each under 3 MB`, g < 3e6 && u < 3e6);
  }
  const html = fs.readFileSync(path.join(DEMO, 'index.html'), 'utf8');
  check('Privacy', 'noindex meta tag present', /<meta name="robots" content="noindex[^"]*">/.test(html));
  check('Privacy', 'Not linked from anywhere else in the repo', !execGrep());
  check('Preview', 'og:title is "Roland Heritage Map: phase two demo"', html.includes('<meta property="og:title" content="Roland Heritage Map: phase two demo">'));
  const png = fs.readFileSync(path.join(DEMO, 'og.png'));
  check('Preview', 'og.png is 1200 × 627', png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 627, `${png.readUInt32BE(16)} × ${png.readUInt32BE(20)}`);
  const sources = fs.readFileSync(path.join(DEMO, 'SOURCES.md'), 'utf8');
  for (const i of data.instruments) {
    check('Sources', `${i.model} ${i.year} has a source in SOURCES.md`, new RegExp(`${i.model}[^\\n]*${i.year}`).test(sources));
    for (const s of i.songs) check('Sources', `"${s.title}" – ${s.artist}, ${s.year} (${i.model}) has a source`, sources.includes(`${s.title} – ${s.artist}, ${s.year}`));
  }
}
function execGrep() {
  const hits = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (['.git', 'node_modules', 'a'].includes(e.name) && d === REPO) return;
    if (e.isDirectory()) walk(f); else if (/\.(html|js|mjs|md|json|xml|txt|webmanifest)$/.test(e.name) && /roland/i.test(fs.readFileSync(f, 'utf8'))) hits.push(path.relative(REPO, f));
  });
  walk(REPO);
  return hits.filter((h) => h !== 'tools/remove-activation.js').length > 0;
}

// ── landing speed on throttled 4G (Lighthouse "slow 4G": 150 ms RTT, 1.6 Mbps down, 4× CPU) ──
{
  const p = await newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForSelector('.station');
  const tMap = Date.now() - t0;
  const bytes = await p.evaluate(() => performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0));
  check('Speed', `Heritage map usable in ${(tMap / 1000).toFixed(2)} s on throttled 4G (target under 3 s)`, tMap < 3000, `${(bytes / 1024).toFixed(0)} KB before the 3D viewer is fetched in the background`);
  await done(p);
}

// ── layout, stores, console errors ──
for (const [w, h] of [[375, 812], [1440, 900]]) {
  for (const q of ['', '?i=tr-808']) {
    const p = await newPage({ viewport: { width: w, height: h }, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await p.goto(BASE + q);
    await p.waitForSelector('.station');
    if (q) await p.waitForFunction(() => document.querySelector('model-viewer')?.loaded, null, { timeout: 30000 });
    const sw = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector('#card').hidden ? 0 : document.querySelector('#card').scrollWidth) - innerWidth);
    check('Layout', `${q ? '808 card' : 'Timeline'} at ${w}px: no horizontal scroll`, sw <= 0, `overflow ${sw}px`);
    const foot = await p.evaluate(() => [...document.querySelectorAll('.foot')].filter((f) => f.offsetParent !== null || f.closest('.card:not([hidden])')).map((f) => f.textContent.includes('Phase two demo by Virtual Fudge for Roland') && f.querySelector('a').href === 'https://calendar.app.google/aTmHkh5B71PkiYVe7?src=roland'));
    check('Layout', `${q ? '808 card' : 'Timeline'} at ${w}px: footer with the calendar link`, foot.length && foot.every(Boolean));
    fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
    await p.screenshot({ path: path.join(HERE, 'out', `${q ? 'card' : 'map'}-${w}.png`) });
    await done(p);
  }
}
for (const [store, name, n] of [['nyc', 'Roland Store New York City', 7], ['london', 'Roland Store London', 5], ['tokyo', 'Roland Store Tokyo', 7]]) {
  const p = await newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${BASE}?store=${store}`);
  await p.waitForSelector('.station');
  const r = await p.evaluate(() => ({ name: document.querySelector('#storeName').textContent, addr: document.querySelector('#storeAddr').textContent, n: document.querySelectorAll('.station').length, line: getComputedStyle(document.documentElement).getPropertyValue('--line').trim() }));
  check('Stores', `?store=${store} shows "${r.name}" (${r.addr}) with ${r.n} stations`, r.name === name && r.n === n);
  await p.screenshot({ path: path.join(HERE, 'out', `store-${store}.png`) });
  await done(p);
}

// ── every instrument card opens, its 3D model loads, songs are text + 3 links ──
{
  const p = await newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(BASE);
  await p.waitForSelector('.station');
  for (const id of ids) {
    await p.click(`.station[data-id="${id}"]`);
    const ok = await p.waitForFunction(() => document.querySelector('model-viewer')?.loaded, null, { timeout: 30000 }).then(() => true, () => false);
    const songs = await p.evaluate(() => [...document.querySelectorAll('#songs li')].map((li) => ({ text: li.querySelector('.song').textContent, links: [...li.querySelectorAll('a')].map((a) => new URL(a.href).host) })));
    const linksOk = songs.every((s) => s.links.join() === 'open.spotify.com,music.apple.com,www.youtube.com');
    check('Cards', `${id}: card opens, 3D model loads, ${songs.length} songs as text with Spotify / Apple Music / YouTube links`, ok && songs.length >= 1 && linksOk);
    await p.click('#back');
    await p.waitForSelector('#card', { state: 'hidden' });
  }
  check('Cards', 'Back button returns to the map', await p.evaluate(() => document.querySelector('#card').hidden && !new URL(location.href).searchParams.get('i')));
  await done(p);
}

// ── desktop: 3D + QR that points to the phone version ──
{
  const p = await newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${BASE}?i=tr-808`);
  await p.waitForFunction(() => document.querySelector('model-viewer')?.loaded, null, { timeout: 30000 });
  await p.waitForSelector('#qr:not([hidden])', { timeout: 10000 }).catch(() => {});
  check('Desktop Chrome', '3D view renders the TR-808 (model-viewer loaded)', await p.evaluate(() => document.querySelector('model-viewer').loaded));
  check('Desktop Chrome', 'AR button hidden on desktop (no AR there)', await p.evaluate(() => !document.querySelector('model-viewer').canActivateAR));
  await p.addScriptTag({ path: JSQR });
  const qr = await p.evaluate(async () => {
    const svg = document.querySelector('#qrCode svg');
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg));
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 400); g.drawImage(img, 20, 20, 360, 360);
    return window.jsQR(g.getImageData(0, 0, 400, 400).data, 400, 400)?.data;
  });
  check('Desktop Chrome', `QR code shown and scans to this card on a phone`, qr && qr.includes('i=tr-808') && qr.startsWith(BASE.split('?')[0]), qr);
  await done(p);
}

// ── the QR sign scans to the live 808 card ──
{
  const p = await newPage();
  await p.goto(BASE);
  await p.addScriptTag({ path: JSQR });
  const b64 = fs.readFileSync(path.join(DEMO, 'print/qr-sign-808-4x6.png')).toString('base64');
  const url = await p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = 600; c.height = 900; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 600, 900);
    return window.jsQR(g.getImageData(0, 0, 600, 900).data, 600, 900)?.data;
  }, b64);
  check('Print', 'QR sign (4 × 6 in, 1200 × 1800 px = 300 dpi) scans to the live 808 card', url === 'https://vf1-create.github.io/virtualfudge-ar/a/roland-8dkrxv/?store=nyc&i=tr-808&src=qr-808-room', url);
  await done(p);
}

// ── audio: nothing before a tap; the pads make sound after one ──
{
  const p = await newPage({ ...devices['Pixel 7'] });
  await p.goto(`${BASE}?i=tr-808`);
  await p.waitForFunction(() => document.querySelector('model-viewer')?.loaded, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  check('Audio', 'No AudioContext exists before the first tap (nothing can play)', await p.evaluate(() => window.__acCount === 0 && !window.__audio));
  await p.tap('.pad[data-step="2"]');
  await p.waitForTimeout(300);
  const a = await p.evaluate(() => ({ n: window.__acCount, state: window.__heritage.drum.ctx?.state, hits: window.__audio?.hits }));
  check('Audio', 'First tap on a pad creates and starts the audio (state "running") and plays the hit', a.n === 1 && a.state === 'running' && a.hits >= 1, JSON.stringify(a));
  await p.tap('#play');
  await p.waitForTimeout(1500);
  const b = await p.evaluate(() => ({ hits: window.__audio.hits, now: !!document.querySelector('.pad.now') }));
  check('Audio', 'Play runs the sequencer: hits scheduled and the playhead moves', b.hits > 5 && b.now, JSON.stringify(b));
  const lit = await p.evaluate(() => { const l = window.__heritage.leds; return l && { n: l.led.filter(Boolean).length, lit: l.led.filter((m) => m.emissiveFactor[0] > 0.5).length }; });
  check('Cards', 'The 3D 808 follows the sequencer: its 16 step LEDs light up with the pattern and the playhead', lit && lit.n === 16 && lit.lit >= 1, JSON.stringify(lit));
  // tapping a streaming link, or leaving the tab, stops the beat so it never plays over the real song
  await p.tap('#play'); await p.waitForTimeout(300);
  const linkStops = await p.evaluate(() => { const a = document.querySelector('#songs a'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); return !window.__heritage.drum.playing; });
  await p.tap('#play'); await p.waitForTimeout(300);
  const hideStops = await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; return !window.__heritage.drum.playing && document.querySelector('#play').textContent.includes('Play'); });
  check('Audio', 'The beat stops when a Spotify / Apple Music / YouTube link is tapped or the tab is left, so it never plays over the real song', linkStops && hideStops, JSON.stringify({ linkStops, hideStops }));
  const hot = await p.evaluate(() => document.querySelectorAll('model-viewer .hot').length);
  check('Cards', 'Three labelled hotspots pinned to the 3D 808 (step keys, tempo, voices)', hot === 3);
  await p.tap('#play');
  // render every voice offline and measure it, to prove each one makes real sound (not silence)
  const levels = await p.evaluate(async () => {
    const { Drum, ROWS } = await import('./js/drum.js');
    const out = {};
    for (const r of ROWS) {
      const d = new Drum();
      const ctx = new OfflineAudioContext(1, 44100 * 0.5, 44100);
      d.ctx = ctx; d.out = ctx.createGain(); d.out.connect(ctx.destination);
      d.noise = ctx.createBuffer(1, 44100, 44100); const ch = d.noise.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      d.hit(r.id, 0.01);
      const buf = await ctx.startRendering(); const x = buf.getChannelData(0);
      let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
      out[r.id] = +peak.toFixed(3);
    }
    return out;
  });
  check('Audio', `All six voices synthesize audible sound (peak levels ${Object.entries(levels).map(([k, v]) => `${k} ${v}`).join(', ')})`, Object.values(levels).every((v) => v > 0.05));
  check('Android Chrome (emulated)', 'Scene Viewer AR is offered: model-viewer reports AR available and shows "See it in AR"', await p.evaluate(() => document.querySelector('model-viewer').canActivateAR && getComputedStyle(document.querySelector('.ar-btn')).display !== 'none'));
  // what Scene Viewer would be asked to open
  const intent = await p.evaluate(() => new Promise((res) => {
    const mv = document.querySelector('model-viewer');
    const orig = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'href');
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { res(this.href); };
    setTimeout(() => res(null), 4000);
    mv.activateAR();
  }));
  check('Android Chrome (emulated)', 'Tapping "See it in AR" hands the TR-808 GLB to Scene Viewer', intent && intent.startsWith('intent://arvr.google.com/scene-viewer') && intent.includes('tr-808.glb'), intent?.slice(0, 160));
  await done(p);
}
{
  const p = await newPage({ ...devices['iPhone 14'] });
  await p.goto(`${BASE}?i=tr-808`);
  await p.waitForSelector('model-viewer');
  const ios = await p.evaluate(() => document.querySelector('model-viewer').getAttribute('ios-src'));
  const ok = await fetch(new URL(ios, BASE)).then(async (r) => r.ok && (await r.arrayBuffer()).byteLength > 1000);
  const zip = fs.readFileSync(path.join(DEMO, 'models/tr-808.usdz'));
  check('iPhone Safari (partial, emulated)', `Quick Look file is wired up: ios-src=${ios}, served, a valid USDZ (zip with a .usda scene)`, ok && zip.readUInt32LE(0) === 0x04034b50 && zip.includes(Buffer.from('.usda')));
  check('iPhone Safari (partial, emulated)', 'No audio before a tap on iPhone-sized screen', await p.evaluate(() => window.__acCount === 0));
  await done(p);
}

{
  // weak in-store Wi-Fi: a failed config download shows a retry message, not an empty map
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.route('**/data/instruments.json', (r) => r.abort());
  await p.goto(BASE);
  const msg = await p.waitForSelector('.oops .retry', { timeout: 10000 }).then(() => true, () => false);
  check('Layout', 'If the map data fails to load, the visitor sees "try again" instead of an empty page', msg);
  await ctx.close();
}
{
  // the store switcher in the header
  const p = await newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(BASE);
  await p.click('#stores a:has-text("Tokyo")');
  await p.waitForFunction(() => document.querySelector('#storeName').textContent === 'Roland Store Tokyo');
  check('Stores', 'The New York / London / Tokyo switcher in the header changes store in one tap', await p.evaluate(() => document.querySelector('#stores [aria-current]').textContent === 'Tokyo'));
  await done(p);
}
{
  // if a 3D file fails, the instrument's picture stays and the visitor gets a plain message (not a blank box)
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.route('**/models/tr-909.glb', (r) => r.abort());
  await p.goto(`${BASE}?i=tr-909`);
  const ok = await p.waitForFunction(() => document.querySelector('#viewer').classList.contains('failed') && document.querySelector('#viewerStatus').textContent.includes('picture'), null, { timeout: 20000 }).then(() => true, () => false);
  const poster = await p.evaluate(() => document.querySelector('model-viewer').getAttribute('poster'));
  check('Cards', 'If a 3D file fails to download, the picture stays up with a plain message and no dead AR button', ok && poster === 'models/posters/tr-909.png');
  await p.screenshot({ path: path.join(HERE, 'out', 'failed-3d.png') });
  await ctx.close();
}
check('Console', 'No console errors in headless Chromium across all of the above', allErrs.length === 0, [...new Set(allErrs)].slice(0, 5).join(' | '));
const ext = [...new Set(allExternal)];
check('Network', 'No requests to any other host while using the demo (no paid services, CDNs or trackers)', ext.length === 0, ext.slice(0, 5).join(', '));

await browser.close();
server?.kill();

// ── the report ──
const passed = results.filter((r) => r.ok).length;
const groups = [...new Set(results.map((r) => r.group))];
const md = [`# Test report: Roland Heritage Map, phase two demo`, '',
  `Run ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC against ${LIVE ? 'the live GitHub Pages URL' : 'a local copy'}: \`${BASE}\``,
  `Automated: **${passed}/${results.length} passed** in headless Chromium (Playwright).`, '',
  ...groups.flatMap((g) => [`## ${g}`, '', '| Result | Check |', '|---|---|', ...results.filter((r) => r.group === g).map((r) => `| ${r.ok ? 'PASS' : 'FAIL'} | ${r.name.replace(/\|/g, '/')}${!r.ok && r.detail ? ` (${r.detail.replace(/\|/g, '/')})` : ''} |`), '']),
  fs.readFileSync(path.join(HERE, 'phone-checklist.md'), 'utf8')].join('\n');
fs.writeFileSync(path.join(DEMO, 'TEST-REPORT.md'), md);
console.log(`\n${passed}/${results.length} passed → TEST-REPORT.md`);
process.exit(passed === results.length ? 0 : 1);
