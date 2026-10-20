# Logistics Run: Build Plan

**Source of truth:** [`docs/requirements/logistics-run-requirements.md`](requirements/logistics-run-requirements.md) (v2, "Decision-complete").
**Status:** Phases 1 to 9 implemented; Phase 10 art blocked; Phase 11 repo work done, deploy blocked. See section 7.
**Scope:** Plan and implementation record.

---

## 0. Read this first

### 0.1 Repository baseline

- The repository contains only `LICENSE` (GNU AGPL-3.0) and one commit. There is no code, no `AGENTS.md`, no CI and no docs.
- All paths in this plan are new. The stack choice is free (requirements section 3 says "Node on Railway" is an example only).
- AGPL-3.0 has a network-use clause (section 13). A public hosted game must offer its source to users. Phase 11 adds a source link. All dependencies must have AGPL-compatible licenses (MIT, BSD, Apache-2.0, ISC are compatible).

### 0.2 Decisions confirmed with the product owner (this session)

| ID | Question | Decision |
|---|---|---|
| Q-1 | Spec conflict: 2.4 puts the pixel layer above all high-res layers. 2.3 puts Smooth faces on a high-res layer above the pixel-art body. | Add a third layer. Stack (bottom to top): high-res background, pixel layer, high-res face overlay, DOM UI. Smooth faces draw over bodies and over any pixel art in front of them. |
| Q-2 | Does a cache hit count toward the 5 ingestions per IP per hour? | No. Only requests that fetch the target site count. |
| Q-3 | Plan location. | `docs/build-plan.md` |
| I-1 | "Faces go on random enemies": which enemies get a face? | Every enemy. The game assigns faces from a shuffled list. A face repeats only when there are fewer faces than enemies. |
| I-2 | Do uploads after partial ingestion add to or replace site faces? | Add to. The run uses site faces plus uploads. |
| I-3 | Does "Play again" reuse loaded data or ingest again? | Reuse. Same faces, uploads and colors from browser memory. No new ingestion. |
| Q-4 | The spec defines when the timer stops, not when it starts. | The timer starts on the first gameplay key press (A, D, W, S or Space) after the level is shown. Load time does not count. Esc does not start it. Each restart (0 lives or Restart level) waits for a new first press. |

### 0.3 Interpretations (no product change, flag if wrong)

- **I-4 Respawn in place:** the level has no bottomless pits, so "in place" is always a valid position.

### 0.4 Requirement IDs

The source document has no IDs. This plan assigns them. Section numbers match the source.

| Prefix | Source | Prefix | Source |
|---|---|---|---|
| SUC | 1 Success | LIV | 2.8 Lives, difficulty, timer |
| DEL | 2.1 Delivery | LVL | 2.9 Level |
| ING | 2.2 Ingestion | PAU | 2.10 Pause |
| THM | 2.3 Theming and faces | LB | 2.11 Scoreboard |
| RND | 2.4 Rendering and art | SEC | 2.12 Security and privacy |
| CTL | 2.5 Controls | E | 5 Edge cases (table rows 1 to 12) |
| WPN | 2.6 Weapons | C | 6 Constraints |
| ENM | 2.7 Enemies | D | 8 Defaults |

Full list with text: section 9 (traceability).

---

## 1. Architecture summary

### 1.1 Stack (engineering decisions)

| Area | Choice | Reason |
|---|---|---|
| Language | TypeScript everywhere | One language for client, server and shared types. |
| Repo layout | npm workspaces: `client/`, `server/`, `shared/` | Shared types for API payloads and initials validation. |
| Client build | Vite | Fast dev server, static output that the server can host. |
| Game engine | None. Custom Canvas 2D loop | The layer stack (Q-1) and the pixel rules need direct canvas control. An engine adds weight and fights the custom compositing. |
| Server | Node 22 LTS + Fastify | Small, typed, good plugin set (multipart, static, rate data). |
| HTTP fetch (server) | `undici` with a custom DNS lookup and a pinned connect | Required for SSRF control (SEC-2). |
| IP checks | `ipaddr.js` | Range classification for IPv4 and IPv6. |
| HTML / CSS parse | `parse5` (or `cheerio`) + `css-tree` | Link discovery and color extraction. |
| Color math | `culori` | OKLCH adjust and contrast. |
| Image decode and crop | `sharp` | Validates image content, crops, strips metadata. |
| Face detection | `onnxruntime-node` + YuNet ONNX model (OpenCV Zoo) | Detection only. No recognition model is shipped (SEC-4). Verify the model license (expected MIT) in Phase 8 before commit. |
| Headless browser | Playwright Chromium | Retry path (ING-5). Pre-installed in the Playwright Docker image. |
| Storage | SQLite (`better-sqlite3`) on a persistent volume; face cache in process memory only | SQLite holds leaderboard, blocklist and rate events. No face data on disk. One instance. No extra service. |
| Audio | Web Audio API, SFX synthesized in code | No third-party audio assets, no license risk. |
| Tests | Vitest (unit, server integration), Playwright Test (E2E) | |
| Deploy | Docker image based on `mcr.microsoft.com/playwright` + Railway with one volume | Railway is the stated example. The Docker image keeps the stack portable. |

### 1.2 Render layer stack (RND-2, THM-4, THM-5, Q-1)

```
top    L3  DOM UI          HUD, menus, footer (high-res, crisp text)
       L2  face canvas     Smooth faces only (device resolution)
       L1  pixel canvas    ALL pixel art: tiles, props, characters, projectiles,
                           particles, VFX, Pixelated faces. imageSmoothing off.
bottom L0  bg canvas       Fixed-palette backdrop and light glows (device resolution)
```

- **Art grid:** 480 x 270 art pixels (16:9).
- **Pixel canvas (L1):** 960 x 540. Every art sprite draws at exactly 2x on L1. This gives a grid that is finer than world pixels for Pixelated faces (THM-5). Pixelated faces use 1 L1 pixel = 1/2 art pixel.
- **Upscale:** L1 scales to the screen by integer factor `k = min(K_MAX, max(1, floor(min(viewportW / 960, viewportH / 540))))` with `K_MAX = 4`; larger viewports center the stage with a fixed-palette border. The face layer L2 caps its backing-store DPR at `DPR_MAX = 2`. Both caps bound the largest on-screen head, which sets the face crop size (Phase 8). with CSS `image-rendering: pixelated`. The `max(1, ...)` keeps `k >= 1` when the viewport is shorter than 540 CSS px; the stage then keeps k=1 and the page scrolls vertically (the spec defines no short-window message). If the viewport is narrower than 960 CSS px, the game shows "Make the window wider to play" (E-12).
- **Rotation (RND-3):** a rotated sprite first rotates into a scratch canvas at art resolution (nearest neighbor), then blits at 2x onto L1. Pixels stay on the art grid.
- **Camera:** snaps to whole art pixels. L2 uses the same snapped camera so Smooth faces stay locked to their bodies.
- **Smooth face draw order:** L2 is above L1. A Smooth face draws over its body and over any pixel art in front of it (accepted in Q-1).

### 1.3 Runtime data flow

```
Main menu (URL, difficulty, face style)
   -> POST /api/ingest {url}
        validate URL -> blocklist -> cache hit? -> return (free, Q-2)
        rate limit (counts here) -> static crawl (CSS colors, pages, images)
        -> detect + crop faces -> <5 faces? headless retry -> cache -> return
        (30 s budget, partial on timeout)
   -> client: color resolve (picker / auto-adjust) -> faces < 5? upload or skip
        upload -> POST /api/faces/upload (memory only, never cached)
   -> run start: face quality check (Auto) -> play
   -> exit -> post-game -> GET /api/leaderboard/:difficulty -> initials? -> POST
```

### 1.4 Planned repository layout

```
package.json                 workspaces, root scripts
tsconfig.base.json
.github/workflows/ci.yml
Dockerfile
README.md
docs/
  build-plan.md              this file
  architecture.md
  operations.md              blocklist, takedown, cache, rate limit
  art-pipeline.md            Sprite Fusion workflow
  launch-checklist.md
shared/src/
  api.ts                     request and response types
  difficulty.ts              Difficulty enum
  initials.ts                3-letter filter (used by client and server)
server/src/
  index.ts  app.ts  config.ts
  db/        db.ts  migrations/
  net/       safeFetch.ts  ipPolicy.ts  limits.ts
  ingest/    pipeline.ts  colors.ts  crawl.ts  headless.ts  images.ts
  faces/     detector.ts  crop.ts
  cache/     faceCache.ts  sweeper.ts  (in memory, no disk)
  routes/    ingest.ts  upload.ts  leaderboard.ts  health.ts  indexHtml.ts
  jobs/      minuteJob.ts
  policy/    blocklist.ts  rateLimit.ts
  cli/       blocklist.ts
server/models/               yunet .onnx + LICENSE
server/test/                 unit + integration + fixtures
client/index.html
client/src/
  main.ts
  render/    layers.ts  pixelCanvas.ts  rotate.ts  faceLayer.ts  camera.ts
  engine/    loop.ts  input.ts  physics.ts  collision.ts
  game/      world.ts  player.ts  enemies.ts  weapons.ts  projectiles.ts
             pickups.ts  lives.ts  timer.ts  difficulty.ts  spawn.ts
  level/     tilemap.ts  zones.ts  levelData.ts  tilesDraw.ts
  theme/     palette.ts  readability.ts  tint.ts  colorPicker.ts
  faces/     faceStore.ts  quality.ts  pixelate.ts  assign.ts  placeholders.ts
  vfx/       particles.ts  gore.ts  facePop.ts  explosions.ts  laser.ts
  audio/     sfx.ts  audio.ts
  ui/        mainMenu.ts  loading.ts  upload.ts  errors.ts  pause.ts
             hud.ts  postGame.ts  leaderboard.ts  footer.ts  about.ts  narrowGuard.ts
  api/       client.ts
  assets/    manifest.ts  loader.ts
client/public/assets/sprites/  committed Sprite Fusion PNGs
client/test/  unit
e2e/          Playwright specs
```

---

## 2. Phases

Phase order follows real dependency. Phases 2 to 5 build the game with local fixtures. Phases 6 to 9 build the backend and connect it. Phase 10 swaps in final art. Phase 11 ships.

```
P1 -> P2 -> P3 -> P4 -> P5 -----------------> P9 -> P11
P1 ------------------------> P6 (leaderboard) -^      ^
P1 -> P7 (secure fetch) -> P8 (ingestion) -----^      |
P2 -> P10 (art, needs Sprite Fusion sign-in) ---------'
```

---

### Phase 1: Project scaffold and CI

**Goal**
`npm install`, `npm run dev`, `npm test` and `npm run e2e` all work. The server hosts the built client. CI runs on every push.

**Requirements covered**
DEL-1 (foundation only).

