/** Fetch limits in one place (SEC-3, ING-8). */
export const LIMITS = {
  /** Whole ingestion budget, shared by every step. */
  ingestionMs: 30_000,
  maxRedirects: 5,
  /** Per-request socket and header timeouts. The ingestion signal still applies. */
  requestHeadersMs: 10_000,
  requestBodyMs: 10_000,
  bodyBytes: {
    html: 2 * 1024 * 1024,
    css: 1 * 1024 * 1024,
    image: 5 * 1024 * 1024,
    /** Scripts, JSON and other subresources in the headless browser. */
    any: 2 * 1024 * 1024,
  },
  /** Total bytes fetched for one ingestion. */
  ingestionBytes: 40 * 1024 * 1024,
} as const;

export type BodyKind = keyof typeof LIMITS.bodyBytes;
