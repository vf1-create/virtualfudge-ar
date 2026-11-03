// Exports every instrument in tools/models.js to models/<id>.glb (web + Android) and
// models/<id>.usdz (iPhone Quick Look). Runs three.js inside headless Chromium.
//   npm i --prefix /some/scratch three@0.183.0      (build-time only; nothing is shipped from it)
//   THREE_DIR=/some/scratch/node_modules/three node tools/build-models.mjs [--preview]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const THREE_DIR = process.env.THREE_DIR;
if (!THREE_DIR || !fs.existsSync(path.join(THREE_DIR, 'build/three.module.js'))) {
  console.error('Set THREE_DIR to a node_modules/three folder (three@0.183.0).');
  process.exit(1);
}
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = path.join(ROOT, 'models');
fs.mkdirSync(OUT, { recursive: true });
const preview = process.argv.includes('--preview');

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.route('https://build.local/**', (route) => {
  const u = new URL(route.request().url()).pathname;
  const file = u.startsWith('/three/') ? path.join(THREE_DIR, u.slice(7)) : path.join(HERE, u.slice(1));
  route.fulfill({ path: file, contentType: 'text/javascript' });
});
await page.route('https://build.local/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0">
<script type="importmap">{"imports":{"three":"https://build.local/three/build/three.module.js","three/addons/":"https://build.local/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { BUILDERS } from 'https://build.local/models.js';
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
window.build = async (id) => {
  const obj = BUILDERS[id]();
  const scene = new THREE.Scene(); scene.add(obj);
  scene.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const usdz = await new USDZExporter().parseAsync(scene);
  return { glb: b64(glb), usdz: b64(usdz) };
};
window.preview = (id) => {
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(900, 600); document.body.innerHTML = ''; document.body.appendChild(r.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeeeeee);
  const obj = BUILDERS[id](); scene.add(obj);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(1, 2, 1.5); scene.add(d);
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(35, 1.5, 0.01, 10); cam.position.set(0, size * 0.75, size * 0.95); cam.lookAt(box.getCenter(new THREE.Vector3()));
  r.render(scene, cam);
};
window.ready = true;
</script>` }));
await page.goto('https://build.local/');
await page.waitForFunction(() => window.ready);
const { BUILDERS_IDS } = { BUILDERS_IDS: ['tr-808', 'jupiter-8', 'tb-303', 'sh-101', 'tr-909', 'juno-106', 'd-50'] };
for (const id of BUILDERS_IDS) {
  const { glb, usdz } = await page.evaluate((id) => window.build(id), id);
  fs.writeFileSync(path.join(OUT, `${id}.glb`), Buffer.from(glb, 'base64'));
  fs.writeFileSync(path.join(OUT, `${id}.usdz`), Buffer.from(usdz, 'base64'));
  console.log(`${id}: glb ${(Buffer.from(glb, 'base64').length / 1024).toFixed(0)} KB, usdz ${(Buffer.from(usdz, 'base64').length / 1024).toFixed(0)} KB`);
  if (preview) {
    await page.evaluate((id) => window.preview(id), id);
    const dir = process.env.PREVIEW_DIR || path.join(ROOT, 'tests', 'out');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `model-${id}.png`) });
  }
}
await browser.close();
