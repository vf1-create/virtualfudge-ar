// Builds every instrument from primitives with three.js. No photos, textures, logos or scans:
// shapes and flat colors only. Run by tools/build-models.mjs, which exports GLB + USDZ.
// Units are meters, so AR places each one at roughly real size.
import * as THREE from 'three';

const mats = new Map();
function mat(color, { rough = 0.6, metal = 0, emissive = 0 } = {}) {
  const key = `${color}-${rough}-${metal}-${emissive}`;
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (emissive) { m.emissive = new THREE.Color(color); m.emissiveIntensity = emissive; }
    m.name = `c${color.toString(16)}`;
    mats.set(key, m);
  }
  return mats.get(key);
}
const geos = new Map();
const boxGeo = (w, h, d) => {
  const k = `b${w}|${h}|${d}`;
  if (!geos.has(k)) geos.set(k, new THREE.BoxGeometry(w, h, d));
  return geos.get(k);
};
const cylGeo = (rt, rb, h, seg = 24) => {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  if (!geos.has(k)) geos.set(k, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geos.get(k);
};
function box(parent, w, h, d, color, x, y, z, opt) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(color, opt));
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
}
function cyl(parent, r, h, color, x, y, z, opt, rTop = r, seg = 24) {
  const m = new THREE.Mesh(cylGeo(rTop, r, h, seg), mat(color, opt));
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
}
// a knob: skirt, cap and a white pointer line
function knob(parent, x, z, r, cap = 0x111111, pointer = 0xf2f2f2, angle = -0.6) {
  cyl(parent, r * 1.18, r * 0.25, 0x0b0b0b, x, 0, z, { rough: 0.5 });
  cyl(parent, r * 0.92, r * 1.1, cap, x, r * 0.25, z, { rough: 0.45 }, r * 0.82);
  const p = box(parent, r * 0.16, r * 0.04, r * 0.75, pointer, 0, r * 1.35, 0);
  p.position.set(x + Math.sin(angle) * r * 0.38, r * 1.35 + 0.0002, z - Math.cos(angle) * r * 0.38);
  p.rotation.y = -angle;
}

// a wedge-shaped case (low front, high back) and a panel group lying on its sloped top
function wedge(root, W, D, hFront, hBack, bodyColor, panelColor, opt = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(D, 0); s.lineTo(D, hBack); s.lineTo(0, hFront); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2 });
  g.rotateY(Math.PI / 2);
  g.translate(-W / 2, 0, D / 2);
  const body = new THREE.Mesh(g, mat(bodyColor, { rough: 0.55, metal: opt.metal || 0 }));
  root.add(body);
  const a = Math.atan2(hBack - hFront, D);
  const L = Math.hypot(D, hBack - hFront);
  const panel = new THREE.Group();
  panel.position.set(0, hFront + 0.0035, D / 2);
  panel.rotation.x = a;
  root.add(panel);
  // the face plate (children use x across, -z going back, y up off the plate)
  box(panel, W - 0.006, 0.002, L - 0.004, panelColor, 0, 0, -L / 2, { rough: 0.7, metal: opt.panelMetal || 0 });
  panel.userData.L = L;
  // rubber feet
  for (const fx of [-W / 2 + 0.05, W / 2 - 0.05]) for (const fz of [-D / 2 + 0.04, D / 2 - 0.04]) cyl(root, 0.012, 0.006, 0x0a0a0a, fx, -0.006, fz);
  return panel;
}
const P = (panel, f) => { const g = new THREE.Group(); g.position.y = 0.002; panel.add(g); f(g); return g; };

