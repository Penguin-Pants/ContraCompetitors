import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** Absolute path of the built client, or null when the client is not served (dev, tests). */
  clientDist: string | null;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  return {
    port: parsePort(env.PORT, 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    clientDist: path.join(repoRoot, 'client/dist'),
  };
}
