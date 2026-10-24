import C from './config.js';
import { setTheme, setMesh, getFilters, facePose, smoothFaces, localToScreen, Particles } from './effects.js';
import { drawBrandFrame, countdownLabel, BAND } from './frame.js';

let W = C.output.width, H = C.output.height; // may drop to 720p on slow devices, see adaptQuality()
const $ = (s) => document.querySelector(s);
const root = document.documentElement;

const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const video = $('#cam');
canvas.width = W; canvas.height = H;

setTheme(C);
const FILTERS = getFilters(C.filters);
let fx = new Particles(W / 1080);
const src = new URLSearchParams(location.search).get('src') || 'direct';
const track = (event, data = {}) => { try { C.track?.(event, { src, filter: FILTERS[state.filter]?.id, ...data }); } catch {} };

const ua = navigator.userAgent;
const IN_APP = /Instagram|FBAN|FBAV|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedInApp|; wv\)/i.test(ua); // social apps + Android WebViews
const IOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IOS_OTHER = /CriOS|FxiOS|EdgiOS/.test(ua); // Chrome/Firefox/Edge on iOS
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  facing: 'user', mirror: true, deviceId: null, stream: null, running: false,
  landmarker: null, result: null, faces: [],
  lastVideoTime: -1, lastTs: 0, lastFrame: 0,
  filter: 0, mouthAcc: 0, hintShown: false, hintDone: false,
  recorder: null, recStart: 0, blob: null, kind: null, logo: null, badTypes: [],
};

if (src === 'debug' || location.hash === '#debug') window.__ar = state;

// ── Theme + intro ────────────────────────────────────────────

root.style.setProperty('--ar', `${W} / ${H}`);
for (const [k, v] of Object.entries(C.colors)) root.style.setProperty(`--${k}`, v);
document.querySelector('meta[name="theme-color"]').content = C.colors.paper;
document.title = `${C.brand} · ${C.seasonTitle}`;
document.querySelectorAll('[data-text]').forEach((el) => { el.textContent = C[el.dataset.text]; });
$('#countdown').textContent = countdownLabel(C);
const loadImage = (src) => { if (!src) return null; const img = new Image(); img.src = src; return img; };
state.logo = loadImage(C.logo);
state.logoPaper = loadImage(C.logoOnPaper);
if (C.logoOnPaper) document.querySelectorAll('img.logo').forEach((img) => { img.src = C.logoOnPaper; });
let meshTick = () => {};
drawMesh($('#meshRings'));

// faint wireframe torus behind the intro, echoing the brochure pages
function drawMesh(g) {
  const cx = 230, cy = 120, R = 120, r = 36, tilt = 0.42, N = 24, ns = 'http://www.w3.org/2000/svg';
  const make = () => { const e = document.createElementNS(ns, 'ellipse'); g.append(e); return e; };
  const rings = Array.from({ length: N }, make);
  for (const s of [R - r, R, R + r]) { const e = make(); e.setAttribute('cx', cx); e.setAttribute('cy', cy); e.setAttribute('rx', s); e.setAttribute('ry', s * tilt); }
  const place = (phase) => rings.forEach((e, k) => {
    const a = (k / N) * Math.PI * 2 + phase;
    e.setAttribute('cx', (cx + Math.cos(a) * R).toFixed(2));
    e.setAttribute('cy', (cy + Math.sin(a) * R * tilt).toFixed(2));
    e.setAttribute('rx', (r * Math.abs(Math.cos(a)) + r * 0.25).toFixed(2));
    e.setAttribute('ry', r);
  });
  place(0);
  // the torus turns slowly while the intro is on screen (~15 fps is plenty for this pace)
  if (REDUCED.matches) return;
  let last = 0, ticking = false;
  const tick = (now) => {
    if (!$('#intro').classList.contains('active') || document.hidden) { ticking = false; return; }
    if (now - last > 66) { place(now / 9000); last = now; }
    requestAnimationFrame(tick);
  };
  meshTick = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };
  meshTick();
}

