// Automated accessibility scan (axe-core, WCAG 2.1 A and AA) of every screen and the promo kit.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { launch, page, open, ready, waitScreen, BASE, PHONE, LAPTOP } from './lib.mjs';

const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

async function scan(p) {
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], resultTypes: ['violations'] }));
  return r.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`);
}

export default async function (check) {
  const b = await launch();
  try {
    for (const [label, opts] of [['phone', PHONE], ['laptop', LAPTOP]]) {
      const p = await page(b, opts);
      await open(p); await p.waitForTimeout(1200);
      let v = await scan(p); check(`${label} intro: no WCAG violations`, !v.length, v.join('; '));
      await p.click('#startBtn', { force: true }); await ready(p); await p.waitForTimeout(800);
      v = await scan(p); check(`${label} camera: no WCAG violations`, !v.length, v.join('; '));
      await p.click('#shutter'); await waitScreen(p, 'result'); await p.waitForTimeout(800);
      v = await scan(p); check(`${label} result: no WCAG violations`, !v.length, v.join('; '));
      await p.context().close();
    }
    for (const [label, url] of [['promo kit', 'tools/kit.html'], ['404 page', '404.html']]) { // GitHub Pages serves 404.html for missing pages
      const p = await page(b, LAPTOP);
      await p.goto(BASE + url); await p.waitForTimeout(1000);
      const v = await scan(p); check(`${label}: no WCAG violations`, !v.length, v.join('; '));
      await p.context().close();
    }
  } finally { await b.close(); }
}
