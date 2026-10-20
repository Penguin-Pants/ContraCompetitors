import { describe, expect, test } from 'vitest';
import { largestFromSrcset, scanHtml, selectPages } from '../src/ingest/crawl.ts';
import { MAX_DEPTH, nestingDepth } from '../src/ingest/html.ts';

const HOME = `<!doctype html><html><head>
<link rel="stylesheet" href="/css/site.css"><style>:root{--primary:#e4002b}</style>
</head><body>
<nav>
  <a href="/team">Our team</a>
  <a href="/about-us">About us</a>
  <a href="https://www.corp.test/leadership">Leadership</a>
  <a href="/careers">Careers</a>
  <a href="/company/meet">Meet us</a>
  <a href="https://other.test/team">Partner team</a>
  <a href="/blog/">Blog</a>
  <a href="/blog/post-1">Post 1</a><a href="/blog/post-2">Post 2</a><a href="/blog/post-3">Post 3</a>
  <a href="/blog/post-4">Post 4</a><a href="/blog/post-5">Post 5</a>
  <a href="/x" >People</a>
</nav>
<img src="/img/hero.jpg"><img src="logo.svg"><img src="data:image/png;base64,AAAA">
</body></html>`;

describe('crawl', () => {
  test('finds /team, /about-us, /leadership and blog posts; ignores off-site and unrelated links', () => {
    const scan = scanHtml(HOME, 'https://corp.test/', 'home');
    const pages = selectPages(scan.links, 'https://corp.test/', new Set(['https://corp.test/']));
    const urls = pages.map((p) => p.url);
    expect(urls).toContain('https://corp.test/team');
    expect(urls).toContain('https://corp.test/about-us');
    expect(urls).toContain('https://www.corp.test/leadership');
    expect(urls).toContain('https://corp.test/company/meet');
    expect(urls).toContain('https://corp.test/x');
    expect(urls).not.toContain('https://other.test/team');
    expect(urls).not.toContain('https://corp.test/careers');
    expect(pages.filter((p) => p.kind === 'blogPost')).toHaveLength(4);
    expect(pages[0]!.kind).toBe('team');
  });

  test('collects stylesheets and inline styles; skips SVG and data images', () => {
    const scan = scanHtml(HOME, 'https://corp.test/', 'home');
    expect(scan.stylesheets).toEqual(['https://corp.test/css/site.css']);
    expect(scan.inlineStyles[0]).toContain('--primary');
    expect(scan.images.map((i) => i.url)).toEqual(['https://corp.test/img/hero.jpg']);
  });

  test('blog author images: .author img, [rel=author] img and schema.org author.image', () => {
    const post = `<html><body>
      <div class="post-author"><img src="/a/alice.jpg"></div>
      <div class="author-box"><img src="/a/bob.jpg"></div>
      <a rel="author" href="/u/carol"><img src="/a/carol.jpg"></a>
      <img src="/a/inline.jpg">
      <script type="application/ld+json">{"@type":"BlogPosting","author":{"@type":"Person","image":{"url":"https://cdn.corp.test/dan.jpg"}}}</script>
      <script type="application/ld+json">{"@graph":[{"author":[{"image":"/a/erin.jpg"}]}]}</script>
    </body></html>`;
    const scan = scanHtml(post, 'https://corp.test/blog/post-1', 'blogPost');
    const authors = scan.images.filter((i) => i.priority === 2).map((i) => i.url);
    expect(authors).toEqual(
      expect.arrayContaining([
        'https://corp.test/a/bob.jpg',
        'https://corp.test/a/carol.jpg',
        'https://cdn.corp.test/dan.jpg',
        'https://corp.test/a/erin.jpg',
      ]),
    );
    expect(authors).not.toContain('https://corp.test/a/inline.jpg');
  });

  test('team page images get priority 1; srcset uses the largest candidate; base href applies', () => {
    const team = `<html><head><base href="https://corp.test/app/"></head><body>
      <img srcset="p-200.jpg 200w, p-800.jpg 800w, p-400.jpg 400w" src="p-200.jpg">
      <img data-src="lazy.jpg"><picture><source srcset="pic@1x.webp 1x, pic@2x.webp 2x"></picture>
    </body></html>`;
    const scan = scanHtml(team, 'https://corp.test/team', 'team');
    expect(scan.images).toEqual([
      { url: 'https://corp.test/app/p-800.jpg', priority: 1 },
      { url: 'https://corp.test/app/lazy.jpg', priority: 1 },
      { url: 'https://corp.test/app/pic@2x.webp', priority: 1 },
    ]);
  });

  test('largestFromSrcset', () => {
    expect(largestFromSrcset('a.jpg 1x, b.jpg 3x, c.jpg 2x')).toBe('b.jpg');
    expect(largestFromSrcset('only.jpg')).toBe('only.jpg');
    // No space after the comma (minified markup).
    expect(largestFromSrcset('small.jpg 1x,large.jpg 2x')).toBe('large.jpg');
    expect(largestFromSrcset('a.jpg 100w,b.jpg 800w,c.jpg 400w')).toBe('b.jpg');
    // A comma inside a URL stays part of it (image CDNs use them).
    expect(largestFromSrcset('/i/w_100,h_100/a.jpg 1x, /i/w_200,h_200/a.jpg 2x')).toBe(
      '/i/w_200,h_200/a.jpg',
    );
  });

  test('a same-site link with a malformed percent escape is matched on its raw path, not a crash', () => {
    const links = [
      { url: 'https://corp.test/team/%zz', text: 'x' },
      { url: 'https://corp.test/about/%E0%A4%A', text: 'Leadership' },
    ];
    const pages = selectPages(links, 'https://corp.test/', new Set());
    expect(pages.map((p) => p.kind)).toEqual(['team', 'team']);
  });

  test('nesting up to MAX_DEPTH is scanned and finds author images and link text', () => {
    const d = MAX_DEPTH - 10;
    const html =
      '<div class="author">' +
      '<div>'.repeat(d / 2) +
      '<img src="/me.jpg"><a href="/team">' +
      '<span>'.repeat(d / 2) +
      'Team' +
      '</span>'.repeat(d / 2) +
      '</a>' +
      '</div>'.repeat(d / 2) +
      '</div>';
    const scan = scanHtml(html, 'https://corp.test/blog/post', 'blogPost');
    expect(scan.images).toContainEqual({ url: 'https://corp.test/me.jpg', priority: 2 });
    expect(scan.links.map((l) => l.text)).toContain('Team');
  });

  test('a page nested deeper than MAX_DEPTH (2 MB of open and close tags) is skipped at once', () => {
    const d = 180_000;
    const html = '<div>'.repeat(d) + '<img src="/x.jpg">' + '</div>'.repeat(d);
    const t0 = Date.now();
    expect(scanHtml(html, 'https://corp.test/', 'home').images).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test('2 MB of unclosed <script or <a tags is checked in linear time', () => {
    const t0 = Date.now();
    scanHtml('<script'.repeat(280_000), 'https://corp.test/', 'home');
    scanHtml('<a'.repeat(1_000_000), 'https://corp.test/', 'home');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  test('nestingDepth ignores void and optional-end tags, so ordinary markup stays shallow', () => {
    expect(nestingDepth('<ul>' + '<li>item<br><img src=a>'.repeat(5000) + '</ul>')).toBe(1);
    expect(nestingDepth('<p>a<p>b<p>c<div><span>x</span></div>')).toBe(2);
    expect(nestingDepth('<div><svg><path/></svg></div>')).toBe(2);
    // Tag-like text in scripts, styles and comments is not markup.
    const js = `<script>const t = "${'<div>'.repeat(5000)}";</script>`;
    expect(
      nestingDepth(`<main>${js}<style>a::before{content:"<b>"}</style><!-- <div> --></main>`),
    ).toBe(1);
  });

  test('routing query parameters are kept; tracking parameters are dropped for dedupe', () => {
    const links = [
      { url: 'https://corp.test/?page=team', text: 'Our team' },
      { url: 'https://corp.test/about?utm_source=x&fbclid=y', text: 'About' },
      { url: 'https://corp.test/about', text: 'About us' },
    ];
    const pages = selectPages(links, 'https://corp.test/', new Set(['https://corp.test/']));
    expect(pages.map((p) => p.url)).toEqual([
      'https://corp.test/?page=team',
      'https://corp.test/about',
    ]);
  });
});