// Canvas text needs the brand fonts loaded before the first frame is drawn
const fontsReady = Promise.race([
  Promise.all(['400 40px Syncopate', '700 40px Syncopate', '400 20px "Roboto Mono"'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {});
$('#tagLine').textContent = C.handle ? `Tag ${C.handle} when you post` : `Post it with ${C.hashtag}`;
if (C.ctaLabel && C.ctaUrl) {
  const cta = $('#cta');
  cta.textContent = `${C.ctaLabel} →`; cta.href = C.ctaUrl; cta.hidden = false;
  cta.addEventListener('click', () => track('cta'));
}

const isDesktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
if (isDesktop) { // phones never need the QR library
  const s = Object.assign(document.createElement('script'), { src: 'vendor/qrcode.js', async: true });
  s.onload = () => {
    try {
      const u = new URL(location.origin + location.pathname); // never echo foreign query params into the code
      u.searchParams.set('src', 'desktop-qr');
      drawQR($('#qr'), u.href);
      $('#desktopQR').hidden = false;
    } catch (e) { console.warn(e); }
  };
  document.head.append(s);
}

function drawQR(cv, url) {
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), q = cv.getContext('2d'), m = 2, cell = cv.width / (n + m * 2);
  const finder = (r, c) => (r < 7 && (c < 7 || c >= n - 7)) || (r >= n - 7 && c < 7);
  q.fillStyle = C.colors.paper; q.fillRect(0, 0, cv.width, cv.height);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c)) continue;
    q.fillStyle = finder(r, c) ? C.colors.brand : C.colors.ink; // brown finder squares, like the brochure QRs
    q.fillRect((c + m) * cell, (r + m) * cell, cell + 0.5, cell + 0.5);
  }
}

// Cache the face-tracking engine for instant repeat visits (https or localhost only)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Start downloading the face model right away so it's ready by the time they tap.
const trackerReady = initTracker();

$('#startBtn').addEventListener('click', start);
$('#closeBtn').addEventListener('click', () => { stopCamera(); show('intro'); });

// Phones: toggle front/back by facingMode. Desktops (cameras report no facingMode): step through devices.
let flipping = false;
$('#flipBtn').addEventListener('click', async () => {
  if (flipping || !state.stream) return;
  flipping = true; $('#flipBtn').disabled = true;
  const prev = { facing: state.facing, deviceId: state.deviceId };
  try {
    const settings = state.stream.getVideoTracks()[0]?.getSettings?.() || {};
    if (settings.facingMode) {
      state.facing = state.facing === 'user' ? 'environment' : 'user';
      await startCamera();
    } else {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const next = cams[(cams.findIndex((d) => d.deviceId === state.deviceId) + 1) % cams.length];
      await startCamera(next?.deviceId);
    }
    state.faces = []; resume();
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.warn(e);
    state.facing = prev.facing; // go back to the camera that worked
    try { await startCamera(prev.deviceId); resume(); toast('Couldn’t switch cameras.', 2600); }
    catch (e2) { if (e2?.name !== 'AbortError') { stopCamera(); show('intro'); cameraError(e2); } }
  } finally {
    flipping = false; $('#flipBtn').disabled = false;
  }
});

// ── Screens ──────────────────────────────────────────────────

const FOCUS = { intro: '#startBtn', ar: '#shutter', result: '#resultHeading' };
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  requestAnimationFrame(() => $(FOCUS[id])?.focus({ preventScroll: true }));
  if (id === 'intro') meshTick();
}

async function start() {
  track('start');
  showCamError('');
  show('ar');
  const loading = $('#loading');
  loading.hidden = false; loading.classList.remove('done');
  buildFilterBar();
  try {
    await Promise.all([startCamera(), fontsReady]);
  } catch (e) {
    if (e?.name === 'AbortError') return; // closed while the camera was starting
    cameraError(e);
    show('intro');
    return;
  }
  if (!$('#ar').classList.contains('active')) { stopCamera(); return; }
  loading.classList.add('done');
  setTimeout(() => { if (loading.classList.contains('done')) loading.hidden = true; }, 450); // out of the accessibility tree too
  layoutControls();
  resume();
  trackerReady.then((lm) => {
    state.landmarker = lm; state.trackerFailed = !lm; state.trackStart = performance.now();
    if (!lm && $('#ar').classList.contains('active')) toast('Face tracking isn’t available on this device. Tap the screen for effects.', 4500);
  });
}

