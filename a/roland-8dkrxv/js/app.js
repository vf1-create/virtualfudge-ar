// Heritage Line: a subway-style timeline. Tap a station, the instrument opens in 3D and AR.
// The store (?store=nyc|london|tokyo) decides the name, address, line color and stations.
import { Drum, ROWS, PRESETS } from './drum.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const STORES = ['nyc', 'london', 'tokyo'];
const storeId = STORES.includes(params.get('store')) ? params.get('store') : 'nyc';
const base = new URL('.', location.href);

const [store, data] = await Promise.all([
  fetch(`stores/${storeId}.json`).then((r) => r.json()),
  fetch('data/instruments.json').then((r) => r.json()),
]);
const byId = Object.fromEntries(data.instruments.map((i) => [i.id, i]));
const stations = store.stations.map((id) => byId[id]).filter(Boolean).sort((a, b) => a.year - b.year || store.stations.indexOf(a.id) - store.stations.indexOf(b.id));

// ── store sign ──
document.documentElement.style.setProperty('--line', store.lineColor);
document.documentElement.dataset.store = store.id;
$('#storeName').textContent = store.name;
$('#storeAddr').textContent = store.address;
$('#lineName').textContent = store.lineName;

// ── the line ──
const bullet = (el, i) => { el.textContent = i.bullet; el.style.setProperty('--c', i.color); };
const line = $('#line');
line.style.setProperty('--n', stations.length);
for (const s of stations) {
  const li = document.createElement('li');
  li.className = 'stop' + (s.id === store.featured ? ' featured' : '');
  li.innerHTML = `<button type="button" class="station" data-id="${s.id}">
      <span class="bullet"></span>
      <span class="label"><span class="year">${s.year}</span><span class="model">${s.model}</span><span class="kind">${s.kind}</span>
      ${s.id === store.featured && store.featuredNote ? `<span class="tag">${store.featuredNote}</span>` : ''}</span>
    </button>`;
  bullet(li.querySelector('.bullet'), s);
  li.querySelector('button').setAttribute('aria-label', `${s.year}, ${s.model}. ${s.kind}. Open in 3D and AR`);
  line.appendChild(li);
}
line.addEventListener('click', (e) => {
  const b = e.target.closest('.station');
  if (b) openCard(b.dataset.id, true);
});

// ── model-viewer loads only when it's needed (keeps the map fast) ──
let mvReady = null;
const loadViewer = () => (mvReady ||= import('../vendor/model-viewer.min.js'));
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
addEventListener('load', () => idle(() => loadViewer()));

let qrReady = null;
const loadQR = () => (qrReady ||= new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = 'vendor/qrcode.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
}));

