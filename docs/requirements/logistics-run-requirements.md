# Logistics Run: Requirements (v2)

**Status:** Decision-complete. Open questions: none.

## Instructions for the coding agent

- Read this whole document before planning.
- Build exactly what sections 2 and 5 describe. Do not change a confirmed requirement.
- Section 3 lists preferences and examples. Treat them as optional.
- Section 4 lists non-goals. Do not build them.
- Section 9 lists items you may decide yourself.
- If two sections conflict, or a case is not covered, stop and ask. Do not guess on product behavior.
- Make a short plan first. Then implement.

## 1. Problem and desired outcome

- **Problem:** Corporate icebreaker games feel generic.
- **Outcome:** A public, single-player, retro run-and-gun web game. The player enters a company URL. The game themes itself with that company's brand colors and employee faces.
- **Success:** A player enters a URL, plays a 1 to 2 minute run and sees their time on a global Top 10.

## 2. Confirmed requirements

### 2.1 Delivery and access

- Hosted web app with a small backend. The backend fetches the target site.
- Public access. Any public URL. No accounts.
- Desktop browsers only. Keyboard only. No touch controls.
- Sound is included, with an on/off toggle.

### 2.2 Main menu and ingestion

- The user enters a URL and picks a difficulty (Easy, Medium or Hard).
- The main menu has a **Face style** setting: Auto (default), Smooth or Pixelated.
- The server reads brand colors from the site CSS first.
- The server then fetches static HTML. It looks for employee images on team, about and leadership pages. It also looks for author pictures on blog posts.
- The server detects faces and crops each image to the visible face only.
- If fewer than 5 faces are found, the server retries with a headless browser.
- If fewer than 5 faces are still found, the game asks the user to upload faces. The user can skip and play with reused faces.
- Ingestion times out after 30 seconds. Each IP gets 5 ingestions per hour.
- The server caches faces per domain for up to 24 hours. It then deletes them.

### 2.3 Theming and face rendering

- **Primary color:** player highlights, structural level accents and UI highlights.
- **Secondary color:** enemy clothing and secondary environment textures.
- **Enemies:** a scaled real face on a moving 2D "bobble-head" body. Clothing is tinted with the secondary color. Faces go on random enemies. Faces repeat if there are too few.
- **Face styles:**
  - **Smooth:** the face draws at full resolution on the high-res layer, over the pixel-art body.
  - **Pixelated:** the face is pixelated on a finer grid than the world pixels. It draws on the pixel layer.
- **Auto mode:** the game checks each face for quality at run start. If most faces pass, all faces use Smooth. Otherwise all faces use Pixelated. Uploaded faces count.
- **Override:** Smooth or Pixelated forces that style for all faces.
- If only one brand color is found, or the colors are unreadable, the game auto-adjusts them for readability and derives the missing color.
- If no color is found, an on-the-spot color picker opens.

### 2.4 Rendering and art

- **Target look:** crisp 90s pixel art. No blurry or off-grid pixels.
- **Layers:** all pixel art (sprites, characters, projectiles, particles and VFX) draws on a separate low-resolution layer. The layer scales up with no smoothing and stacks over any high-res layer. The source article uses 4x as an example.
- **Rotation:** rotated sprites draw on the low-res layer so pixels stay on the grid.
- **VFX:** gore, face pop, explosions and the laser use the pixel layer.
- **Art sources:**
  - Characters and props: Sprite Fusion (MCP).
  - Tiles and effects: drawn in code.
- Assets are generated at build time and committed. The live game does not call Sprite Fusion.

### 2.5 Controls

| Key | Action |
|---|---|
| A / D | Move left and right |
| W | Jump onto platforms |
| S | Drop down from a platform |
| Space | Fire in the facing direction |
| Esc | Pause and resume |

Arrow keys are not used.

### 2.6 Weapons

- Weapons come from floating power-up containers (briefcases). Collecting one replaces the current weapon.
- **Standard Pistol (start weapon):** one straight projectile.
- **Spread Gun:** a three-way fan, centered on the facing direction.
- **Laser Rifle:** a continuous horizontal beam with high damage. It pierces all enemies in line. Solid obstacles block it.