// the camera view is live and ready to capture
const cameraLive = () => state.running && !!state.stream && $('#ar').classList.contains('active') && $('#loading').classList.contains('done');

// Keep the controls off the caption text on every screen shape.
function layoutControls() {
  const ar = $('#ar'), r = canvas.getBoundingClientRect();
  if (!r.width) return;
  const side = (innerWidth - r.width) / 2 >= 220;
  ar.classList.toggle('side', side);
  ar.style.setProperty('--label-top', `${Math.round(r.top + r.height * 0.15)}px`);
  if (side) {
    ar.style.setProperty('--rail-left', `${Math.round(r.right + Math.min(56, (innerWidth - r.right - 180) / 2))}px`);
    ar.classList.remove('tight');
    ar.style.setProperty('--rail-top', `${Math.round($('#filters').getBoundingClientRect().top)}px`); // hints sit just above the list
    return;
  }
  const bandTop = r.top + r.height * BAND;
  const textBottom = r.top + r.height * (BAND + 248 / 1920);
  const chips = $('#filters').offsetHeight || 34;
  ar.style.setProperty('--chips-top', `${Math.round(bandTop - chips - 10)}px`);
  ar.style.setProperty('--hint-top', `${Math.round(bandTop - chips - 10 - 46)}px`);
  // room under the caption text for the shutter (+ its tip)?
  const room = innerHeight - textBottom;
  ar.classList.toggle('tight', room < 70 + 26 + 18);
}
addEventListener('resize', layoutControls);
addEventListener('orientationchange', () => setTimeout(layoutControls, 250));

function resume() {
  if (state.running) return;
  state.running = true;
  state.lastFrame = performance.now();
  state.q = null; // restart the quality check window
  requestAnimationFrame(loop);
}

function cameraError(e) {
  console.error(e);
  const android = /Android/.test(ua);
  let msg;
  if (IN_APP) msg = 'This app’s browser blocks the camera. Tap ••• and choose “Open in browser”.';
  else if (!navigator.mediaDevices?.getUserMedia) msg = 'The camera needs a secure (https) link. Open this page from its https address.';
  else if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    msg = IOS_OTHER ? 'Camera access is off. Open iPhone Settings › this browser › Camera › Allow, then reload this page.'
      : IOS ? 'Camera access is off. Reload this page and tap Allow, or use the page menu left of the address (aA on older iOS) › Website Settings › Camera › Allow.'
      : android ? 'Camera access is off. Tap the icon left of the address › Permissions › Camera › Allow, then try again.'
      : 'Camera access is off. Click the camera icon in the address bar, allow it, then try again.';
  } else if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') {
    msg = 'No camera found on this device. Scan the QR code with your phone instead.';
  } else msg = 'The camera is busy or unavailable. Close other apps using it, then try again.';
  showCamError(msg);
}

function showCamError(msg) {
  const el = $('#camError');
  el.textContent = msg;
  el.hidden = !msg;
}

// ── Camera + tracking ────────────────────────────────────────

let camGen = 0; // bumped by every start/stop, so a slow camera request can't revive a closed session
async function startCamera(deviceId) {
  const gen = ++camGen;
  releaseStream();
  const size = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: state.facing, ...size },
  });
  if (gen !== camGen) { stream.getTracks().forEach((t) => t.stop()); throw new DOMException('Camera request superseded', 'AbortError'); }
  state.stream = stream;
  const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
  state.deviceId = settings.deviceId || null;
  if (settings.facingMode) state.facing = settings.facingMode;
  state.mirror = settings.facingMode !== 'environment'; // laptops report nothing: treat as selfie cams
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (state.stream !== stream) return;
    stopCamera(); show('intro');
    showCamError('The camera was disconnected. Tap “Open the camera” to start again.');
  });
  keepAwake(true);
  // only offer "switch camera" when there's a second camera to switch to
  navigator.mediaDevices.enumerateDevices?.().then((list) => {
    $('#flipBtn').hidden = list.filter((d) => d.kind === 'videoinput').length < 2;
  }).catch(() => {});
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  if (gen !== camGen) throw new DOMException('Camera request superseded', 'AbortError');
}

