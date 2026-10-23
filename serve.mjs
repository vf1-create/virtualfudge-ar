#!/usr/bin/env node
// Zero-dependency static server for local testing.
//   node serve.mjs              → http://localhost:8080 (camera works on localhost)
//   node serve.mjs --https      → https://<your-LAN-ip>:8443, to test on a phone on the same Wi-Fi.
//                                 Uses certs/cert.pem + certs/key.pem (made automatically with openssl if missing).
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const useHttps = process.argv.includes('--https');
const port = Number(process.env.PORT) || (useHttps ? 8443 : 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.task': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

function handler(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('Bad request'); return; }
  if (p.includes('\0')) { res.writeHead(400).end('Bad request'); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  // case-insensitive: macOS and Windows file systems would happily serve /CERTS/key.pem
  if (!file.startsWith(ROOT) || /[\\/](\.|certs[\\/]|node_modules)/i.test('/' + path.relative(ROOT, file))) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      'Permissions-Policy': 'camera=(self)',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const lan = Object.values(os.networkInterfaces()).flat().find((i) => i?.family === 'IPv4' && !i.internal)?.address;

if (useHttps) {
  const dir = path.join(ROOT, 'certs');
  const cert = path.join(dir, 'cert.pem'), key = path.join(dir, 'key.pem');
  if (!fs.existsSync(cert)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-keyout', key, '-out', cert,
      '-subj', '/CN=season-ar-dev', '-addext', `subjectAltName=DNS:localhost${lan ? `,IP:${lan}` : ''}`], { stdio: 'ignore' });
  }
  https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, handler).listen(port, () => {
    console.log(`Season AR → https://localhost:${port}${lan ? `  |  phone: https://${lan}:${port}` : ''}`);
    console.log('(self-signed cert: tap "Advanced → proceed" on the phone)');
  });
} else {
  http.createServer(handler).listen(port, () => console.log(`Season AR → http://localhost:${port}`));
}