### 2.7 Enemies and defeat

- Enemies walk and hurt the player on contact. Some enemy types also shoot.
- Defeat uses a pixel-hit animation. The body shows light gore.
- The real face does a non-gory pop.

### 2.8 Lives, difficulty and timer

- 3 lives. One hit costs one life. The player respawns in place with brief invulnerability.
- The weapon resets to the Standard Pistol after each lost life.
- At 0 lives the level restarts. Lives reset to 3 and the timer resets to 0.
- **Easy:** slow enemies and lower spawn density.
- **Medium:** standard speed and baseline density.
- **Hard:** high speed and maximum density.
- An on-screen timer shows the run time to the millisecond. It stops when the player touches the final exit boundary.

### 2.9 Level

One continuous warehouse level with three zones:

- **Zone 1, Storage Aisle:** indoor warehouse floor. Metal racking as step platforms, stacked pallets and cardboard boxes.
- **Zone 2, Shipping Dock and Truck Lot:** the transition from the terminal doors to open tarmac. Trucks, semi-trailers and freight containers as tiered platforms.
- **Zone 3, Receiving Bay Entrance:** processing lanes, conveyor belts or terminal steps. The level ends at a large shutter door labeled as the Receiving Zone entry.

Pacing:

- A skilled player on Medium finishes in about 1 to 2 minutes.
- The player does not have to defeat all enemies to finish. There is no boss.

### 2.10 Pause

- Esc opens a pause menu. Esc again resumes.
- The timer and all game motion freeze while paused.
- Menu items: Resume, Restart level, Main menu and Sound toggle.
- Restart level resets lives and the timer.

### 2.11 Scoreboard and post-game

- One global leaderboard per difficulty. All sites share it.
- It ranks by fastest time and shows the Top 10.
- The game asks for 3 initials only if the run makes the Top 10.
- The browser reports the time. The only check is a 3-letter format filter (honor system).
- The post-game screen offers two actions: play again (same site and difficulty) or return to the main menu.

### 2.12 Security, privacy and takedown

- The server accepts only public http and https URLs.
- The server blocks private, loopback and internal addresses. This includes redirects and DNS tricks that point to them.
- The server limits response size and accepts only valid image content.
- Face detection and cropping only. No face recognition. No names stored.
- A footer link lets people request takedown or a domain blocklist entry. Blocklisted domains are rejected at ingestion.

## 3. Preferences and examples (not requirements)

