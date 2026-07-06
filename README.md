# JIT EXTRACTOR

**▶ [Play it live](https://jit-extractor.pages.dev)** — no install, runs in the browser.

A minimalist sci-fi extraction loop — prototype / vertical slice.
Land on a procedurally generated planet, deploy extractors, meet the ore
quota, defend the lander, and fly back to orbit. ~2–3 minutes per contract.

Built with TypeScript + Vite + Canvas 2D. **Zero runtime dependencies, no
asset files** — every sprite is drawn in code and every sound is synthesized
with WebAudio.

## Run it

```bash
npm install
npm run dev       # dev server
npm run build     # typecheck + production bundle in dist/
npm run preview   # serve the built bundle locally
```

## The loop

1. **SHIP** — you're in orbit. Walk to the console, `E` to launch the pod.
2. **DESCENT** — lander mini-game. `W` thrust, `A/D` steer. Fuel is enough
   to land softly, not to be picky about where.
3. **GROUND** — the contract:
   - Take crates from the lander (walk up to it: `Q`/`E` move the selector,
     **click or Enter** to take). Carrying a crate: 20% slower, no weapon.
   - `Q` drops the crate, **hold `B`** (2s) builds it.
   - **Extractor drills** only deploy on the glowing ore nodes. Fill the
     quota (200 ore), **hold `E`** (3s) on a building to deconstruct it —
     its progress is preserved in the crate. Return crates to the lander
     with `E` to bank the ore/fuel.
   - The **fuel generator** slowly makes fuel; **turrets** shoot hostiles.
   - Watch out: pirates guard nodes (2% grenade chance...), natives defend
     their camp, predators get hungry. Kill a pirate and reinforcements
     will droppod in, RimWorld-style.
   - Combat: **click** to shoot at the mouse, `G` tap lobs a grenade,
     **hold `G`** to cook + aim an arc. Grenades crater the terrain.
4. **ASCENT** — board the lander (launch slot in the menu), thrust up TO ORBIT.
5. **DOCKING** — payment processed. Next contract has a fresh map.

Death or losing the lander = **CONTRACT TERMINATED**, new run, new planet.

`M` toggles music at any time.

## Music

Drop `.mp3` files into `public/music/` and list them in
`public/music/manifest.json`:

```json
["track1.mp3", "track2.mp3"]
```

An empty list is fine — the game is silent but happy. All SFX are synthesized.

## Deploy (Cloudflare Pages)

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build` — output directory: `dist`.

Or with wrangler directly: `npx wrangler pages deploy dist`.

### Leaderboard + analytics backend (optional but recommended)

The `functions/` folder deploys automatically with Pages. To activate it:

1. Dashboard → **Storage & Databases → KV** → create two namespaces:
   `jit-scores` and `jit-stats`.
2. In the Pages project → **Settings → Bindings**: bind KV namespace
   `SCORES` → jit-scores, and `STATS` → jit-stats.
3. Same page → add a **secret** `ADMIN_KEY` = any long random string.
4. Redeploy. Without the bindings the game silently falls back to a
   local (per-browser) leaderboard.

**Moderation** (remove a bad entry):
`curl -X DELETE "https://YOURSITE/api/scores?id=ENTRY_ID&key=ADMIN_KEY"`
(get ids from `GET /api/scores`; omit `id` to wipe the whole board).

**Analytics**: runs are counted server-side as day+country+ending
aggregates — no IPs, no cookies, no fingerprinting, so no consent
banner is required. Read them with
`GET /api/event?key=ADMIN_KEY&day=2026-07-06`. For page-level stats
(visits per country), also enable the free cookieless **Web Analytics**
in the Cloudflare dashboard.

**Anticheat, honestly**: submissions are signed and server-side
sanity-checked (impossible profits/times rejected, per-IP rate limit),
which stops devtools-console tampering and casual replay. A determined
attacker reading the bundle can still forge a plausible score — that is
inherent to any client-side game. The `ADMIN_KEY` delete endpoint is
the backstop.

## Code map

```
src/
  main.ts          boot, fixed 60Hz loop
  game.ts          stage machine: ship → descent → ground → ascent → docking
  stages/          one file per gameplay stage
  world/           terrain (destructible 1D heightmap), seeded worldgen, World
  entities/        player, lander, pirates, natives, animals, buildings, pods…
  systems/         faction hostility matrix + war flags
  audio/           WebAudio SFX synth, folder-based music player
  ui/hud.ts        pips, bars, prompts
```

`window.__game` is exposed as a debug handle (used by the headless
verification scripts; `puppeteer-core` is a devDependency for that purpose).
