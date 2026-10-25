// Layout on nine screen shapes: nothing overflows, controls never cover the face area's caption text, everything fits.
import path from 'node:path';
import { launch, page, open, OUT } from './lib.mjs';

const DEVICES = [
  ['iphone-se', 375, 667, true], ['iphone-15', 393, 852, true], ['pixel-7', 412, 915, true], ['android-small', 360, 780, true],
  ['ipad', 820, 1180, true], ['ipad-land', 1180, 820, true], ['phone-land', 844, 390, true],
  ['laptop', 1280, 800, false], ['desktop', 1920, 1080, false],
];

export default async function (check) {
  const b = await launch();
  try {
    for (const [name, w, h, touch] of DEVICES) {
      const p = await page(b, { viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 1000 });
      p.on('console', (m) => m.type() === 'error' && !/^INFO: Created TensorFlow Lite/.test(m.text()) && p.errs.push(m.text())); // MediaPipe logs its start-up as an error
      await open(p); await p.waitForTimeout(1000);
      const intro = await p.evaluate(() => ({ hScroll: document.documentElement.scrollWidth > innerWidth }));
      await p.screenshot({ path: path.join(OUT, `${name}-1-intro.png`) });
      await p.click('#startBtn', { force: true });
      const face = await p.waitForFunction(() => window.__ar?.landmarker && window.__ar.faces.length > 0, null, { timeout: 60000 }).then(() => true, () => false);
      await p.waitForTimeout(1000);
      const l = await p.evaluate(() => {
        const c = document.querySelector('#stage').getBoundingClientRect(), f = document.querySelector('#filters').getBoundingClientRect(), s = document.querySelector('#shutter').getBoundingClientRect();
        const bandTop = c.top + c.height * 0.74, textBottom = c.top + c.height * (0.74 + 240 / 1920); // the caption strip's text block
        const overX = (r) => r.right > c.left && r.left < c.right;
        const inView = (r) => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        return {
          chipsClear: !(overX(f) && f.bottom > bandTop + 1),
          shutterClear: !(overX(s) && s.top < textBottom && s.bottom > bandTop),
          chipsFit: [...document.querySelectorAll('#filters button')].every((x) => inView(x.getBoundingClientRect())),
          shutterFits: inView(s),
        };
      });
      await p.screenshot({ path: path.join(OUT, `${name}-2-ar.png`) });
      await p.click('#shutter'); await p.waitForSelector('#result.active', { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(600);
      await p.screenshot({ path: path.join(OUT, `${name}-3-result.png`) });
      const resultFits = await p.evaluate(() => [...document.querySelectorAll('.result-actions .btn')].filter((x) => !x.hidden)
        .every((x) => { const r = x.getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth; }));
      const bad = Object.entries({ noSideScroll: !intro.hScroll, faceFound: face, ...l, resultFits, noErrors: !p.errs.length }).filter(([, v]) => !v).map(([k]) => k);
      check(`${name} ${w}×${h}: layout`, !bad.length, bad.join(', ') + (p.errs.length ? ' | ' + p.errs.join(' | ') : ''));
      await p.context().close();
    }
  } finally { await b.close(); }
}
