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

const state = {
  facing: 'user', stream: null, running: false,
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
  // the torus turns slowly while the intro is on screen
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const intro = $('#intro');
  const tick = (now) => {
    if (intro.classList.contains('active') && !document.hidden) place(now / 9000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
if (isDesktop && window.qrcode) {
  $('#desktopQR').hidden = false;
  const u = new URL(location.href);
  u.searchParams.set('src', 'desktop-qr');
  drawQR($('#qr'), u.href);
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
$('#flipBtn').addEventListener('click', async () => {
  state.facing = state.facing === 'user' ? 'environment' : 'user';
  state.faces = [];
  try { await startCamera(); resume(); } catch (e) { cameraError(e); }
});

// ── Screens ──────────────────────────────────────────────────

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

async function start() {
  track('start');
  showCamError('');
  show('ar');
  $('#loading').classList.remove('done');
  buildFilterBar();
  try {
    await Promise.all([startCamera(), fontsReady]);
  } catch (e) {
    cameraError(e);
    show('intro');
    return;
  }
  $('#loading').classList.add('done');
  layoutControls();
  resume();
  trackerReady.then((lm) => { state.landmarker = lm; state.trackerFailed = !lm; state.trackStart = performance.now(); });
}

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
  requestAnimationFrame(loop);
}

function cameraError(e) {
  console.error(e);
  const ua = navigator.userAgent;
  const inApp = /Instagram|FBAN|FBAV|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedInApp/i.test(ua);
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  let msg;
  if (inApp) msg = 'This app’s browser blocks the camera. Tap ••• and choose “Open in browser”.';
  else if (!navigator.mediaDevices?.getUserMedia) msg = 'The camera needs a secure (https) link. Open this page from its https address.';
  else if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    msg = ios ? 'Camera access is off. Tap “aA” in the address bar › Website Settings › Camera › Allow, then try again.'
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

async function startCamera() {
  stopCamera();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  state.stream = stream;
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
}

// keep the screen on while the camera is open (kiosks, tablets on stands)
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock) { wakeLock = await navigator.wakeLock?.request('screen'); wakeLock?.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}

function stopCamera() {
  keepAwake(false);
  cancelCountdown();
  state.running = false;
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
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
    try {
      return await FaceLandmarker.createFromOptions(wasm, options('GPU'));
    } catch (e) {
      console.warn('GPU face tracking unavailable, falling back to CPU', e);
      return await FaceLandmarker.createFromOptions(wasm, options('CPU'));
    }
  })().catch((e) => {
    console.error(e);
    toast('Face tracking couldn’t load, but tap the screen for effects!', 4000);
    return null;
  });
}

// ── Render loop ──────────────────────────────────────────────

function loop(now) {
  if (!state.running) return;
  requestAnimationFrame(loop);
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
  const mirror = state.facing === 'user';

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
  if (!state.landmarker && !state.trackerFailed && state.facing === 'user') {
    if (hint.dataset.kind !== 'loading') { hint.textContent = 'Starting face tracking…'; hint.hidden = false; hint.dataset.kind = 'loading'; }
    return;
  }
  if (hint.dataset.kind === 'loading') { hint.hidden = true; hint.dataset.kind = ''; }
  // once tracking is running, nudge people who aren't in frame
  const now = performance.now();
  if (hasFace) state.lastFace = now;
  const lost = state.facing === 'user' && state.landmarker && now - (state.lastFace ?? state.trackStart ?? now) > 2500;
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
    b.setAttribute('role', 'tab');
    b.textContent = f.name;
    b.addEventListener('click', () => setFilter(i));
    bar.append(b);
  });
  setFilter(state.filter, true);
}

function setFilter(i, silent) {
  state.filter = (i + FILTERS.length) % FILTERS.length;
  [...$('#filters').children].forEach((b, j) => b.setAttribute('aria-selected', j === state.filter));
  $('#filters').children[state.filter]?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  if (!silent) {
    track('filter');
    const label = $('#modeLabel');
    label.textContent = FILTERS[state.filter].name;
    label.classList.remove('show'); void label.offsetWidth; label.classList.add('show');
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

// keyboard: space/enter = photo, arrows = filters, escape = back
document.addEventListener('keydown', (e) => {
  if ($('#ar').classList.contains('active')) {
    if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return; // let focused buttons work normally
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) capturePhoto(); }
    else if (e.key === 'ArrowRight') setFilter(state.filter + 1);
    else if (e.key === 'ArrowLeft') setFilter(state.filter - 1);
    else if (e.key === 'Escape') $('#closeBtn').click();
  } else if ($('#result').classList.contains('active') && e.key === 'Escape') {
    $('#retakeBtn').click();
  }
});

// ── Capture ──────────────────────────────────────────────────

const shutter = $('#shutter');
let holdTimer = null, pressed = false;

shutter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pressed = true;
  shutter.setPointerCapture?.(e.pointerId);
  if (countTimer) return; // a tap during the countdown cancels it (handled on release)
  holdTimer = setTimeout(() => { if (pressed) startRecording(); }, 350);
});
const release = (photo) => () => {
  if (!pressed) return;
  pressed = false;
  clearTimeout(holdTimer);
  if (state.recorder) stopRecording();
  else if (photo) capturePhoto();
};
shutter.addEventListener('pointerup', release(true));
shutter.addEventListener('pointercancel', release(false));
shutter.addEventListener('contextmenu', (e) => e.preventDefault());

function takePhoto() {
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
  navigator.vibrate?.(30);
}

function stopRecording() {
  const rec = state.recorder;
  if (!rec) return;
  state.recorder = null;
  shutter.classList.remove('rec');
  shutter.style.setProperty('--p', 0);
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
  if (kind === 'video') { // attributes before src so iOS plays it inline and silently
    for (const a of ['autoplay', 'loop', 'muted', 'playsinline']) el.setAttribute(a, '');
    el.muted = true;
  }
  el.src = url;
  el.alt = 'Your AR selfie';
  box.append(el);
  const what = kind === 'photo' ? 'Photo' : `Video · ${Math.max(1, Math.round(seconds || 0))}s`;
  $('#resultMeta').textContent = `${what} · ${W} × ${H} · ready for Stories & Reels`;
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
}
$('#copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(caption()); toast('Caption copied. Paste it into your post.'); }
  catch { toast(caption(), 6000); }
  track('copy');
});

$('#retakeBtn').addEventListener('click', () => { show('ar'); layoutControls(); resume(); });

$('#saveBtn').addEventListener('click', () => {
  const file = fileFor(state.blob);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  track('save', { kind: state.kind });
  toast(C.handle ? `Saved. Tag ${C.handle} when you post.` : `Saved. Post it with ${C.hashtag}.`);
});

$('#shareBtn').addEventListener('click', async () => {
  const file = fileFor(state.blob);
  const link = C.shareUrl || location.origin + location.pathname;
  const text = `${C.shareText} ${C.hashtag}`;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${text} ${link}`, title: C.seasonTitle });
      track('share', { kind: state.kind, method: 'native' });
    } catch (e) {
      if (e.name !== 'AbortError') { console.warn(e); $('#saveBtn').click(); }
    }
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
  if (!document.hidden && $('#ar').classList.contains('active') && state.stream) keepAwake(true);
});
