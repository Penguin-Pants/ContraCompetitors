# Operations

## Blocklist and takedown (SEC-5)

Takedown and blocklist requests arrive at `CONTACT_EMAIL` (footer link "Takedown or blocklist request").

1. Check the request comes from the site owner or a person shown on the site.
2. Block the domain:
   `npm run blocklist -- add example.com`
   On Railway, run it in the service shell (same `DATA_DIR`).
3. Reply to the requester.

Effect:

- The entry is stored in canonical form (lower case, punycode, no trailing dot). `add Example.COM.` stores `example.com`.
- A blocked entry matches the domain and every subdomain (`www.example.com`), not look-alikes (`notexample.com`).
- New ingestions of the domain are rejected at once with `blocked_domain`, including redirects to it and pages or images served from it.
- Cached faces are purged by the server's minute sweep within 1 minute: every cache entry whose key or any source host matches.
- `npm run blocklist -- list` shows entries; `remove <domain>` removes one.

## Face data lifetime (C-1, ING-9, D-2)

| Data | Where | Lifetime |
|---|---|---|
| Site faces | Server process memory only (LRU, 256 MB cap) | Read TTL 23 h; minute sweep, so at most 23 h 1 min; gone on any restart or redeploy |
| Uploaded faces | Request memory only | Never stored; never cached |
| Faces in the browser | Page memory | Until the tab closes |
| `DATA_DIR` (SQLite) | Volume | Holds scores, blocklist and rate events only. No face data, names, alt text or page URLs. |

## Rate limits

| Limit | Value | Notes |
|---|---|---|
| Ingestions | 5 per IP per hour | Sliding window in SQLite. Only requests that fetch the site count; cache hits, invalid URLs and blocked domains do not (Q-2). |
| Uploads | 20 requests per IP per hour | Abuse limit for detection CPU. |
| Storage | SHA-256 of the IP only | Events older than 1 hour are deleted on insert and by the minute sweep. |

`TRUST_PROXY_HOPS` must match the proxies in front of the server (Railway: `1`). With a wrong value every player shares one IP.

## Fetch limits (SEC-1 to SEC-3)

Public `http` and `https` only, global unicast IPs only (checked on every redirect hop, connection pinned to the checked address), max 5 redirects, HTML 2 MB, CSS 1 MB, image 5 MB, 40 MB per ingestion, 30 s per ingestion, 150 image candidates with 4 in flight. Headless Chromium: every request goes through the same fetch; images are never fetched by the browser; 200 other requests, 6 in flight, 2 sessions at once.

## Logs

Structured Fastify logs. Ingestion logs hold the domain, outcome code, internal reason (for example the blocked address class), duration, face count and source. They never hold faces, file names, alt text, captions or page URLs of faces.

## Health and restarts

- Health check: `GET /api/health`.
- One instance only (SQLite and in-process headless queue).
- Rollback: redeploy the previous image. Migrations are additive and tracked by file name, so an older image runs on a newer schema.
