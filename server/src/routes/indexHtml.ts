import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { injectMeta } from '@lr/shared/meta';
import type { Config } from '../config.ts';

/** Serves the built index.html with the contact-email and source-url meta tags filled in. */
export function indexHtmlRoutes(app: FastifyInstance, config: Config, clientDist: string) {
  const html = injectMeta(fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8'), {
    contactEmail: config.contactEmail,
    sourceUrl: config.sourceUrl,
  });
  const send = async (_req: unknown, reply: { type(t: string): { send(b: string): unknown } }) =>
    reply.type('text/html; charset=utf-8').send(html);
  app.get('/', send);
  app.get('/index.html', send);
}