// keep the screen on while the camera is open (kiosks, tablets on stands)
let wakeLock = null, wakePending = false, wantAwake = false;
async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && !wakeLock && !wakePending && navigator.wakeLock) {
      wakePending = true;
      const lock = await navigator.wakeLock.request('screen');
      wakePending = false;
      if (!wantAwake) { lock.release(); return; }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    } else if (!on && wakeLock) {
      const lock = wakeLock; wakeLock = null; await lock.release();
    }
  } catch { wakePending = false; }
}

function releaseStream() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

function stopCamera() {
  camGen++; // cancels a camera request that's still in flight
  keepAwake(false);
  cancelCountdown();
  discardRecording();
  press = null; clearTimeout(holdTimer);
  state.running = false;
  releaseStream();
}

function initTracker() {
  return (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('../vendor/mediapipe/vision_bundle.mjs');
    setMesh(FaceLandmarker.FACE_LANDMARKS_TESSELATION);
    const wasm = await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm', import.meta.url).href);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('../vendor/models/face_landmarker.task', import.meta.url).href, delegate },
      runningMode: 'VIDEO',
      numFaces: C.maxFaces,
      outputFaceBlendshapes: true,
    });
    let lm;
    try {
      lm = await FaceLandmarker.createFromOptions(wasm, options('GPU'));
    } catch (e) {
      console.warn('GPU face tracking unavailable, falling back to CPU', e);
      lm = await FaceLandmarker.createFromOptions(wasm, options('CPU'));
    }
    // the first inference compiles shaders and can stall for a second: do it now, not on the live preview
    try {
      const warm = Object.assign(document.createElement('canvas'), { width: 96, height: 96 });
      warm.getContext('2d').fillRect(0, 0, 96, 96);
      lm.detectForVideo(warm, 1);
      state.lastTs = Math.max(state.lastTs, 1);
    } catch {}
    return lm;
  })().catch((e) => {
    console.error(e); // explained in the camera view, see start()
    return null;
  });
}

// ── Render loop ──────────────────────────────────────────────

function loop(now) {
  if (!state.running) return;
  requestAnimationFrame(loop);
  if (now - state.lastFrame < 15) return; // 90/120 Hz screens: ~60 fps is plenty (the camera runs at 30)
  const raw = (now - state.lastFrame) / 1000, dt = Math.min(0.05, raw);
  state.lastFrame = now;
  if (video.readyState < 2 || !video.videoWidth) return;

  const lm = state.landmarker;
  if (lm && video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    state.lastTs = Math.max(now, state.lastTs + 1); // must strictly increase
    try { state.result = lm.detectForVideo(video, state.lastTs); } catch (e) { console.warn(e); }
  }

  render(now / 1000, dt);
  adaptQuality(raw);

  if (state.recorder) {
    const p = (now - state.recStart) / (C.maxVideoSeconds * 1000);
    $('#shutter').style.setProperty('--p', Math.min(1, p));
    if (p >= 1) stopRecording();
  }
}

// Older phones: if frames take too long at 1080p, drop to 720p (still sharp for Stories).
// Judged over rolling ~3 s windows once face tracking is running.
function adaptQuality(raw) {
  if (W <= 720 || state.recorder || !state.landmarker) return;
  if (raw > 0.25) { state.q = null; return; } // a hidden tab or app switch, not a slow device
  const now = performance.now();
  const q = (state.q ||= { since: now + 1500, frames: 0, time: 0 }); // 1.5 s warm-up
  if (now < q.since) return;
  q.frames++; q.time += raw;
  if (now - q.since < 3000) return;
  const avg = q.time / q.frames;
  state.q = { since: now, frames: 0, time: 0 };
  if (avg > 0.045) { // slower than ~22 fps
    W = 720; H = Math.round((720 * C.output.height) / C.output.width);
    canvas.width = W; canvas.height = H;
    fx = new Particles(W / 1080);
    state.faces = [];
    console.info(`[ar] ${Math.round(1 / avg)} fps at 1080p, switched to 720p`);
  }
}