// ── TR-808: the detailed one ───────────────────────────────────────
export function tr808() {
  const root = new THREE.Group(); root.name = 'TR-808';
  const W = 0.68, D = 0.30;
  const panel = wedge(root, W, D, 0.055, 0.105, 0x1c1c1d, 0x2b2b2d);
  const L = panel.userData.L;
  P(panel, (p) => {
    // lower strip behind the step keys is a lighter grey
    box(p, W - 0.012, 0.0006, 0.088, 0x4a4a4c, 0, 0, -0.05);
    // 16 step keys in four color groups: red, orange, yellow, off-white
    const groups = [0xd8352a, 0xf07a1f, 0xf2c230, 0xece6d6];
    const x0 = -0.19, pitch = 0.0315;
    for (let i = 0; i < 16; i++) {
      const x = x0 + i * pitch + Math.floor(i / 4) * 0.004;
      // each step key and LED gets its own named material so the page can light them in time with the beat
      const key = box(p, 0.026, 0.009, 0.034, groups[Math.floor(i / 4)], x, 0, -0.032, { rough: 0.35 });
      key.material = key.material.clone(); key.material.name = `key-${i}`;
      const led = cyl(p, 0.0034, 0.003, 0x5a0d0a, x, 0, -0.062, { rough: 0.3 }); // step LED
      led.material = led.material.clone(); led.material.name = `led-${i}`;
      // the printed color band above each group
      if (i % 4 === 0) box(p, pitch * 4 - 0.004, 0.0008, 0.006, groups[Math.floor(i / 4)], x + pitch * 1.5, 0, -0.078);
    }
    // start/stop and tap keys on the left of the strip
    box(p, 0.04, 0.009, 0.034, 0xb8b2a6, -0.29, 0, -0.032, { rough: 0.4 });
    box(p, 0.04, 0.009, 0.034, 0xb8b2a6, -0.24, 0, -0.032, { rough: 0.4 });
    // orange rule between the key strip and the voice section
    box(p, W - 0.03, 0.0008, 0.003, 0xf07a1f, 0, 0, -0.098);
    // the voice section: 11 columns, each with a level knob on top and tone/decay knobs under it
    const knobsPerCol = [3, 3, 2, 2, 2, 1, 1, 1, 3, 2, 1];
    const cx0 = -0.185, cpitch = 0.0465;
    for (let c = 0; c < 11; c++) {
      const x = cx0 + c * cpitch;
      knob(p, x, -(L - 0.035), 0.0105, 0x161616, 0xf07a1f, -0.4 + c * 0.07); // level
      for (let k = 1; k < knobsPerCol[c]; k++) knob(p, x, -(L - 0.035 - k * 0.042), 0.0085, 0x121212, 0xf2f2f2, 0.5 - k * 0.6);
      // column divider and the little label plate under each column
      if (c) box(p, 0.0012, 0.0006, 0.15, 0x6b6b6d, x - cpitch / 2, 0, -(L - 0.095));
      box(p, 0.03, 0.0006, 0.006, 0xd9d4c8, x, 0, -0.112);
    }
    // master controls: tempo (big), fine tempo, master volume, mode selector, the instrument selector
    knob(p, -0.285, -(L - 0.05), 0.019, 0x161616, 0xf2f2f2, 0.8);
    knob(p, -0.243, -(L - 0.03), 0.009, 0x161616);
    knob(p, -0.285, -(L - 0.115), 0.016, 0x8a8a8c, 0xffffff, -1.0);
    knob(p, -0.243, -(L - 0.095), 0.011, 0x161616, 0xf07a1f, 0.3);
    knob(p, -0.255, -(L - 0.16), 0.014, 0x8a8a8c, 0xffffff, 1.4);
    box(p, 0.0012, 0.0006, 0.17, 0x6b6b6d, -0.21, 0, -(L - 0.1));
  });
  // a darker back edge so the wedge reads from the side
  box(root, W, 0.004, 0.012, 0x101010, 0, 0.1, -D / 2 + 0.006);
  return root;
}

