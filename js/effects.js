// Face-anchored AR effects drawn on a 2D canvas.
//
// Every effect draws in a "face-local" coordinate space:
//   origin = midpoint between the pupils
//   x axis = along the eye line (screen-right), y axis = down the face
//   1 unit = face width (cheek to cheek)
// so a hat or a pair of glasses scales, moves and tilts with the head for free.

const TAU = Math.PI * 2;
let C = null; // config, set via setTheme()

export function setTheme(config) { C = config; }

// ── Face pose ────────────────────────────────────────────────

// MediaPipe Face Mesh landmark indices
const LM = { top: 10, chin: 152, cheekL: 234, cheekR: 454, lipTop: 13, lipBottom: 14, irisA: 468, irisB: 473, eyeA: 33, eyeB: 263 };

export function facePose(lm, blend, toScreen) {
  const P = (i) => toScreen(lm[i].x, lm[i].y);
  const a = P(LM.cheekL), b = P(LM.cheekR);
  let ex = b.x - a.x, ey = b.y - a.y;
  // orient the local frame by the face itself (local +y runs forehead → chin), so any roll works, mirrored or not
  const top = P(LM.top), chin = P(LM.chin);
  if (-ey * (chin.x - top.x) + ex * (chin.y - top.y) < 0) { ex = -ex; ey = -ey; }
  const w = Math.hypot(ex, ey) || 1;
  const cos = ex / w, sin = ey / w;

  const iris = lm.length > LM.irisB;
  const ea = P(iris ? LM.irisA : LM.eyeA), eb = P(iris ? LM.irisB : LM.eyeB);
  const ox = (ea.x + eb.x) / 2, oy = (ea.y + eb.y) / 2;
  const L = (p) => {
    const dx = (p.x - ox) / w, dy = (p.y - oy) / w;
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  };

  const lip1 = L(P(LM.lipTop)), lip2 = L(P(LM.lipBottom));
  const score = (name) => blend?.categories?.find((c) => c.categoryName === name)?.score;
  const jaw = score('jawOpen') ?? clamp((lip2.y - lip1.y - 0.02) * 8, 0, 1);
  const smile = ((score('mouthSmileLeft') ?? 0) + (score('mouthSmileRight') ?? 0)) / 2;

  return {
    ox, oy, w,
    angle: Math.atan2(sin, cos),
    top: L(P(LM.top)).y,        // hairline (negative = above eyes)
    chin: L(P(LM.chin)).y,
    eyeHalf: Math.abs(L(ea).x - L(eb).x) / 2,
    mouthX: (lip1.x + lip2.x) / 2,
    mouthY: (lip1.y + lip2.y) / 2,
    jaw, smile,
    pts: lm.map((p) => toScreen(p.x, p.y)),
  };
}

// Light smoothing so effects don't jitter. Faces are matched to the previous
// frame by proximity, so group shots keep their hats on the right heads.
export function smoothFaces(prev, next, k = 0.55) {
  return next.map((n) => {
    let best = null, bestD = Infinity;
    for (const p of prev) {
      const d = Math.hypot(p.ox - n.ox, p.oy - n.oy);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best || bestD > n.w * 0.6) return n;
    const out = {};
    for (const key in n) {
      if (key === 'angle') {
        let d = n.angle - best.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        out.angle = best.angle + d * k;
      } else if (key === 'pts') {
        const a = best.pts, b = n.pts;
        out.pts = a.length === b.length ? b.map((p, i) => ({ x: a[i].x + (p.x - a[i].x) * k, y: a[i].y + (p.y - a[i].y) * k })) : b;
      } else {
        out[key] = best[key] + (n[key] - best[key]) * k;
      }
    }
    return out;
  });
}

export function localToScreen(f, x, y) {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  return { x: f.ox + f.w * (c * x - s * y), y: f.oy + f.w * (s * x + c * y) };
}