function render(t, dt) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const Hp = Math.round(H * BAND); // the photo area above the paper caption strip
  const s = Math.max(W / vw, Hp / vh);
  const dx = (W - vw * s) / 2, dy = (Hp - vh * s) / 2;
  const mirror = state.mirror;

  // camera feed, cover-fit into the photo area, mirrored for selfies
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, Hp); ctx.clip();
  ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? W : 0, 0);
  ctx.drawImage(video, dx, dy, vw * s, vh * s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const toScreen = (nx, ny) => {
    const x = dx + nx * vw * s;
    return { x: mirror ? W - x : x, y: dy + ny * vh * s };
  };
  const r = state.result;
  const faces = (r?.faceLandmarks || []).map((l, i) => facePose(l, r.faceBlendshapes?.[i], toScreen));
  state.faces = smoothFaces(state.faces, faces);

  const filter = FILTERS[state.filter];
  filter.grade?.(ctx, W, Hp);
  filter.ambient?.(fx, dt, W, Hp, t);
  for (const f of state.faces) {
    ctx.save();
    filter.draw(ctx, f, t);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // open mouth → particle stream
  let opened = false;
  for (const f of state.faces) {
    if (f.jaw < 0.4) continue;
    opened = true;
    const m = localToScreen(f, f.mouthX, f.mouthY + 0.03);
    const n = Math.floor((state.mouthAcc += dt * 45 * f.jaw));
    state.mouthAcc -= n;
    fx.emit(filter.burst, m.x, m.y, n, f.angle + Math.PI / 2, 1.6);
  }
  fx.update(dt);
  fx.draw(ctx);
  ctx.restore(); // end of photo-area clip
  drawBrandFrame(ctx, W, H, C, t, state.logo, state.logoPaper);

  updateHint(state.faces.length > 0, opened);
}

function updateHint(hasFace, opened) {
  const hint = $('#hint');
  if (!state.landmarker && !state.trackerFailed && state.mirror) {
    if (hint.dataset.kind !== 'loading') { hint.textContent = 'Starting face tracking…'; hint.hidden = false; hint.dataset.kind = 'loading'; }
    return;
  }
  if (hint.dataset.kind === 'loading') { hint.hidden = true; hint.dataset.kind = ''; }
  // once tracking is running, nudge people who aren't in frame
  const now = performance.now();
  if (hasFace) state.lastFace = now;
  const lost = state.mirror && state.landmarker && now - (state.lastFace ?? state.trackStart ?? now) > 2500;
  if (lost && hint.hidden) { hint.textContent = 'Bring your face into the frame'; hint.hidden = false; hint.dataset.kind = 'lost'; }
  if (!lost && hint.dataset.kind === 'lost') { hint.hidden = true; hint.dataset.kind = ''; }
  if (lost) return;
  if (state.hintDone) return;
  if (opened) { state.hintDone = true; hint.hidden = true; return; }
  if (hasFace && !state.hintShown) {
    state.hintShown = true;
    hint.textContent = FILTERS[state.filter].hint;
    hint.hidden = false;
    setTimeout(() => { hint.hidden = true; state.hintDone = true; }, 6000);
  }
}

// ── Filters + gestures ───────────────────────────────────────

function buildFilterBar() {
  const bar = $('#filters');
  bar.innerHTML = '';
  FILTERS.forEach((f, i) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'radio');
    b.textContent = f.name;
    b.addEventListener('click', () => setFilter(i));
    bar.append(b);
  });
  setFilter(state.filter, true);
}

$('#filters').addEventListener('keydown', (e) => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  const to = step != null ? state.filter + step : e.key === 'Home' ? 0 : e.key === 'End' ? FILTERS.length - 1 : null;
  if (to == null) return;
  e.preventDefault(); e.stopPropagation();
  setFilter(to, false, true);
});

let modeTimer = null;
function setFilter(i, silent, focus) {
  state.filter = (i + FILTERS.length) % FILTERS.length;
  [...$('#filters').children].forEach((b, j) => {
    b.setAttribute('aria-checked', j === state.filter);
    b.tabIndex = j === state.filter ? 0 : -1; // one tab stop for the group
  });
  const chip = $('#filters').children[state.filter];
  if (focus) chip?.focus();
  chip?.scrollIntoView({ inline: 'center', behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'nearest' });
  if (!silent) {
    track('filter');
    const label = $('#modeLabel');
    label.textContent = FILTERS[state.filter].name;
    label.classList.remove('show'); void label.offsetWidth; label.classList.add('show');
    clearTimeout(modeTimer); modeTimer = setTimeout(() => label.classList.remove('show'), 1300); // also ends it when motion is reduced
    navigator.vibrate?.(8);
  }
}

