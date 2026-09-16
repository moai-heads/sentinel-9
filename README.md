# SENTINEL-9 // NET CLEANSE

A single-file browser game (just open `index.html`). You are the last clean core
on the internet. Viruses and hackers converge on the computer at the centre of a
low-poly city; you drop in first-person and shoot them off before they reach it.

## The game
- **First-person city** — a street grid of blocks with high-rise towers (dense
  downtown core, lower-rise outskirts), rooftop beacons on the tallest landmarks,
  and lamp-lit avenues. The core computer sits in a central plaza; buildings are
  solid, so the streets are the arena. The FPS view is the default (and only) view.
- **Threats** — viruses (red) and hackers (amber) spawn on a full 360° ring around
  the core and fly inward. On contact they chip **INTEGRITY** continuously.
- **Your gun** — WASD + mouse look (pointer lock), click/Space to fire, Shift to
  sprint, Esc to release the mouse. Hitscan with tracers, recoil and hit flash.
- **Core auto-turret** — one built-in turret keeps firing while you reposition, so
  the core is never completely helpless.
- **Waves** — neutering threats fills the NET CLEANED meter; at 100% the wave
  advances and the swarm gets tougher and denser.
- **SYSTEM CRASH → REDEPLOY** — if INTEGRITY hits zero the core is overwhelmed and
  you can redeploy a fresh run.

## Rendering
Everything is procedural — no assets, no dependencies, no build step. The world is
a WebGL renderer (texture atlas built from 2D canvases, depth buffer, distance fog,
PS1-style ordered dithering) composited under a 2D HUD canvas (scanlines, grain,
vignette, viewmodel). The GL layer handles `webglcontextlost`/`webglcontextrestored`
and rebuilds its buffers/shaders/atlas, so it recovers from a GPU reset.

## URL parameters
- `?speed=N` — multiplies game time, e.g. `speed=2` for a faster run.
- `?seed=N` — deterministic RNG so headless runs are reproducible.
- `?autoplay=1` — the player runs itself (orbits the core, aims and fires). Good
  for demos/spectating.
- `?probe=1` — writes live state JSON into the DOM for headless verification.

## Repo layout
- `index.html` — the game (single file).
- `nexus7_original.html` — the earlier idle-defender incarnation, kept for reference.
- `preview.png` — hero render.
- `tools/` — headless Playwright/CDP helpers (playtests, captures, verification).
