import path from 'node:path';
import { isHttpsUrl, isPlainEmail } from '@lr/shared/meta';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** Absolute path of the built client, or null when the client is not served (dev, tests). */
  clientDist: string | null;
  /** Plain takedown address (no scheme), shown in the footer. */
  contactEmail: string;
  /** https URL of the public source repository. */
  sourceUrl: string;
  /** Reverse proxy hops in front of the server (Railway: 1). Sets Fastify trustProxy. */
  trustProxyHops: number;
}

export class ConfigError extends Error {}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`PORT must be an integer 0-65535, got "${raw}"`);
  }
  return port;
}

function parseHops(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10)
    throw new ConfigError('TRUST_PROXY_HOPS must be an integer 0-10');
  return n;
}

function requireEmail(raw: string | undefined): string {
  if (!raw || !isPlainEmail(raw)) {
    throw new ConfigError('CONTACT_EMAIL must be a plain address such as takedown@example.com');
  }
  return raw;
}

function requireHttpsUrl(raw: string | undefined): string {
  if (!raw || !isHttpsUrl(raw)) throw new ConfigError('SOURCE_URL must be an https URL');
  return raw;
}

/** Reads and validates env vars. Throws ConfigError, so the server refuses to start on bad values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  return {
    trustProxyHops: parseHops(env.TRUST_PROXY_HOPS),
    contactEmail: requireEmail(env.CONTACT_EMAIL),
    sourceUrl: requireHttpsUrl(env.SOURCE_URL),
    port: parsePort(env.PORT, 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    clientDist: path.join(repoRoot, 'client/dist'),
  };
}