// ── keyboard synths ──────────────────────────────────────────────
function keyboard(parent, x0, width, nKeys, z0, depth, y) {
  const isBlack = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const whites = [...Array(nKeys).keys()].filter((i) => !isBlack[i % 12]).length;
  const ww = width / whites;
  let wi = 0;
  box(parent, width + 0.006, 0.012, depth + 0.01, 0x0d0d0d, x0 + width / 2, y - 0.012, z0 - depth / 2); // key bed
  for (let i = 0; i < nKeys; i++) {
    if (!isBlack[i % 12]) {
      box(parent, ww * 0.94, 0.016, depth, 0xf4f1ea, x0 + (wi + 0.5) * ww, y, z0 - depth / 2, { rough: 0.3 });
      wi++;
    } else {
      box(parent, ww * 0.56, 0.012, depth * 0.6, 0x111111, x0 + wi * ww, y + 0.016, z0 - depth * 0.7, { rough: 0.3 });
    }
  }
}
function synth({ name, W, D, H, keys, kbW, body, panel: panelColor, cheeks, build }) {
  const root = new THREE.Group(); root.name = name;
  const kbD = 0.15;
  box(root, W, H * 0.6, D, body, 0, 0, 0, { rough: 0.55 });
  // control panel: tilted slab at the back
  const pd = D - kbD - 0.02;
  const panel = new THREE.Group();
  panel.position.set(0, H * 0.6, D / 2 - kbD - 0.02);
  panel.rotation.x = Math.atan2(H * 0.4, pd);
  root.add(panel);
  const L = Math.hypot(pd, H * 0.4);
  // the slab under the panel
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(pd, 0); s.lineTo(pd, H * 0.4); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(-W / 2, H * 0.6, D / 2 - kbD - 0.02);
  root.add(new THREE.Mesh(g, mat(body, { rough: 0.55 })));
  box(panel, W - 0.01, 0.002, L - 0.004, panelColor, 0, 0, -L / 2, { rough: 0.7 });
  const p = new THREE.Group(); p.position.y = 0.002; panel.add(p);
  build(p, L, W);
  keyboard(root, -kbW / 2 + (W - kbW) / 2 - 0.01, kbW, keys, D / 2 - 0.005, kbD - 0.01, H * 0.6 - 0.004);
  if (cheeks) for (const sx of [-1, 1]) box(root, 0.025, H * 1.02, D + 0.004, cheeks, sx * (W / 2 + 0.0125), 0, 0, { rough: 0.8 });
  return root;
}
const sliders = (p, x0, z, n, pitch, cap = 0xd9d9d9, len = 0.045) => {
  for (let i = 0; i < n; i++) {
    const x = x0 + i * pitch;
    box(p, 0.003, 0.001, len, 0x050505, x, 0, z);
    box(p, 0.009, 0.009, 0.006, cap, x, 0, z + (((i * 7) % 5) - 2) * len * 0.15, { rough: 0.4 });
  }
};
const buttons = (p, x0, z, colors, pitch = 0.024, w = 0.018) => colors.forEach((c, i) => box(p, w, 0.006, 0.012, c, x0 + i * pitch, 0, z, { rough: 0.4 }));

export const jupiter8 = () => synth({
  name: 'Jupiter-8', W: 1.06, D: 0.48, H: 0.13, keys: 61, kbW: 0.84, body: 0x1d1d1f, panel: 0x232326, cheeks: 0x0f0f10,
  build(p, L, W) {
    sliders(p, -0.47, -L + 0.06, 28, 0.02, 0xe8e8e8);
    // rows of multicolored selector buttons along the front of the panel
    const row = [0xd8352a, 0xf07a1f, 0xf2c230, 0x7fb2d8, 0xece6d6];
    buttons(p, -0.47, -0.04, Array.from({ length: 36 }, (_, i) => row[Math.floor(i / 4) % row.length]), 0.026);
    buttons(p, -0.47, -0.075, Array.from({ length: 16 }, () => 0xece6d6), 0.026);
    for (let i = 0; i < 6; i++) knob(p, 0.2 + i * 0.045, -L + 0.06, 0.009);
    box(p, 0.09, 0.002, 0.025, 0x8b1b12, 0.38, 0, -0.08, { emissive: 0.6 });
  },
});

export const sh101 = () => synth({
  name: 'SH-101', W: 0.57, D: 0.30, H: 0.075, keys: 32, kbW: 0.47, body: 0x6c7276, panel: 0x7a8085,
  build(p, L) {
    const caps = [0xd8352a, 0xf2c230, 0x7fb2d8, 0xece6d6];
    for (let s = 0; s < 4; s++) sliders(p, -0.25 + s * 0.13, -L / 2, 5, 0.022, caps[s], 0.04);
    buttons(p, -0.25, -0.02, Array.from({ length: 10 }, () => 0x2a2a2a), 0.024, 0.016);
    knob(p, 0.24, -L / 2, 0.012, 0x161616);
  },
});

export const juno106 = () => synth({
  name: 'Juno-106', W: 0.99, D: 0.32, H: 0.09, keys: 61, kbW: 0.84, body: 0x1c1c1e, panel: 0x26262a,
  build(p, L) {
    sliders(p, -0.45, -L / 2 - 0.005, 24, 0.022, 0xdedede, 0.045);
    buttons(p, -0.45, -0.018, Array.from({ length: 16 }, (_, i) => (i < 8 ? 0xece6d6 : 0x7fb2d8)), 0.026);
    buttons(p, 0.13, -0.018, [0xd8352a, 0xf07a1f, 0xf2c230, 0xece6d6], 0.026);
    box(p, 0.06, 0.002, 0.02, 0x8b1b12, 0.3, 0, -L / 2, { emissive: 0.6 });
  },
});