**Changes**
- Create root `package.json` (workspaces `client`, `server`, `shared`), `tsconfig.base.json`, ESLint + Prettier config, `.gitignore`, `.nvmrc` (Node 22).
- Create `shared/src/difficulty.ts`: runtime array `DIFFICULTIES = ['easy', 'medium', 'hard'] as const` and `type Difficulty = typeof DIFFICULTIES[number]`. Server route schemas and client menus import the array, so the values exist at runtime.
- Create `server/src/app.ts` (Fastify factory, injectable config for tests), `server/src/index.ts`, `routes/health.ts` (`GET /api/health`).
- Create `server/src/db/db.ts`: SQLite at `${DATA_DIR}/app.db` (`better-sqlite3`) and a migration runner (SQL files in `server/src/db/migrations/`, run at startup). The runner records each applied file name in a `schema_migrations` table and applies every file not yet recorded, in name order. For each file, the migration SQL and the `schema_migrations` insert run in the same transaction, so a crash leaves the file either fully applied and recorded or not applied at all. It does not use a single version number, so phases can land in any order. Migrations touch only their own tables. No tables yet. Phases 6 and 7 each add their own migration files.
- Serve `client/dist` with `@fastify/static` in production. Vite proxies `/api` in dev.
- Create `client/index.html`, `client/src/main.ts` (blank canvas stack placeholder).
- Create `.github/workflows/ci.yml`: install, lint, typecheck, Vitest, Playwright E2E (Chromium).
- Create `README.md` with setup, scripts and env vars table (start with `PORT`, `DATA_DIR`).
- Create `.env.example` with valid dev values (`CONTACT_EMAIL=takedown@example.com`, `SOURCE_URL=https://github.com/Penguin-Pants/ContraCompetitors`). The `dev` and `start` scripts run Node with `--env-file-if-exists=.env`, and Vite reads `.env` itself. Setup is `cp .env.example .env` (README step 1). Playwright `webServer.env` and the CI workflow set the same fixed values directly, so tests never depend on a local `.env`.

**Implementation notes**
- `createApp(config)` must accept dependency overrides (DNS resolver, clock, data dir). Later phases need this for tests (SSRF tests use a local fixture server, which the production IP policy blocks).
- Keep the override surface code-only. Never expose it through env vars.

**Tests**
- Vitest: health route returns 200.
- Vitest: migration runner applies files in name order once; a second start applies nothing; a lower-numbered file added after higher ones were applied (Phase 6 landing after Phase 7) is still applied; a failing file rolls back and stops startup; a simulated crash after the SQL but before commit leaves no table and no record, and the next start applies the file once.
- Playwright: home page loads with no console errors.

**Acceptance criteria**
- CI is green on a clean clone.
- On a clean clone, `cp .env.example .env && npm install && npm run build && npm start` serves the client and `/api/health` from one process.

**Dependencies**
None.

---

### Phase 2: Pixel renderer, input and game loop

**Goal**
A test scene shows a code-drawn sprite moving, rotating and scaling with crisp pixels on the 4-layer stack. Keyboard input works. The narrow-window guard works.

**Requirements covered**
DEL-3, RND-1, RND-2, RND-3, RND-6 (code-drawn path), CTL-1, CTL-2, E-12.

**Changes**
- `client/src/render/layers.ts`: create L0 to L3 (section 1.2), resize handling, integer scale `k`, `devicePixelRatio` handling for L0 and L2.
- `client/src/render/pixelCanvas.ts`: 960 x 540 canvas, `imageSmoothingEnabled = false`, `drawSprite(x, y, frame, flip)` at 2x, integer coordinates only.
- `client/src/render/rotate.ts`: rotate at art resolution into scratch canvas, then blit at 2x.
- `client/src/render/camera.ts`: follow target, snap to art pixels.
- `client/src/engine/loop.ts`: fixed 60 Hz update, render on `requestAnimationFrame`, frame delta clamp.
- `client/src/engine/input.ts`: map `KeyboardEvent.code` (`KeyA`, `KeyD`, `KeyW`, `KeyS`, `Space`, `Escape`). Ignore arrow keys. `preventDefault` on Space. Clear held keys on window `blur`.
- `client/src/ui/narrowGuard.ts`: when viewport width < 960 CSS px, show "Make the window wider to play" and freeze the game (same freeze as pause).
- `client/src/assets/manifest.ts`: sprite contract used by placeholder art now and by Phase 10 art later. Headless bodies, one head anchor point per frame, enemy clothing in a reserved neutral gray ramp, player highlight in a second reserved ramp, frame lists per animation.
- Desktop-only: no touch handlers. No mobile layout work.

**Implementation notes**
- Use `KeyboardEvent.code` so the layout (AZERTY and others) does not change physical key positions. Rebinding stays out of scope.
- Freezing during the narrow guard prevents damage while the player cannot see the game. This is a safety choice, not a new feature.

**Tests**
- Unit: scale factor `k` for sample viewports (959 px wide gives guard, 960 x 540 gives k=1, 960 x 539 gives k=1 and no guard, 1920 x 1080 gives k=2).
- Unit: input map ignores `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`.
- E2E pixel check: read back L1 after upscale (screenshot of the canvas element). Every `2k x 2k` block that maps to one art pixel has one color. Run with a rotated sprite on screen.
- E2E: resize to 900 px wide shows the narrow message; resize back hides it.

**Acceptance criteria**
- Pixel check passes at k=1 and k=2, including a sprite rotated 30 degrees.
- No `imageSmoothingEnabled = true` and no non-integer draw coordinates on L1 (lint rule or code review checklist).
- E-12 behavior as described.

**Dependencies**
Phase 1.

---

### Phase 3: Level, movement, timer and exit

**Goal**
The player runs, jumps and drops through one continuous three-zone warehouse level built from code-drawn tiles. A ms timer runs and stops at the exit shutter door.

**Requirements covered**
CTL-1 (A/D, W, S), LVL-1 to LVL-5, LIV-6 (timer display and stop), RND-6 (tiles drawn in code).

**Changes**
- `client/src/level/tilemap.ts`: solid tiles and one-way platforms.
- `client/src/level/levelData.ts`: one authored level. Zone 1 Storage Aisle (racking step platforms, pallets, boxes). Zone 2 Shipping Dock and Truck Lot (terminal doors, trucks, trailers, containers as tiered platforms). Zone 3 Receiving Bay Entrance (processing lanes, conveyor belts, terminal steps; pick any per section 3) ending at a large shutter door labeled "RECEIVING ZONE".
- `client/src/level/zones.ts`: zone boundaries, background palette per zone (fixed cold/warm palette from section 3, independent of brand colors).
- `client/src/level/tilesDraw.ts`: code-drawn tiles. Structural accents use a theme slot (filled in Phase 5, gray until then).
- `client/src/engine/physics.ts`, `collision.ts`: gravity, AABB vs tiles, one-way platforms.
- `client/src/game/player.ts`: A/D move, W jump onto platforms, S drop through one-way platforms, facing direction.
- `client/src/game/timer.ts`: shows `0:00.000` until the first gameplay key press (Q-4), then accumulates unpaused frame time, display `m:ss.mmm`, stops on first contact with the exit boundary.
- `client/src/ui/hud.ts`: timer on L3.
- No bottomless pits (I-4).

**Implementation notes**
- Timer uses accumulated real delta (ms precision), not the fixed step count. It adds nothing while paused or frozen.
- Size the level for a skilled Medium run of about 60 to 120 s (LVL-4). Target a pure traversal time (no enemies) of about 45 to 60 s. Combat adds the rest. Tune in Phase 4.

**Tests**
- Unit: one-way platform: W lands on it from below, S drops through it, solid tiles block both.
- Unit: timer formats 61234 ms as `1:01.234`; timer stops at exit and ignores later frames.
- Unit: timer stays at 0 with no input and after Esc alone; starts on the first A, D, W, S or Space; a restart returns it to the waiting state (Q-4).
- E2E: scripted input run from start to exit completes and shows a stopped timer.

**Acceptance criteria**
- The level has three zones in the order of LVL-1 to LVL-3 and ends at the labeled shutter door.
- Scripted traversal time (no enemies) is between 40 and 70 s.
- Arrow keys do nothing.

**Dependencies**
Phase 2.

---

### Phase 4: Combat, enemies, lives, difficulty and pause

**Goal**
A full playable run with placeholder art: weapons, briefcase pickups, enemies, defeat VFX, lives, three difficulties and the pause menu (Resume and Restart level).

**Requirements covered**
CTL-1 (Space), CTL-1 (Esc), WPN-1 to WPN-4, ENM-1 to ENM-3, LIV-1 to LIV-5, LVL-5, PAU-1, PAU-2, PAU-3 (Resume, Restart), PAU-4, RND-3, RND-4.

**Changes**
- `client/src/game/weapons.ts`:
  - Standard Pistol (start): one straight projectile.
  - Spread Gun: three projectiles at -15, 0 and +15 degrees from the facing direction.
  - Laser Rifle: while Space is held, a horizontal beam in the facing direction. Ray-cast to the first solid tile. Damages every enemy on the line (pierce). High damage per second.
- `client/src/game/projectiles.ts`: player and enemy projectiles, solids block them, rotated sprites via `rotate.ts`.
- `client/src/game/pickups.ts`: floating briefcase containers. Collect replaces the current weapon.
- `client/src/game/enemies.ts`: two types. Walker (contact damage). Shooter (contact damage + fires at player). Health per type (implementer: walker 2 HP, shooter 3 HP, pistol 1 damage, as a start).
- `client/src/game/spawn.ts` + `difficulty.ts`: spawn points activate as the camera nears. Table per difficulty:

  | | Easy | Medium | Hard |
  |---|---|---|---|
  | Enemy speed multiplier | 0.7 | 1.0 | 1.35 |
  | Active spawn points | 50% | 75% | 100% |
  | Shooter fire interval | 1.5x | 1.0x | 0.7x |

  Values are starting points. Tune by playtest.
- `client/src/game/lives.ts`: 3 lives. Hit costs 1. Respawn in place with ~1.5 s invulnerability (blink). Weapon resets to Pistol. At 0 lives: level restart, lives 3, timer 0, enemies and pickups reset.
- `client/src/vfx/`: pixel-hit flash, light gore particles from bodies, explosions, laser beam. All on L1.
- `client/src/ui/pause.ts`: Esc opens, Esc resumes. Items Resume and Restart level now. Main menu and Sound toggle land in Phase 5.
- Placeholder enemy heads: `client/src/faces/placeholders.ts` (code-drawn pixel heads). Used until Phase 5 and kept for E-8.

**Implementation notes**
- Ammo model (section 9): unlimited ammo for all weapons. A weapon lasts until a new pickup or a lost life. Fewest rules, no extra HUD.
- Power-up count and placement (section 9): about 2 to 3 per zone. Tune by playtest.
- Pause freezes the update step, the timer, particles and audio scheduling. Render still runs for the menu.
- Enemies do not block level completion (LVL-5). There is no boss.

**Tests**
- Unit: Spread angles are symmetric around facing direction for both facings.
- Unit: Laser stops at the first solid tile and damages all enemies before it, none after it.
- Unit: hit during invulnerability costs no life; hit after costs one and resets weapon to Pistol.
- Unit: 0 lives resets lives to 3, timer to 0 and player to the start.
- Unit: difficulty table: Hard speed > Medium > Easy; active spawns Hard >= Medium >= Easy.
- E2E: press Esc, wait 2 s, timer value and player position do not change; press Esc, they change again.
- E2E: Restart level from pause resets timer to 0 and lives to 3.
- Manual playtest (3 runs on Medium by a competent player): record times.

**Acceptance criteria**
- All unit and E2E tests above pass.
- Medium playtest times fall between 60 and 120 s (SUC-1, LVL-4). Record results in the PR.
- Gore, pixel hit, explosions and laser render on L1 (pixel check from Phase 2 passes during combat).

**Dependencies**
Phase 3.

---

### Phase 5: Theming, face rendering, menus, audio and post-game shell