function toCanvas(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
}

// tap the camera view = burst at your finger, swipe = change filter
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const ddx = e.clientX - down.x, ddy = e.clientY - down.y;
  if (Math.abs(ddx) > 50 && Math.abs(ddx) > Math.abs(ddy)) setFilter(state.filter + (ddx < 0 ? 1 : -1));
  else if (Math.hypot(ddx, ddy) < 20) { const c = toCanvas(e.clientX, e.clientY); fx.emit(FILTERS[state.filter].burst, c.x, c.y, 35); }
  down = null;
});

// self-timer: off → 3s → 10s
const TIMERS = [0, 3, 10];
$('#timerBtn').addEventListener('click', () => {
  state.timer = TIMERS[(TIMERS.indexOf(state.timer || 0) + 1) % TIMERS.length];
  const b = $('#timerBtn'), badge = b.querySelector('.badge');
  badge.textContent = state.timer || ''; badge.hidden = !state.timer;
  b.setAttribute('aria-pressed', !!state.timer);
  b.setAttribute('aria-label', state.timer ? `Self-timer ${state.timer} seconds` : 'Self-timer off');
  toast(state.timer ? `Self-timer: ${state.timer} seconds` : 'Self-timer off', 1400);
});

let countTimer = null;
function capturePhoto() {
  if (countTimer) { cancelCountdown(); return; } // tap again to cancel
  if (!state.timer) { takePhoto(); return; }
  let n = state.timer;
  const el = $('#countNum');
  const tick = () => {
    if (n === 0) { cancelCountdown(); takePhoto(); return; }
    el.textContent = n; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
    navigator.vibrate?.(6);
    n--; countTimer = setTimeout(tick, 1000);
  };
  shutter.classList.add('counting');
  tick();
}
function cancelCountdown() {
  clearTimeout(countTimer); countTimer = null;
  $('#countNum').classList.remove('tick'); $('#countNum').textContent = '';
  shutter?.classList.remove('counting');
}

// Mouse clicks on these controls shouldn't park focus on them, so Space/Enter keep taking photos.
// (Keyboard users still Tab to them, and then Space/Enter activate the focused control.)
for (const el of [$('#filters'), $('.topbar')]) el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

// keyboard: space/enter = photo, V = start/stop video, arrows = filters, escape = back
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if ($('#ar').classList.contains('active')) {
    const btn = e.target.closest?.('button');
    // a control the user reached with the keyboard keeps its own Space/Enter (mouse-focused ones don't)
    if (btn && btn !== shutter && btn.matches(':focus-visible') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat && cameraLive()) capturePhoto(); }
    else if (e.key === 'v' || e.key === 'V') { if (!e.repeat && cameraLive()) (state.recorder ? stopRecording() : startRecording()); }
    else if (e.key === 'ArrowRight') setFilter(state.filter + 1);
    else if (e.key === 'ArrowLeft') setFilter(state.filter - 1);
    else if (e.key === 'Escape') $('#closeBtn').click();
  } else if ($('#result').classList.contains('active') && e.key === 'Escape') {
    $('#retakeBtn').click();
  }
});

// ── Capture ──────────────────────────────────────────────────

const shutter = $('#shutter');
const SHUTTER_LABEL = 'Take photo. Hold, or press V, to record video';
shutter.setAttribute('aria-label', SHUTTER_LABEL);
let holdTimer = null, press = null; // press = { cancel, recorded } for the finger currently on the shutter

