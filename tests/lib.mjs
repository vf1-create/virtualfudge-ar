// Shared helpers for the browser tests: a Chromium with a fake webcam, and PASS/FAIL reporting.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright'); // `npm install`, or a global install on NODE_PATH

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(DIR);
export const OUT = path.join(DIR, 'out'); // screenshots, posters and a sample clip land here
export const CAMERA = process.env.CAMERA || path.join(DIR, 'fixtures', 'face.y4m');
export const PORT = Number(process.env.PORT) || 8090;
export const BASE = `http://localhost:${PORT}/`;
fs.mkdirSync(OUT, { recursive: true });

// the fake webcam plays CAMERA in a loop, and camera permission is granted without a prompt
export const launch = () => chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${CAMERA}`, '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

export const PHONE = { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true };
export const LAPTOP = { viewport: { width: 1280, height: 800 } };

export async function page(browser, opts = {}) {
  const ctx = await browser.newContext({ permissions: ['camera', 'clipboard-read', 'clipboard-write'], ...opts });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  return p;
}

// AR page with ?src=debug, which exposes the app state as window.__ar
export const open = (p, query = '') => p.goto(`${BASE}?src=debug${query}`);
export const ready = (p) => p.waitForFunction(() => window.__ar?.landmarker && window.__ar.faces.length > 0 && document.querySelector('#loading').classList.contains('done'), null, { timeout: 60000 });
export const screen = (p) => p.evaluate(() => document.querySelector('.screen.active')?.id);
export const waitScreen = (p, id, ms = 10000) => p.waitForFunction((id) => document.querySelector('.screen.active')?.id === id, id, { timeout: ms }).catch(() => {});

export function reporter() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`);
  };
  return { check, results };
}