**Goal**
The game themes itself from a color pair and a face list (local fixtures for now). Faces render in Smooth, Pixelated and Auto mode. Main menu, full pause menu, sound, post-game screen (without leaderboard) and footer exist.

**Requirements covered**
DEL-4, ING-1 (menu UI), ING-2, THM-1 to THM-8, RND-4 (face pop), ENM-3, PAU-3 (all items), LB-5, SEC-5 (footer link UI), E-5, E-6, E-8, E-9, D-1, D-4, D-5, D-6.

**Changes**
- Theme:
  - `client/src/theme/palette.ts`: `{primary, secondary}` slots. Primary: player highlights, structural level accents, UI highlights (CSS variables on L3). Secondary: enemy clothing, secondary environment textures.
  - `client/src/theme/readability.ts`: in OKLCH, adjust lightness and chroma until each color has contrast >= 3:1 against the fixed zone backdrops and the two colors differ by a minimum OKLab distance (start: 0.12). If one color is missing, derive it from the other (hue offset ~150 degrees, then the same adjust). Pure function.
  - `client/src/theme/colorPicker.ts`: modal with two `<input type="color">`, opens when no color is available (E-5).
  - `client/src/theme/tint.ts`: at load, recolor sprite pixels in reserved gray ramps (clothing ramp for enemies to secondary, highlight ramp for player to primary). Cache tinted sheets.
- Faces:
  - `client/src/faces/faceStore.ts`: in-memory list of `{id, bitmap, srcWidth, srcHeight, origin: "site" | "upload"}`. `id` is the server-assigned face id (SHA-256 of the crop bytes) for site and uploaded faces alike. It never changes for the life of the store.
  - `client/src/faces/assign.ts`: shuffle, assign one face per enemy, cycle when faces < enemies (THM-3, I-1). Zero faces: placeholder heads (E-8).
  - `client/src/faces/quality.ts`: at run start, a face passes if `srcWidth >= onScreenHeadWidthDevicePx` (D-5). Auto: more than half pass gives Smooth for all, else Pixelated for all. Override forces one style for all faces, uploads included (THM-6, THM-7, E-9).
  - `client/src/render/faceLayer.ts`: Smooth faces on L2 at device resolution, anchored to the head anchor of the current body frame.
  - `client/src/faces/pixelate.ts`: Pixelated faces downsample to the head size in L1 pixels (1/2 art pixel grid) and draw on L1.
  - `client/src/vfx/facePop.ts`: non-gory pop (scale up, then burst of pixel confetti in face-sampled colors). Draws on L1. The Smooth face hides when the pop starts.
- Menus and UI (L3, DOM):
  - `client/src/ui/mainMenu.ts`: URL field, difficulty (Easy, Medium, Hard), Face style (Auto default, Smooth, Pixelated), Start. Face style is not persisted (resets to Auto each visit, D-4).
  - `client/src/ui/pause.ts`: add Main menu and Sound toggle (D-6).
  - `client/src/ui/postGame.ts`: show final time, Play again (same site, difficulty and face data, I-3) and Main menu. Leaderboard slot is empty until Phase 9.
  - `server/src/routes/indexHtml.ts`: serves `index.html` with `<meta name="contact-email">` and `<meta name="source-url">` filled from the env vars `CONTACT_EMAIL` and `SOURCE_URL` (HTML-escaped). `CONTACT_EMAIL` is a plain address (`takedown@example.com`, no scheme); `SOURCE_URL` is an `https` URL. The server refuses to start if either is missing or invalid. The values arrive with the page, so there is no separate config request that can fail, and the image needs no rebuild when values change. Vite dev server injects the same tags from `.env`.
  - `client/src/ui/footer.ts`: About link, takedown and blocklist request link (`href` = `"mailto:" + contactEmail`; the client never receives a value that already has a scheme) and Source code link (from `source-url`).
  - `client/src/ui/about.ts`: About view (DOM overlay). It explains the game, the 24 h face cache, no recognition and the takedown process, and repeats both links.
- Audio: `client/src/audio/sfx.ts` (synth SFX: shoot, spread, laser loop, hit, enemy pop, pickup, jump, life lost, exit). Default state: on. Audio context starts on first keypress (browser autoplay rule). Sound state lives in memory for the visit.
- Dev fixtures: `client/src/dev/fixtures.ts` with sample colors and faces, loaded only by a dev query flag, so this phase is testable without the server.
- All UI text is English (D-1).

**Implementation notes**
- The sprite contract is defined in Phase 2 (`client/src/assets/manifest.ts`). `tint.ts` and `faceLayer.ts` read the reserved ramps and head anchors from it.
- Quality check uses device pixels (`css px * devicePixelRatio`) so Smooth is chosen only when the source is sharp enough.
- Face style decision is fixed for the run. A resize mid-run does not switch styles.

**Tests**
- Unit `readability`: one color in gives two readable colors out; two near-identical colors get separated; low-contrast color gets adjusted; already readable colors stay unchanged.
- Unit `quality`: 3 of 5 pass gives Smooth; 2 of 4 pass gives Pixelated (exactly half is not "most"); override wins; uploaded faces counted.
- Unit `assign`: 3 faces, 7 enemies, every enemy has a face, each face used 2 or 3 times; 0 faces gives placeholders.
- Unit `tint`: clothing ramp pixels map to secondary ramp; other pixels unchanged.
- E2E: start with fixture "no colors" opens the color picker; picked colors appear in the HUD accent.
- E2E: Smooth override draws faces on L2 and none on L1; Pixelated override draws none on L2.
- E2E: pause menu has exactly Resume, Restart level, Main menu, Sound; Main menu returns to the menu; Sound toggle mutes output (gain node at 0).
- E2E: post-game Play again starts a new run with the same difficulty, the same multiset of face ids in the store (compare sorted ids, not enemy order, since `assign.ts` shuffles) and the same selected colors, without a network call.
- Integration: `GET /` returns both meta tags with the configured values; server start fails when `CONTACT_EMAIL` or `SOURCE_URL` is missing or invalid. Server start also fails for `CONTACT_EMAIL=mailto:x@y.z`. E2E: footer takedown `href` equals exactly `mailto:` + the configured address; Source code `href` equals exactly `SOURCE_URL`; About link present.

**Acceptance criteria**
- All tests above pass.
- Visual review: primary appears on player highlights, structural accents and UI highlights; secondary on enemy clothing and secondary textures.

**Dependencies**
Phase 4.

---

### Phase 6: Leaderboard backend

**Goal**
A persistent global Top 10 per difficulty with a trust-based submit.

**Requirements covered**
LB-1, LB-2, LB-4, C-2.

**Changes**
- Migration `server/src/db/migrations/001_scores.sql`: table `scores(id INTEGER PRIMARY KEY, submission_id TEXT NOT NULL UNIQUE, difficulty, initials, time_ms, created_at)`, index on `(difficulty, time_ms, created_at)`. Uses the Phase 1 migration runner.
- `shared/src/initials.ts`: `/^[A-Za-z]{3}$/`, normalize to upper case.
- `server/src/routes/leaderboard.ts`:
  - Both routes validate `:difficulty` with a Fastify route schema `enum: DIFFICULTIES` (the runtime array from `shared/src/difficulty.ts`) and return 400 for any other value before any DB access.
  - `GET /api/leaderboard/:difficulty` returns Top 10 ordered by `time_ms` asc, then `created_at` asc.
  - `POST /api/leaderboard/:difficulty` body `{submissionId, initials, timeMs}`. `submissionId` is a UUID the client creates once per finished run and reuses on every retry. `scores.submission_id` has a unique index; a POST with a known id inserts nothing and returns the current Top 10 and the original row id. Checks: initials filter; `timeMs` is a positive integer (needed to store the value). No other checks (LB-4, C-2). Returns the new Top 10 and the new row id (or `null` if the row did not place).
  - Bounded storage: in one transaction, insert the row, then delete every row for that difficulty outside the Top 10. The table never holds more than 30 rows.
- All sites share one board per difficulty (no domain column).

**Implementation notes**
- Per-company boards and anti-cheat are non-goals. Do not add time bounds, signatures or replay data.
- Store no IP and no domain with scores.

**Tests**
- Integration: the same `submissionId` posted twice creates one row and both responses return the same row id.
- Integration: 12 submits on `medium` return 10 rows, fastest first; ties order by submit time; the table holds exactly 10 `medium` rows after the 12th submit.
- Integration: `"AB"`, `"ABCD"`, `"A1C"` give 400; `"abc"` is stored as `ABC`.
- Integration: boards are separate per difficulty.
- Integration: GET and POST on `/api/leaderboard/extreme` return 400 and write no row.
- Integration: data survives app restart on the same `DATA_DIR`.

**Acceptance criteria**
- All tests pass. API types live in `shared/src/api.ts`.

**Dependencies**
Phase 1.

---

### Phase 7: Secure fetch, blocklist and rate limit

**Goal**
A server fetch layer that only reaches public http(s) hosts, enforces size and type limits, rejects blocklisted domains and limits ingestions per IP.

**Requirements covered**
SEC-1, SEC-2, SEC-3, SEC-5 (rejection), ING-8 (rate limit), E-1, E-2, E-4, E-7, Q-2.

**Changes**
- `server/src/net/ipPolicy.ts`: allow only global unicast. Block loopback, private (RFC 1918), link-local (incl. 169.254.169.254), CGNAT 100.64/10, unspecified, broadcast, multicast, reserved, documentation ranges, ULA fc00::/7, IPv4-mapped and IPv4-compatible IPv6 of blocked IPv4, NAT64 `64:ff9b::/96`, 6to4 and Teredo forms of blocked addresses.
- `server/src/net/safeFetch.ts` (`undici`):
  - Scheme `http` or `https` only. Reject URLs with user info.
  - Resolve all A and AAAA records. Reject if any address is blocked. Connect to the validated address (custom `connect.lookup`), so a second DNS answer cannot change the target (DNS rebinding).
  - Manual redirects, max 5. Validate every hop with the same rules, including the domain blocklist on the hop's `canonicalHost`. A blocked hop fails the request with `blocked_domain`. Headless requests use `safeFetch`, so they get the same check.
  - Per-request timeout, honors the shared 30 s ingestion `AbortSignal`.
  - Body cap streamed: HTML 2 MB, CSS 1 MB, image 5 MB; ingestion total 40 MB. Abort on overflow.
- `server/src/net/limits.ts`: constants above in one place.
- `server/src/net/hostname.ts`: `canonicalHost(host)`: lowercase, IDNA to ASCII (punycode via WHATWG `URL`), strip every trailing root dot, reject empty labels. All blocklist entries, blocklist checks, cache keys and rate-limit logs use this form.
- Migrations `002_blocklist.sql` and `003_rate_limit.sql` (Phase 1 runner).
- `server/src/policy/blocklist.ts`: table `blocklist(domain, created_at)`, entries stored in canonical form. A canonical host matches if it equals an entry or ends with `.` + entry.
- `server/src/cli/blocklist.ts`: `npm run blocklist -- add|remove|list <domain>`. `add` also purges the domain cache (Phase 8 hook).
- `server/src/policy/rateLimit.ts`: sliding window, 5 per IP per hour, in SQLite (survives restarts). Table `rate_events(ip_hash, at)` stores a SHA-256 of the IP, not the IP. Each insert deletes that IP's events older than 1 h, and `server/src/jobs/minuteJob.ts` (created in this phase, runs every minute) deletes all events older than 1 h, so the table holds at most one hour of admitted ingestions. A slot is used only when a real fetch starts. Cache hits, invalid URLs and blocklisted URLs use no slot (Q-2).
- Fastify `trustProxy` set from config (Railway runs one proxy hop) so `request.ip` is the client IP.