shutter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!cameraLive()) return;
  press = { cancel: !!countTimer, recorded: false }; // a tap during the countdown only cancels it
  shutter.setPointerCapture?.(e.pointerId);
  if (press.cancel) return;
  holdTimer = setTimeout(() => { if (press && !press.cancel) { press.recorded = true; startRecording(); } }, 350);
});
const release = (photo) => () => {
  const p = press;
  press = null;
  clearTimeout(holdTimer);
  if (!p || !$('#ar').classList.contains('active')) return;
  if (p.cancel) { cancelCountdown(); return; }
  if (p.recorded) { stopRecording(); return; } // never turn a video press into a photo (even if the 15 s cap already stopped it)
  if (photo) capturePhoto();
};
shutter.addEventListener('pointerup', release(true));
shutter.addEventListener('pointercancel', release(false));
shutter.addEventListener('contextmenu', (e) => e.preventDefault());
// keyboard / assistive-tech activation arrives as a click with no pointer (detail 0)
shutter.addEventListener('click', (e) => { if (e.detail === 0 && cameraLive()) capturePhoto(); });

function takePhoto() {
  if (!cameraLive()) return;
  navigator.vibrate?.(12);
  const f = $('#flash');
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  canvas.toBlob((blob) => { track('photo'); showResult(blob, 'photo'); }, 'image/jpeg', 0.92);
}

function pickVideoType() {
  const types = ['video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return types.find((t) => !state.badTypes.includes(t) && window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

function startRecording() {
  if (state.recorder || !cameraLive()) return;
  if (!window.MediaRecorder || !canvas.captureStream) {
    toast('Video isn’t supported in this browser. Tap for a photo instead!');
    return;
  }
  const stream = canvas.captureStream(30);
  const mimeType = pickVideoType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (rec.discard) return;
    const blob = new Blob(chunks, { type: (rec.mimeType || mimeType || 'video/webm').split(';')[0] });
    if (!blob.size) { // some encoders silently produce nothing: fall back to the next format
      state.badTypes.push(mimeType);
      toast('That clip didn’t record. Hold to try again!');
      return;
    }
    const seconds = (performance.now() - state.recStart) / 1000;
    track('video', { seconds: Math.round(seconds) });
    showResult(blob, 'video', seconds);
  };
  rec.start(250);
  state.recorder = rec;
  state.recStart = performance.now();
  shutter.classList.add('rec');
  shutter.setAttribute('aria-label', 'Recording. Release, or press V, to stop');
  navigator.vibrate?.(30);
}

function discardRecording() {
  const rec = state.recorder;
  if (!rec) return;
  state.recorder = null;
  rec.discard = true;
  try { rec.stop(); } catch {}
  shutter.classList.remove('rec');
  shutter.style.setProperty('--p', 0);
  shutter.setAttribute('aria-label', SHUTTER_LABEL);
}

function stopRecording() {
  const rec = state.recorder;
  if (!rec) return;
  state.recorder = null;
  shutter.classList.remove('rec');
  shutter.style.setProperty('--p', 0);
  shutter.setAttribute('aria-label', SHUTTER_LABEL);
  rec.discard = performance.now() - state.recStart < 600; // barely held → treat as a photo
  rec.stop();
  if (rec.discard) takePhoto();
}

// ── Result: save + share ─────────────────────────────────────

function showResult(blob, kind, seconds) {
  state.running = false; // pause rendering, keep camera warm for retake
  state.blob = blob; state.kind = kind;
  const box = $('#resultMedia');
  box.querySelectorAll('img,video').forEach((el) => URL.revokeObjectURL(el.src));
  box.innerHTML = '';
  const url = URL.createObjectURL(blob);
  const el = document.createElement(kind === 'photo' ? 'img' : 'video');
  const secs = Math.max(1, Math.round(seconds || 0));
  if (kind === 'video') { // attributes before src so iOS plays it inline and silently
    const attrs = REDUCED.matches ? ['controls', 'muted', 'playsinline'] : ['autoplay', 'loop', 'muted', 'playsinline'];
    for (const a of attrs) el.setAttribute(a, '');
    el.muted = true;
    el.setAttribute('aria-label', `Your AR video, ${secs} seconds. Tap to pause or play.`);
    el.addEventListener('click', () => (el.paused ? el.play() : el.pause()));
  } else {
    el.alt = 'Your AR photo';
  }
  el.src = url;
  box.append(el);
  const mp4 = kind === 'photo' || blob.type.includes('mp4');
  const what = kind === 'photo' ? 'Photo' : `Video · ${secs}s`;
  $('#resultMeta').textContent = mp4
    ? `${what} · ${W} × ${H} · ready for Stories & Reels`
    : `${what} · WebM · Instagram and TikTok need MP4: post a photo, or open this page in Chrome or Safari`;
  $('#resultHeading').textContent = kind === 'photo' ? 'Your photo is ready' : 'Your video is ready';
  // in-app browsers (Instagram, TikTok, Android WebViews) can't save blob downloads
  const noSave = IN_APP && !canShareFiles;
  $('#saveBtn').hidden = noSave;
  $('#saveHint').hidden = !noSave;
  $('#saveHint').textContent = kind === 'photo'
    ? 'To save: press and hold the photo, or open this page in your browser (••• › Open in browser).'
    : 'To save the video, open this page in your browser (••• › Open in browser).';
  show('result');
}

function fileFor(blob) {
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : 'jpg';
  const slug = C.hashtag.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'season';
  return new File([blob], `${slug}-${Date.now()}.${ext}`, { type: blob.type });
}

// Computers usually can't share files to apps: offer Download + Copy caption instead
const canShareFiles = (() => { try { return !!navigator.canShare?.({ files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] }); } catch { return false; } })();
const caption = () => `${C.shareText} ${C.hashtag} ${C.shareUrl || location.origin + location.pathname}`;
if (!canShareFiles) {
  $('#shareBtn').hidden = true;
  $('#saveBtn').classList.replace('ghost', 'primary');
  $('#saveBtn').innerHTML = 'Download <span aria-hidden="true">↓</span>';
  $('#copyBtn').hidden = false;
  $('.result-actions').prepend($('#saveBtn')); // the main action comes first in tab order too
}
$('#copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(caption()); toast('Caption copied. Paste it into your post.'); }
  catch { toast(caption(), 6000); }
  track('copy');
});

