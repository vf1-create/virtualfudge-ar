// Runs the browser test suites against a local copy of the site.
//   npm test                 all suites
//   npm test -- kit devices  just those suites
// Needs Playwright's Chromium and a fake webcam feed: see "Testing" in the README.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, BASE, PORT, CAMERA, reporter } from './lib.mjs';

const SUITES = ['app', 'devices', 'kit', 'offline', 'a11y'];
const pick = process.argv.slice(2).filter((s) => SUITES.includes(s));
if (!fs.existsSync(CAMERA)) {
  console.error(`No fake webcam feed at ${path.relative(process.cwd(), CAMERA)}.\nMake one from any front-facing portrait: node tests/make-camera.mjs portrait.jpg`);
  process.exit(1);
}

const server = spawn(process.execPath, [path.join(ROOT, 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
let up = false;
for (let i = 0; i < 50 && !up; i++) up = await fetch(BASE).then((r) => r.ok, () => false) || (await new Promise((r) => setTimeout(r, 100)), false);
if (!up) { server.kill(); console.error(`The local server didn't start on port ${PORT}.`); process.exit(1); }

const { check, results } = reporter();
try {
  for (const name of pick.length ? pick : SUITES) {
    console.log(`\n── ${name}`);
    const t = Date.now();
    try { await (await import(`./${name}.test.mjs`)).default(check); }
    catch (e) { check(`${name}: suite finished without crashing`, false, e.stack || e.message); }
    console.log(`   (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
} finally { server.kill(); }

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
