// Branded overlay drawn on top of every frame, so it's baked into photos and videos.
import { FONT, hexA, roundRect } from './effects.js';

export function countdownLabel(C, now = new Date()) {
  if (!C.seasonStart) return C.startLabel || '';
  const start = new Date(C.seasonStart);
  if (start <= now) return C.liveLabel || 'NOW LIVE';
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d1 = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days = Math.round((d1 - d0) / 864e5);
  if (days === 0) return 'TONIGHT';
  if (days === 1) return 'TOMORROW';
  return `${days} DAYS TO GO`;
}

export function drawBrandFrame(ctx, W, H, C, t, logo) {
  const u = W / 1080;
  const { primary, accent, highlight, text } = C.colors;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // scrims for legibility (light at the top, deeper behind the lower third)
  let g = ctx.createLinearGradient(0, 0, 0, H * 0.12);
  g.addColorStop(0, hexA(primary, 0.7)); g.addColorStop(1, hexA(primary, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.12);
  g = ctx.createLinearGradient(0, H, 0, H * 0.6);
  g.addColorStop(0, hexA(primary, 0.95)); g.addColorStop(0.55, hexA(primary, 0.6)); g.addColorStop(1, hexA(primary, 0));
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);

  // gradient border
  const inset = 26 * u;
  g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, accent); g.addColorStop(0.5, highlight); g.addColorStop(1, accent);
  ctx.strokeStyle = g; ctx.lineWidth = 10 * u;
  roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, 56 * u);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // top: small brand mark only, so the face stays clear
  const top = 118 * u;
  if (logo && logo.complete && logo.naturalWidth) {
    const lh = 104 * u, lw = Math.min((logo.naturalWidth / logo.naturalHeight) * lh, W * 0.5);
    ctx.drawImage(logo, (W - lw) / 2, top - lh / 2, lw, lh);
  } else {
    ctx.font = `800 ${32 * u}px ${FONT}`;
    ctx.fillStyle = hexA(text, 0.92);
    spaced(ctx, C.brand, W / 2, top, 8 * u);
  }

  // lower third: countdown pill → title → hashtag (kept above the live camera controls)
  const label = countdownLabel(C);
  let y = H * 0.705;
  ctx.font = `italic 900 ${38 * u}px ${FONT}`;
  const pw = ctx.measureText(label).width + 64 * u, ph = 64 * u;
  const pulse = 1 + Math.sin(t * 4) * 0.025;
  ctx.save();
  ctx.translate(W / 2, y); ctx.scale(pulse, pulse);
  roundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
  ctx.fillStyle = highlight; ctx.fill();
  ctx.fillStyle = primary; ctx.fillText(label, 0, 2 * u);
  ctx.restore();

  y += 105 * u;
  ctx.font = `italic 900 ${88 * u}px ${FONT}`;
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 4 * u;
  ctx.fillStyle = text;
  ctx.fillText(C.seasonTitle, W / 2, y, W - 120 * u);
  ctx.shadowColor = 'transparent';

  y += 92 * u;
  ctx.font = `italic 900 ${64 * u}px ${FONT}`;
  g = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
  g.addColorStop(0, highlight); g.addColorStop(1, text);
  ctx.fillStyle = g;
  ctx.fillText(C.hashtag, W / 2, y, W - 160 * u);

  // very bottom (sits under the shutter while live, shows in the saved photo/video)
  if (C.startLabel && label !== C.startLabel) {
    ctx.font = `800 ${30 * u}px ${FONT}`;
    ctx.fillStyle = hexA(text, 0.85);
    spaced(ctx, C.startLabel, W / 2, H - 95 * u, 4 * u);
  }

  ctx.restore();
}

// letter-spaced centered text (ctx.letterSpacing isn't everywhere yet)
function spaced(ctx, str, cx, y, gap) {
  const chars = [...str];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + gap; });
  ctx.textAlign = align;
}
