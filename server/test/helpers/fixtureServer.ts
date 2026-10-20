import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export interface FixtureServer {
  host: string;
  port: number;
  /** Paths requested, in order. */
  hits: string[];
  route(path: string, handler: Handler): void;
  close(): Promise<void>;
}

/** Local HTTP server for SSRF and crawl tests. Unknown paths give 404. */
export async function startFixture(host = '127.0.0.1'): Promise<FixtureServer> {
  const routes = new Map<string, Handler>();
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    const handler = routes.get((req.url ?? '').split('?')[0]!);
    if (handler) handler(req, res);
    else {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  return {
    host,
    port: (server.address() as AddressInfo).port,
    hits,
    route: (path, handler) => routes.set(path, handler),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export function html(body: string): Handler {
  return (_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(body);
  };
}

export function redirect(location: string, status = 302): Handler {
  return (_req, res) => {
    res.statusCode = status;
    res.setHeader('location', location);
    res.end();
  };
}
