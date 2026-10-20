import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../../src/config.ts';

export function tempDir(prefix = 'lr-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir: tempDir(),
    clientDist: null,
    contactEmail: 'takedown@example.com',
    sourceUrl: 'https://github.com/Penguin-Pants/ContraCompetitors',
    ...overrides,
  };
}
