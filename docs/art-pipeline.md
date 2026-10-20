# Art pipeline (Sprite Fusion)

**Status:** ⚠️ Blocked. Generation needs a person to sign in to the Sprite Fusion MCP (OAuth). Until then the game ships code-drawn placeholder art that follows the same sprite contract (`client/src/assets/placeholders.ts`).

## Rules

- Characters and props come from Sprite Fusion (RND-5). Tiles and effects stay code-drawn (RND-6).
- Assets are generated ahead of time and committed under `client/public/assets/sprites/`. The live game never calls Sprite Fusion (RND-7). A unit test (`client/test/noLiveArt.test.ts`) and an E2E test (`e2e/assets.spec.ts`) check this.
- Prompts must not name or imitate Contra or Destroy Any Website assets (C-3). They are inspiration only.
- Read the Sprite Fusion terms for use of generated assets before public launch (C-4, `docs/launch-checklist.md`).

## Sprite contract

Defined in `client/src/assets/manifest.ts` and checked by `validateSheet` (unit test `client/test/manifest.test.ts`):

| Rule | Detail |
|---|---|
| Sheet layout | One row of frames, `frameW x frameH` art pixels each |
| Enemy bodies | Headless. Every frame has a head anchor (collar center) inside the frame. |
| Enemy clothing | Only the 4 `CLOTHING_RAMP` grays (`#3c3c3c`, `#5c5c5c`, `#7c7c7c`, `#9c9c9c`). Tinted to the secondary color at load. |
| Player highlights | Only the 4 `HIGHLIGHT_RAMP` magentas (`#4a1f4a`, `#7a2f7a`, `#aa3faa`, `#da4fda`). Tinted to the primary color at load. |
| Head size | `HEAD_W_ART = 32` art pixels wide (`shared/src/render.ts`). The server face crop cap depends on it. |
| Palette | Backdrops are fixed cold/warm colors (`client/src/level/zones.ts`). Do not put brand-like saturated colors in reserved ramps. |

## Asset list

| Sheet id | Kind | Frames and animations | Size |
|---|---|---|---|
| `player` | player | idle, run, jump, shoot, hit; highlight in `HIGHLIGHT_RAMP` | 16 x 32 |
| `walker` | enemy | walk, defeat; clothing in `CLOTHING_RAMP`; head anchor per frame | 24 x 22 |
| `shooter` | enemy | walk, shoot, defeat; clothing in `CLOTHING_RAMP`; head anchor per frame | 24 x 22 |
| `briefcase` | prop | spread, laser variants | 14 x 11 |
| props | prop | pallet, cardboard boxes, truck cab, semi-trailer, freight container, conveyor, shutter door | per prop |

About 15 to 30 generation calls (estimate). Generation tools cost 15 credits per call (refunded when no sprite is saved), so about 225 to 450 credits. Run the free `get_credits` tool first.

## How to run (product owner and an agent)

1. In a Claude Code session: `claude mcp add --transport http spritefusion https://www.spritefusion.com/mcp`, then `/mcp`, choose `spritefusion` and sign in.
2. `get_credits` to confirm the budget.
3. Generate a style anchor first with `generate_sprites` (32 px suggested), then the rest with `generate_sprites_in_style` using the anchor as reference. Animate with `animate_sprite`, fix with `edit_sprite`. Tag every result `logistics-run`. Do not use `create_8_directions` or normal maps (non-goal).
4. Post-process every sheet so clothing and highlight pixels sit exactly on the reserved ramp colors, and enemy bodies have no head.
5. Save PNGs to `client/public/assets/sprites/<id>.png`. In `client/src/assets/placeholders.ts` (or a new `sprites.ts`) switch each sheet to `source: { type: 'png', path: '/assets/sprites/<id>.png' }` and record per-frame head anchors.
6. Run `npm test` (manifest validation) and `npm run e2e` (pixel check, no Sprite Fusion requests).
7. Record the prompts used in the table below.

## Prompts used

None yet (blocked).

| Sheet | Tool | Prompt | Tag |
|---|---|---|---|