- "Node on Railway" is an example stack. Any stack that meets the requirements is acceptable.
- Briefcases are an example look for power-ups.
- "Peak Q4 Rush" is an example name for Hard.
- Zone 3 obstacles are options. Pick any.
- Contra and Destroy Any Website (https://destroy.spritefusion.com/) are inspiration only. Do not copy their assets or code.
- Character size of 32 px is a suggestion. 16 and 64 px are also available in Sprite Fusion.
- Background look: cold light with warm accents (for example cold fluorescent aisles with warm amber lamps). Keep the background palette fixed so brand colors stay readable.
- Footer pattern from Destroy: an About link and a contact email.
- Neutral gray enemy clothing makes runtime tinting easier.
- Bodies without heads, and a head anchor point on every frame, make face placement easier.
- Implementer tip: turn off image smoothing and scale by whole numbers.

## 4. Non-goals

- Multiplayer, accounts or profiles
- Mobile or touch support
- Anti-cheat of any kind
- Boss fights or multiple levels
- Face recognition or identification
- Rebindable controls
- Per-company leaderboards
- A face review screen before play
- Shareable links, embeds or sponsor slots
- Mouse aim, grenades, weapon-switch keys or flying
- 8-direction sprites and normal maps

## 5. Edge cases and failure behavior

| Case | Behavior |
|---|---|
| Invalid, unreachable or blocklisted URL | Show an error. Let the user retry or upload manually. |
| Private or internal address | Reject with a generic error. |
| 30 second limit reached | Use partial results. Then follow the fewer-than-5-faces path. |
| Rate limit reached | Show a message. Do not start ingestion. |
| No brand color found | Open the color picker. |
| One color found, or colors unreadable | Auto-adjust. Derive the missing color. |
| Fewer than 5 faces | Prompt for upload. The user can skip. |
| Zero faces and user skips | Use placeholder heads. |
| Non-face, non-image or oversized images | Discard them. |
| Face style override set | Applies to all faces, uploaded ones included. |
| Leaderboard submit fails | Show the result and the error. Allow a retry. |
| Browser window too narrow | Show "Make the window wider to play". |

## 6. Confirmed constraints

- No face data is kept beyond the 24 hour domain cache.
- The leaderboard is trust-based.
- Do not copy third-party game assets. Generated assets are allowed.
- Before public launch, read the Sprite Fusion terms for use of generated assets. They were not reviewed for this spec.

## 7. Deferred ideas

- Server-side time checks or replay verification
- Offensive-initials filter
- Per-site leaderboards
- Contra-style aiming (up and diagonal)
- Mobile touch controls
- Face review screen
- Shareable link that pre-fills the URL
- More levels and a boss

## 8. Defaults applied (change on request)

- English-only UI.
- Uploaded faces are not stored beyond the session.
- A failed or timed-out ingestion falls back to manual upload and the color picker.
- The Face style setting resets to Auto each visit.
- Quality check: a face passes if its cropped source width is at least its on-screen width. "Most" means more than half.
- Pause menu items are Resume, Restart level, Main menu and Sound toggle.

## 9. Left to the implementer

- Enemy types and health
- Power-up count and placement
- Ammo model
- Exact speeds and densities per difficulty
- Pixel resolution and integer scale
- Pixel grid size for Pixelated faces
- Face detection method
- Audio source and default sound state

## 10. Art pipeline notes: Sprite Fusion MCP

### Setup

- Claude Code:

  ```
  claude mcp add --transport http spritefusion https://www.spritefusion.com/mcp
  ```

  Then run `/mcp` in Claude Code, choose `spritefusion` and sign in.

- Codex:

  ```
  codex mcp add spritefusion --url https://www.spritefusion.com/mcp
  codex mcp login spritefusion
  ```

- A Sprite Fusion sign-in is required. No API key is needed with OAuth.

### Tools that fit this game

| Tool | Use |
|---|---|
| `generate_sprites` | Up to 12 sprites per prompt at 16, 32 or 64 px |
| `generate_sprites_in_style` | New sprites that match 1 to 20 reference images. Use it to keep the player, enemies and props consistent. |
| `animate_sprite` | Walk, shoot and death motions from a motion prompt |
| `edit_sprite` | Fix a sprite, optionally with up to 8 reference images |

- Not needed: `create_8_directions`. This is a side-scroller. Flip sprites for left and right.
- Cost: 15 credits per generation call. Credits are refunded if no sprite is saved.
- Tag every result with one project tag, for example `logistics-run`.
- Input images: `data_url` up to 1 MB. Larger files go through `create_upload`. Images attached to a chat cannot go to the tools directly.

### Background look (from the Opus 5.5 article)

- A good art prompt sets mood, lighting and intended use. It leaves room for invention.
- Build the palette on strong warm and cold contrast.
- Name the effects you want. Name the target resolution.
- Example direction for this game:
  - Zone 1: cold fluorescent aisles with warm amber lamps. Dust and flickering strip lights.
  - Zone 2: cold dusk tarmac with warm headlights and dock lights. Exhaust steam.
  - Zone 3: warm interior glow from the shutter door against a cool exterior. Sparks from conveyors.
- Tiles and effects are drawn in code, not generated. Use these directions as a style reference.

## 11. Sources

- Destroy Any Website: https://destroy.spritefusion.com/
- Pixel art rendering trick: https://www.spritefusion.com/blog/pixel-art-rendering-trick-for-a-90s-look
- Pixel art scenes with Opus 5.5: https://www.spritefusion.com/blog/opus-5-5-for-pixel-art-scenes
- Sprite Fusion MCP docs: https://www.spritefusion.com/docs/pixel-art-generator/api/mcp