$('#retakeBtn').addEventListener('click', () => {
  $('#resultMedia video')?.pause();
  const live = state.stream?.getVideoTracks()[0]?.readyState === 'live';
  if (!live) { start(); return; } // the camera went away while the result was showing
  show('ar'); layoutControls(); resume();
});

const tagTip = () => (C.handle ? `Tag ${C.handle} when you post.` : `Post it with ${C.hashtag}.`);
let sharing = false; // one share sheet at a time (a second tap would reject with InvalidStateError)
async function shareFiles(data) {
  if (sharing) return 'busy';
  sharing = true;
  try { await navigator.share(data); return 'ok'; }
  catch (e) { return e?.name === 'AbortError' || e?.name === 'InvalidStateError' ? 'cancel' : 'error'; }
  finally { sharing = false; }
}

$('#saveBtn').addEventListener('click', async () => {
  const file = fileFor(state.blob);
  track('save', { kind: state.kind });
  // iPhone: a downloaded file lands in Files, not Photos. The share sheet has Save Image / Save Video.
  if (IOS && navigator.canShare?.({ files: [file] })) {
    const r = await shareFiles({ files: [file] });
    if (r === 'ok') toast(tagTip());
    if (r !== 'error') return;
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  toast(`Downloading… ${tagTip()}`);
});

$('#shareBtn').addEventListener('click', async () => {
  const file = fileFor(state.blob);
  const link = C.shareUrl || location.origin + location.pathname;
  const text = `${C.shareText} ${C.hashtag}`;
  if (navigator.canShare?.({ files: [file] })) {
    const r = await shareFiles({ files: [file], text: `${text} ${link}`, title: C.seasonTitle });
    if (r === 'ok') track('share', { kind: state.kind, method: 'native' });
    if (r === 'error') $('#saveBtn').click(); // sharing isn't allowed here: fall back to saving
  } else {
    // Desktop / unsupported: save the file and copy the caption
    $('#saveBtn').click();
    try { await navigator.clipboard.writeText(`${text} ${link}`); toast('Saved + caption copied. Paste it in your post!'); } catch {}
    track('share', { kind: state.kind, method: 'download' });
  }
});

// ── Misc ─────────────────────────────────────────────────────

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.recorder) stopRecording();
  if (!document.hidden) {
    state.q = null; // the gap while hidden says nothing about device speed
    if ($('#ar').classList.contains('active') && state.stream) keepAwake(true);
    if ($('#intro').classList.contains('active')) meshTick();
  }
});
