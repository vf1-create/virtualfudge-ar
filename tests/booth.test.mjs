// Booth mode (?booth): a shared tablet at an event. No Share/Download on the tablet, a QR code to each
// guest's own phone instead, and the result clears itself for the next guest.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { launch, page, ready, screen, waitScreen, BASE, PHONE } from './lib.mjs';

const req = createRequire(import.meta.url);
const JSQR = fs.readFileSync(req.resolve('jsqr/dist/jsQR.js'), 'utf8');
const AXE = fs.readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
const TABLET = { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true };
const TABLET_LAND = { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true };

const withConfig = (p, config) => p.route('**/js/config.js', async (r) => {
  const res = await r.fetch(); let body = await res.text();
  for (const [k, v] of Object.entries(config)) body = body.replace(new RegExp(`(\\n\\s*${k}:\\s*)('[^']*'|[^,\\n]+)`), `$1${v}`);
  r.fulfill({ response: res, body, contentType: 'text/javascript' });
});
const shown = (p) => p.evaluate(() => {
  const v = (s) => { const el = document.querySelector(s); return !!el && !!el.offsetParent; };
  return { share: v('#shareBtn'), save: v('#saveBtn'), copy: v('#copyBtn'), tag: v('#tagLine'), cta: v('#cta'), panel: v('#boothPanel'), next: document.querySelector('#retakeBtn').textContent.trim() };
});
const snap = (p) => p.evaluate(() => {
  const q = document.querySelector('#boothQR').getBoundingClientRect(), n = document.querySelector('#retakeBtn').getBoundingClientRect();
  const ph = document.querySelector('#resultMedia img, #resultMedia video').getBoundingClientRect();
  return { qr: Math.round(q.width), qrOn: q.top >= 0 && q.left >= 0 && q.bottom <= innerHeight && q.right <= innerWidth, nextOn: n.bottom <= innerHeight && n.right <= innerWidth, photoW: Math.round(ph.width) };
});
const photo = async (p) => { await p.click('#shutter'); await waitScreen(p, 'result'); await p.waitForTimeout(500); };

export default async function (check) {
  const b = await launch();
  try {
    // Tablet in portrait: the full booth flow
    {
      const p = await page(b, TABLET);
      await withConfig(p, { boothResetSeconds: 8 });
      await p.goto(`${BASE}?booth&src=debug`); await p.click('#startBtn', { force: true }); await ready(p);
      await photo(p);
      const ui = await shown(p);
      check('booth: no Share, Download, Copy or outside link on the shared tablet', !ui.share && !ui.save && !ui.copy && !ui.cta && !ui.tag, JSON.stringify(ui));
      check('booth: the result offers the QR panel and a Next guest button', ui.panel && ui.next === 'Next guest', JSON.stringify(ui));
      check('booth: the countdown back to the camera is shown', /Back to the camera in \d+ s/.test(await p.textContent('#boothReset')), await p.textContent('#boothReset'));
      await p.addScriptTag({ content: JSQR });
      const qr = await p.evaluate(() => {
        const c = document.querySelector('#boothQR'), w = 400, t = Object.assign(document.createElement('canvas'), { width: w, height: w }), g = t.getContext('2d');
        g.drawImage(c, 0, 0, w, w); return jsQR(g.getImageData(0, 0, w, w).data, w, w)?.data ?? null;
      });
      check('booth: the QR opens the camera on the guest\'s own phone, tagged booth-qr', qr === `${BASE}?src=booth-qr`, qr);
      const lay = await snap(p);
      check('booth tablet (portrait): QR big enough to scan, everything on screen, photo leads', lay.qr >= 140 && lay.qrOn && lay.nextOn && lay.photoW >= 300, JSON.stringify(lay));
      await p.addScriptTag({ content: AXE });
      const v = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], resultTypes: ['violations'] }).then((r) => r.violations.map((x) => `${x.id} (${x.nodes.length})`)));
      check('booth result: no WCAG violations', !v.length, v.join(', '));
      // a touch restarts the countdown; with nobody touching it, the screen clears for the next guest
      await p.locator('#boothPanel').click(); await p.waitForTimeout(3000);
      check('booth: a touch keeps the result up', (await screen(p)) === 'result', await screen(p));
      await waitScreen(p, 'ar', 15000);
      const after = await p.evaluate(() => ({ screen: document.querySelector('.screen.active').id, media: document.querySelectorAll('#resultMedia img, #resultMedia video').length, blob: !!window.__ar.blob }));
      check('booth: an idle result returns to the camera and the last guest\'s photo is gone', after.screen === 'ar' && after.media === 0 && !after.blob, JSON.stringify(after));
      // a touch in the countdown's last second still restarts it
      await photo(p);
      await p.evaluate(() => { const real = Date.now.bind(Date); // jump the clock to 1.3 s before the reset
        window.__skew = window.__ar.boothDeadline - real() - 1300; Date.now = () => real() + window.__skew; });
      await p.locator('#boothPanel').click(); await p.waitForTimeout(1500);
      check('booth: a touch in the last second still restarts the countdown', (await screen(p)) === 'result', await screen(p));
      // a tablet locked mid-countdown (iOS pauses timers) resets as soon as it wakes, so the next guest never sees it
      await p.evaluate(() => { window.__skew += 600000; document.dispatchEvent(new Event('visibilitychange')); });
      await waitScreen(p, 'ar', 2000);
      check('booth: a tablet woken after the countdown shows the camera, not the last guest\'s photo', (await screen(p)) === 'ar' && !(await p.evaluate(() => document.querySelectorAll('#resultMedia img, #resultMedia video').length)), await screen(p));
      await p.evaluate(() => { window.__skew = 0; });
      await photo(p); // the next guest's turn works the same way
      check('booth: the next guest gets a fresh result', (await screen(p)) === 'result' && (await shown(p)).panel);
      const mf = await p.evaluate(async () => { const href = document.querySelector('link[rel="manifest"]').href; return { href, start: (await (await fetch(href)).json()).start_url }; });
      check('booth: Add to Home Screen reopens in booth mode', mf.href.endsWith('/manifest-booth.webmanifest') && /[?&]booth\b/.test(mf.start), JSON.stringify(mf));
      check('booth: no page errors', !p.errs.length, p.errs.join(' | '));
      await p.context().close();
    }
    // Tablet in landscape
    {
      const p = await page(b, TABLET_LAND);
      await p.goto(`${BASE}?booth&src=debug`); await p.click('#startBtn', { force: true }); await ready(p);
      await photo(p);
      const lay = await snap(p);
      check('booth tablet (landscape): QR big enough to scan, everything on screen', lay.qr >= 140 && lay.qrOn && lay.nextOn, JSON.stringify(lay));
      await p.context().close();
    }
    // Without ?booth nothing changes
    {
      const p = await page(b, PHONE);
      await p.goto(`${BASE}?src=debug`); await p.click('#startBtn', { force: true }); await ready(p);
      await photo(p);
      const ui = await shown(p);
      check('normal mode is untouched: no booth panel, the usual buttons', !ui.panel && ui.next === 'Retake' && (ui.share || ui.save) && ui.tag, JSON.stringify(ui));
      check('normal mode keeps the normal home-screen app', (await p.evaluate(() => document.querySelector('link[rel="manifest"]').href)).endsWith('/manifest.webmanifest'));
      await p.context().close();
    }
  } finally { await b.close(); }
}
