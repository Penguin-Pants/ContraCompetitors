/**
 * Test-only server for the real-server E2E journey: the app with an injected resolver (every
 * `*.test` host is the local fixture site) and a fixture company site with team photos.
 * Never used in production.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server/src/app.ts';
import { checkAddress } from '../server/src/net/ipPolicy.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP_PORT = Number(process.env.PORT ?? 4174);
const SITE_PORT = Number(process.env.SITE_PORT ?? 4175);
const dataDir = path.join(ROOT, 'test-results/e2e-real-data');
fs.rmSync(dataDir, { recursive: true, force: true });

// Playwright starts both web servers at once; the first one builds the client.
const indexHtml = path.join(ROOT, 'client/dist/index.html');
for (let i = 0; i < 1200 && !fs.existsSync(indexHtml); i++)
  await new Promise((r) => setTimeout(r, 100));

const crew = fs.readFileSync(path.join(ROOT, 'server/test/fixtures/photos/gemini7-crew.jpg'));
const photos = await Promise.all(
  [640, 900, 1200].map((w) => sharp(crew).resize(w).jpeg().toBuffer()),
);

http
  .createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/') {
      res.setHeader('content-type', 'text/html');
      return res.end(
        '<html><head><style>:root{--brand-primary:#e4002b}.btn{background-color:#1e88e5}</style></head>' +
          '<body><a href="/team">Team</a></body></html>',
      );
    }
    if (url === '/team') {
      res.setHeader('content-type', 'text/html');
      return res.end(
        '<html><body><img src="/0.jpg"><img src="/1.jpg"><img src="/2.jpg"></body></html>',
      );
    }
    const m = /^\/(\d)\.jpg$/.exec(url);
    if (m && photos[Number(m[1])]) {
      res.setHeader('content-type', 'image/jpeg');
      return res.end(photos[Number(m[1])]);
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(SITE_PORT, '127.0.0.1');

const app = await createApp(
  {
    port: APP_PORT,
    host: '127.0.0.1',
    dataDir,
    clientDist: path.join(ROOT, 'client/dist'),
    contactEmail: 'takedown@example.com',
    sourceUrl: 'https://github.com/Penguin-Pants/ContraCompetitors',
    trustProxyHops: 0,
  },
  {
    logger: false,
    headless: null,
    resolver: async (host) => {
      if (!host.endsWith('.test')) throw new Error(`ENOTFOUND ${host}`);
      return [{ address: '127.0.0.1', family: 4 }];
    },
    checkIp: (ip) => (ip === '127.0.0.1' ? { allowed: true } : checkAddress(ip)),
  },
);
await app.listen({ port: APP_PORT, host: '127.0.0.1' });