// ── the instrument card ──
const card = $('#card');
let current = null;
let lastFocus = null;
async function openCard(id, push) {
  const i = byId[id];
  if (!i || !store.stations.includes(id)) return;
  current = i;
  lastFocus = document.activeElement;
  if (push) {
    const u = new URL(location.href); u.searchParams.set('store', store.id); u.searchParams.set('i', id);
    history.pushState({ card: id }, '', u);
  }
  bullet($('#cardBullet'), i);
  $('#cardTitle').textContent = i.model;
  $('#cardYear').textContent = i.year;
  $('#cardKind').textContent = i.kind;
  card.style.setProperty('--c', i.color);
  renderSongs(i);
  $('#seq').hidden = !i.playable;
  if (i.playable) setupSeq();
  $('#qr').hidden = true;
  card.hidden = false;
  document.body.classList.add('card-open');
  card.scrollTop = 0;
  $('#back').focus({ preventScroll: true });

  const viewer = $('#viewer');
  viewer.innerHTML = '';
  viewer.classList.remove('lifted');
  const mv = document.createElement('model-viewer');
  Object.entries({
    src: `models/${i.id}.glb`, 'ios-src': `models/${i.id}.usdz`, alt: `A 3D model of the ${i.model}, built for this demo`,
    ar: '', 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'fixed', 'camera-controls': '', 'touch-action': 'pan-y',
    'shadow-intensity': '1.1', 'shadow-softness': '0.7', exposure: '1.1', 'environment-image': 'neutral', 'camera-orbit': '0deg 62deg auto', 'interaction-prompt': 'none',
    'auto-rotate': '', 'auto-rotate-delay': '2500', 'rotation-per-second': '12deg', loading: 'eager',
  }).forEach(([k, v]) => mv.setAttribute(k, v));
  mv.innerHTML = `<button slot="ar-button" class="ar-btn" type="button">See it in AR</button><div slot="progress-bar"></div>` + (HOTSPOTS[i.id] || []).map(([n, pos, text]) =>
    `<button slot="hotspot-${n}" class="hot" type="button" data-position="${pos}" data-normal="0m 1m 0m" tabindex="-1"><span>${text}</span></button>`).join('');
  viewer.appendChild(mv);
  requestAnimationFrame(() => requestAnimationFrame(() => viewer.classList.add('lifted')));
  await loadViewer();
  mv.addEventListener('load', async () => {
    if (current !== i) return;
    bindModel(mv);
    if (!mv.canActivateAR) {
      // desktop: offer the phone instead
      await loadQR();
      const u = new URL(base); u.searchParams.set('store', store.id); u.searchParams.set('i', i.id); u.searchParams.set('src', 'desktop-qr');
      const qr = window.qrcode(0, 'M'); qr.addData(u.href); qr.make();
      $('#qrCode').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      $('#qrCode svg').setAttribute('role', 'img');
      $('#qrCode svg').setAttribute('aria-label', `QR code that opens the ${i.model} on your phone`);
      $('#qr').hidden = false;
    }
  }, { once: true });
}
function closeCard() {
  card.hidden = true;
  document.body.classList.remove('card-open');
  drum?.stop();
  syncPlay();
  $('#viewer').innerHTML = '';
  current = null;
  const b = lastFocus?.closest?.('.station') || document.querySelector(`.station`);
  b?.focus({ preventScroll: true });
}
$('#back').addEventListener('click', () => (history.state?.card ? history.back() : (history.replaceState(null, '', `?store=${store.id}`), closeCard())));
addEventListener('popstate', () => { const id = new URLSearchParams(location.search).get('i'); id ? openCard(id, false) : closeCard(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) $('#back').click(); });

function renderSongs(i) {
  const ul = $('#songs');
  ul.innerHTML = '';
  const cc = store.appleMusicCountry || 'us';
  for (const s of i.songs) {
    const q = encodeURIComponent(`${s.title} ${s.artist}`);
    const li = document.createElement('li');
    li.innerHTML = `<p class="song"></p><p class="links">
      <a href="https://open.spotify.com/search/${q}" target="_blank" rel="noopener">Spotify</a>
      <a href="https://music.apple.com/${cc}/search?term=${q}" target="_blank" rel="noopener">Apple Music</a>
      <a href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">YouTube</a></p>`;
    li.querySelector('.song').textContent = `${s.title} – ${s.artist}, ${s.year}`;
    li.querySelectorAll('a').forEach((a) => a.setAttribute('aria-label', `Listen to ${s.title} by ${s.artist} on ${a.textContent}`));
    ul.appendChild(li);
  }
}

// labels pinned to the 3D model (meters, model space)
const HOTSPOTS = {
  'tr-808': [['keys', '0.06m 0.075m 0.12m', '16 step keys'], ['tempo', '-0.285m 0.125m -0.1m', 'Tempo'], ['voices', '0.07m 0.11m -0.07m', '11 voices']],
};

// the 3D 808 follows the sequencer: LEDs show the selected sound's pattern, the playhead lights its key
let leds = null;
let head = -1;
function bindModel(mv) {
  leds = null;
  const mats = mv.model?.materials || [];
  const find = (n) => mats.find((m) => m.name === n);
  if (!find('led-0')) return;
  leds = { led: Array.from({ length: 16 }, (_, s) => find(`led-${s}`)), key: Array.from({ length: 16 }, (_, s) => find(`key-${s}`)) };
  paintModel();
}
function paintModel() {
  if (!leds || !drum) return;
  for (let s = 0; s < 16; s++) {
    const on = drum.steps[row][s];
    leds.led[s]?.setEmissiveFactor(s === head ? [1, 0.25, 0.1] : on ? [0.85, 0.08, 0.03] : [0, 0, 0]);
    leds.key[s]?.setEmissiveFactor(s === head ? [0.7, 0.7, 0.7] : [0, 0, 0]);
  }
}

