// Renders the print and preview images from the demo itself (no photos, shapes and text only):
//   print/qr-sign-808-4x6.png     4 × 6 in at 300 dpi, "Scan to play the 808"
//   print/placement-mockup.png    one page (8.5 × 11 in at 200 dpi): where the sign sits beside the 808 under glass
//   og.png                        1200 × 627 link preview: the Heritage Line with the 808 card
// Serve the repo first (node serve.mjs, PORT=8091), then: node a/roland-8dkrxv/tools/make-print.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const LOCAL = process.env.BASE || 'http://localhost:8091/a/roland-8dkrxv/';
const LIVE = 'https://vf1-create.github.io/virtualfudge-ar/a/roland-8dkrxv/';
const SIGN_URL = `${LIVE}?store=nyc&i=tr-808&src=qr-808-room`;
const { chromium } = createRequire(import.meta.url)('playwright');
fs.mkdirSync(path.join(ROOT, 'print'), { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const FONT = `'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif`;
const COLORS = ['#E8402F', '#F07A1F', '#F2C230', '#ECE6D6'];
const keyStrip = (h) => `<div style="display:flex;gap:${h / 4}px">${Array.from({ length: 16 }, (_, i) => `<div style="flex:1;height:${h}px;border-radius:${h / 6}px;background:${COLORS[i >> 2]}"></div>`).join('')}</div>`;

// 1. pieces of the real demo
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(LOCAL);
await page.waitForSelector('.station');
const lineShot = await page.locator('#line').screenshot();
await page.goto(`${LOCAL}?i=tr-808`);
await page.waitForFunction(() => document.querySelector('model-viewer')?.loaded, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => { const mv = document.querySelector('model-viewer'); mv.autoRotate = false; mv.cameraOrbit = '0deg 60deg auto'; mv.jumpCameraToGoal(); });
await page.waitForTimeout(500);
const modelShot = await page.locator('#viewer').screenshot();
const seqShot = await page.locator('#seq').screenshot();

// posters: a still of each 3D model, shown instantly while the 3D loads (and kept if a device can't do 3D)
fs.mkdirSync(path.join(ROOT, 'models/posters'), { recursive: true });
const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/instruments.json'), 'utf8')).instruments.map((i) => i.id);
const pp = await browser.newPage({ viewport: { width: 1100, height: 760 } });
for (const id of ids) {
  await pp.goto(`${LOCAL}?i=${id}`);
  await pp.waitForFunction(() => document.querySelector('model-viewer')?.loaded, null, { timeout: 30000 });
  await pp.addStyleTag({ content: '.viewer{background:none!important;transform:none!important;opacity:1!important}.hot,.ar-btn,.viewer-status{display:none!important}' });
  await pp.evaluate(() => { const mv = document.querySelector('model-viewer'); mv.autoRotate = false; mv.cameraOrbit = '0deg 62deg auto'; mv.jumpCameraToGoal(); });
  await pp.waitForTimeout(600);
  await pp.locator('model-viewer').screenshot({ path: path.join(ROOT, `models/posters/${id}.png`), omitBackground: true });
  console.log('wrote', `models/posters/${id}.png`);
}
await pp.close();

// QR as SVG, from the same MIT-licensed generator the demo uses
const qrPage = await browser.newPage();
await qrPage.addScriptTag({ path: path.join(ROOT, 'vendor/qrcode.js') });
const qrSvg = await qrPage.evaluate((u) => { const q = qrcode(0, 'Q'); q.addData(u); q.make(); return q.createSvgTag({ cellSize: 10, margin: 0, scalable: true }); }, SIGN_URL);

async function render(file, w, h, html, scale = 1) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await p.setContent(`<!doctype html><html><body style="margin:0;font-family:${FONT};-webkit-font-smoothing:antialiased">${html}</body></html>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(ROOT, file) });
  await p.close();
  console.log('wrote', file);
}

// 2. the 4 × 6 in sign (1200 × 1800 px = 300 dpi)
const sign = `<div style="width:1200px;height:1800px;background:#fff;display:flex;flex-direction:column">
  <div style="background:#111;color:#fff;padding:70px 80px 56px;border-bottom:22px solid #E8402F">
    <div style="display:flex;align-items:center;gap:22px;font-size:40px;font-weight:700;letter-spacing:.08em;text-transform:uppercase"><span style="width:40px;height:40px;border-radius:50%;background:#E8402F;box-shadow:0 0 0 6px #fff"></span>Heritage Line · 1980</div>
    <div style="font-size:150px;font-weight:700;line-height:.95;margin-top:34px;letter-spacing:-.02em">Scan to<br>play the 808</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;padding:40px 80px">
    <div style="width:720px;height:720px;padding:36px;border:10px solid #111;border-radius:40px;background:#fff">${qrSvg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ')}</div>
    <div style="font-size:50px;font-weight:700;text-align:center;line-height:1.2">Tap the pads. Then see it in AR.<br><span style="font-weight:400;color:#444">No app needed.</span></div>
  </div>
  <div style="padding:0 80px 60px">${keyStrip(48)}
    <div style="display:flex;justify-content:space-between;margin-top:34px;font-size:30px;color:#444"><span>Roland Store New York City · 414 West 14th Street</span></div>
    <div style="margin-top:10px;font-size:26px;color:#777">Phase two demo by Virtual Fudge for Roland</div>
  </div></div>`;
await render('print/qr-sign-808-4x6.png', 1200, 1800, sign);
const signPng = fs.readFileSync(path.join(ROOT, 'print/qr-sign-808-4x6.png'));

// 3. the placement mockup: front elevation + plan, simple shapes only (8.5 × 11 in at 200 dpi)
const IN = 14; // px per inch in the elevation drawing
const floorY = 1300;
const el = (x, y, w, h, s) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${s}"></div>`;
const label = (x, y, t, s = '') => `<div style="position:absolute;left:${x}px;top:${y}px;font-size:26px;color:#222;${s}">${t}</div>`;
const plinthW = 40 * IN, plinthH = 36 * IN, plinthX = 260;
const caseH = 16 * IN, caseW = 34 * IN, caseX = plinthX + 3 * IN;
const unitW = 27 * IN, unitH = 4.5 * IN, unitX = plinthX + 6.5 * IN;
const signX = plinthX + plinthW + 9 * IN, signW = 4 * IN, signH = 6 * IN, signY = floorY - 54 * IN;
const elevation = `<div style="position:relative;width:1560px;height:1380px;background:#f6f6f4;border:2px solid #ddd;border-radius:16px;overflow:hidden">
  ${el(0, floorY, 1560, 80, 'background:#d9d6cf')}
  ${el(0, 0, 1560, 140, 'background:#111')}
  ${el(0, 140, 1560, 12, 'background:#E8402F')}
  ${label(40, 40, 'Wall graphic: the Heritage Line', 'color:#fff;font-weight:700;font-size:34px')}
  ${label(40, 86, 'a colored line runs along the wall; each instrument is a station', 'color:#bbb')}
  ${el(caseX - 20, floorY - plinthH - caseH - 92, caseW + 40, 10, 'background:#E8402F;border-radius:5px')}
  <div style="position:absolute;left:${plinthX + plinthW / 2 - 44}px;top:${floorY - plinthH - caseH - 131}px;width:76px;height:76px;border-radius:50%;background:#E8402F;border:6px solid #fff;box-shadow:0 0 0 4px #111;display:grid;place-items:center;color:#fff;font-weight:700;font-size:26px">808</div>
  ${label(plinthX + plinthW / 2 - 200, floorY - plinthH - caseH - 180, '1980 station on the wall line', 'font-weight:700;color:#E8402F')}
  ${el(plinthX, floorY - plinthH, plinthW, plinthH, 'background:#2b2b2d')}
  ${el(caseX, floorY - plinthH - caseH, caseW, caseH, 'background:rgba(170,205,230,.35);border:4px solid #8fb3cc;border-bottom:none')}
  ${el(unitX, floorY - plinthH - unitH, unitW, unitH, 'background:#1c1c1d;border-radius:6px')}
  <div style="position:absolute;left:${unitX + 2.2 * IN}px;top:${floorY - plinthH - unitH + 30}px;width:${unitW - 3 * IN}px">${keyStrip(16)}</div>
  ${label(caseX + 18, floorY - plinthH - caseH + 18, 'Vintage TR-808 under glass (existing)', 'font-weight:700')}
  ${el(signX + signW / 2 - 3, signY + signH, 6, floorY - signY - signH, 'background:#555')}
  ${el(signX + signW / 2 - 50, floorY - 10, 100, 10, 'background:#555')}
  <img src="${b64(signPng)}" style="position:absolute;left:${signX}px;top:${signY}px;width:${signW}px;height:${signH}px;box-shadow:0 6px 18px rgba(0,0,0,.25)">
  ${label(signX - 20, signY - 84, '4 × 6 in QR sign<br>on a slim post', 'font-weight:700')}
  ${el(signX + signW + 40, signY, 3, floorY - signY, 'background:#E8402F')}
  ${label(signX + signW + 56, signY + (floorY - signY) / 2 - 40, 'QR center<br>≈ 54 in<br>from floor', 'color:#E8402F;font-weight:700')}
  ${el(plinthX + plinthW, floorY + 30, signX - plinthX - plinthW, 3, 'background:#E8402F')}
  ${label(plinthX + plinthW + 10, floorY + 40, '≈ 9 in from the case', 'color:#E8402F;font-weight:700')}
  ${el(plinthX - 70, floorY - plinthH, 3, plinthH, 'background:#999')}
  ${label(plinthX - 250, floorY - plinthH / 2 - 15, 'plinth ≈ 36 in', 'color:#666')}
</div>`;
const mock = `<div style="width:1700px;height:2200px;background:#fff;padding:70px;box-sizing:border-box">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:6px solid #111;padding-bottom:22px">
    <div><div style="font-size:30px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#E8402F">Placement mockup · not to scale</div>
    <div style="font-size:72px;font-weight:700;letter-spacing:-.02em;margin-top:8px">The 808 room, 414 W 14th St</div></div>
    <div style="font-size:26px;color:#666;text-align:right">Roland Heritage Map<br>Phase two demo</div>
  </div>
  <div style="margin-top:40px">${elevation}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:44px;font-size:28px;line-height:1.45">
    <div><div style="font-weight:700;font-size:32px;margin-bottom:10px">How it works on the floor</div>
      <ol style="margin:0;padding-left:34px">
        <li>A visitor reads the case, then scans the sign beside it.</li>
        <li>The 808 card opens on their phone: pads to play, then “See it in AR” puts a full-size 808 on the floor next to the real one.</li>
        <li>“Made with it” lists songs as text, with links to their own Spotify, Apple Music or YouTube.</li>
      </ol></div>
    <div><div style="font-weight:700;font-size:32px;margin-bottom:10px">Placement notes</div>
      <ul style="margin:0;padding-left:34px">
        <li>Sign beside the case, never on the glass: no glare on the QR.</li>
        <li>QR center around 54 in high, readable from 3 to 6 ft.</li>
        <li>Leave about 6 ft of open floor in front, so the AR 808 has room.</li>
        <li>Same sign file and link work in London and Tokyo by changing <b>?store=</b>.</li>
      </ul></div>
  </div>
  <div style="position:absolute;left:70px;bottom:60px;font-size:24px;color:#777">Phase two demo by Virtual Fudge for Roland · shapes and text only, no photography</div>
</div>`;
await render('print/placement-mockup.png', 1700, 2200, `<div style="position:relative">${mock}</div>`);

// 4. the link preview (1200 × 627)
const og = `<div style="width:1200px;height:627px;background:#fff;position:relative;overflow:hidden">
  <div style="background:#111;color:#fff;padding:34px 48px 26px;border-bottom:10px solid #E8402F">
    <div style="font-size:20px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#E8402F">Phase two demo</div>
    <div style="font-size:54px;font-weight:700;letter-spacing:-.02em;margin-top:6px">Roland Heritage Map</div>
  </div>
  <img src="${b64(lineShot)}" style="position:absolute;left:20px;top:215px;width:676px">
  <div style="position:absolute;right:36px;top:150px;width:440px;background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden">
    <div style="background:#111;color:#fff;display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:5px solid #E8402F">
      <span style="display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#E8402F;border:3px solid #fff;font-weight:700;font-size:13px">808</span>
      <span style="font-size:24px;font-weight:700;flex:1">TR-808</span><span style="font-size:24px;font-weight:700">1980</span></div>
    <img src="${b64(modelShot)}" style="display:block;width:100%;height:230px;object-fit:cover">
    <img src="${b64(seqShot)}" style="display:block;width:100%;height:190px;object-fit:cover;object-position:top">
  </div>
  <div style="position:absolute;left:48px;bottom:30px;font-size:22px;color:#444">Tap a year. The instrument lifts off the wall in AR. Play the 808.</div>
</div>`;
await render('og.png', 1200, 627, og);
await browser.close();
