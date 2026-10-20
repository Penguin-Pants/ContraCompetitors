import { chromium } from 'playwright';

/**
 * Launch gate for the headless retry: starts Chromium with the sandbox on and loads a blank page.
 * Exits 1 when the sandbox is not available on this host (never retried with --no-sandbox).
 */
console.log(`uid=${process.getuid?.()}`);
try {
  const browser = await chromium.launch({ chromiumSandbox: true });
  const page = await browser.newPage();
  await page.goto('about:blank');
  await browser.close();
  console.log('Chromium sandbox: OK');
} catch (err) {
  console.error(`Chromium sandbox: FAILED: ${(err as Error).message.split('\n')[0]}`);
  process.exit(1);
}