**Implementation notes**
- Error codes returned to the client: `invalid_url`, `unreachable`, `blocked_domain`, `rate_limited`. Private or internal targets return `unreachable` with the same generic message (E-2). Logs record the real reason; the response does not.
- Image validity (SEC-3, E-7) is enforced in Phase 8 by `sharp` decode. This phase enforces size and `Content-Type` prefix checks.

**Tests**
- Unit `ipPolicy`: table test of 30+ addresses (each blocked class plus public controls such as 1.1.1.1 and 2606:4700::1111).
- Integration with an injected resolver and a local fixture server:
  - hostname resolving to 127.0.0.1 is rejected;
  - public URL that redirects to `http://169.254.169.254/` is rejected at the hop;
  - allowed URL that redirects to a blocklisted domain returns `blocked_domain`, and nothing is cached;
  - resolver that returns public then private (rebinding) never connects to the private address;
  - `ftp://`, `file://`, `javascript:` and `http://user:pass@host` are rejected;
  - a 3 MB HTML body aborts at 2 MB.
- Integration: blocklisted `example.com` rejects `example.com`, `www.example.com`, `EXAMPLE.com`, `example.com.` and `www.example.com..`; allows `notexample.com`. CLI `add Example.COM.` stores `example.com`. An IDN entry matches both its Unicode and punycode request forms.
- Integration: 6th uncached ingestion in one hour from one IP returns `rate_limited` and no fetch happens; cache hits after that still succeed.
- Integration: 1,000 ingestions from 1,000 different IPs, then clock +61 min and one sweep: `rate_events` is empty.

**Acceptance criteria**
- All tests pass.
- No production code path can disable `ipPolicy` (override exists only through `createApp` test injection).

**Dependencies**
Phase 1.

---

### Phase 8: Ingestion pipeline, face detection and cache

**Goal**
`POST /api/ingest` returns brand colors and face crops for a public site within 30 s, with headless retry, partial results, a 24 h domain cache and an upload endpoint.

**Requirements covered**
ING-3 to ING-9, SEC-3, SEC-4, C-1, D-2, D-3, E-3, E-7.

**Changes**
- `server/src/ingest/pipeline.ts`: orchestrates the steps under one 30 s `AbortController`. On timeout, returns what it has with `partial: true` (E-3). The route races the pipeline against the deadline, so the response never waits for work that cannot be aborted.
- `server/src/faces/worker.ts`: `sharp` decode, YuNet detection and cropping run in a `worker_threads` pool (2 workers). Each job gets the time left in the budget; on deadline the pool calls `worker.terminate()` and starts a fresh worker, so a slow decode or inference cannot keep using CPU past 30 s.
- `server/src/ingest/colors.ts` (ING-3): fetch homepage HTML, then linked stylesheets (max 10) and inline `<style>`. Parse with `css-tree`. Score candidates: custom properties with brand-like names (`--primary`, `--brand`, `--accent`, `--color-primary` and similar) first, then saturated colors used as `background-color` or `color` on buttons, links and headers, ranked by frequency. Drop near-white, near-black and low-chroma grays. Return 0, 1 or 2 colors. The client does readability and derivation (Phase 5).
- `server/src/ingest/crawl.ts` (ING-4): from the homepage, follow same-site links whose path or text matches team, about, leadership, people, company, and up to N blog post links. Max 12 pages. Collect `<img>` (`src`, `srcset` largest), author images on blog posts (`.author img`, `[rel=author] img`, schema.org `author.image`).
- `server/src/ingest/images.ts`: dedupe candidate URLs, keep at most 150 per ingestion (team and author images first), and fetch them through `safeFetch` with at most 4 requests in flight. Test: a page with 5,000 `<img>` tags makes at most 150 image requests and never more than 4 at once. Then decode with `sharp` (`limitInputPixels` 25 MP). Accept JPEG, PNG, WebP, GIF (first frame) only. Discard SVG, non-images, decode failures and oversize (E-7).
- `server/src/faces/detector.ts`: YuNet via `onnxruntime-node`, confidence threshold ~0.8, min face width 40 px.
- `server/src/faces/crop.ts` (ING-5): crop to the detected face box only. Downscale (aspect kept) so width ≤ `MAX_CROP_PX` and height ≤ `2 × MAX_CROP_PX`, where `MAX_CROP_PX = HEAD_W_ART × 2 × K_MAX × DPR_MAX` (shared constant; 512 px for a 32 art px head, 256 px for 16). The width bound equals the widest reachable on-screen head in device pixels, and D-5 tests width, so capping never makes a face fail D-5 or upscales a Smooth face; the height bound only limits unusually tall boxes. Encode PNG with no metadata; reject any crop over `2 × MAX_CROP_PX²` bytes (512 KiB at 512 px). Unit tests: a typical 512 px PNG face crop is accepted; a 1,000 × 1,200 crop becomes 512 × 614 and passes the quality check at k=4, DPR 2. Max 30 faces per domain. Deduplicate exact repeats by content hash.
- `server/src/ingest/headless.ts` (ING-6): if static faces < 5 and budget remains, load the same pages in Playwright Chromium:
  - routing is installed with `browserContext.route()` (and `browserContext.routeWebSocket()`) before any page is created, so popups and their first navigation are covered too. New pages and popups are closed on creation (`context.on('page')`); only the page the pipeline opens may load. Every request goes through this route and is fulfilled by `safeFetch` (so SSRF rules apply to the browser too). `safeFetch` runs in single-hop mode here: it validates the target, and a 3xx answer goes back to Chromium unchanged as a 3xx with its `Location`. Chromium then follows it as a new request, which `page.route` intercepts and validates again. The route handler counts the chain with Playwright `request.redirectedFrom()` and aborts the 6th hop, so the max-5 redirect limit holds in headless mode too. Test: a 7-hop redirect chain is aborted at hop 6. The document URL therefore matches the real final URL. Test: `http://a.test/` redirects to `https://www.a.test/app/`; relative scripts and images on the final page resolve against `/app/`;
  - WebSockets closed via the context-level `routeWebSocket`; service workers blocked; WebRTC non-proxied UDP disabled; browser `proxy` set to a dead local port so any request that escapes routing fails;
  - after load, run the `crawl.ts` link matcher on the rendered DOM and visit newly found team, about, leadership and blog pages (same 12-page total cap as the static crawl);
  - collect rendered image URLs from every visited page and feed them to `images.ts`;
  - request budget inside the route: image, media and font requests are aborted and their URLs only recorded (they go to the capped `images.ts` queue later); all other requests count toward a cap of 200 per ingestion with at most 6 in flight; over the cap, requests are aborted. Test: a page that creates 5,000 `<img>` tags and 5,000 `fetch()` calls causes no image fetches from Chromium, at most 200 other requests and never more than 6 at once;
  - max 2 headless sessions at once; queued requests count against their own 30 s budget. On the deadline the session is torn down in a `finally`: `context.close()` with a 2 s timeout, then `browser.close()` and relaunch if that fails, then the slot is released. Test: a page with a never-ending `page.evaluate` hits the deadline; afterwards no context is open, the slot is free and the next request starts at once.
- `server/src/cache/faceCache.ts` (ING-9, C-1): key = `canonicalHost` (Phase 7), exact. `example.com` and `www.example.com` are separate entries, so cache keys use the same matching rule as the blocklist. The cache lives in process memory only (a `Map` with LRU eviction, cap 256 MB). Face crops are never written to disk, so no face data survives a stop, crash or redeploy, and downtime cannot extend the 24 h limit (C-1). Entry = `{colors, faces, sourceHosts, createdAt}`; `sourceHosts` is the set of `canonicalHost` values of every page and image fetched for the entry. Cache only complete ingestions (not `partial`). Cache TTL is 23 h for reads (`CACHE_TTL`).
- `server/src/cache/sweeper.ts`: registers with the Phase 7 minute job. Every minute it deletes entries older than `CACHE_TTL` (23 h) and entries whose key or any `sourceHosts` value matches the blocklist. Worst-case lifetime is 23 h 1 min, under the 24 h limit. The blocklist CLI is a separate process, so this sweep is how a new blocklist entry purges the in-memory cache within 1 min; the ingest route also checks the blocklist before any cache read, so a blocked domain is never served even inside that minute.
- `server/src/routes/ingest.ts`: order: validate URL, blocklist, cache lookup, rate limit, pipeline. Response type in `shared/src/api.ts`: `{domain, colors: string[], faces: [{id, dataUrl, width, height}], partial, source: "cache" | "static" | "headless"}`.
- `server/src/routes/upload.ts` (ING-7, D-2): `POST /api/faces/upload`, multipart, max 10 files, 5 MB each. Same decode, detect and crop path. Processed in memory. Never written to disk or cache. Returns face crops in the same shape. Light abuse limit: 20 upload requests per IP per hour.

**Implementation notes**
- Faces go to the client as data URLs in the JSON response. No public face URLs exist, so no extra access-control surface.
- Never store or log names, alt text, captions, file names or page URLs with faces (SEC-4). Logs hold the domain, counts and timings only.
- `blocklist add` calls `faceCache.purge(domain)` (C-1, SEC-5 takedown).
- `faceCache.purge(entry)` deletes every cache entry whose key or any `sourceHosts` value equals `entry` or ends with `.` + `entry` (the blocklist matching rule). Test: `company.test` cached with a face from `cdn.thirdparty.test`; after `blocklist add thirdparty.test` and one sweep, the `company.test` entry is gone. The sweeper calls it for each blocklist entry. Test: cache `example.com` and `www.example.com`; after `blocklist add example.com` and one sweep, both are gone; after `blocklist add www.example.com` and one sweep, only `www.example.com` is gone; a request for a just-blocked domain returns `blocked_domain` before the sweep runs.
- Blocklist race: after the pipeline, the server checks the key and all `sourceHosts` against the blocklist, then sets the cache entry. The CLI is a separate process, so a block can still commit between that check and the set. The guarantee is therefore defined by the two checks that cannot be skipped: (1) every cache read checks the blocklist first, so blocked data is never served after the block commits; (2) the minute sweep deletes it within 1 min. Tests: block a domain while a fixture pipeline is in flight; the next request returns `blocked_domain`, and after one sweep no entry exists. Block it before the post-pipeline check; that request returns `blocked_domain` and caches nothing.
- Verify the YuNet model license file and commit it next to the model in `server/models/`.

**Tests**
- Unit `colors`: fixture CSS with `--brand-primary` wins over frequent colors; gray-only CSS returns 0 colors; single brand color returns 1.
- Unit `crawl`: fixture site finds `/team`, `/about-us`, `/leadership` and blog author images; ignores off-site links.
- Unit `crop`: fixture photo with 2 faces gives 2 crops at the detector boxes; landscape photo with no face gives 0.
- Integration (fixture server, injected resolver):
  - static site with 6 faces: `source: "static"`, no headless launch;
  - JS-rendered site with 0 static faces and 6 rendered: `source: "headless"`;
  - SPA whose `/team` link exists only after JavaScript runs, with the faces on `/team`: headless finds the link, visits it and returns the faces;
  - site that stalls: response by 30 s + small margin with `partial: true` and whatever was found;
  - injected detector that sleeps 60 s: response by 30 s + small margin with `partial: true`; the worker is terminated and the next job runs on a fresh worker;
  - SVG, HTML-as-image, 8 MB image are discarded;
  - second request within 24 h: `source: "cache"`, no rate-limit slot used;
  - sweeper with clock +23 h 1 min deletes the entry; no entry older than 23 h 1 min exists in a simulated 48 h run; after an app restart the cache is empty and `DATA_DIR` holds no face data.
