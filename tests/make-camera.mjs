// Turns a front-facing portrait photo into the fake webcam feed the tests use (Chrome plays .y4m files).
//   node tests/make-camera.mjs path/to/portrait.jpg      (needs ffmpeg)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DIR } from './lib.mjs';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('Usage: node tests/make-camera.mjs path/to/portrait.jpg'); process.exit(1); }
const out = path.join(DIR, 'fixtures', 'face.y4m');
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', src, '-t', '2', '-r', '15',
  '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=gray',
  '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' });
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
