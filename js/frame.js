// Branded overlay drawn on top of every frame, so it's baked into photos and videos.
// Layout: the camera image as a print, sitting on a paper caption strip, like a
// page of the Virtual Fudge brochure.
import { DISPLAY, MONO, hexA } from './effects.js';

export const BAND = 0.74; // caption strip starts at 74% of the height

export function countdownLabel(C, now = new Date()) {
  if (!C.seasonStart) return C.startLabel || '';
  // a plain 'YYYY-MM-DD' means local midnight (JS would read it as UTC); anything unparseable falls back to the label
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(C.seasonStart);
  const start = ymd ? new Date(+ymd[1], ymd[2] - 1, +ymd[3]) : new Date(C.seasonStart);
  if (isNaN(start)) return C.startLabel || '';
  if (start <= now) return C.liveLabel || "It's here";
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d1 = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days = Math.round((d1 - d0) / 864e5);
  if (days === 0) return 'Tonight';
  if (days === 1) return 'Tomorrow';
  return `${days} days to go`;
}

let grain = null;
function grainPattern(ctx) {
  if (!grain) {
    const c = document.createElement('canvas');
    c.width = c.height = 192;
    const g = c.getContext('2d'), img = g.createImageData(192, 192);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 14;
    }
    g.putImageData(img, 0, 0);
    grain = c;
  }
  return ctx.createPattern(grain, 'repeat');
}

function brackets(ctx, x0, y0, x1, y1, arm) {
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.moveTo(x, y + dy * arm); ctx.lineTo(x, y); ctx.lineTo(x + dx * arm, y);
  }
  ctx.stroke();
}

// faint wireframe torus, like the meshes floating on the brochure pages
function mesh(ctx, cx, cy, R, r, tilt) {
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * R, cy + Math.sin(a) * R * tilt, r * Math.abs(Math.cos(a)) + r * 0.25, r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const s of [R - r, R, R + r]) { ctx.beginPath(); ctx.ellipse(cx, cy, s, s * tilt, 0, 0, Math.PI * 2); ctx.stroke(); }
}

function fits(ctx, str, max) { return ctx.measureText(str).width <= max; }

export function drawBrandFrame(ctx, W, H, C, t, logo, logoPaper) {
  const u = W / 1080;
  const { text } = C.colors;
  const y0 = Math.round(H * BAND);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // a whisper of shade at the top so the white logo reads on bright backgrounds
  let g = ctx.createLinearGradient(0, 0, 0, 240 * u);
  g.addColorStop(0, 'rgba(20,10,4,.32)'); g.addColorStop(1, 'rgba(20,10,4,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 240 * u);

  if (logo && logo.complete && logo.naturalWidth) {
    const lh = 82 * u, lw = (logo.naturalWidth / logo.naturalHeight) * lh;
    ctx.drawImage(logo, (W - lw) / 2, 64 * u, lw, lh);
  } else if (!logo || logo.complete) { // no logo configured, or it failed to load: the brand name in text
    ctx.fillStyle = hexA(text, 0.95);
    ctx.font = `700 ${30 * u}px ${DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(C.brand, W / 2, 105 * u, W - 200 * u);
  }

  // viewfinder corners on the photo
  ctx.strokeStyle = hexA(text, 0.95);
  ctx.lineWidth = 4 * u;
  ctx.lineCap = 'butt';
  brackets(ctx, 40 * u, 40 * u, W - 40 * u, y0 - 40 * u, 64 * u);

  // paper caption strip: static, so it's drawn once into an offscreen canvas and reused every frame
  const key = [W, H, countdownLabel(C), !!(logoPaper && logoPaper.complete && logoPaper.naturalWidth), document.fonts?.status].join('|');
  if (!stripCache || stripCache.key !== key) stripCache = { key, canvas: drawStrip(W, H, C, logoPaper) };
  ctx.drawImage(stripCache.canvas, 0, y0);
  ctx.restore();
}

let stripCache = null;
function drawStrip(W, H, C, logoPaper) {
  const u = W / 1080;
  const { paper, ink, brand } = C.colors;
  const y0 = Math.round(H * BAND), h = H - y0;
  const pad = 72 * u;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.translate(0, -y0); // keep drawing in full-frame coordinates

  ctx.fillStyle = paper; ctx.fillRect(0, y0, W, h);
  ctx.fillStyle = grainPattern(ctx); ctx.fillRect(0, y0, W, h);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, y0, W, 2 * u);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, y0, W, h); ctx.clip();
  ctx.strokeStyle = 'rgba(35,31,32,.10)'; ctx.lineWidth = 1.5 * u;
  mesh(ctx, W * 0.93, y0 + 175 * u, 150 * u, 46 * u, 0.42);
  ctx.restore();

  ctx.strokeStyle = ink; ctx.lineWidth = 3 * u;
  brackets(ctx, 32 * u, y0 + 32 * u, W - 32 * u, H - 32 * u, 30 * u);

  // text, left-aligned like the brochure
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const maxW = W - pad * 2;

  const kicker = [C.kicker, countdownLabel(C)].filter(Boolean).join(' · ');
  ctx.fillStyle = brand;
  ctx.font = `700 ${26 * u}px ${DISPLAY}`;
  ctx.fillText(kicker, pad, y0 + 96 * u, maxW);

  let size = 62;
  ctx.font = `400 ${size * u}px ${DISPLAY}`;
  while (size > 40 && !fits(ctx, C.seasonTitle, maxW)) ctx.font = `400 ${--size * u}px ${DISPLAY}`;
  ctx.fillText(C.seasonTitle, pad, y0 + 170 * u, maxW);

  ctx.fillStyle = ink;
  ctx.font = `400 ${29 * u}px ${MONO}`;
  ctx.fillText([C.hashtag, C.website].filter(Boolean).join('  ·  '), pad, y0 + 232 * u, maxW);

  // full-color logo in the bottom corner of the strip
  if (logoPaper && logoPaper.complete && logoPaper.naturalWidth) {
    const lh = 92 * u, lw = (logoPaper.naturalWidth / logoPaper.naturalHeight) * lh;
    ctx.drawImage(logoPaper, W - pad - lw, H - 68 * u - lh, lw, lh);
  } else {
    ctx.fillStyle = ink;
    ctx.font = `700 ${24 * u}px ${DISPLAY}`;
    ctx.textAlign = 'right';
    ctx.fillText(C.brand, W - pad, H - 82 * u);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = hexA(ink, 0.6);
  ctx.font = `400 ${22 * u}px ${MONO}`;
  ctx.fillText(C.handle ? `Tag ${C.handle}` : 'Made in AR', pad, H - 82 * u);
  return cv;
}
