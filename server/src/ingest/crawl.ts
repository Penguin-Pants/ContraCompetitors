import { attr, parseHtml, textOf, walkElements } from './html.ts';

/** Total pages per ingestion, homepage included (static and headless share it). */
export const MAX_PAGES = 12;
export const MAX_BLOG_POSTS = 4;
export const MAX_STYLESHEETS = 10;

const TEAM_RE = /\b(team|about|leadership|people|company|staff|founders?|who-we-are|our-story)\b/i;
const BLOG_RE = /\/(blog|news|stories|articles|posts|insights|journal)(\/|$)/i;

export type PageKind = 'home' | 'team' | 'blog' | 'blogPost';

export interface Link {
  url: string;
  text: string;
}

/** Image URL with a priority: 2 author picture, 1 team page image, 0 other. */
export interface ImageCandidate {
  url: string;
  priority: number;
}

export interface PageScan {
  links: Link[];
  images: ImageCandidate[];
  stylesheets: string[];
  inlineStyles: string[];
}

function resolve(raw: string | undefined, base: URL): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v || v.startsWith('data:') || v.startsWith('javascript:') || v.startsWith('#')) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Candidates of a srcset, after the HTML parsing rules: a URL runs to the next whitespace (trailing
 * commas end it), and its descriptors run to the next comma. So `a.jpg 1x,b.jpg 2x` gives two
 * candidates, and a comma inside a URL stays in it.
 */
function srcsetCandidates(srcset: string): { url: string; desc: string }[] {
  const out: { url: string; desc: string }[] = [];
  let i = 0;
  while (i < srcset.length) {
    while (i < srcset.length && /[\s,]/.test(srcset[i]!)) i++;
    const start = i;
    while (i < srcset.length && !/\s/.test(srcset[i]!)) i++;
    const url = srcset.slice(start, i);
    if (!url) break;
    if (url.endsWith(',')) {
      out.push({ url: url.replace(/,+$/, ''), desc: '' });
      continue;
    }
    const descStart = i;
    while (i < srcset.length && srcset[i] !== ',') i++;
    out.push({ url, desc: srcset.slice(descStart, i).trim() });
  }
  return out;
}

/** Largest candidate of a srcset: highest `w`, else highest `x`, else the last. */
export function largestFromSrcset(srcset: string): string | null {
  let best: { url: string; score: number } | null = null;
  for (const { url, desc } of srcsetCandidates(srcset)) {
    const m = /^([\d.]+)([wx])$/.exec(desc || '1x');
    const score = m ? Number(m[1]) * (m[2] === 'w' ? 1 : 1000) : 0;
    if (!best || score >= best.score) best = { url, score };
  }
  return best?.url ?? null;
}

function sameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.replace(/^www\./, '');
  return strip(a.hostname) === strip(b.hostname);
}

function jsonLdAuthorImages(json: unknown, out: string[]) {
  if (Array.isArray(json)) return json.forEach((j) => jsonLdAuthorImages(j, out));
  if (!json || typeof json !== 'object') return;
  const o = json as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'author') {
      for (const a of Array.isArray(v) ? v : [v]) {
        const img = (a as Record<string, unknown> | null)?.image;
        for (const i of Array.isArray(img) ? img : [img]) {
          if (typeof i === 'string') out.push(i);
          else if (i && typeof (i as { url?: unknown }).url === 'string')
            out.push((i as { url: string }).url);
        }
      }
    } else if (typeof v === 'object') {
      jsonLdAuthorImages(v, out);
    }
  }
}

/** Links, images and styles of one HTML page. `pageUrl` is the final URL after redirects. */
export function scanHtml(html: string, pageUrl: string, kind: PageKind): PageScan {
  const doc = parseHtml(html);
  let base = new URL(pageUrl);
  walkElements(doc, (el) => {
    if (el.tagName === 'base') {
      const href = resolve(attr(el, 'href'), new URL(pageUrl));
      if (href) base = new URL(href);
    }
  });
  const links: Link[] = [];
  const images: ImageCandidate[] = [];
  const stylesheets: string[] = [];
  const inlineStyles: string[] = [];
  const pagePriority = kind === 'team' ? 1 : 0;
  const authorUrls: string[] = [];

  walkElements(doc, (el, ancestors) => {
    switch (el.tagName) {
      case 'a': {
        const url = resolve(attr(el, 'href'), base);
        if (url) links.push({ url, text: textOf(el).replace(/\s+/g, ' ').trim().slice(0, 120) });
        break;
      }
      case 'link': {
        const rel = (attr(el, 'rel') ?? '').toLowerCase().split(/\s+/);
        const url = resolve(attr(el, 'href'), base);
        if (url && rel.includes('stylesheet')) stylesheets.push(url);
        break;
      }
      case 'style':
        inlineStyles.push(textOf(el));
        break;
      case 'script':
        if ((attr(el, 'type') ?? '').toLowerCase() === 'application/ld+json') {
          try {
            jsonLdAuthorImages(JSON.parse(textOf(el)), authorUrls);
          } catch {
            // Bad JSON-LD is ignored.
          }
        }
        break;
      case 'img':
      case 'source': {
        const srcset = attr(el, 'srcset') ?? attr(el, 'data-srcset');
        const raw =
          (srcset && largestFromSrcset(srcset)) ??
          attr(el, 'data-src') ??
          attr(el, 'data-lazy-src') ??
          attr(el, 'src');
        const url = resolve(raw, base);
        if (!url || /\.svg(\?|$)/i.test(url)) break;
        const author = ancestors.some((a) => {
          const cls = (attr(a, 'class') ?? '').toLowerCase();
          const rel = (attr(a, 'rel') ?? '').toLowerCase();
          return /\bauthor\b/.test(cls) || rel.split(/\s+/).includes('author');
        });
        images.push({
          url,
          priority: author && (kind === 'blogPost' || kind === 'blog') ? 2 : pagePriority,
        });
        break;
      }
    }
  });
  for (const raw of authorUrls) {
    const url = resolve(raw, base);
    if (url) images.push({ url, priority: 2 });
  }
  return { links, images, stylesheets: stylesheets.slice(0, MAX_STYLESHEETS), inlineStyles };
}

/**
 * ING-4: same-site team, about, leadership, people and company pages, and up to MAX_BLOG_POSTS
 * blog posts. Off-site links are ignored.
 */
export function selectPages(
  links: readonly Link[],
  from: string,
  seen: ReadonlySet<string>,
): { url: string; kind: PageKind }[] {
  const origin = new URL(from);
  const out: { url: string; kind: PageKind }[] = [];
  const taken = new Set(seen);
  let posts = 0;
  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link.url);
    } catch {
      continue;
    }
    if (!sameSite(u, origin)) continue;
    u.search = '';
    const key = u.href;
    if (taken.has(key)) continue;
    let path = u.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // A malformed escape (`%zz`): match on the raw path.
    }
    let kind: PageKind | null = null;
    if (TEAM_RE.test(path) || TEAM_RE.test(link.text)) kind = 'team';
    else if (BLOG_RE.test(path)) {
      const isPost = /\/(blog|news|stories|articles|posts|insights|journal)\/[^/]+/i.test(path);
      if (isPost && posts < MAX_BLOG_POSTS) {
        kind = 'blogPost';
        posts++;
      } else if (!isPost) kind = 'blog';
    }
    if (!kind) continue;
    taken.add(key);
    out.push({ url: key, kind });
  }
  // Team pages first, then blog posts, then blog indexes.
  const rank: Record<PageKind, number> = { team: 0, blogPost: 1, blog: 2, home: 3 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
