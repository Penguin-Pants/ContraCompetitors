import type { FaceCrop } from '../faces/crop.ts';
import { ByteBudget, safeFetch, type NetPolicy } from '../net/safeFetch.ts';
import { extractColors } from './colors.ts';
import { MAX_PAGES, scanHtml, selectPages, type ImageCandidate, type PageKind } from './crawl.ts';
import { collectFaces, prioritize, type Accumulator } from './images.ts';

/** Faces below this trigger the headless retry (ING-6) and the upload prompt (ING-7). */
export const MIN_FACES = 5;
const PAGE_CONCURRENCY = 3;
const CSS_CONCURRENCY = 4;

export interface HeadlessResult {
  imageUrls: ImageCandidate[];
  hosts: string[];
}

/** Renders pages in Chromium. `pagesLeft` shares the 12-page cap with the static crawl. */
export type HeadlessRun = (
  url: string,
  pagesLeft: number,
  signal: AbortSignal,
) => Promise<HeadlessResult>;

export interface PipelineDeps {
  net: NetPolicy;
  /** Detects faces with the time left in the budget; aborts with the ingestion signal. */
  detect: (bytes: Uint8Array, signal: AbortSignal) => Promise<FaceCrop[]>;
  headless: HeadlessRun | null;
}

export interface PipelineOutcome {
  source: 'static' | 'headless';
}

async function mapLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

/**
 * ING-3 to ING-6: homepage, CSS colors, static crawl, faces, then a headless retry when fewer
 * than MIN_FACES were found. Writes into `acc` as it goes, so the caller can return partial
 * results at the deadline. Throws FetchError only when the homepage itself fails.
 */
export async function runPipeline(
  url: string,
  acc: Accumulator,
  deps: PipelineDeps,
  signal: AbortSignal,
): Promise<PipelineOutcome> {
  const budget = new ByteBudget();
  const fetchHtml = (u: string) => safeFetch(u, { kind: 'html', signal, budget }, deps.net);
  const home = await fetchHtml(url);
  for (const h of home.hosts) acc.sourceHosts.add(h);
  acc.stats.pages++;
  const homeScan = scanHtml(home.body.toString('utf8'), home.url, 'home');

  // Colors from linked stylesheets (max 10) and inline <style>.
  const css: string[] = [...homeScan.inlineStyles];
  await mapLimit(homeScan.stylesheets, CSS_CONCURRENCY, async (sheet) => {
    try {
      const res = await safeFetch(sheet, { kind: 'css', signal, budget }, deps.net);
      for (const h of res.hosts) acc.sourceHosts.add(h);
      css.push(res.body.toString('utf8'));
    } catch {
      // A missing stylesheet only loses colors.
    }
  });
  acc.colors = extractColors(css);

  // Static crawl: team, about, leadership pages and blog posts, max 12 pages.
  const seen = new Set([home.url, url]);
  const images: ImageCandidate[] = [...homeScan.images];
  let queue: { url: string; kind: PageKind }[] = selectPages(homeScan.links, home.url, seen);
  for (let round = 0; round < 2 && queue.length && !signal.aborted; round++) {
    const batch = queue.slice(0, MAX_PAGES - acc.stats.pages);
    for (const p of batch) seen.add(p.url);
    const found: { url: string; kind: PageKind }[] = [];
    await mapLimit(batch, PAGE_CONCURRENCY, async (page) => {
      if (acc.stats.pages >= MAX_PAGES) return;
      try {
        acc.stats.pages++;
        const res = await fetchHtml(page.url);
        for (const h of res.hosts) acc.sourceHosts.add(h);
        const scan = scanHtml(res.body.toString('utf8'), res.url, page.kind);
        images.push(...scan.images);
        // A blog index links to its posts.
        if (page.kind === 'blog')
          found.push(
            ...selectPages(scan.links, res.url, seen).filter((p) => p.kind === 'blogPost'),
          );
      } catch {
        // Skip pages that fail.
      }
    });
    queue = found;
  }

  const stage = {
    fetchImage: async (u: string) => {
      const res = await safeFetch(u, { kind: 'image', signal, budget }, deps.net);
      return { bytes: res.body, hosts: res.hosts };
    },
    detect: (bytes: Uint8Array) => deps.detect(bytes, signal),
  };
  await collectFaces(prioritize(images, acc.tried), stage, acc, signal);
  if (acc.faces.size >= MIN_FACES || !deps.headless || signal.aborted) return { source: 'static' };

  // ING-6: headless retry for JavaScript-rendered sites.
  acc.stats.headless = true;
  const rendered = await deps.headless(url, MAX_PAGES - acc.stats.pages + 1, signal);
  for (const h of rendered.hosts) acc.sourceHosts.add(h);
  await collectFaces(prioritize(rendered.imageUrls, acc.tried), stage, acc, signal);
  return { source: 'headless' };
}
