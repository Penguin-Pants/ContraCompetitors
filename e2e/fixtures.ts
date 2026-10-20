import type { Page } from '@playwright/test';
import type { FaceDto, IngestResponse } from '../shared/src/api.ts';

/**
 * Test-only fixture faces: simple drawn faces at the given source widths, made in the browser so the
 * PNG encoding matches what the client decodes. Ids are SHA-256 of the PNG bytes, like the server.
 */
export async function makeFaces(page: Page, widths: readonly number[]): Promise<FaceDto[]> {
  if (page.url() === 'about:blank') await page.goto('/api/health');
  return page.evaluate(async (widths) => {
    const out: { id: string; dataUrl: string; width: number; height: number }[] = [];
    for (const [i, w] of widths.entries()) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = Math.round(w * 1.15);
      const g = c.getContext('2d')!;
      const hue = (i * 67) % 360;
      g.fillStyle = `hsl(${hue} 30% 35%)`;
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = `hsl(${(hue + 30) % 360} 45% 70%)`;
      g.beginPath();
      g.ellipse(w / 2, c.height / 2, w * 0.38, c.height * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      for (const ex of [0.36, 0.64]) {
        g.beginPath();
        g.arc(w * ex, c.height * 0.45, w * 0.05, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(w * 0.38, c.height * 0.66, w * 0.24, w * 0.04);
      const dataUrl = c.toDataURL('image/png');
      const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]!), (ch) => ch.charCodeAt(0));
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      const id = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
      out.push({ id, dataUrl, width: c.width, height: c.height });
    }
    return out;
  }, widths);
}

export function ingestResponse(over: Partial<IngestResponse> = {}): IngestResponse {
  return {
    domain: 'example.test',
    colors: ['#ffb300', '#4fc3f7'],
    faces: [],
    partial: false,
    source: 'static',
    ...over,
  };
}

/** Mocks POST /api/ingest with a fixed response. Returns a counter of calls. */
export async function mockIngest(page: Page, body: IngestResponse | (() => IngestResponse)) {
  const calls = { count: 0 };
  await page.route('**/api/ingest', async (route) => {
    calls.count++;
    await route.fulfill({ json: typeof body === 'function' ? body() : body });
  });
  return calls;
}