- Integration upload: 2 JPEGs with faces return 2 crops; nothing appears under `DATA_DIR`; a text file is rejected.
- Headless SSRF: fixture page that loads `http://127.0.0.1/secret` via `<img>`, `fetch()` and `window.open()` (popup) never reaches the loopback server; the popup is closed.

**Acceptance criteria**
- All tests pass.
- Manual check on 3 real public company sites: completes in <= 30 s and returns colors or a clear empty result.

**Dependencies**
Phase 7.

---

### Phase 9: Client integration of ingestion, upload and leaderboard

**Goal**
The full player journey works end to end: URL in, themed run, Top 10 out.

**Requirements covered**
SUC-1, ING-1, ING-7, LB-2, LB-3, LB-4, LB-5, E-1, E-2, E-3, E-4, E-5, E-6, E-8, E-10, E-11, D-3.

**Changes**
- `client/src/api/client.ts`: typed calls to ingest, upload and leaderboard.
- `client/src/ui/loading.ts`: progress state during ingestion (up to 30 s).
- `client/src/ui/errors.ts`:
  - `invalid_url`, `unreachable`, `blocked_domain`: error text + Retry + Upload faces manually (E-1, E-2 generic text). Manual path has no colors, so the color picker opens (D-3).
  - `rate_limited`: message only, ingestion not started (E-4).
- `client/src/ui/upload.ts`: shown when faces < 5, and always when `partial` is true (D-3). Upload (merge with site faces, I-2) or Skip (reuse faces; zero faces gives placeholders, E-8).
- Color flow: 0 colors opens picker (E-5); 1 color or unreadable colors auto-adjust (E-6). When `partial` is true, the picker always opens, prefilled with any found (auto-adjusted) colors, so the user can confirm or change them (D-3).
- `client/src/ui/leaderboard.ts` in post-game:
  - fetch Top 10 for the run difficulty;
  - if fewer than 10 rows or time < 10th time, ask for 3 initials (filter from `shared/initials.ts`), else show the board only (LB-3);
  - submit; on failure show the time, the error and a Retry button (E-11). A failed Top 10 fetch shows the same retry pattern.
- Sound default and toggle from Phase 5 are unchanged.

**Implementation notes**
- The client is the only time source (LB-4). Send the integer `timeMs` from `timer.ts`.
- Play again (I-3) does not call the API.

**Tests**
- E2E with mocked API routes (Playwright `page.route`):
  - happy path: ingest 6 faces + 2 colors, play scripted run, qualify, enter `jmd`, board shows `JMD`;
  - 3 faces: upload prompt shows; Skip starts run with reused faces;
  - `partial: true` with 6 faces and 2 colors: upload prompt and prefilled color picker both show (D-3);
  - 0 faces + Skip: placeholder heads;
  - `rate_limited`: message, no run start;
  - `blocked_domain`: error with Retry and manual upload; manual upload path opens color picker;
  - non-qualifying time: no initials prompt;
  - submit 500 then retry 200: error shown then board shown.
  - submit commits but the response is dropped (route aborted), then retry: the board holds the run once.
- E2E against the real server with a fixture site (injected resolver in test app): one full journey.

**Acceptance criteria**
- All E2E tests pass.
- SUC-1: a tester enters a real URL, plays, and sees their time on the Top 10.

**Dependencies**
Phases 5, 6 and 8.

---

### Phase 10: Final art from Sprite Fusion

**Goal**
Placeholder characters and props are replaced by committed Sprite Fusion art that follows the sprite contract. The live game makes no Sprite Fusion calls.

**Requirements covered**
RND-5, RND-6, RND-7, THM-3 (bobble-head bodies), ENM-2, C-3.

**External dependency**
- **Who runs it:** the product owner connects the Sprite Fusion MCP in a Claude Code session (`claude mcp add --transport http spritefusion https://www.spritefusion.com/mcp`, then `/mcp`, choose `spritefusion`, sign in). An agent in that session runs this phase.
- **Why a person:** the MCP uses OAuth. A person must approve the connection on a Sprite Fusion page. An agent cannot do this step.
- **Credits:** the AI Pixel Art Generator is not the free Tilemap Editor. Generation tools cost 15 credits per call (refunded if no sprite is saved). The asset list below needs about 15 to 30 calls (estimate), so about 225 to 450 credits. Run the free `get_credits` tool before you start.

**Changes**
- Generate with `generate_sprites` and `generate_sprites_in_style` (32 px suggested), animate with `animate_sprite`, fix with `edit_sprite`. Tag every result `logistics-run`. Do not use `create_8_directions` or normal maps (non-goal).
- Asset list:
  - Player: idle, run, jump, shoot, hit (highlight in the reserved primary ramp).
  - Enemy bodies, headless, clothing in the reserved neutral gray ramp: walker (walk, defeat), shooter (walk, shoot, defeat).
  - Props: briefcase pickup, pallets, cardboard boxes, truck, semi-trailer, freight container, conveyor, shutter door.
- Save PNGs to `client/public/assets/sprites/`. Record frames and per-frame head anchors in `client/src/assets/manifest.ts`.
- Tiles and effects stay code-drawn (RND-6).
- `docs/art-pipeline.md`: prompts used, tags, how to regenerate, palette rules (fixed cold/warm backdrop, reserved ramps).

**Implementation notes**
- Prompts must not name or imitate Contra or Destroy Any Website assets (C-3). Inspiration only.
- Post-process each sprite so clothing and highlight pixels sit exactly on the reserved ramps (tinting depends on it).

**Tests**
- Unit: manifest validation: every frame has a head anchor inside frame bounds; every sheet exists; every enemy sheet has clothing-ramp pixels.
- Static check: `grep` for `spritefusion.com` in `client/src` and `server/src` finds no runtime URL (RND-7).
- E2E on the production build: record all requests during startup and one scripted run; assert none go to `spritefusion.com` (RND-7).
- E2E pixel check from Phase 2 re-run with final art.

**Acceptance criteria**
- All placeholder character and prop art is gone from the shipped build (placeholder heads for E-8 stay).
- Tests pass.

**Dependencies**
Phase 2 (defines the sprite contract in `client/src/assets/manifest.ts`). Can run in parallel with Phases 3 to 9.

---

### Phase 11: Deployment, operations docs and launch gate

**Goal**
The game runs publicly on Railway with persistent storage, documented operations and a completed launch checklist.

**Requirements covered**
DEL-1, DEL-2, SEC-5 (process), C-4, AGPL compliance (repo evidence, section 0.1).

**Changes**
- `Dockerfile`: base `mcr.microsoft.com/playwright:<pinned version>` (Chromium included), build client and server, run server as the non-root `pwuser` (never root).
- Chromium hardening (Playwright Docker guidance for crawling): launch with `chromiumSandbox: true` and never pass `--no-sandbox`. Apply the Playwright seccomp profile where the host allows it. If Railway cannot run the sandbox, move headless rendering to a separate Railway service with no volume and no secrets, called over the private network. Do not ship headless retry without one of these two setups.
- Test: CI starts the image, asserts the server process UID is not 0, and launches Chromium with the sandbox on (launch fails if the sandbox is not available).
- Railway: one service, one volume mounted at `DATA_DIR`. Env vars: `PORT`, `DATA_DIR`, `CONTACT_EMAIL`, `TRUST_PROXY_HOPS`, `SOURCE_URL`.
- Footer and About view: the "Source code" link (from the `source-url` meta tag, Phase 5) points to the public repository (AGPL section 13).
- Production smoke test: footer takedown link and Source code link resolve to the configured `CONTACT_EMAIL` and `SOURCE_URL`.
- `docs/operations.md`: blocklist CLI, takedown handling (add to blocklist, which purges cache), cache lifetime, rate limits, logs policy (no face metadata).
- `docs/architecture.md`: layer stack, data flow, security model.
- `docs/launch-checklist.md`: read Sprite Fusion terms for generated asset use (C-4); confirm YuNet license; confirm all dependency licenses are AGPL-compatible; confirm the Chromium sandbox runs on the production host (or the isolated headless service is in use); smoke test SUC-1 on production.
- README: deploy section.

**Implementation notes**
- One instance only (SQLite and in-process headless queue). Scaling out is not required.
- Health check: `GET /api/health`.

**Tests**
- CI builds the Docker image and runs `/api/health` against it.
- Production smoke test: SUC-1 journey on the deployed URL.
- Restart the service: leaderboard rows survive; the face cache is empty; `DATA_DIR` contains no image files.

**Acceptance criteria**
- Public URL serves the game. Launch checklist is fully checked, including C-4, before public announcement.

**Dependencies**
Phases 9 and 10.

---

## 3. Cross-cutting work

| Concern | Work | Owner phase |
|---|---|---|
| SSRF and abuse | IP policy, pinned connect, redirect checks, size caps, headless routing, rate limits | 7, 8 |
| Privacy | Detection only, no recognition model; no names, alt text or URLs stored; uploads in memory only; 24 h in-memory cache (no face data on disk); blocklist purges cache within 1 min | 8 |
| Takedown | Footer link, About text, blocklist CLI, operations doc | 5, 7, 11 |
| Licensing | AGPL source link; dependency and model license check; Sprite Fusion terms (C-4); no copied third-party assets (C-3) | 8, 10, 11 |
| Accessibility | Keyboard-only is a requirement, so all menus must work with keyboard (Tab, Enter). Text contrast via readability module. No further a11y scope. | 5, 9 |
| Observability | Structured Fastify logs: ingestion domain, outcome code, duration, face count, source. No face data. | 8 |
| Data migrations | Name-tracked SQL migrations (`schema_migrations` table); runner in Phase 1, one file per feature, order-independent | 1, 6, 7 |
| Rollback | Railway redeploy of the previous image. Migrations are additive only, so a previous image runs on a newer schema. | 11 |

---

## 4. Requirements traceability

