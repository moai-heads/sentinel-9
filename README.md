# SENTINEL-9 // NET CLEANSE

A single-file browser incremental/idle defender game (open `index.html`). You run
the last clean core on the internet; viruses and hackers converge on it while your
antivirus engine and defense modules fight back.

## Premise
The net is infected. You hold the central core — a computer with a shield. Threats
spawn in the surrounding sectors and rush the core. Keep INTEGRITY above zero,
cleanse sectors, and build a self-running defense.

## Two views
- **GRID (orbit)** — the god view: the core sits in a PS1-style low-poly diorama
  while threats fly in from the surrounding sectors.
- **FIRST-PERSON (FPS)** — drop into the room: run around the core and shoot the
  viruses yourself with WASD + mouse (pointer lock). Your unlocked auto-fire
  weapons keep firing alongside you, so the tower-defense layer stays live while
  you play. Press `F` (or `?fps=1`) to enter; `ESC` / `F` returns to the grid.
  The first-person level is a **city**: a street grid of blocks with high-rise
  towers (dense downtown core, lower-rise outskirts), rooftop podiums and aerial
  beacons on the tallest landmarks, and lamp-lit avenues. The core sits in a
  central plaza; buildings are solid colliders, so the streets are the arena.

## Mechanics
- **Cleanse nodes** — 10 collector tiers (CPU, RAM, GPU, SSD, BUS, COOLANT, QPU,
  NEURAL...). Each has its own fill bar and produces COMPUTE or MEMORY. Upgrade a
  node to speed its collection; upgrading node *i* unlocks node *i+1*.
- **MATERIALS** — **COMPUTE** and **MEMORY** are the two currencies, spent on node
  upgrades (of their own type) and defense modules.
- **Defense modules** — CLOCK RATE (+node speed), CACHE/ADDRESS BUS (+yields),
  FIREWALL (-incoming damage), OVERCLOCK CORE / COOLANT LOOP (+weapon output).
- **Auto-fire weapons** — you start with a single slow turret and unlock four
  more (cost COMPUTE/MEMORY, scale with node progression). Each has its own dps,
  rate of fire and tracer colour; together with your own gun they form the
  defense. `WEAPON DPS` is shown in the HUD.
- **Threats** — viruses (red) and hackers (amber). They spawn at the sector edge,
  *approach* the core, *contact* it, and chip INTEGRITY while in contact. The
  antivirus engine burns them down on the way in — **NEUTRALIZED** threats pay out
  COMPUTE/MEMORY and advance **NET CLEANED**.
- **Integrity / shield** — 100-pt core health. The shield reacts visually in tiers:
  **harmed** (yellow) below 66, **strained** (orange) below 33, and a red **breach**
  flash on a hit that would have been fatal-but-healed. Integrity slowly regens
  while the core is safe.
- **Sector cleanse** — cleaning threats fills the NET CLEANED meter; at 100% you
  advance a sector (EDGE EXCHANGE → ROOT NAMESPACE). **PURGE SECTOR** instantly
  cleanses a chunk for a big COMPUTE+MEMORY cost.
- **SYSTEM CRASH** — if integrity hits 0 the core is overwhelmed: session COMPUTE /
  MEMORY are lost, but you earn a **CHECKSUM** (+10% to all yields, permanent).
- **Keeping upgrades** — node levels, module levels, sector, and checksums all
  **persist** across PURGE, SYSTEM CRASH, and page reloads (localStorage). Progress
  is never fully wiped.

## Autoplay / idle
- `index.html?autoplay=1` — the game plays itself (buys modules, upgrades nodes,
  purges when rich). Good for idle/background growth and demos.
- `&speed=N` — multiplies game time (e.g. `speed=2`).
- `&seed=N` — deterministic RNG so headless runs are reproducible.
- `&fps=1` — boot straight into the first-person view (used by the demo capture).
- `&sim=SECONDS` — headlessly fast-forward a fresh state before rendering.

## Phase 1 — threat lifecycle & impact FX (DONE)
The "feel" layer that makes the idle defense read as a living attack:
- Threats have a real state machine: `approach → attack (contact) → dying`, with
  per-threat HP bars and hacker/virus variants.
- **Contact** pins a threat to the core and deals INTEGRITY damage; impacts spawn
  **particle bursts** (sparks on hit, shockwave on contact) plus a screen shake.
- **Shield states** driven by integrity tiers (harmed / strained / crit) with a
  red **breach** overlay flash, and antenna/PC glitch in the high tiers.
- Verified headlessly by `tools/playtest_p1.js` (see below).

## Tools (headless CDP)
Node scripts that drive the real page in headless Chromium over the DevTools
protocol — no dependencies beyond `node`, `chromium`, and `ffmpeg`.
- `tools/playtest.js` — general headless harness / smoke test.
- `tools/playtest_p1.js` — **Phase 1 verification**: samples the sim over time and
  asserts the full lifecycle (approach/contact/dying), particle counts, shield
  tiers, then forces low integrity to exercise strained/crit shield states and the
  breach overlay. Writes `report.json` + PNG captures.
- `tools/record_demo.js` — records a real-time-accurate MP4 of an autoplay run via
  CDP screenshots (timestamped frames encoded at the measured fps).
  Usage: `node tools/record_demo.js <seconds> <speed> <out.mp4> [seed]`.

Open the file directly in a browser; no build step.
