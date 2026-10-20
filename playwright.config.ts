import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run build && node server/src/index.ts',
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PORT: String(PORT),
        HOST: '127.0.0.1',
        DATA_DIR: 'test-results/e2e-data',
        CONTACT_EMAIL: 'takedown@example.com',
        SOURCE_URL: 'https://github.com/Penguin-Pants/ContraCompetitors',
        TRUST_PROXY_HOPS: '0',
      },
    },
    {
      // Real-server journey: app with an injected resolver and a fixture site (e2e/testServer.ts).
      // Waits for the first server, which builds the client.
      command: 'node e2e/testServer.ts',
      url: 'http://localhost:4174/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { PORT: '4174', SITE_PORT: '4175' },
    },
  ],
});