| ID | Requirement (short) | Phase | Verification |
|---|---|---|---|
| SUC-1 | Enter URL, play 1 to 2 min run, see time on global Top 10 | 4, 9, 11 | Medium playtest times (P4); full journey E2E (P9); production smoke (P11) |
| DEL-1 | Hosted web app with small backend that fetches target site | 1, 8, 11 | Build serves client + API (P1); deployed URL (P11) |
| DEL-2 | Public, any public URL, no accounts | 7, 11 | No auth code; URL policy tests (P7) |
| DEL-3 | Desktop only, keyboard only, no touch | 2 | Input tests; no touch handlers (review) |
| DEL-4 | Sound with on/off toggle | 5 | Pause Sound toggle E2E |
| ING-1 | Enter URL and pick Easy, Medium, Hard | 5, 9 | Menu E2E |
| ING-2 | Face style setting Auto (default), Smooth, Pixelated | 5 | Menu E2E; default is Auto |
| ING-3 | Brand colors from site CSS first | 8 | `colors` unit tests |
| ING-4 | Static HTML: team, about, leadership pages; blog author images | 8 | `crawl` unit tests |
| ING-5 | Detect faces, crop to visible face only | 8 | `crop` unit tests |
| ING-6 | < 5 faces: headless retry | 8 | Integration "headless" case |
| ING-7 | Still < 5: prompt upload, user can skip | 8, 9 | Upload integration; upload/skip E2E |
| ING-8 | 30 s timeout; 5 ingestions per IP per hour (cache hits free, Q-2) | 7, 8 | Timeout integration; rate-limit integration |
| ING-9 | Cache faces per domain up to 24 h, then delete | 8 | Cache hit + sweeper integration |
| THM-1 | Primary color: player highlights, structural accents, UI highlights | 5 | Tint unit; visual review |
| THM-2 | Secondary color: enemy clothing, secondary textures | 5 | Tint unit; visual review |
| THM-3 | Face on 2D bobble-head body, clothing tinted, random assignment, repeats | 5, 10 | `assign` unit; manifest anchors (P10) |
| THM-4 | Smooth: full-res face over pixel body (L2 per Q-1) | 5 | Smooth override E2E |
| THM-5 | Pixelated: finer grid than world pixels, on pixel layer | 5 | Pixelated override E2E; `pixelate` grid = 1/2 art px |
| THM-6 | Auto: quality check at run start, majority rule, uploads count | 5 | `quality` unit |
| THM-7 | Override forces style for all faces | 5 | `quality` unit; E2E |
| THM-8 | One color or unreadable: auto-adjust, derive missing; none: picker | 5, 9 | `readability` unit; picker E2E |
| RND-1 | Crisp 90s pixel art, no blurry or off-grid pixels | 2, 10 | Pixel block check E2E |
| RND-2 | Separate low-res pixel layer, integer upscale, no smoothing, above high-res | 2 | Layer order test; pixel check |
| RND-3 | Rotated sprites on low-res layer, on grid | 2, 4 | Pixel check with rotated sprite and spread projectiles |
| RND-4 | Gore, face pop, explosions, laser on pixel layer | 4, 5 | Pixel check during combat |
| RND-5 | Characters and props from Sprite Fusion | 10 | Manifest validation; placeholder removal |
| RND-6 | Tiles and effects drawn in code | 3, 4 | Code review: no tile/VFX image files |
| RND-7 | Assets built ahead and committed; no live Sprite Fusion calls | 10 | Static grep check; request-recording E2E |
| CTL-1 | A/D, W, S, Space, Esc mapping | 2, 3, 4 | Input and movement tests; pause E2E |
| CTL-2 | No arrow keys | 2 | Input unit test |
| WPN-1 | Pickups from floating containers replace weapon | 4 | Pickup unit test |
| WPN-2 | Pistol: one straight projectile, start weapon | 4 | Weapon unit test |
| WPN-3 | Spread: three-way fan centered on facing | 4 | Spread angle unit test |
| WPN-4 | Laser: continuous horizontal beam, high damage, pierces, blocked by solids | 4 | Laser ray-cast unit test |
| ENM-1 | Enemies walk, contact damage; some shoot | 4 | Enemy unit tests |
| ENM-2 | Pixel-hit defeat, light body gore | 4, 10 | Visual review; pixel check |
| ENM-3 | Face pop non-gory | 5 | Visual review |
| LIV-1 | 3 lives, one hit one life, respawn in place, invulnerability | 4 | Lives unit tests |
| LIV-2 | Weapon resets to Pistol after lost life | 4 | Lives unit test |
| LIV-3 | 0 lives: level restart, lives 3, timer 0 | 4 | Lives unit test |
| LIV-4 | Easy: slow, lower density | 4 | Difficulty table unit test |
| LIV-5 | Medium baseline; Hard high speed, max density | 4 | Difficulty table unit test |
| LIV-6 | Timer to the ms, starts on first gameplay key (Q-4), stops at exit boundary | 3 | Timer unit test; traversal E2E |
| LVL-1 | Zone 1 Storage Aisle content | 3 | Level review against spec |
| LVL-2 | Zone 2 Dock and Truck Lot content | 3 | Level review |
| LVL-3 | Zone 3 Receiving Bay, labeled shutter door exit | 3 | Level review; exit E2E |
| LVL-4 | Skilled Medium run about 1 to 2 min | 3, 4 | Traversal time (P3); playtest (P4) |
| LVL-5 | No need to kill all enemies, no boss | 4 | Scripted run reaches exit with enemies alive |
| PAU-1 | Esc opens pause, Esc resumes | 4 | Pause E2E |
| PAU-2 | Timer and all motion freeze | 4 | Pause freeze E2E |
| PAU-3 | Items: Resume, Restart level, Main menu, Sound | 4, 5 | Pause items E2E |
| PAU-4 | Restart resets lives and timer | 4 | Restart E2E |
| LB-1 | One global board per difficulty, all sites | 6 | Integration test |
| LB-2 | Rank by fastest time, show Top 10 | 6, 9 | Integration; E2E |
| LB-3 | Ask initials only when in Top 10 | 9 | Qualify / non-qualify E2E |
| LB-4 | Browser reports time; only check is 3-letter filter | 6, 9 | Validation integration tests |
| LB-5 | Post-game: Play again (same site, difficulty) or Main menu | 5, 9 | Post-game E2E |
| SEC-1 | Public http and https only | 7 | Scheme tests |
| SEC-2 | Block private, loopback, internal incl. redirects and DNS tricks | 7, 8 | IP table, redirect, rebinding, headless SSRF tests |
| SEC-3 | Response size limit, valid image content only | 7, 8 | Body cap test; image validation tests |
| SEC-4 | Detection and crop only, no recognition, no names | 8 | Code review: detector model only; no name fields in schema |
| SEC-5 | Footer takedown and blocklist request; blocklisted rejected | 5, 7, 11 | Footer E2E; blocklist integration |
| E-1 | Invalid, unreachable, blocklisted: error, retry or manual upload | 9 | Error E2E |
| E-2 | Private address: generic error | 7, 9 | Integration (same code as unreachable) |
| E-3 | 30 s limit: partial results, then fewer-than-5 path | 8, 9 | Timeout integration; upload prompt E2E |
| E-4 | Rate limit: message, no ingestion | 7, 9 | Integration; E2E |
| E-5 | No brand color: color picker | 5, 9 | Picker E2E |
| E-6 | One color or unreadable: auto-adjust, derive | 5, 9 | `readability` unit |
| E-7 | Non-face, non-image, oversized: discard | 8 | Image discard integration |
| E-8 | Zero faces and skip: placeholder heads | 4, 5, 9 | `assign` unit; E2E |
| E-9 | Override applies to all faces incl. uploads | 5 | `quality` unit |
| E-10 | Fewer than 5 faces: prompt upload, skippable | 9 | E2E |
| E-11 | Submit fails: show result and error, allow retry | 9 | E2E 500 then 200 |
| E-12 | Window too narrow: "Make the window wider to play" | 2 | Resize E2E |
| C-1 | No face data beyond 24 h cache | 8 | Sweeper test; in-memory cache empty after restart; no face data in `DATA_DIR` |
| C-2 | Trust-based leaderboard | 6 | No extra checks (review) |
| C-3 | No copied third-party assets | 10 | Art pipeline doc; review |
| C-4 | Read Sprite Fusion terms before launch | 11 | Launch checklist item |
| D-1 | English-only UI | 5 | Review |
| D-2 | Uploaded faces not stored beyond session | 8 | Upload integration (no disk writes) |
| D-3 | Failed or timed-out ingestion: manual upload and color picker | 9 | Error-path E2E |
| D-4 | Face style resets to Auto each visit | 5 | E2E reload shows Auto |
| D-5 | Quality pass: source width >= on-screen width; "most" > half | 5 | `quality` unit |
| D-6 | Pause items as listed | 5 | Pause items E2E |

### 4.1 Implementer decisions (section 9 of source)

| Item | Decision | Phase |
|---|---|---|
| Enemy types and health | Walker 2 HP, Shooter 3 HP | 4 |
| Power-up count and placement | 2 to 3 briefcases per zone | 4 |
| Ammo model | Unlimited for all weapons | 4 |
| Speeds and densities | Table in Phase 4 | 4 |
| Pixel resolution and scale | Art 480 x 270, L1 960 x 540, integer `k` | 2 |
| Pixelated face grid | 1/2 art pixel | 5 |
| Face detection method | YuNet ONNX via `onnxruntime-node` | 8 |
| Audio source and default | Synthesized Web Audio SFX, on by default | 5 |

### 4.2 Out of scope (not built)

- Section 4 non-goals: multiplayer, accounts, profiles; mobile or touch; anti-cheat; bosses or more levels; face recognition; rebindable controls; per-company boards; face review screen; shareable links, embeds, sponsor slots; mouse aim, grenades, weapon-switch keys, flying; 8-direction sprites and normal maps.
- Section 7 deferred: server-side time checks or replays; offensive-initials filter; per-site boards; up and diagonal aiming; touch controls; face review screen; pre-filled share link; more levels and a boss.
- Section 3 optional items not adopted: "Peak Q4 Rush" label for Hard; music track.

---

## 5. Open items

| Type | Item | Blocks |
|---|---|---|
| External dependency | Product owner connects the Sprite Fusion MCP (OAuth sign-in) and confirms about 225 to 450 credits with `get_credits` | Phase 10 art. Status 2026-10-20: still open; placeholders ship. |
| Launch gate | Sprite Fusion terms review (C-4) | Public launch only |
| Config value | `CONTACT_EMAIL` for the takedown link | Phase 11 deploy only. Code uses a config value. Still open. |
| Config value | Railway project, volume and public domain | Phase 11 deploy. Still open. |
| Host capability | Chromium sandbox on Railway (seccomp) or a separate headless service | Headless retry in production. Still open. |
| Human check | Manual Medium playtest (3 runs) and SUC-1 on the deployed URL | SUC-1 sign-off. Still open. |

No unresolved product decisions remain.

---

## 6. Plan review log (two passes)

**Pass 1: coverage and correctness**

| Finding | Fix applied |
|---|---|
| Two-layer stack cannot satisfy THM-4 and RND-2 together | Asked owner (Q-1); 4-layer stack in 1.2 |
| THM-5 "finer grid than world pixels" is impossible if L1 equals the art grid | L1 at 2x art grid; Pixelated faces use 1/2 art pixel |
| Rotation on a 2x L1 would create half-pixel steps | Rotate at art resolution first, then blit 2x (Phase 2) |
| Fixture servers run on loopback, which the SSRF policy blocks | Test-only resolver injection via `createApp` (Phases 1 and 7) |
| Headless browser does its own DNS, bypassing SSRF checks | All browser requests fulfilled by `safeFetch`; WebSockets, service workers, WebRTC and stray traffic blocked (Phase 8) |
| Rate-limit and cache-hit interaction undefined | Asked owner (Q-2) |
| Respawn in place undefined over a pit | No pits in level (I-4) |
| Game could run while narrow-window message hides it | Freeze while guard is shown (Phase 2) |
| AGPL license needs source offer for a hosted app | Source link (Phase 11) and license checks |
| Leaderboard Top 10 fetch failure not covered | Same retry pattern as submit failure (Phase 9) |

**Pass 2: scope, sequencing and verifiability**

