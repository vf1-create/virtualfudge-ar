import C from './config.js';
import { setTheme, setMesh, getFilters, facePose, smoothFaces, localToScreen, Particles } from './effects.js';
import { drawBrandFrame, countdownLabel, BAND } from './frame.js';

const W = C.output.width, H = C.output.height;
const $ = (s) => document.querySelector(s);
const root = document.documentElement;

const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const video = $('#cam');
canvas.width = W; canvas.height = H;

setTheme(C);
const FILTERS = getFilters(C.filters);
const fx = new Particles(W / 1080);
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
  const cx = 230, cy = 120, R = 120, r = 36, tilt = 0.42, ns = 'http://www.w3.org/2000/svg';
  const add = (attrs) => { const e = document.createElementNS(ns, 'ellipse'); for (const k in attrs) e.setAttribute(k, attrs[k]); g.append(e); };
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    add({ cx: cx + Math.cos(a) * R, cy: cy + Math.sin(a) * R * tilt, rx: r * Math.abs(Math.cos(a)) + r * 0.25, ry: r });
  }
  for (const s of [R - r, R, R + r]) add({ cx, cy, rx: s, ry: s * tilt });
}

// Canvas text needs the brand fonts loaded before the first frame is drawn
const fontsReady = Promise.race([
  Promise.all(['400 40px Syncopate', '700 40px Syncopate', '400 20px "Roboto Mono"'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {});
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
  resume();
  trackerReady.then((lm) => { state.landmarker = lm; });
}

function resume() {
  if (state.running) return;
  state.running = true;
  state.lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function cameraError(e) {
  console.error(e);
  const inApp = /Instagram|FBAN|FBAV|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedInApp/i.test(navigator.userAgent);
  const msg = inApp
    ? 'This app’s browser blocks the camera. Tap ••• and choose “Open in browser”.'
    : !navigator.mediaDevices?.getUserMedia
    ? 'Camera needs a secure (https) link. Open this page over https.'
    : e?.name === 'NotAllowedError'
      ? 'Camera access was blocked. Allow it in your browser settings and try again.'
      : 'Couldn’t start the camera. Close other apps using it and try again.';
  toast(msg, 5000);
}

// ── Camera + tracking ────────────────────────────────────────

async function startCamera() {
  stopCamera();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  state.stream = stream;
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
}

function stopCamera() {
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
  const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  if (video.readyState < 2 || !video.videoWidth) return;

  const lm = state.landmarker;
  if (lm && video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    state.lastTs = Math.max(now, state.lastTs + 1); // must strictly increase
    try { state.result = lm.detectForVideo(video, state.lastTs); } catch (e) { console.warn(e); }
  }

  render(now / 1000, dt);

  if (state.recorder) {
    const p = (now - state.recStart) / (C.maxVideoSeconds * 1000);
    $('#shutter').style.setProperty('--p', Math.min(1, p));
    if (p >= 1) stopRecording();
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
    const n = Math.floor((state.mouthAcc += dt * 70 * f.jaw));
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
    const c = toCanvas(innerWidth / 2, innerHeight * 0.45);
    fx.emit(FILTERS[state.filter].burst, c.x, c.y, 40);
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

// ── Capture ──────────────────────────────────────────────────

const shutter = $('#shutter');
let holdTimer = null, pressed = false;

shutter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pressed = true;
  shutter.setPointerCapture?.(e.pointerId);
  holdTimer = setTimeout(() => { if (pressed) startRecording(); }, 350);
});
const release = (photo) => () => {
  if (!pressed) return;
  pressed = false;
  clearTimeout(holdTimer);
  if (state.recorder) stopRecording();
  else if (photo) takePhoto();
};
shutter.addEventListener('pointerup', release(true));
shutter.addEventListener('pointercancel', release(false));
shutter.addEventListener('contextmenu', (e) => e.preventDefault());

function takePhoto() {
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
    track('video', { seconds: Math.round((performance.now() - state.recStart) / 1000) });
    showResult(blob, 'video');
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

function showResult(blob, kind) {
  state.running = false; // pause rendering, keep camera warm for retake
  state.blob = blob; state.kind = kind;
  const box = $('#resultMedia');
  box.querySelectorAll('img,video').forEach((el) => URL.revokeObjectURL(el.src));
  box.innerHTML = '';
  const url = URL.createObjectURL(blob);
  const el = document.createElement(kind === 'photo' ? 'img' : 'video');
  el.src = url;
  if (kind === 'video') Object.assign(el, { autoplay: true, loop: true, muted: true, playsInline: true });
  el.alt = 'Your AR selfie';
  box.append(el);
  show('result');
}

function fileFor(blob) {
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : 'jpg';
  const slug = C.hashtag.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'season';
  return new File([blob], `${slug}-${Date.now()}.${ext}`, { type: blob.type });
}

$('#retakeBtn').addEventListener('click', () => { show('ar'); resume(); });

$('#saveBtn').addEventListener('click', () => {
  const file = fileFor(state.blob);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  track('save', { kind: state.kind });
  toast('Saved! Post it with ' + C.hashtag);
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
});
