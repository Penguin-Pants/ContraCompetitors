export interface PageMeta {
  /** Plain address, no scheme. The client adds `mailto:`. */
  contactEmail: string;
  /** https URL of the public source repository (AGPL section 13). */
  sourceUrl: string;
}

const EMAIL_RE = /^[^\s@:<>"'/\\]+@[^\s@:<>"'/\\]+\.[^\s@:<>"'/\\]+$/;

export function isPlainEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll("'", '&#39;');
}

/** Adds the contact-email and source-url meta tags before `</head>`. */
export function injectMeta(html: string, meta: PageMeta): string {
  const tags =
    `<meta name="contact-email" content="${escapeHtml(meta.contactEmail)}" />\n` +
    `    <meta name="source-url" content="${escapeHtml(meta.sourceUrl)}" />\n  `;
  if (!html.includes('</head>')) throw new Error('index.html has no </head>');
  return html.replace('</head>', `${tags}</head>`);
}