export const d50 = () => synth({
  name: 'D-50', W: 1.0, D: 0.34, H: 0.09, keys: 61, kbW: 0.84, body: 0x1a1a1c, panel: 0x2a2b2e,
  build(p, L) {
    box(p, 0.16, 0.003, 0.04, 0x9fd29a, -0.05, 0, -L / 2, { emissive: 0.35 }); // LCD
    box(p, 0.17, 0.002, 0.05, 0x0a0a0a, -0.05, 0, -L / 2);
    buttons(p, -0.45, -0.025, Array.from({ length: 8 }, () => 0xcfcfcf), 0.028);
    buttons(p, 0.1, -0.025, Array.from({ length: 12 }, (_, i) => (i % 4 === 0 ? 0xd8352a : 0xcfcfcf)), 0.026);
    sliders(p, -0.44, -L + 0.05, 2, 0.03, 0xdedede, 0.04);
    // joystick
    cyl(p, 0.016, 0.006, 0x111111, -0.3, 0, -L / 2);
    cyl(p, 0.003, 0.04, 0x222222, -0.3, 0.006, -L / 2);
    cyl(p, 0.008, 0.01, 0x111111, -0.3, 0.044, -L / 2);
  },
});

export function tb303() {
  const root = new THREE.Group(); root.name = 'TB-303';
  const W = 0.30, D = 0.17;
  const panel = wedge(root, W, D, 0.038, 0.06, 0x8f9396, 0xc4c7ca, { metal: 0.4, panelMetal: 0.3 });
  const L = panel.userData.L;
  P(panel, (p) => {
    // knob row along the back
    for (let i = 0; i < 6; i++) knob(p, -0.1 + i * 0.038, -(L - 0.03), 0.0085, 0x141414);
    knob(p, -0.13, -(L - 0.03), 0.0115, 0x141414); // tempo
    // the two-row step keyboard: 13 note keys and function keys
    for (let i = 0; i < 8; i++) box(p, 0.022, 0.006, 0.02, 0xe9e9e9, -0.08 + i * 0.026, 0, -0.03, { rough: 0.35 });
    [0, 1, 3, 4, 5].forEach((i) => box(p, 0.018, 0.007, 0.016, 0x1a1a1a, -0.067 + i * 0.026, 0, -0.06, { rough: 0.35 }));
    for (let i = 0; i < 4; i++) box(p, 0.02, 0.006, 0.016, 0xd8352a, -0.13 + (i % 2) * 0.025, 0, -0.03 - Math.floor(i / 2) * 0.03, { rough: 0.4 });
    box(p, 0.24, 0.0006, 0.004, 0x3a3a3a, 0, 0, -0.085);
  });
  return root;
}

export function tr909() {
  const root = new THREE.Group(); root.name = 'TR-909';
  const W = 0.60, D = 0.30;
  const panel = wedge(root, W, D, 0.05, 0.095, 0x1a1a1b, 0xb7b9bc, { panelMetal: 0.2 });
  const L = panel.userData.L;
  P(panel, (p) => {
    for (let i = 0; i < 16; i++) {
      const x = -0.2 + i * 0.029 + Math.floor(i / 4) * 0.003;
      box(p, 0.024, 0.008, 0.03, 0xf3f1ec, x, 0, -0.03, { rough: 0.35 });
      cyl(p, 0.002, 0.0025, 0x8b1b12, x, 0, -0.056);
    }
    box(p, 0.035, 0.008, 0.03, 0xf07a1f, -0.255, 0, -0.03, { rough: 0.4 });
    box(p, W - 0.03, 0.0008, 0.004, 0xf07a1f, 0, 0, -0.075);
    for (let c = 0; c < 11; c++) {
      const x = -0.2 + c * 0.044;
      for (let k = 0; k < 3; k++) if (k < (c < 5 ? 3 : 2)) knob(p, x, -(L - 0.03 - k * 0.04), 0.0085, 0x161616);
    }
    knob(p, -0.26, -(L - 0.05), 0.017, 0x161616);
    box(p, 0.06, 0.002, 0.02, 0x8b1b12, -0.26, 0, -(L - 0.11), { emissive: 0.6 });
  });
  return root;
}

export const BUILDERS = { 'tr-808': tr808, 'jupiter-8': jupiter8, 'tb-303': tb303, 'sh-101': sh101, 'tr-909': tr909, 'juno-106': juno106, 'd-50': d50 };
