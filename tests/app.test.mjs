// The AR camera: capture, keyboard, focus, start-up edge cases, self-timer, result screen, effects.
import fs from 'node:fs';
import path from 'node:path';
import { launch, page, open, ready, screen, waitScreen, BASE, OUT, PHONE, LAPTOP } from './lib.mjs';

// override fields in js/config.js for one page, e.g. { maxVideoSeconds: 2 }
const withConfig = (p, config) => p.route('**/js/config.js', async (r) => {
  const res = await r.fetch(); let body = await res.text();
  for (const [k, v] of Object.entries(config)) body = body.replace(new RegExp(`(\\n\\s*${k}:\\s*)('[^']*'|[^,\\n]+)`), `$1${v}`);
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
      for (const hold of [4000, 6000, 8000]) { // longer each retry: the software encoder on a busy test machine can need it
        await holdShutter(p, hold); await waitScreen(p, 'result', 12000);
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
      let r;
      for (let k = 0; k < 3; k++) { // retries only re-test the empty-clip fallback; a real cap bug fails every time
        await holdShutter(p, 6000); await p.waitForTimeout(1500);
        r = await result(p); if (r.kind === 'video') break;
      }
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
      // wait for the chip's background fade to finish (up to 5 s on a slow test machine) instead of guessing a delay
      await p.waitForFunction(() => { const bs = [...document.querySelectorAll('#filters button')];
        const on = bs.find((x) => x.getAttribute('aria-checked') === 'true'), off = bs.find((x) => x.getAttribute('aria-checked') !== 'true');
        return on && off && getComputedStyle(on).backgroundColor !== getComputedStyle(off).backgroundColor; }, null, { timeout: 5000, polling: 100 }).catch(() => {});
      const hl = await p.evaluate(() => { const bs = [...document.querySelectorAll('#filters button')];
        return { on: getComputedStyle(bs.find((x) => x.getAttribute('aria-checked') === 'true')).backgroundColor, off: getComputedStyle(bs.find((x) => x.getAttribute('aria-checked') !== 'true')).backgroundColor }; });
      check('the active filter chip is visibly highlighted', hl.on !== hl.off, JSON.stringify(hl));
      // V during a recording stops it instead of photographing over it; Space does too
      await p.keyboard.press('v'); await p.waitForTimeout(2500); await p.keyboard.press('Space'); await waitScreen(p, 'result', 12000); await p.waitForTimeout(400);
      // the fix: a capture key during a recording must never produce a photo (it stops the recording instead)
      check('Space during a V recording never takes a photo over it', (await result(p)).kind !== 'photo', JSON.stringify(await result(p)));
      await ((await screen(p)) === 'result' ? p.keyboard.press('Escape') : Promise.resolve()); await waitScreen(p, 'ar'); await p.waitForTimeout(400);

      await p.evaluate(() => document.activeElement.blur());
      for (const hold of [3000, 6000, 8000]) {
        await p.keyboard.press('v'); await p.waitForTimeout(hold); await p.keyboard.press('v'); await waitScreen(p, 'result', 15000);
        if ((await result(p)).kind === 'video') break;
        await p.waitForTimeout(500); // empty clip on a busy machine: the app toasts and stays live, so try again
      }
      check('V starts and stops a video', (await result(p)).kind === 'video', JSON.stringify(await result(p)));
      check('laptop flow: no page errors', !p.errs.length, p.errs.join(' | '));
      await p.context().close();
    }
    // Start-up edge cases: Enter while warming up, Esc while warming up
    {
      const p = await page(b, LAPTOP);
      await p.addInitScript(() => { const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (c) => new Promise((r) => setTimeout(r, 6000)).then(() => orig(c)); });
      await open(p); await p.click('#startBtn', { force: true }); await p.waitForTimeout(500);
      await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      check('Enter while "Warming up" takes no black photo', (await screen(p)) === 'ar' && !(await p.evaluate(() => !!window.__ar.blob)));
      await p.keyboard.press('Escape'); await p.waitForTimeout(7000);
      const r = await p.evaluate(() => ({ screen: document.querySelector('.screen.active').id, running: window.__ar.running, stream: !!window.__ar.stream }));
      check('Esc while warming up leaves the camera off', r.screen === 'intro' && !r.running && !r.stream, JSON.stringify(r));
      await p.context().close();
    }
    // Closing the camera while a photo is still encoding must not pop the result screen up afterwards
    {
      const p = await page(b, LAPTOP);
      await p.addInitScript(() => { // a slow phone: the JPEG takes a while to encode
        const tb = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (cb, ...a) { return tb.call(this, (blob) => setTimeout(() => cb(blob), 1500), ...a); };
      });
      await open(p); await p.click('#startBtn', { force: true }); await ready(p);
      await p.click('#shutter'); await p.waitForTimeout(150);
      await p.click('#closeBtn'); await p.waitForTimeout(2500);
      check('closing the camera mid-save drops the photo instead of popping up the result', (await screen(p)) === 'intro', await screen(p));
      await p.context().close();
    }
    // Quality: a hidden-tab gap doesn't drop to 720p
    {
      const p = await page(b, PHONE);
      await open(p); await p.click('#startBtn', { force: true }); await ready(p); await p.waitForTimeout(2000);
      await p.evaluate(() => { window.__ar.lastFrame -= 5000; }); // what a 5 s background gap looks like to the render loop
      // the outlier guard resets the quality window on that huge frame, so the gap can't force a drop; a real
      // slow-device drop needs a full 3 s measurement window, which can't complete in this short wait — so a
      // 720 here means the guard failed, not that this (often loaded) test machine is genuinely slow.
      await p.waitForTimeout(800);
      const w = await p.evaluate(() => document.querySelector('#stage').width);
      check('a background gap does not drop output to 720p', w === 1080, `canvas width ${w}`);
      await p.context().close();
    }
    // Self-timer: digits, cancel, reduced motion
    {
      const p = await page(b, { ...PHONE, reducedMotion: 'reduce' });
      await open(p); await p.click('#startBtn', { force: true }); await ready(p);
      await p.click('#timerBtn');
      check('self-timer shows its 3 s badge', (await p.textContent('#timerBtn .badge')) === '3');
      // cancel with the 10 s timer, so a slow test machine can't run out the clock before the tap lands
      await p.click('#timerBtn');
      await p.click('#shutter'); await p.waitForTimeout(300);
      const c = await p.evaluate(() => ({ text: document.querySelector('#countNum').textContent, opacity: getComputedStyle(document.querySelector('#countNum')).opacity }));
      check('reduced motion: countdown digits stay visible', /^(10|9)$/.test(c.text) && c.opacity === '1', JSON.stringify(c));
      await p.click('#shutter'); await p.waitForTimeout(1500);
      check('tapping during the countdown cancels it', (await screen(p)) === 'ar' && !(await p.textContent('#countNum')), await screen(p));
      await p.click('#timerBtn'); await p.click('#timerBtn'); // 10 s → off → 3 s
      // leaving the tab mid-countdown cancels it rather than shooting a frozen frame later
      await p.click('#shutter'); await p.waitForTimeout(300);
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await p.waitForTimeout(4000);
      const hid = { screen: await screen(p), count: await p.textContent('#countNum') };
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      check('hiding the page cancels a running countdown', hid.screen === 'ar' && !hid.count, JSON.stringify(hid));
      await p.click('#shutter'); await waitScreen(p, 'result', 10000);
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
    // Camera busy: Firefox reports a webcam held by another app as AbortError, which must not look like "closed while starting"
    {
      const p = await page(b, LAPTOP);
      await p.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Starting videoinput failed', 'AbortError')); });
      await open(p); await p.click('#startBtn', { force: true }); await p.waitForTimeout(1500);
      const r = await p.evaluate(() => ({ screen: document.querySelector('.screen.active').id, msg: document.querySelector('#camError').hidden ? '' : document.querySelector('#camError').textContent }));
      check('camera busy: back on the intro with the busy message, not stuck loading', r.screen === 'intro' && /busy/i.test(r.msg), JSON.stringify(r));
      await p.context().close();
    }
    // Wake lock: sharing to another app hides the page and releases the lock; it must come back for the booth
    {
      const p = await page(b, PHONE);
      await p.addInitScript(() => {
        const held = new Set();
        Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
          const l = new EventTarget(); l.released = false; held.add(l);
          l.release = async () => { if (l.released) return; l.released = true; held.delete(l); l.dispatchEvent(new Event('release')); };
          return l;
        } } });
        window.__locks = () => held.size;
        window.__hide = (h) => { // what the browser does when another app comes to the front
          Object.defineProperty(document, 'hidden', { value: h, configurable: true });
          if (h) [...held].forEach((l) => l.release());
          document.dispatchEvent(new Event('visibilitychange'));
        };
      });
      await open(p); await p.click('#startBtn', { force: true }); await ready(p);
      await p.click('#shutter'); await waitScreen(p, 'result');
      await p.evaluate(() => window.__hide(true)); await p.waitForTimeout(200);
      await p.evaluate(() => window.__hide(false)); await p.waitForTimeout(200);
      await p.click('#retakeBtn'); await waitScreen(p, 'ar'); await p.waitForTimeout(300);
      const locks = await p.evaluate(() => window.__locks());
      check('the screen stays awake after a share hands off to another app', locks === 1, `wake locks held: ${locks}`);
      await p.context().close();
    }
    // Engine download dropped (bad venue Wi-Fi): reopening the camera retries it instead of giving up for the session
    {
      const p = await page(b, { ...LAPTOP, serviceWorkers: 'block' });
      let blocked = true;
      await p.route('**/face_landmarker.task*', (r) => (blocked ? r.abort() : r.continue()));
      await open(p); await p.click('#startBtn', { force: true });
      const failedFirst = await p.waitForFunction(() => window.__ar?.trackerFailed === true, null, { timeout: 60000 }).then(() => true, () => false);
      blocked = false; // the connection recovers
      await p.click('#closeBtn'); await waitScreen(p, 'intro');
      await p.click('#startBtn', { force: true });
      const recovered = await ready(p).then(() => true, () => false);
      check('a failed engine download is retried when the camera reopens', failedFirst && recovered, JSON.stringify({ failedFirst, recovered }));
      await p.context().close();
    }
    // Result screen: copy works where the async clipboard is blocked; a double tap saves once
    {
      const p = await page(b, LAPTOP);
      await open(p); await p.click('#startBtn', { force: true }); await ready(p);
      await p.click('#shutter'); await waitScreen(p, 'result'); await p.waitForTimeout(300);
      // an in-app browser that blocks the clipboard API but allows the older copy command
      await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('blocked', 'NotAllowedError')); document.execCommand = () => true; });
      await p.click('#copyBtn'); await p.waitForTimeout(200);
      check('copy falls back to the older copy command', /Caption copied/.test(await p.textContent('#toast')), await p.textContent('#toast'));
      // both blocked: the caption is shown where a long press can select it
      await p.evaluate(() => { document.execCommand = () => false; });
      await p.click('#copyBtn'); await p.waitForTimeout(200);
      const cap = await p.evaluate(() => { const el = document.querySelector('#captionText'); return { shown: !el.hidden, text: el.textContent, select: getComputedStyle(el).userSelect }; });
      check('with no clipboard at all, the caption is shown and selectable', cap.shown && cap.text.includes('#VirtualFudge') && cap.select === 'all', JSON.stringify(cap));
      // double tap on Download
      await p.evaluate(() => { window.__saves = 0; const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__saves++; return; } return c.call(this); }; });
      await p.dblclick('#saveBtn'); await p.waitForTimeout(300);
      check('a double tap on Download saves one copy', (await p.evaluate(() => window.__saves)) === 1, `${await p.evaluate(() => window.__saves)} saves`);
      check('result fallbacks: no page errors', !p.errs.length, p.errs.join(' | '));
      await p.context().close();
    }
    // A browser too old to parse the app gets told so, instead of a dead start button
    {
      const p = await page(b, PHONE);
      await p.addInitScript(() => { // pretend optional chaining doesn't parse, like iOS 12 Safari
        const F = window.Function;
        window.Function = function (...a) { if (a.join(' ').includes('?.')) throw new SyntaxError('Unexpected token'); return F(...a); };
      });
      await p.goto(BASE); await p.waitForTimeout(800);
      const r = await p.evaluate(() => ({ startHidden: document.querySelector('#startBtn').hidden, msg: document.querySelector('#camError').hidden ? '' : document.querySelector('#camError').textContent }));
      check('a too-old browser sees an update message, not a dead button', r.startHidden && /too old/.test(r.msg), JSON.stringify(r));
      await p.context().close();
    }
  } finally { await b.close(); }
}