| Finding | Fix applied |
|---|---|
| Pause menu needs Main menu, which needs menus from Phase 5 | Pause split: Resume and Restart in Phase 4, remaining items in Phase 5 |
| "1 to 2 minutes" not objectively testable alone | Two checks: scripted traversal 40 to 70 s (P3) and 3 recorded Medium playtests 60 to 120 s (P4) |
| Art phase blocked by external sign-in could block release of all game work | Placeholder art follows the same manifest contract; Phase 10 runs in parallel |
| Considered `theme-color` meta tag as color source | Removed. Spec says CSS first; not needed |
| Considered port restriction to 80 and 443 | Removed. Spec allows any public URL; IP policy is the control |
| Considered sound toggle on main menu | Removed. Pause toggle meets DEL-4 and D-6 |
| Upload endpoint abuse limit is not in spec | Kept as a security control (CPU cost of detection), documented in Phase 8 |

**PR review round (CodeRabbit and Codex)**

| Finding | Fix applied |
|---|---|
| Short viewport gave k=0 | `k = max(1, ...)`; 960 x 539 test |
| Footer config could not reach static files; config fetch could fail | Server injects meta tags into `index.html`; required at startup |
| Play again face check had no stable id | `id` = crop SHA-256; compare sorted id multiset |
| 10 min sweeper could exceed 24 h | Read TTL 23 h; later superseded by in-memory cache (see below) |
| Leaderboard table unbounded | Prune to Top 10 per difficulty in the insert transaction |
| Face crops unbounded | 256 px longest side, 150 KB cap |
| Sprite contract defined after Phase 10 could start | Contract moved to Phase 2 |
| Timed-out ingestion could skip D-3 fallbacks | `partial` always shows upload and prefilled picker |
| Chromium ran as root without sandbox | Non-root user, sandbox on, or isolated headless service |
| Blocklist add during in-flight ingestion | Blocklist recheck in the cache-write transaction |
| Requirements file not in repo | Committed at `docs/requirements/` |
| Blocklist bypass via `example.com.` or case or IDN forms | `canonicalHost` for entries, checks and cache keys |
| Phase 7 needed SQLite before Phase 6 created it | DB wrapper and migration runner moved to Phase 1 |
| Upload merge, enemy faces and Play again were unconfirmed | Confirmed by owner; moved to section 0.2 |
| Timer start undefined in the spec | Owner decision Q-4: first gameplay key press |
| `CONTACT_EMAIL` form ambiguous (`mailto:mailto:` risk) | Plain address only; client adds the scheme |
| Leaderboard accepted any `:difficulty` | Enum validation, 400 before DB access |
| Cache merged `www.` and bare host but blocklist did not, so a purge could miss entries | Owner decision: exact `canonicalHost` cache key; purge uses the blocklist matching rule |
| Disk cache outlived 24 h while the service was down | Face cache moved to process memory; nothing on disk |
| `.env.example` was not loaded automatically | `--env-file-if-exists=.env`, `cp` step in setup and acceptance |
| Stack table still said face PNGs on disk | Updated to in-memory cache |
| 256 px crop cap was below uncapped display size | `K_MAX = 4`, `DPR_MAX = 2`; crop cap derived from them |
| Cache check-then-set is not atomic across the CLI process | Guarantee defined as check-on-read plus 1 min sweep; tests for both |
| Headless fulfilled redirects with the final body under the wrong URL | Single-hop mode returns 3xx to Chromium |
| Blocked third-party image hosts stayed in company cache entries | `sourceHosts` per entry; purge matches them |
| Rate-event cleanup depended on Phase 8 | Minute job created in Phase 7 |
| No cap on candidate image requests | 150 candidates, 4 in flight |
| `scores` migration lacked `submission_id` | Added with `UNIQUE` |
| Crop byte cap formula gave bytes, not KiB | Cap is `MAX_CROP_PX²` bytes |
| Single-hop headless redirects reset the 5-hop limit | Count via `redirectedFrom()`; abort hop 6 |
| Timed-out headless sessions kept slots and CPU | Close context, else browser; release slot in `finally` |
| Longest-side cap could shrink portrait width below D-5 | Cap width to `MAX_CROP_PX`, height to 2× |
| Browser-initiated requests bypassed the 150 cap | Abort image/media/font in route; cap 200 others, 6 in flight |
| `scores.id` not declared as primary key | `id INTEGER PRIMARY KEY` |
| Popup first navigation bypassed `page.route` | Context-level route before any page; popups closed |
| Redirect to a blocklisted domain bypassed the takedown | Blocklist checked on every redirect hop |
| Rate-limit table grew without bound | Hashed IP, prune events older than 1 h |
| `sharp` and YuNet ignored the abort signal | Worker pool with terminate on deadline |
| Headless retry did not find JS-only links | Rerun link discovery on the rendered DOM |
| Lost submit response could duplicate a score on retry | Client `submissionId` with unique index |
| `user_version` runner would skip `001` if Phase 7 landed before Phase 6 | Runner tracks applied file names; late files still apply |
| Migration SQL and its record could commit separately | Same transaction; crash-boundary test |
| `Difficulty` type-only union has no runtime values for the schema enum | Runtime `DIFFICULTIES` array; type derived from it |
| Startup check could block local, E2E and CI runs | Fixed values in `.env.example`, Playwright and CI |

---

## 7. Implementation status

Review method per phase: two passes on the full phase diff. Pass 1 checks coverage and correctness against the phase requirements. Pass 2 checks scope, security and verifiability. Findings are classified per `AGENTS.md` (Edits 3): in-task findings are fixed in the phase; out-of-task findings are listed in section 7.2 as proposals.

| Phase | Status | Evidence | Remaining or blocked |
|---|---|---|---|
| 1 Scaffold and CI | ✅ Done | Vitest health + 5 migration-runner cases; Playwright home page; `npm start` serves client and `/api/health` | None. CI is green on GitHub (PR runs). |
| 2 Renderer, input, loop | ✅ Done | Unit: scale `k` table, input map (arrows ignored), rotation, loop freeze, camera snap, manifest contract. E2E: pixel blocks at k=1 and k=2 with a 30 degree sprite (fails when `image-rendering` is not `pixelated`); narrow guard show, freeze, hide. Lint rule blocks `imageSmoothingEnabled = true`. | None |
| 3 Level, movement, timer | ✅ Done | Unit: one-way land, drop and solid block; timer format, stop and Q-4 start rules; zone order and labeled exit; headless bot traversal 52.4 s (40 to 70 s). E2E: scripted run to the exit with a stopped timer; arrow keys do nothing. | Pacing re-tuned in Phase 4 with combat |
| 4 Combat, enemies, pause | ⚠️ Done except manual playtest | Unit: spread symmetry, laser wall stop and pierce, invulnerability, lost life resets weapon, 0 lives full reset, pickups, nested difficulty spawn sets, 2 to 3 briefcases per zone, exit with enemies alive. Combat-bot pacing proxy: Easy 59.8 s, Medium 63.6 s, Hard 67.1 s (unit test guards Medium in 60 to 120 s). E2E: pause freeze 2 s and resume, Restart level, pixel blocks during laser + particles + rotated projectiles. | Manual playtest: 3 Medium runs by a competent human player, times recorded in the PR (agent cannot do this) |
| 5 Theming, faces, menus | ✅ Done | Unit: readability (derive, separate, adjust, unchanged), tint ramps, assign, quality majority and override with uploads. Integration: meta tags on `GET /`, startup fails on missing or invalid `CONTACT_EMAIL` (incl. `mailto:`) or `SOURCE_URL`. E2E: picker on no colors and HUD accent, Smooth on L2 only, Pixelated on L1 only, Auto choice, face pop, pause has exactly 4 items, Sound mutes (gain 0), audio stays suspended in pause, Main menu, Play again reuses data with no network call, footer and About links, Auto and Medium on reload, Enter starts a run. | Visual review done on placeholder art; repeat in Phase 10 |
| 6 Leaderboard backend | ✅ Done | Integration: idempotent `submissionId`, 12 submits keep 10 rows fastest first with tie order, initials filter and upper-casing, `timeMs` positive integer (no string coercion), per-difficulty boards, `extreme` gives 400 with no row, data survives restart, no IP or domain column. Unit: initials filter. | None |
| 7 Secure fetch, blocklist | ✅ Done | Unit: 61-row IP table (every blocked class, embedded IPv4 forms, NAT64, strict address forms, public controls); canonical host forms. Integration (fixture servers on 127.0.0.1 and 127.0.0.2, injected resolver): loopback by name and literal rejected with no connect, mixed DNS answers rejected, redirect to 169.254.169.254 and to a private host rejected at the hop, redirect to a blocklisted host gives `blocked_domain`, DNS rebinding never reaches the private server (fails when the pinned lookup is removed), bad schemes and user info rejected, 2 MB cap streamed and declared, 40 MB budget, 5-redirect limit, single-hop mode, content-type check, abort. Blocklist forms, IDN, CLI. Rate limit 5 per hour, hashed IP, 1,000-IP sweep. Trust proxy hops. | Route-level checks (rate limit with cache hits, nothing cached after a blocked redirect) run in Phase 8 with the ingest route |
| 8 Ingestion, faces, cache | ✅ Done | Unit: colors (brand var wins, gray gives 0, single color, channel lists, shades), crawl (team/about/leadership, off-site ignored, blog author images incl. JSON-LD, srcset, base href), crop (512 x 614 cap, 512 px PNG under the byte cap, 2-face photo gives 2 crops, landscape 0, SVG/text/broken rejected, GIF/WebP/PNG), pool (worker deadline and replacement, abort drops queued and running jobs). Integration: static 6 faces with no headless, cache hit with no slot, 6th ingestion rate-limited with no fetch while cache hits work, bad images discarded, invalid/internal/blocked URLs, redirect to blocked host caches nothing, stall and slow detector give partial by the deadline, 23 h 1 min sweep and 48 h max age, restart leaves no face data, third-party host purge, www and bare host purge, block during an in-flight pipeline, 5,000 images capped at 150 and 4 in flight, upload (2 crops, no disk writes, text, 5 MB and 10-file limits, 20 per hour). Headless (real Chromium): JS-rendered and SPA sites, SSRF via img, fetch and popup, 7-hop chain stops at hop 6, redirect keeps the final URL for relative resources, 5,000 img + 5,000 fetch flood, hung page torn down. Manual: anthropic.com, about.gitlab.com, basecamp.com, mozilla.org all under 6.5 s with colors or an empty color list. | Chromium sandbox on the production host is checked in Phase 11 |
| 9 Client integration | ⚠️ Done except human SUC-1 sign-off | E2E with mocked API: happy path to JMD on the board, 3 faces then Skip, uploads merge with site faces, partial gives upload prompt and prefilled picker, 0 faces gives placeholders, rate_limited message only, blocked_domain Retry and manual path to the picker, unreachable text, non-qualifying time, submit 500 then retry, lost response then retry stores the run once, failed Top 10 fetch retry, initials filter, malformed URL, bad face skipped. E2E against the real server and a fixture site: full journey with 6 real detected faces to the Top 10. Unit: qualify rule. Automated SUC-1 on a real URL (www.mozilla.org, production server): 14 faces, themed run, time on the Top 10. | SUC-1 by a human tester on the deployed URL (Phase 11) |
| 10 Final art | ❌ Blocked (art generation) | Done: sprite contract and validation for every shipped sheet, static check that runtime code never names `spritefusion.com`, E2E that records every request in startup and a full run (all requests go to the game server), `docs/art-pipeline.md` (contract, asset list, steps, prompt log). | Product owner signs in to the Sprite Fusion MCP (OAuth) and confirms credits; an agent then generates and commits the PNGs, switches sheets to `png` sources and re-runs the pixel check. Placeholder character and prop art stays until then. |
| 11 Deploy and launch gate | ⚠️ Repo work done; deploy blocked | `Dockerfile` (Playwright 1.56.1 image, Node 22.20, `npm ci --ignore-scripts`), entrypoint that runs the server as `pwuser`, `deploy/smoke-docker.sh` (run locally and in a CI job): health, server UID 1001, Chromium sandbox on with the Playwright seccomp profile (fails without it), face detection in the image, restart keeps scores, `DATA_DIR` holds no face data, meta tags. `e2e/production.spec.ts` (runs with `PROD_URL`). `docs/operations.md`, `docs/architecture.md`, `docs/launch-checklist.md`, README deploy section. Dependency licenses checked. | Railway project, token, volume and domain; production sandbox check; production smoke test; human SUC-1; launch checklist items 1, 2, 5 to 11 |

