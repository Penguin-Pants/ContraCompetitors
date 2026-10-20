# Logistics Run

A retro run-and-gun browser game. The player enters a company URL. The game themes itself with the brand colors and employee faces of that site. Fastest runs go on a global Top 10.

- Requirements: [`docs/requirements/logistics-run-requirements.md`](docs/requirements/logistics-run-requirements.md)
- Build plan and status: [`docs/build-plan.md`](docs/build-plan.md)

## Setup

1. `cp .env.example .env`
2. `npm install`
3. `npm run dev` (server on port 3000, Vite on port 5173 with `/api` proxied)

Requires Node 22 (see `.nvmrc`, at least 22.19). The server runs TypeScript directly with Node type stripping. There is no server build step.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Server with `--watch` and the Vite dev server |
| `npm run build` | Builds the client to `client/dist` |
| `npm start` | Runs the server. It serves `client/dist` and `/api` from one process. |
| `npm test` | Vitest unit and integration tests |
| `npm run e2e` | Playwright tests. Builds the client and starts the server on port 4173. |
| `npm run lint` | ESLint and Prettier check |
| `npm run typecheck` | `tsc` for `shared`, `server`, `client` and `e2e` |
| `npm run blocklist -- add\|remove\|list [domain]` | Manages the domain blocklist in `DATA_DIR` (see `docs/operations.md`) |

## Environment variables

| Name | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | Directory for the SQLite database (`app.db`). Holds no face data. |
| `CONTACT_EMAIL` | none, required | Plain takedown address (no `mailto:`), shown in the footer. The server refuses to start without a valid value. |
| `TRUST_PROXY_HOPS` | `0` | Reverse proxies in front of the server (Railway: `1`), so rate limits see the client IP. |
| `SOURCE_URL` | none, required | `https` URL of the public source repository (AGPL section 13). Required at startup. |

## Docs

- [`docs/architecture.md`](docs/architecture.md): layer stack, data flow, security model
- [`docs/operations.md`](docs/operations.md): blocklist and takedown, face data lifetime, rate limits, logs
- [`docs/art-pipeline.md`](docs/art-pipeline.md): Sprite Fusion workflow and sprite contract
- [`docs/launch-checklist.md`](docs/launch-checklist.md): gates before public launch

## Deploy (Docker and Railway)

The `Dockerfile` builds on `mcr.microsoft.com/playwright:v1.56.1-noble` (Chromium included). The entrypoint fixes the `DATA_DIR` volume owner and runs the server as the non-root `pwuser`.

1. `sh deploy/smoke-docker.sh` builds the image and checks health, the server UID, the Chromium sandbox and a restart (CI runs it too).
2. Railway: one service from this repository (Dockerfile build), one volume mounted at `/data`, health check path `/api/health`.
3. Set env vars: `DATA_DIR=/data`, `CONTACT_EMAIL`, `SOURCE_URL`, `TRUST_PROXY_HOPS=1` (`PORT` comes from Railway).
4. Run the sandbox check in the service shell: `node server/src/cli/checkSandbox.ts`. See `docs/launch-checklist.md` item 5 if it fails.
5. Run the production smoke test: `PROD_URL=https://<domain> CONTACT_EMAIL=... SOURCE_URL=... PROD_SITE=https://<company> npm run e2e`.

Run one instance only (SQLite and an in-process headless queue). Roll back by redeploying the previous image.

## License

GNU AGPL-3.0. See [`LICENSE`](LICENSE).