function enter(ctx, f) {
  const c = Math.cos(f.angle) * f.w, s = Math.sin(f.angle) * f.w;
  ctx.setTransform(c, s, -s, c, f.ox, f.oy);
}

// Canvas text misbehaves at tiny font sizes, so draw at 100px and scale down.
function text(ctx, str, x, y, size, { weight = 700, align = 'center', fill = '#fff', maxWidth } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.font = `${weight} 100px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.fillText(str, 0, 0, maxWidth ? (maxWidth * 100) / size : undefined);
  ctx.restore();
}

export const DISPLAY = '"Syncopate", "Arial", sans-serif';
export const MONO = '"Roboto Mono", ui-monospace, Menlo, Consolas, monospace';
export const FONT = DISPLAY;

// ── Filters ──────────────────────────────────────────────────

const snow = {
  id: 'snow', name: 'Snow Day', emoji: '❄️', burst: 'snow', hint: 'Open your mouth for frosty breath',
  ambient(fx, dt, W, H, t) { fx.snowfall(dt, W, H, t, 110); },
  draw(ctx, f, t) {
    enter(ctx, f);
    const cuffBottom = f.top + 0.11, cuffTop = f.top - 0.09;
    const domeRx = 0.56, domeRy = 0.62;

    // dome
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, cuffTop + 0.02, domeRx, domeRy, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = C.colors.primary;
    ctx.fill();
    ctx.clip();
    // knit stripes
    ctx.fillStyle = C.colors.accent;
    ctx.fillRect(-1, cuffTop - 0.2, 2, 0.035);
    // ribs
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = 0.012;
    for (let x = -0.55; x <= 0.55; x += 0.07) {
      ctx.beginPath(); ctx.moveTo(x, cuffTop); ctx.quadraticCurveTo(x * 0.7, cuffTop - 0.4, x * 0.15, cuffTop - domeRy); ctx.stroke();
    }
    // volume
    const g = ctx.createRadialGradient(-0.2, cuffTop - 0.4, 0.05, 0, cuffTop - 0.2, 0.75);
    g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = g; ctx.fillRect(-1, -2, 2, 3);
    ctx.restore();

    // the hat's shadow on the forehead
    const sh = ctx.createLinearGradient(0, cuffBottom - 0.01, 0, cuffBottom + 0.09);
    sh.addColorStop(0, 'rgba(25,10,3,.32)'); sh.addColorStop(1, 'rgba(25,10,3,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(0, cuffBottom - 0.01, 0.5, 0.1, 0, 0, Math.PI); ctx.fill();

    // cuff
    roundRect(ctx, -0.6, cuffTop, 1.2, cuffBottom - cuffTop, 0.07);
    ctx.fillStyle = C.colors.highlight; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,.13)'; ctx.lineWidth = 0.014;
    for (let x = -0.6; x <= 0.6; x += 0.045) { ctx.beginPath(); ctx.moveTo(x, cuffTop); ctx.lineTo(x, cuffBottom); ctx.stroke(); }
    const cg = ctx.createLinearGradient(0, cuffTop, 0, cuffBottom);
    cg.addColorStop(0, 'rgba(255,255,255,.25)'); cg.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = cg; ctx.fillRect(-1, cuffTop, 2, 1);
    ctx.restore();
    text(ctx, C.seasonShort, 0, (cuffTop + cuffBottom) / 2 + 0.005, 0.075, { fill: C.colors.brand, maxWidth: 0.95 });

    // pom-pom (wobbles)
    const px = Math.sin(t * 3) * 0.02, py = cuffTop - domeRy - 0.05;
    ctx.fillStyle = C.colors.highlight;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      ctx.beginPath(); ctx.arc(px + Math.cos(a) * 0.09, py + Math.sin(a) * 0.09, 0.06, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(px, py, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.beginPath(); ctx.arc(px + 0.03, py + 0.04, 0.08, 0, TAU); ctx.fill();
  },
};

const mvp = {
  id: 'mvp', name: 'MVP Crown', emoji: '👑', burst: 'gold', hint: 'Open your mouth to make it rain 😮',
  draw(ctx, f, t) {
    enter(ctx, f);
    const base = f.top - 0.04 + Math.sin(t * 2.5) * 0.015;
    ctx.save();
    ctx.translate(0, base); ctx.rotate(Math.sin(t * 1.7) * 0.04); ctx.translate(0, -base);

    const xs = [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4];
    const hs = [0.32, 0.15, 0.4, 0.15, 0.5, 0.15, 0.4, 0.15, 0.32];
    ctx.beginPath();
    ctx.moveTo(-0.4, base);
    xs.forEach((x, i) => ctx.lineTo(x, base - hs[i]));
    ctx.lineTo(0.4, base);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, base - 0.5, 0, base);
    g.addColorStop(0, '#FFF3B0'); g.addColorStop(0.45, '#FFC93C'); g.addColorStop(1, '#C98A00');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 0.015; ctx.strokeStyle = '#8A5A00'; ctx.stroke();

    // band + gems
    roundRect(ctx, -0.42, base - 0.12, 0.84, 0.12, 0.03);
    ctx.fillStyle = '#E8A800'; ctx.fill(); ctx.stroke();
    [[-0.26, C.colors.accent], [0, '#ff3b6b'], [0.26, C.colors.accent]].forEach(([x, col]) => {
      ctx.beginPath(); ctx.arc(x, base - 0.06, 0.04, 0, TAU); ctx.fillStyle = col; ctx.fill();
      ctx.beginPath(); ctx.arc(x - 0.012, base - 0.072, 0.012, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
    });
    // tips
    [0, 2, 4, 6, 8].forEach((i) => {
      ctx.beginPath(); ctx.arc(xs[i], base - hs[i] - 0.025, 0.035, 0, TAU); ctx.fillStyle = '#FFF3B0'; ctx.fill(); ctx.stroke();
    });
    ctx.restore();

    // orbiting sparkles
    for (let k = 0; k < 7; k++) {
      const a = t * 1.3 + (k * TAU) / 7;
      const s = 0.035 * (1.2 + Math.sin(t * 5 + k));
      sparkle(ctx, Math.cos(a) * 0.72, f.top - 0.15 + Math.sin(a) * 0.22, s, k % 2 ? '#FFF3B0' : '#fff');
    }
  },
};

const gameface = {
  id: 'gameface', name: 'Game Face', emoji: '🏆', burst: 'confetti', hint: 'Open your mouth for confetti 😮',
  draw(ctx, f, t) {
    enter(ctx, f);
    // headband
    const y0 = f.top + 0.06, y1 = f.top + 0.19, hw = 0.56;
    ctx.beginPath();
    ctx.moveTo(-hw, y0 + 0.03); ctx.quadraticCurveTo(0, y0 - 0.05, hw, y0 + 0.03);
    ctx.lineTo(hw, y1 + 0.03); ctx.quadraticCurveTo(0, y1 - 0.05, -hw, y1 + 0.03);
    ctx.closePath();
    ctx.fillStyle = C.colors.accent; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1, y0 - 0.06, 2, 0.045);
    ctx.fillRect(-1, y1 - 0.025, 2, 0.045);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(-1, (y0 + y1) / 2 + 0.03, 2, 0.2);
    ctx.restore();
    text(ctx, C.seasonShort, 0, (y0 + y1) / 2 - 0.01, 0.075, { fill: C.colors.primary, maxWidth: 0.8 });

    // eye-black / cheek stripes
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * (f.eyeHalf + 0.02), 0.17);
      ctx.rotate(s * -0.12);
      ctx.globalAlpha = 0.9;
      roundRect(ctx, -0.08, -0.045, 0.16, 0.035, 0.015); ctx.fillStyle = C.colors.highlight; ctx.fill();
      roundRect(ctx, -0.08, 0.01, 0.16, 0.035, 0.015); ctx.fillStyle = C.colors.accent; ctx.fill();
      ctx.restore();
    }
    // a star on one cheek, pulsing when you smile
    star(ctx, f.eyeHalf + 0.03, 0.3, 0.045 * (1 + f.smile * 0.6 + Math.sin(t * 4) * 0.05), 0.45, '#fff');
  },
};

// ── Wireframe: the face as a live mesh, like the wireframes in the brochure ──
let MESH = [];
export function setMesh(connections) { // the tessellation lists shared triangle edges twice: keep each edge once
  const seen = new Set();
  MESH = (connections || []).filter(({ start, end }) => {
    const k = Math.min(start, end) * 1000 + Math.max(start, end);
    return !seen.has(k) && seen.add(k);
  });
}

const wireframe = {
  id: 'wireframe', name: 'Wireframe', emoji: '◇', burst: 'pixels', hint: 'Open your mouth to scatter pixels',
  draw(ctx, f, t) {
    const pts = f.pts;
    if (!pts || !MESH.length) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // a scan line sweeps down the face; edges near it glow brighter
    const top = localToScreen(f, 0, f.top).y, bot = localToScreen(f, 0, f.chin).y;
    const span = Math.max(1, bot - top);
    const scan = top - span * 0.2 + ((t * 0.45) % 1) * span * 1.4;
    const buckets = [[], [], [], []];
    for (const { start, end } of MESH) {
      const a = pts[start], b = pts[end];
      if (!a || !b) continue;
      const d = Math.abs((a.y + b.y) / 2 - scan) / (span * 0.09);
      buckets[d < 0.6 ? 3 : d < 1.4 ? 2 : d < 3 ? 1 : 0].push(a, b);
    }
    const alphas = [0.5, 0.65, 0.85, 1];
    const lw = Math.max(1.6, f.w * 0.0045);
    const path = (seg) => { ctx.beginPath(); for (let j = 0; j < seg.length; j += 2) { ctx.moveTo(seg[j].x, seg[j].y); ctx.lineTo(seg[j + 1].x, seg[j + 1].y); } };
    // a soft chocolate underline keeps the white mesh readable on any skin tone
    ctx.lineWidth = lw * 2.2; ctx.strokeStyle = 'rgba(36,13,2,.18)';
    ctx.beginPath();
    for (const seg of buckets) for (let j = 0; j < seg.length; j += 2) { ctx.moveTo(seg[j].x, seg[j].y); ctx.lineTo(seg[j + 1].x, seg[j + 1].y); }
    ctx.stroke();
    ctx.lineWidth = lw;
    buckets.forEach((seg, i) => {
      if (!seg.length) return;
      ctx.strokeStyle = i === 3 ? '#ffffff' : `rgba(255,248,240,${alphas[i]})`;
      path(seg); ctx.stroke();
    });
    // the scan line itself
    const l = localToScreen(f, -0.62, 0), r = localToScreen(f, 0.62, 0);
    const g = ctx.createLinearGradient(l.x, 0, r.x, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(l.x, scan - 1, r.x - l.x, 2);
    enter(ctx, f);
    viewfinder(ctx, f);
  },
};

// ── Cocoa Snow: no props, just a warm grade and slow snow ──
const cocoa = {
  id: 'cocoa', name: 'Cocoa Snow', emoji: '☕', burst: 'snow', hint: 'Open your mouth to make it snow',
  ambient(fx, dt, W, H, t) { fx.snowfall(dt, W, H, t, 140); },
  grade(ctx, W, H) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = hexA(C.colors.highlight, 0.6);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = hexA(C.colors.highlight, 0.08);
    ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.8);
    v.addColorStop(0, 'rgba(36,13,2,0)'); v.addColorStop(1, 'rgba(36,13,2,.28)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
  draw() {},
};

function viewfinder(ctx, f) {
  ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 0.014; ctx.lineCap = 'butt';
  const x0 = 0.6, yT = f.top - 0.12, yB = f.chin + 0.06, arm = 0.1;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[-x0, yT, 1, 1], [x0, yT, -1, 1], [-x0, yB, 1, -1], [x0, yB, -1, -1]]) {
    ctx.moveTo(x, y + dy * arm); ctx.lineTo(x, y); ctx.lineTo(x + dx * arm, y);
  }
  ctx.stroke();
}

// The Virtual Fudge mark as wearable AR: striped fudge-bar shades that drip,
// framed by the logo's viewfinder corners.
const VF_STOPS = [[0, '#240d02'], [0.35, '#ae6b39'], [0.5, '#a96a3b'], [0.65, '#ae6b39'], [1, '#240d02']];

function lensPath(ctx, cx, s) { // s = +1 right lens, -1 left lens (outer side points along s)
  const w = 0.215, top = -0.15, bot = 0.2;
  const p0 = [cx - s * w * 0.9, top + 0.012];
  const c1 = [cx, top - 0.015], p1 = [cx + s * w, top + 0.01];
  const c2 = [cx + s * (w + 0.03), top + 0.06], p2 = [cx + s * w * 0.97, top + 0.17];
  const c3a = [cx + s * w * 0.9, bot + 0.02], c3b = [cx - s * w * 0.3, bot + 0.04], p3 = [cx - s * w * 0.72, bot - 0.06];
  const c4 = [cx - s * w * 1.0, 0.03];
  ctx.moveTo(...p0);
  if (s > 0) {
    ctx.quadraticCurveTo(...c1, ...p1); ctx.quadraticCurveTo(...c2, ...p2);
    ctx.bezierCurveTo(...c3a, ...c3b, ...p3); ctx.quadraticCurveTo(...c4, ...p0);
  } else { // the mirror image, traced backwards so both lenses wind the same way (the clip/fill union has no holes)
    ctx.quadraticCurveTo(...c4, ...p3); ctx.bezierCurveTo(...c3b, ...c3a, ...p2);
    ctx.quadraticCurveTo(...c2, ...p1); ctx.quadraticCurveTo(...c1, ...p0);
  }
  ctx.closePath();
}

const vfshades = {
  id: 'vfshades', name: 'Fudge Shades', emoji: '🍫', burst: 'fudge', hint: 'Open your mouth to make it drip',
  draw(ctx, f, t) {
    enter(ctx, f);
    const e = f.eyeHalf;
    const g = ctx.createLinearGradient(-e - 0.22, 0, e + 0.22, 0);
    VF_STOPS.forEach(([o, c]) => g.addColorStop(o, c));
    const bar = 0.025, step = 0.035;

    viewfinder(ctx, f);

    // soft contact shadow where the frames sit on the face
    ctx.save();
    ctx.shadowColor = 'rgba(20,8,2,.38)'; ctx.shadowBlur = f.w * 0.035; ctx.shadowOffsetY = f.w * 0.018;
    ctx.fillStyle = 'rgba(20,6,0,.5)';
    ctx.beginPath(); lensPath(ctx, -e, -1); lensPath(ctx, e, 1); ctx.fill();
    ctx.restore();

    // striped lenses + bridge
    ctx.save();
    ctx.beginPath();
    lensPath(ctx, -e, -1);
    lensPath(ctx, e, 1);
    ctx.rect(-e + 0.12, -0.155, 2 * (e - 0.12), 0.055);
    ctx.clip();
    ctx.fillStyle = 'rgba(20,6,0,.62)'; // dark lens tint between the bars
    ctx.fillRect(-1, -0.3, 2, 0.6);
    ctx.fillStyle = g;
    for (let x = -e - 0.24; x < e + 0.24; x += step) ctx.fillRect(x, -0.3, bar, 0.6);
    // light sweep, every few seconds
    const span = e + 0.3, sx = ((t * 0.32) % 1.8 - 0.4) * span * 2 - span;
    const sg = ctx.createLinearGradient(sx - 0.12, 0, sx + 0.12, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,240,220,.38)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(sx - 0.08, -0.3); ctx.lineTo(sx + 0.16, -0.3); ctx.lineTo(sx + 0.04, 0.3); ctx.lineTo(sx - 0.2, 0.3); ctx.closePath(); ctx.fill();
    ctx.restore();

    // drips off the right lens; they stretch when the mouth opens
    ctx.fillStyle = g;
    [[0.02, 0.16, 0], [0.056, 0.09, 1.7], [0.092, 0.12, 3.1]].forEach(([dx, len, ph]) => {
      const x = e + dx - bar / 2;
      const y0 = 0.15, l = len + Math.sin(t * 1.6 + ph) * 0.025 + f.jaw * 0.2;
      ctx.fillRect(x, y0, bar, l);
      ctx.beginPath(); ctx.arc(x + bar / 2, y0 + l, bar / 2, 0, Math.PI); ctx.fill();
    });
  },
};

const shades = {
  id: 'shades', name: 'Star Shades', emoji: '🕶️', burst: 'stars', hint: 'Open your mouth for star power 😮',
  draw(ctx, f, t) {
    enter(ctx, f);
    const e = f.eyeHalf, r = 0.19, wob = Math.sin(t * 2) * 0.08;
    // temples
    ctx.strokeStyle = C.colors.highlight; ctx.lineWidth = 0.03; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * (e + r * 0.85), -0.04); ctx.lineTo(s * 0.5, -0.01); ctx.stroke(); }
    // bridge
    ctx.beginPath(); ctx.moveTo(-e + r * 0.6, -0.03); ctx.quadraticCurveTo(0, -0.1, e - r * 0.6, -0.03); ctx.stroke();
    // lenses
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * e, 0.0);
      ctx.rotate(s * wob);
      starPath(ctx, 0, 0, r, 0.55);
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, hexA(C.colors.accent, 0.75)); g.addColorStop(1, hexA(C.colors.primary, 0.85));
      ctx.fillStyle = g; ctx.fill();
      ctx.lineJoin = 'round'; ctx.lineWidth = 0.035; ctx.strokeStyle = C.colors.highlight; ctx.stroke();
      // glint
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.018;
      ctx.beginPath(); ctx.moveTo(-0.07, -0.05); ctx.lineTo(-0.01, -0.11); ctx.stroke();
      ctx.restore();
    }
  },
};

const ALL = { vfshades, wireframe, snow, cocoa, mvp, gameface, shades };
export function getFilters(ids) { return ids.map((id) => ALL[id]).filter(Boolean); }

// ── Particles (screen space) ─────────────────────────────────

export class Particles {
  constructor(scale = 1) { this.list = []; this.flakes = []; this.u = scale; }

  emit(type, x, y, n, dir = null, spread = TAU) {
    const u = this.u;
    for (let i = 0; i < n && this.list.length < 700; i++) {
      const a = dir == null ? Math.random() * TAU : dir + (Math.random() - 0.5) * spread;
      const m = MOTION[type] || MOTION.default;
      const sp = rand(...m.speed) * u, life = rand(...m.life);
      this.list.push({
        type, x, y, life, max: life,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: m.spin ? Math.random() * TAU : 0, vr: m.spin ? rand(-m.spin, m.spin) : 0,
        size: rand(...m.size) * u,
        color: pick(palette(type)),
      });
    }
  }

  snowfall(dt, W, H, t, count) {
    const u = this.u;
    while (this.flakes.length < count) {
      this.flakes.push({ x: Math.random() * W, y: Math.random() * H, r: rand(2, 7) * u, v: rand(60, 180) * u, p: Math.random() * TAU });
    }
    if (this.flakes.length > count) this.flakes.length = count; // each filter keeps its own density
    for (const f of this.flakes) {
      f.y += f.v * dt;
      f.x += Math.sin(t * 1.5 + f.p) * 25 * u * dt;
      if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
    }
    this.snowing = true;
  }

  update(dt) {
    const drag = Math.exp(-1.8 * dt);
    for (const p of this.list) {
      p.life -= dt;
      p.vx *= drag; p.vy *= drag;
      p.vy += (MOTION[p.type] || MOTION.default).gravity * this.u * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx) {
    if (this.snowing) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // three depths: small faint flakes far away, larger brighter ones close
      for (const [lo, hi, alpha] of [[0, 3.2, 0.45], [3.2, 5.2, 0.7], [5.2, 99, 0.92]]) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        for (const f of this.flakes) {
          const r = f.r / this.u;
          if (r < lo || r >= hi) continue;
          ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, TAU);
        }
        ctx.fill();
      }
      this.snowing = false;
    } else {
      this.flakes.length = 0;
    }
    for (const p of this.list) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      ctx.setTransform(c, s, -s, c, p.x, p.y);
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.4));
      ctx.fillStyle = p.color;
      if (p.type === 'snow') {
        ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, TAU); ctx.fill();
      } else if (p.type === 'fudge') { // chocolate chip with a soft highlight
        roundRect(ctx, -p.size / 2, -p.size / 2, p.size, p.size * 0.8, p.size * 0.22); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.22)';
        roundRect(ctx, -p.size * 0.35, -p.size * 0.38, p.size * 0.4, p.size * 0.18, p.size * 0.08); ctx.fill();
      } else if (p.type === 'pixels') { // crisp squares that drift up and flicker out
        ctx.globalAlpha *= 0.75 + 0.25 * Math.sin(p.life * 40);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.type === 'stars') {
        starPath(ctx, 0, 0, p.size / 2, 0.45); ctx.fill();
      } else {
        const flutter = Math.cos(p.rot * 1.7);
        ctx.fillRect(-p.size / 2, (-p.size / 4) * flutter, p.size, (p.size / 2) * flutter);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

const MOTION = {
  snow: { speed: [150, 500], life: [0.6, 1.2], size: [6, 16], gravity: 120, spin: 8 },
  fudge: { speed: [300, 820], life: [1.4, 2.4], size: [10, 20], gravity: 1000, spin: 6 },
  pixels: { speed: [120, 380], life: [0.9, 1.8], size: [6, 13], gravity: -160, spin: 0 },
  default: { speed: [400, 1100], life: [1.2, 2.2], size: [10, 20], gravity: 900, spin: 8 },
};
MOTION.stars = { ...MOTION.default, size: [14, 30] };

function palette(type) {
  switch (type) {
    case 'snow': return ['#ffffff', '#eaf8ff', '#d4f3ff'];
    case 'pixels': return [C.colors.highlight, C.colors.accent, '#ffffff'];
    case 'fudge': return ['#240d02', '#3a1a0b', '#5a2a10', '#8d4f29', '#ae6b39'];
    case 'gold': return ['#FFD54A', '#FFC93C', '#FFF1B0', '#E0A800', '#ffffff'];
    case 'stars': return [C.colors.highlight, C.colors.accent, '#ffffff'];
    default: return [C.colors.accent, C.colors.highlight, '#ffffff', '#ff3b6b'];
  }
}

// ── Drawing helpers ──────────────────────────────────────────

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starPath(ctx, x, y, r, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function star(ctx, x, y, r, inner, fill) { starPath(ctx, x, y, r, inner); ctx.fillStyle = fill; ctx.fill(); }

function sparkle(ctx, x, y, r, fill) { starPath(ctx, x, y, r, 0.25, 4); ctx.fillStyle = fill; ctx.fill(); }

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