### 7.1 Engineering notes

- Phase 1: the server runs TypeScript directly with Node 22 type stripping (Node >= 22.19). There is no server build step. `tsconfig.base.json` sets `erasableSyntaxOnly` so code stays strippable.
- Phase 1: TypeScript is pinned to `~6.0` because `typescript-eslint` 8.x supports `<6.1.0`. `@playwright/test` is pinned to `1.56.1` to match the Chromium build in the dev container and in CI.

- Phase 2: `PixelCanvas` is the only writer to L1. It rounds every coordinate to whole art pixels (or whole L1 pixels for `fine*`), so non-integer draws cannot reach L1. Code review checklist: no other module calls `getContext` on the pixel layer.
- Phase 2: the client has a test hook (`window.__lr`) that exists only with the `?e2e` query flag. `?e2e=manual` runs the loop on a manual clock so scripted E2E runs are deterministic and fast. The hook adds no capability beyond what a player already has (the leaderboard is trust-based, C-2).
- Phase 2: render constants (`K_MAX`, `DPR_MAX`, `HEAD_W_ART = 32`, `MAX_CROP_PX = 512`) live in `shared/src/render.ts` so the Phase 8 crop cap uses the same values.
- Phase 2: reserved ramps are `CLOTHING_RAMP` (4 neutral grays) and `HIGHLIGHT_RAMP` (4 magentas) in `client/src/assets/manifest.ts`.

- Phase 3: level is 300 x 17 tiles of 16 art px (4,800 px). Run speed 1.5 art px per step (90 px/s), jump apex about 58 px. Every ground obstacle is at most 2 tiles above the ground the player stands on, so the floor route works with jumps only. Racks, trailer roofs, containers and conveyors are optional upper tiers.
- Phase 3: the world (player and, from Phase 4, enemies) holds still until the first gameplay key. This keeps Q-4 consistent: nothing can happen to the player before the timer runs. Engineering choice, not a product change.
- Phase 3: props are code-drawn placeholders until Phase 10. The exit sign uses a 3 x 5 pixel font on L1.

- Phase 4: each spawn point releases a small group (walkers 3, shooters 2, 26 px apart). Single enemies died before they reached the player, so combat added only about 2 s on Medium. Enemy HP stays at the planned 2 and 3.
- Phase 4: enemies jump when blocked by a wall. A walker that cannot clear a tall stack hops in place, which a player can pass or shoot.
- Phase 4: the combat bot (`client/test/helpers/combatBot.ts`) is one decision function used by the unit pacing test and by the E2E scripted run (its source is sent into the page). The `?e2e` hook exposes `world()` for this.
- Phase 4: pause menu keys are Tab or W/S to move, Enter to choose and Esc to resume. Arrow keys stay unused (CTL-2).

- Phase 5 deviation: the plan names `client/src/dev/fixtures.ts`. `AGENTS.md` (Edits 9) allows mock data only in tests, so fixture faces and colors live in `e2e/fixtures.ts`. Playwright serves them by mocking `POST /api/ingest`. The shipped client holds no mock data. `client/src/api/client.ts` therefore lands in Phase 5 with `ingest()`; Phase 9 adds the error, loading and upload flow.
- Phase 5: colors picked in the color picker also pass through `makeReadable`, so a picked color that fails 3:1 is lightened. Readable picks stay unchanged.
- Phase 5: face pops resample on their source grid: placeholder heads on the art grid, real faces on the L1 grid (the THM-5 finer grid).
- Phase 5: pause suspends the AudioContext. A key press during pause does not resume it.
- Phase 5: CI runs on pushes to `main` and on pull requests (one run per PR push instead of two).

- Phase 6: Fastify type coercion is off (`coerceTypes: false`), so `"1000"` is not accepted as `timeMs`. All API errors use `{ error, message }`; schema failures are `bad_request`.
- Phase 6: a retry of a run that did not place (or was pushed out) inserts again and is pruned again in the same transaction, so the board never shows a duplicate. `rowId` is `null` in that case.

- Phase 7: the IP policy is an allow-list (IPv4 `unicast`, IPv6 `unicast` inside `2000::/3` and outside `2001::/23`). Embedded IPv4 in mapped, compatible, translated, 6to4 and Teredo forms is checked with the IPv4 rule. NAT64 (`64:ff9b::/96`, `64:ff9b:1::/48`) is blocked outright. Only strict address forms parse; anything else fails closed.
- Phase 7: `rate_events` has a `kind` column so the Phase 8 upload limit (20 per hour) shares the table, the prune and the sweep.
- Phase 7: `safeFetch` sends no `accept-encoding`, so bodies arrive uncompressed and the byte caps apply to real bytes.
- Phase 7: `TRUST_PROXY_HOPS` maps to a Fastify trust function (trust the first N hops), because Fastify 5 types have no numeric `trustProxy`.

- Phase 8: model is `face_detection_yunet_2026may.onnx` (OpenCV Zoo re-export of 2023mar with dynamic height and width), MIT license verified from the Zoo `LICENSE` file and committed as `server/models/LICENSE-yunet`. Input is padded to a multiple of 32; the image is downscaled to 640 px for detection and crops come from the full image.
- Phase 8: crops are PNG with `compressionLevel: 9` and `adaptiveFiltering`. With default PNG settings a detailed 512 x 614 crop was about 456 KB, close to the 512 KiB cap; with these settings it is about 248 KB.
- Phase 8 deviation (headless redirects): Chromium does not send the request after a fulfilled 3xx back through `context.route`; it went to the dead proxy (verified by test). Main-frame navigations therefore run single-hop and the runner navigates to `location` itself (max 5 hops), so the document URL is the real final URL. Subresources follow redirects inside `safeFetch` (every hop checked, max 5). `redirectedFrom()` counting is not used.
- Phase 8: pool jobs take the ingestion abort signal. On the deadline queued jobs are dropped and a running job's worker is terminated, so no detection CPU is used past the budget.
- Phase 8: `.npmrc` sets `onnxruntime-node-install=skip` (CPU only; the linux/x64 install script otherwise downloads CUDA providers from NuGet).
- Phase 8 (CI fix): face workers are child processes, not worker threads. onnxruntime-node aborted the whole process (SIGABRT, `Napi::Error`) when a worker thread was terminated while it loaded the model. A killed child process cannot abort the server. `close()` also rejects running jobs and waits for the workers to exit. `server/test/helpers/poolChurn.ts` is the regression check.
- Phase 8: headless runner options `headlessSandbox: false`, `pool.testDetectDelayMs` and `ingestionMs` exist only as `createApp` code overrides for tests.

- Phase 9: the upload prompt focuses the visually hidden file input (Enter opens the chooser; Tab reaches Skip), so the flow works keyboard-only.
- Phase 9: the initials field has no native `pattern`; the shared `initials.ts` filter is the one check and shows its own message.
- Phase 9: `e2e/testServer.ts` (test-only) runs the app with an injected resolver and a fixture site for the real-server journey. It waits for the client build that the first Playwright web server makes.

- PR review fixes: the loop reports a frame's full real time before its steps, so the exit frame and the time after a long stall count (only the simulation is capped at 250 ms). Input is blocked while the narrow guard shows. Sprites stand on their lowest opaque row (`feet`), and `loadSheet` throws on a sprite-contract break. Enemy group spawn columns move to the nearest open space. Rotation keeps every opaque pixel of 1-pixel sprites. The rate-limit key is the full IPv4 address or the IPv6 /64 (IPv4-mapped counts as IPv4). Unknown `/api` routes are `not_found`; a 429 is `rate_limited`. A bad `Location` header is `unreachable`. A known `submissionId` under another difficulty gets `rowId: null`.

- Codex review fixes: unread bodies (redirect, error status, wrong type) are dropped, not drained. The connection tries every validated DNS answer. srcset follows the HTML candidate rules (no space needed after a comma). A malformed `%` escape in a link no longer stops the scan. Headless image candidates are deduped and capped at 1,000 as they arrive. The minimum face width (40 px) is checked in source pixels. An upload past the deadline is `upload_rejected`. Skip is disabled while an upload is pending. A late Top 10 answer for an earlier run changes nothing.

- Phase 11: the image installs with `npm ci --ignore-scripts`. All native deps ship prebuilt binaries; the image npm otherwise ran `node-gyp rebuild` for better-sqlite3 and failed without a compiler. The smoke script proves detection works in the image.
- Phase 11: Railway volume ownership is an unverified assumption (volumes may mount as root). The entrypoint handles both cases: as root it fixes the owner of `DATA_DIR` and drops to `pwuser` with `setpriv`.
- Phase 11: with the default Docker seccomp profile the Chromium sandbox does not start (verified). Production needs the Playwright profile or an isolated headless service (launch checklist item 5). Without it the server logs the launch error and serves static results only.

### 7.2 Proposed out-of-scope fixes

Found during implementation. Not in any phase; not built. Each needs a decision.

| # | Proposal | Why |
|---|---|---|
| P-1 | Redact client IPs from Fastify request logs (`req.remoteAddress`, `x-forwarded-for`) | Rate events store only an IP hash, but default request logs still print raw IPs. The plan only defines ingestion log fields. |
| P-2 | Fall back from `crypto.randomUUID()` to a `crypto.getRandomValues` UUID | `randomUUID` exists only in secure contexts. Production (https) and localhost work; plain-http access over a LAN would fail to submit scores. |
| P-3 | Move `actions/upload-artifact` to a release that targets Node 24 | GitHub warns that the v4 action runs on deprecated Node 20. |

### 7.3 Requirement status at the end of this implementation

Every requirement ID in section 4 has code and a passing check, except these:

| ID | Status | What is missing |
|---|---|---|
| RND-5, THM-3 (art), ENM-2 (art), C-3 | Blocked | Sprite Fusion art (product owner OAuth sign-in). Placeholder art follows the same contract. |
| C-4 | Open | Sprite Fusion terms review (launch checklist item 1). |
| DEL-1, DEL-2 (hosted) | Open | Railway deploy (project, token, volume, domain). The image passes the Docker smoke test. |
| ING-6 (production) | Open | Chromium sandbox on the production host or an isolated headless service (launch checklist item 5). Tested in CI and locally with the Playwright seccomp profile. |
| SUC-1, LVL-4 (human) | Open | Human SUC-1 on the deployed URL and 3 recorded Medium playtests. Automated: real-URL SUC-1 run on the production server build, Medium bot proxy 63.6 s. |
