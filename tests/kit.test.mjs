// The promo kit: link checks, QR codes, posters, NFC writing and locking.
import fs from 'node:fs';
import path from 'node:path';
import { launch, page, BASE, OUT } from './lib.mjs';

export default async function (check) {
  const b = await launch();
  try {
    const k = await page(b, { viewport: { width: 1200, height: 1000 } }), errs = k.errs;
    const KIT = BASE + 'tools/kit.html';
    const st = () => k.evaluate(() => ({ final: document.querySelector('#finalUrl').textContent, warn: document.querySelector('#urlWarn').hidden ? '' : document.querySelector('#urlWarn').textContent,
      dis: ['dlQR', 'copyLink', 'dlPoster', 'writeNfc'].map((i) => document.getElementById(i).disabled), src: document.querySelector('#src').value,
      saved: Object.keys(localStorage).map((x) => x + '=' + localStorage.getItem(x)) }));
    await k.goto(KIT); await k.waitForTimeout(800);
    let s = await st();
    check('kit#1 nothing saved on load', !s.saved.some((x) => x.split('=')[1]), JSON.stringify(s.saved));
    await k.fill('#url', 'ar.virtualfudge.com'); await k.waitForTimeout(200); s = await st();
    check('kit#4 bare domain gets https://', s.final === 'https://ar.virtualfudge.com/?src=ig-post' && !s.warn, s.final);
    check('kit#1 key scoped to the project', s.saved.some((x) => x.startsWith('kit-url:/=') || x.startsWith('kit-url:/')), JSON.stringify(s.saved));
    await k.fill('#url', 'http://ar.virtualfudge.com'); await k.waitForTimeout(200); s = await st();
    check('kit#4 http link → warning + buttons disabled', !!s.warn && s.dis.every(Boolean), JSON.stringify(s));
    await k.fill('#url', 'https://ar.virtualfudge.com/?' + 'x'.repeat(3000)); await k.waitForTimeout(200); s = await st();
    check('kit#9 too-long link → warning, no page error', /too long/.test(s.warn) && s.dis.every(Boolean) && !errs.length, s.warn + ' ' + errs.join('|'));
    await k.fill('#url', 'https://ar.virtualfudge.com/?' + 'x'.repeat(1900)); await k.waitForTimeout(200); s = await st();
    check('kit#9 long-but-OK link falls back to L and works', !s.warn && !s.dis.some(Boolean), s.warn);
    await k.fill('#url', 'https://ar.virtualfudge.com/'); await k.waitForTimeout(200);
    await k.click('#copyLink'); await k.waitForTimeout(200); const lab1 = await k.textContent('#copyLink'); await k.selectOption('#src', 'tiktok'); await k.waitForTimeout(100);
    check('kit#8 "Copied ✓" resets when the link changes', lab1.includes('Copied') && (await k.textContent('#copyLink')) === 'Copy link', lab1);
    await k.click('text=Print A4'); await k.waitForTimeout(300); s = await st();
    check('kit#5 Print A4 → src=poster', s.src === 'poster' && s.final.endsWith('src=poster'), s.final);
    await k.click('text=Feed 4:5'); await k.waitForTimeout(200); s = await st();
    check('kit#5 back to Feed → src=ig-post', s.src === 'ig-post', s.src);
    const fsz = await k.evaluate(() => getComputedStyle(document.querySelector('#url')).fontSize + ' ' + getComputedStyle(document.querySelector('#src')).fontSize);
    check('kit#10 inputs are 16px', fsz === '16px 16px', fsz);
    // kit#7 quiet zone: first dark pixel in the downloadable QR sits ≥ 4 modules in
    const qz = await k.evaluate(() => { const c = document.querySelector('#qrPreview'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
      for (let x = 0; x < c.width; x++) { const i = (Math.floor(c.height / 4) * c.width + x) * 4; if (d[i] < 128) return x; } return -1; });
    check('kit#7 downloadable QR has a ≥4-module quiet zone', qz > 1024 / 33 * 3.9, `first dark px at x=${qz}`);
    // kit#2 + kit#13 + kit#3 + kit#6 with a config override
    await k.route('**/js/config.js', async (r) => { const rr = await r.fetch(); let body = await rr.text();
      body = body.replace("seasonTitle: 'The Sweetest Season'", "seasonTitle: 'Unforgettable Weihnachtszauber'").replace("seasonStart: ''", "seasonStart: '2026-12-25'").replace("startLabel: 'Holiday 2026'", "startLabel: ''").replace(/posterLine: '[^']*'/, "posterLine: 'Custom poster line from config.'");
      r.fulfill({ response: rr, body, contentType: 'text/javascript' }); });
    await k.goto(KIT); await k.waitForTimeout(1200);
    // instrument fillText to capture what the poster draws
    await k.evaluate(() => { window.__t = []; const P = CanvasRenderingContext2D.prototype, f = P.fillText; P.fillText = function (s, x, y, m) { if (this.canvas.id === 'poster') window.__t.push({ s, x, w: this.measureText(s).width, y, W: this.canvas.width, H: this.canvas.height }); return f.apply(this, arguments); }; });
    for (const t of ['Feed 4:5', 'Story 9:16', 'Print A4']) {
      await k.evaluate(() => { window.__t = []; }); await k.click(`text=${t}`); await k.waitForTimeout(250);
      const drawn = await k.evaluate(() => window.__t);
      const over = drawn.filter((d) => d.x + d.w > d.W - 110 * d.W / 1080 + 1);
      const kicker = drawn.find((d) => /BESPOKE|Bespoke/.test(d.s))?.s;
      check(`${t}: kit#2 no text past the margin`, !over.length, over.map((d) => d.s + ' ' + Math.round(d.x + d.w) + '/' + d.W).join(', '));
      check(`${t}: kit#3 static date, not a countdown`, /December 25/.test(kicker) && !/days|Tomorrow|Tonight/.test(kicker), kicker);
      check(`${t}: kit#13 body copy from config`, drawn.some((d) => d.s.includes('Custom poster line')), '');
      if (t.startsWith('Story')) { const ys = drawn.map((d) => d.y); check('Story: kit#6 text stays out of the top/bottom 250px', Math.min(...ys) > 250 && Math.max(...ys) < 1920 - 250, `y ${Math.round(Math.min(...ys))}–${Math.round(Math.max(...ys))}`); }
    }
    // save the real posters
    await k.unroute('**/js/config.js'); await k.goto(KIT); await k.fill('#url', 'https://vf1-create.github.io/virtualfudge-ar/'); await k.waitForTimeout(1000);
    for (const t of ['Feed 4:5', 'Story 9:16', 'Print A4']) {
      await k.click(`text=${t}`); await k.waitForTimeout(250);
      const data = await k.evaluate(() => document.querySelector('#poster').toDataURL('image/png'));
      fs.writeFileSync(path.join(OUT, `poster-${t.split(' ')[0]}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    // kit#12: NFC with a fake NDEFReader: second tap supersedes the first without a failure message; lock appears after success
    await k.addInitScript(() => { window.__w = []; window.NDEFReader = class { write(m, { signal }) { return new Promise((res, rej) => { window.__w.push(res); signal.addEventListener('abort', () => rej(new DOMException('Push is cancelled', 'AbortError'))); }); } makeReadOnly() { return Promise.resolve(); } }; });
    await k.goto(KIT); await k.waitForTimeout(800);
    await k.click('#writeNfc'); await k.click('#writeNfc'); await k.waitForTimeout(100);
    const s1 = await k.textContent('#nfcStatus');
    await k.evaluate(() => window.__w[1]()); await k.waitForTimeout(100);
    const s2 = await k.textContent('#nfcStatus'), lockShown = !(await k.evaluate(() => document.querySelector('#lockNfc').hidden));
    check('kit#12 second tap doesn\'t show a failure', /Hold the tag/.test(s1), s1);
    check('security#7 lock offered after a write', /written/.test(s2) && lockShown, s2);
    k.once('dialog', (d) => d.accept()); await k.click('#lockNfc'); await k.waitForTimeout(150);
    check('security#7 lock works', /locked/.test(await k.textContent('#nfcStatus')), await k.textContent('#nfcStatus'));
    check('kit: no page errors', !errs.length, errs.join(' | '));
  } finally { await b.close(); }
}
