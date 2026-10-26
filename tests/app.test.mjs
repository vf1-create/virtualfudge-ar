// The AR camera: capture, keyboard, focus, start-up edge cases, self-timer, result screen, effects.
import fs from 'node:fs';
import path from 'node:path';
import { launch, page, open, ready, screen, waitScreen, BASE, OUT, PHONE, LAPTOP } from './lib.mjs';

// override fields in js/config.js for one page, e.g. { maxVideoSeconds: 2 }
const withConfig = (p, config) => p.route('**/js/config.js', async (r) => {
  const res = await r.fetch(); let body = await res.text();
  for (const [k, v] of Object.entries(config)) body = body.replace(new RegExp(`(\\n\\s*${k}:\\s*)[^,\\n]+`), `$1${v}`);
  r.fulfill({ response: res, body, contentType: 'text/javascript' });
});
const holdShutter = async (p, ms) => {
  const box = await p.locator('#shutter').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up();
};
const result = (p) => p.evaluate(() => ({ screen: document.querySelector('.screen.active').id, kind: window.__ar.kind, type: window.__ar.blob?.type, size: window.__ar.blob?.size || 0, focus: document.activeElement?.id }));

export default async function (check) {
  const b = await launch();
  try {
    // Phone: every filter draws, photo, video
    {
      const p = await page(b, PHONE);
      await open(p); await p.click('#startBtn', { force: true }); await ready(p);
      const n = await p.locator('#filters button').count();
      for (let i = 0; i < n; i++) { await p.locator('#filters button').nth(i).click(); await p.waitForTimeout(700); }
      await p.locator('#stage').screenshot({ path: path.join(OUT, 'filter-last.png') });
      check(`phone: all ${n} filters run without errors`, n >= 4 && !p.errs.length, p.errs.join(' | '));
      await p.click('#shutter'); await waitScreen(p, 'result');
      let r = await result(p);
      check('phone: tap takes a photo', r.screen === 'result' && r.kind === 'photo' && r.size > 50000, JSON.stringify(r));
      await p.click('#retakeBtn'); await waitScreen(p, 'ar');
      // headless Chromium's H.264 encoder sometimes returns an empty clip; the app then says so and
      // moves on to the next format (mp4/avc1 → mp4 → webm), so allow one hold per format
      // (the test browser renders in software, so give the encoder a longer clip than a phone would need)
      for (let k = 0; k < 3; k++) {
        await holdShutter(p, 4000); await waitScreen(p, 'result', 10000);
        r = await result(p); if (r.kind === 'video') break;
      }
      check('phone: hold records a video', r.kind === 'video' && r.size > 10000, JSON.stringify({ ...r, toast: await p.textContent('#toast'), tried: await p.evaluate(() => window.__ar.badTypes) }));
      if (r.kind === 'video') {
        const bytes = await p.evaluate(async () => [...new Uint8Array(await window.__ar.blob.arrayBuffer())]);
        fs.writeFileSync(path.join(OUT, `clip.${r.type.includes('mp4') ? 'mp4' : 'webm'}`), Buffer.from(bytes));
      }
      await p.context().close();
    }
    // Holding past the video cap keeps the video
    {
      const p = await page(b, PHONE); await withConfig(p, { maxVideoSeconds: 2 });
      await open(p); await p.click('#startBtn', { force: true }); await ready(p);
      await holdShutter(p, 6000); await p.waitForTimeout(1500);
      const r = await result(p);
      check('holding past the video cap keeps the video', r.screen === 'result' && r.kind === 'video', JSON.stringify(r));
      await p.context().close();
    }
    // Laptop: keyboard and focus
    {
      const p = await page(b, LAPTOP);
      await open(p); await p.click('#startBtn', { force: true }); await ready(p);
      check('focus moves to the shutter when the camera opens', (await p.evaluate(() => document.activeElement?.id)) === 'shutter');
      await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab');
      await p.keyboard.press('Enter'); await waitScreen(p, 'result'); await p.waitForTimeout(200);
      const r = await result(p), heading = await p.textContent('#resultHeading');
      check('Enter on the focused shutter takes a photo', r.screen === 'result' && r.kind === 'photo', JSON.stringify(r));
      check('result screen takes focus and names itself', r.focus === 'resultHeading' && /photo is ready/i.test(heading), `${r.focus} / ${heading}`);
      const first = await p.evaluate(() => [...document.querySelectorAll('.result-actions .btn')].find((x) => !x.hidden)?.id);
      check('desktop: Download comes first', first === 'saveBtn', first);
      await p.click('#copyBtn'); await p.waitForTimeout(200);
      const copied = await p.evaluate(() => navigator.clipboard.readText());
      check('desktop: Copy caption copies the handle, hashtag and link', /@Virtual_Fudge/.test(copied) && /#VirtualFudge/.test(copied) && copied.includes(BASE), copied);
      await p.keyboard.press('Escape'); await waitScreen(p, 'ar'); await p.waitForTimeout(400);

      await p.click('#filters button:nth-child(3)'); await p.waitForTimeout(300);
      const before = await p.evaluate(() => window.__ar.filter);
      await p.keyboard.press('Space'); await waitScreen(p, 'result');
      const r3 = await p.evaluate(() => ({ screen: document.querySelector('.screen.active').id, filter: window.__ar.filter }));
      check('Space after clicking a filter takes a photo', r3.screen === 'result' && r3.filter === before, JSON.stringify({ before, ...r3 }));
      await p.keyboard.press('Escape'); await waitScreen(p, 'ar'); await p.waitForTimeout(400);

      await p.evaluate(() => document.querySelector('#filters [aria-checked="true"]').focus());
      await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200);
      const r4 = await p.evaluate(() => { const bs = [...document.querySelectorAll('#filters button')];
        return { checked: bs.findIndex((x) => x.getAttribute('aria-checked') === 'true'), focused: bs.indexOf(document.activeElement), tabStops: bs.filter((x) => x.tabIndex === 0).length, role: document.querySelector('#filters').getAttribute('role') }; });
      check('filters: arrows move selection and focus together, one tab stop', r4.checked === r4.focused && r4.tabStops === 1 && r4.role === 'radiogroup', JSON.stringify(r4));

      await p.evaluate(() => document.activeElement.blur());
      await p.keyboard.press('v'); await p.waitForTimeout(3000); await p.keyboard.press('v'); await waitScreen(p, 'result', 15000);
      check('V starts and stops a video', (await result(p)).kind === 'video', JSON.stringify(await result(p)));
      check('laptop flow: no page errors', !p.errs.length, p.errs.join(' | '));
      await p.context().close();
    }
    // Start-up edge cases: Enter while warming up, Esc while warming up
    {
      const p = await page(b, LAPTOP);
      await p.addInitScript(() => { const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (c) => new Promise((r) => setTimeout(r, 3000)).then(() => orig(c)); });
      await open(p); await p.click('#startBtn', { force: true }); await p.waitForTimeout(500);
      await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      check('Enter while "Warming up" takes no black photo', (await screen(p)) === 'ar' && !(await p.evaluate(() => !!window.__ar.blob)));
      await p.keyboard.press('Escape'); await p.waitForTimeout(4000);
      const r = await p.evaluate(() => ({ screen: document.querySelector('.screen.active').id, running: window.__ar.running, stream: !!window.__ar.stream }));
      check('Esc while warming up leaves the camera off', r.screen === 'intro' && !r.running && !r.stream, JSON.stringify(r));
      await p.context().close();
    }
    // Quality: a hidden-tab gap doesn't drop to 720p
    {
      const p = await page(b, PHONE);
      await open(p); await p.click('#startBtn', { force: true }); await ready(p); await p.waitForTimeout(2000);
      await p.evaluate(() => { window.__ar.lastFrame -= 5000; }); // what a 5 s background gap looks like to the render loop
      await p.waitForTimeout(6000);
      const w = await p.evaluate(() => document.querySelector('#stage').width);
      check('a 5 s pause keeps 1080p output', w === 1080, `canvas width ${w}`);
      await p.context().close();
    }
    // Self-timer: digits, cancel, reduced motion
    {
      const p = await page(b, { ...PHONE, reducedMotion: 'reduce' });
      await open(p); await p.click('#startBtn', { force: true }); await ready(p);
      await p.click('#timerBtn');
      check('self-timer shows its 3 s badge', (await p.textContent('#timerBtn .badge')) === '3');
      await p.click('#shutter'); await p.waitForTimeout(300);
      const c = await p.evaluate(() => ({ text: document.querySelector('#countNum').textContent, opacity: getComputedStyle(document.querySelector('#countNum')).opacity }));
      check('reduced motion: countdown digits stay visible', c.text === '3' && c.opacity === '1', JSON.stringify(c));
      await p.click('#shutter'); await p.waitForTimeout(4000);
      check('tapping during the countdown cancels it', (await screen(p)) === 'ar', await screen(p));
      await p.click('#shutter'); await waitScreen(p, 'result', 6000);
      check('self-timer takes the photo when it ends', (await result(p)).kind === 'photo');
      await p.context().close();
    }
    // Effects: the Fudge Shades lens clip has no hole where a lens meets the bridge
    {
      const p = await page(b, PHONE); await open(p);
      const px = await p.evaluate(async () => {
        const src = await (await fetch('js/effects.js')).text();
        const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d');
        g.setTransform(400, 0, 0, 400, 200, 200); g.fillStyle = '#000';
        new Function('ctx', 'e', src.match(/function lensPath[\s\S]*?\n}\n/)[0] + 'ctx.beginPath(); lensPath(ctx, -e, -1); lensPath(ctx, e, 1); ctx.rect(-e + 0.12, -0.155, 2 * (e - 0.12), 0.055); ctx.fill();')(g, 0.226);
        const a = (x, y) => g.getImageData(200 + x * 400, 200 + y * 400, 1, 1).data[3];
        return [a(-0.11, -0.13), a(0.11, -0.13), a(0, -0.13)];
      });
      check('Fudge Shades: lenses and bridge are solid', px.every((v) => v === 255), px.join(','));
      await p.context().close();
    }
    // Desktop intro: the "open on your phone" QR survives a huge query string
    {
      const p = await page(b, LAPTOP);
      await p.goto(`${BASE}?utm=${'x'.repeat(4000)}`); await p.waitForTimeout(1500);
      check('desktop QR shows even with a 4 KB query string', !(await p.evaluate(() => document.querySelector('#desktopQR').hidden)) && !p.errs.length, p.errs.join(' | '));
      await p.context().close();
    }
    // Camera blocked: back on the intro with a way forward
    {
      const p = await page(b, PHONE);
      await p.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); });
      await open(p); await p.click('#startBtn', { force: true }); await p.waitForTimeout(1500);
      const r = await p.evaluate(() => ({ screen: document.querySelector('.screen.active').id, msg: document.querySelector('#camError').hidden ? '' : document.querySelector('#camError').textContent }));
      check('camera blocked: back on the intro with instructions', r.screen === 'intro' && r.msg.length > 20, JSON.stringify(r));
      await p.context().close();
    }
  } finally { await b.close(); }
}
