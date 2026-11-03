#!/usr/bin/env node
// Takes a private pitch activation offline. Each one lives in a single folder: a/<name>-<code>/.
//   node tools/remove-activation.js roland            remove a/roland-*/ and commit
//   node tools/remove-activation.js roland --dry-run  just list what would go
// It commits locally and prints the push command; GitHub Pages drops the page a minute after the push.
// It touches nothing outside a/<name>-*/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const name = (process.argv[2] || '').toLowerCase();
const dry = process.argv.includes('--dry-run');
if (!/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage: node tools/remove-activation.js <name> [--dry-run]   e.g. roland');
  process.exit(1);
}
const A = path.join(ROOT, 'a');
const dirs = fs.existsSync(A) ? fs.readdirSync(A, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith(`${name}-`)).map((d) => `a/${d.name}`) : [];
if (!dirs.length) { console.log(`Nothing to remove: no a/${name}-*/ folder.`); process.exit(0); }
console.log(`${dry ? 'Would remove' : 'Removing'}: ${dirs.join(', ')}`);
if (dry) process.exit(0);

const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: 'inherit' });
for (const d of dirs) {
  git('rm', '-r', '-q', '--ignore-unmatch', '--', d);
  fs.rmSync(path.join(ROOT, d), { recursive: true, force: true }); // untracked leftovers (reports, test output)
}
git('commit', '-q', '-m', `Take down the ${name} activation`, '--', ...dirs);
console.log(`\nCommitted. To take it offline, push:\n  git push origin HEAD\nThe page returns 404 once GitHub Pages redeploys (about a minute).`);
