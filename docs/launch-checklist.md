# Launch checklist

Public announcement waits until every item is checked.

| # | Item | Status | Evidence or owner |
|---|---|---|---|
| 1 | Read the Sprite Fusion terms for use of generated assets (C-4) | ☐ Open | Product owner. Needed once Phase 10 art exists. |
| 2 | Final art from Sprite Fusion replaces placeholder characters and props (Phase 10) | ☐ Open | Blocked on the Sprite Fusion OAuth sign-in. See `docs/art-pipeline.md`. |
| 3 | YuNet model license confirmed | ☑ Done | MIT, `server/models/LICENSE-yunet`, source and SHA-256 in `server/models/README.md` |
| 4 | All dependency licenses AGPL-compatible | ☑ Done | Production deps: MIT, BSD-2/3, Apache-2.0, ISC, 0BSD, CC0, BlueOak-1.0.0 (permissive), LGPL-3.0-or-later (libvips via sharp). Re-check on dependency changes. |
| 5 | Chromium sandbox runs on the production host, or headless runs as an isolated service | ☐ Open | Run `node server/src/cli/checkSandbox.ts` as `pwuser` in the Railway shell. It needs the Playwright seccomp profile (`deploy/seccomp_profile.json`) or an equivalent. If it fails, headless retry stays off (the server logs the launch error and serves static results) until a separate headless service with no volume and no secrets exists. Do not use `--no-sandbox`. |
| 6 | Railway service, volume at `/data`, env vars set | ☐ Open | `PORT`, `DATA_DIR=/data`, `CONTACT_EMAIL`, `SOURCE_URL`, `TRUST_PROXY_HOPS=1`. Needs a Railway project, token and domain. |
| 7 | Production smoke test passes | ☐ Open | `PROD_URL=... CONTACT_EMAIL=... SOURCE_URL=... PROD_SITE=... npm run e2e` (`e2e/production.spec.ts`) |
| 8 | SUC-1 by a human tester on the deployed URL | ☐ Open | Enter a real URL, play, see the time on the Top 10 |
| 9 | Restart check on production: scores survive, face cache empty, `DATA_DIR` has no image files | ☐ Open | Same checks as `deploy/smoke-docker.sh` (passes in CI) |
| 10 | Manual Medium playtest: 3 runs by a competent player, 60 to 120 s (SUC-1, LVL-4) | ☐ Open | Record times in the PR. Bot proxy: 63.6 s. |
| 11 | Source code link points to the public repository (AGPL section 13) | ☐ Open | Set `SOURCE_URL`; the smoke test checks the link resolves. |
