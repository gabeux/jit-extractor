# Changelog

All notable changes to JIT Extractor. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are UTC.

## [1.1.0] — 2026-07-07

The "P.A.T. & Planets" update: a full guided tutorial, four languages,
living weather, variable contracts, and a big batch of playtest fixes.

### Added
- **P.A.T. (Personal Assistant Traveller)** — company-issued AI companion
  with a communicator UI: compact tablet portrait (CRT scanlines, glitch,
  animated talking face; drop `public/pat/portrait.png` to override),
  typewriter dialogue, 1–N choices, dialogue trees that can loop back,
  non-blocking hint mode with a gold pointer arrow, boxes that auto-place
  beside/below what they discuss and shrink to fit their text.
- **Guided tutorial (simulated drop)** — full first-run walkthrough:
  boarding, descent flight school, defense (turret + grenades), a scripted
  two-front pirate/tribal wave with a hold-your-ground briefing, fuel
  generator, extractor, pickup drone, medikit rules, harvesting, audits,
  launch and orbit. The sim is deathless (P.A.T. lectures you back to
  life), event-free, always clear-skied, quota-200, with buffed stats
  (+25% damage dealt, −50% taken, +33% mining, −35% fuel burn), a 2× hull
  self-repairing lander, invincible fuel gens, and a holographic SIM pod.
  Nothing from the sim touches the leaderboard, analytics, or the
  contract counter.
- **P.A.T. terminal** — a second console (pulsing `?`) on the ship
  reopens the intro to retake or skip the tutorial anytime.
- **Localization** — English, Português (BR), Español, Français. All
  strings (dialogue, HUD, prompts, debriefs, scoreboard) live in typed
  dictionaries; a first-launch flag picker with a cyan→red countdown bar
  defaults to English, and `L` cycles languages aboard the ship.
- **Dynamic weather** — clear / strong winds / rain / hail / rare
  thunderstorm, rolled per planet and drifting every 2–4 minutes with a
  smooth crossfade. Wind pushes grenades and leans on the lander;
  lightning prefers trees, damages what it hits, and turbo-charges drones
  (2× speed) and turrets (laser pulses, 2× damage & rate). Quiet
  synthesized ambience beds per weather.
- **Variable contracts** — contract #1 is always 200 ore; afterwards each
  planet rolls 100–400 (steps of 50). Planet quirks scale with contract #
  up to mission 10: feral fauna, lush grazers, extra native camps, or
  pirate-haven guard crews. Dying re-rolls everything.
- **Seasoned dropper** — mission 10+ debriefs add a gold
  "★ You're a seasoned dropper." (persisted for future rewards).
- **Stranded rework** — a destroyed lander no longer ends the run: the
  steal-a-pirate-ship path takes over. Cutter salvage pays $18,000; the
  lost lander is billed as a $3,000 write-off. While stranded: guaranteed
  pirate reinforcements within 7s if none are alive, a red arrow tracking
  the nearest pirate, and the pirate ship waits 30s longer on the ground.
- **Tribal war drums** — synthesized 6/8 pattern that swells as angry
  natives close in, panned toward them (WebAudio, no asset files).
- **Wilhelm pods** — 5% of drop pods target a warm body; the scream plays
  when a tribal is squished by a pod or the pirate ship's landing (which
  now actually crushes whoever stands in the landing zone).
- **Dream-ending escalation** — the meteor storm intensifies to
  near-continuous over a minute, with an increasing share of red tracking
  meteors that bend toward the player.

### Changed
- Lander rack `LAUNCH` renamed **BOARD & LAUNCH** (qualifier on its own line).
- `[V] SWITCH TARGET` hint moved from the screen bottom to directly under
  the active interaction prompt.
- Z-venting accelerates the longer it's held (35 → 160 ore/s).
- Medikit icon cross is green (the red cross emblem is protected).
- Weather HUD label reads `WEATHER:`, spelled out.
- Training debrief is a clean "TRAINING RUN COMPLETE" card.
- Squad pirates patrol their ship's perimeter and rush nearby players
  instead of hugging the hull.

### Fixed
- Tribals no longer jitter at spear range (movement hysteresis + sticky
  targeting), leap at targets perched above them, and never attack
  unprovoked — trespassers near camp get a menacing escort to the border
  instead. Attack animation is a proper jab-and-recoil lunge.
- Pirates stop dumping magazines into hillsides: after two blocked shots
  they lob a grenade over the terrain (30%) or advance for a real angle.
  A crew-wide 4s grenade cooldown stops stacked nade spam.
- Overweight ascent hop (TWR ≤ 1) explains itself ("TOO HEAVY TO FLY /
  HOLD Z") and no longer damages the lander.
- Ground camera no longer opens on the sky when a briefing pauses the
  first frame after landing.
- Dead lander shows "LANDER IS NO MORE." instead of a negative percent,
  and its wreck no longer offers the equipment rack.
- Leaderboard tabs are clickable (previously Q/E only).

## [1.0.0] — 2026-07-06

Initial public release: procedurally generated planets, extraction loop
(descent / ground / ascent / docking), pirates, natives, wildlife,
factions and wars, stranded pirate-ship escape, meteor-storm dream
ending, synthesized audio, shared Cloudflare KV leaderboard with
anonymous per-country analytics.