// ── the playable 808 ──
let drum = null;
let row = 'bd';
let built = false;
const GROUPS = ['g0', 'g1', 'g2', 'g3']; // red, orange, yellow, white: four steps each
function setupSeq() {
  if (built) return;
  built = true;
  drum = new Drum();
  drum.steps = structuredClone(PRESETS[0].steps);
  drum.bpm = PRESETS[0].bpm;
  const unlock = () => drum.unlock();

  PRESETS.forEach((p, n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'preset'; b.textContent = p.name; b.setAttribute('aria-pressed', String(n === 0));
    b.addEventListener('click', () => {
      unlock();
      drum.steps = structuredClone(p.steps); drum.bpm = p.bpm;
      $('#presets').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      syncAll();
      if (!drum.playing) { drum.start(); syncPlay(); }
    });
    $('#presets').appendChild(b);
  });
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'preset clear'; clear.textContent = 'Clear';
  clear.addEventListener('click', () => { for (const r of ROWS) drum.steps[r.id].fill(false); $('#presets').querySelectorAll('[aria-pressed]').forEach((x) => x.setAttribute('aria-pressed', 'false')); syncAll(); });
  $('#presets').appendChild(clear);

  for (const r of ROWS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'row'; b.dataset.row = r.id;
    b.innerHTML = `<span class="short">${r.short}</span><span class="name">${r.name}</span>`;
    b.addEventListener('click', () => { unlock(); row = r.id; drum.hit(r.id); syncAll(); });
    $('#rows').appendChild(b);
  }
  for (let s = 0; s < 16; s++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `pad ${GROUPS[s >> 2]}`; b.dataset.step = s;
    b.innerHTML = `<span class="led"></span><span class="n">${s + 1}</span>`;
    b.addEventListener('click', () => {
      unlock();
      const on = (drum.steps[row][s] = !drum.steps[row][s]);
      if (on && !drum.playing) drum.hit(row);
      syncAll();
    });
    $('#pads').appendChild(b);
  }
  // the whole pattern at a glance; tap a cell to toggle it too
  for (const r of ROWS) {
    const label = document.createElement('span'); label.className = 'gl'; label.textContent = r.short; $('#grid').appendChild(label);
    for (let s = 0; s < 16; s++) {
      const c = document.createElement('span'); c.className = `cell ${GROUPS[s >> 2]}`; c.dataset.row = r.id; c.dataset.step = s;
      c.addEventListener('click', () => { unlock(); row = r.id; const on = (drum.steps[r.id][s] = !drum.steps[r.id][s]); if (on && !drum.playing) drum.hit(r.id); syncAll(); });
      $('#grid').appendChild(c);
    }
  }
  $('#play').addEventListener('click', () => { unlock(); drum.playing ? drum.stop() : drum.start(); syncPlay(); });
  $('#tempo').addEventListener('input', (e) => { drum.bpm = +e.target.value; $('#bpm').textContent = drum.bpm; });
  drum.onStep = (s) => {
    document.querySelectorAll('.pad.now, .cell.now').forEach((x) => x.classList.remove('now'));
    head = s; paintModel();
    if (s < 0) return;
    $(`.pad[data-step="${s}"]`).classList.add('now');
    document.querySelectorAll(`.cell[data-step="${s}"]`).forEach((x) => x.classList.add('now'));
  };
  syncAll();
}
function syncAll() {
  paintModel();
  $('#tempo').value = drum.bpm; $('#bpm').textContent = drum.bpm;
  $('#rows').querySelectorAll('.row').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.row === row)));
  const name = ROWS.find((r) => r.id === row).name;
  $('#pads').querySelectorAll('.pad').forEach((b) => {
    const on = drum.steps[row][b.dataset.step];
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', `${name}, step ${+b.dataset.step + 1}`);
  });
  $('#grid').querySelectorAll('.cell').forEach((c) => {
    c.classList.toggle('on', drum.steps[c.dataset.row][c.dataset.step]);
    c.classList.toggle('sel', c.dataset.row === row);
  });
}
function syncPlay() {
  if (!drum) return;
  $('#play').textContent = drum.playing ? '■ Stop' : '▶ Play';
  $('#play').setAttribute('aria-pressed', String(drum.playing));
}

// deep link: ?i=tr-808 opens that card (the QR sign in the 808 room uses this)
const deep = params.get('i');
if (deep && byId[deep]) {
  history.replaceState({ card: null }, '', location.href);
  openCard(deep, false);
}
window.__heritage = { get leds() { return leds; }, store, stations: stations.map((s) => s.id), get drum() { return drum; } };
document.documentElement.classList.add('ready');
