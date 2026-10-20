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
| `npm run typecheck` | `tsc` for `shared`, `server` and `client` |

## Environment variables

| Name | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | Directory for the SQLite database (`app.db`) |

## License

GNU AGPL-3.0. See [`LICENSE`](LICENSE).
