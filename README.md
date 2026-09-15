# NEXUS-7 // CONTAINMENT

A single-file browser incremental game (open `index.html`).

## Premise
You are an operator inside NEXUS-7. Assault network segments, salvage CYCLEs,
buy containment upgrades, and push DEEPER before the mainframe traces you.

## Mechanics
- **Target roster** — 10 named tiers; deeper tiers are exponentially tankier and richer.
- **CYCLEs** — currency from neutralizing targets; funds upgrades.
- **TRACE** — exposure grows while you attack a target (deepest tiers expose you fastest).
  Hit 100% and the mainframe **purges** you: cycles + position are lost, but
  **KERNELs** (+15% damage & salvage each), depth, and upgrades persist.
- **SCRUB** — spend cycles to vent trace.
- **Autoplay** — `index.html?autoplay=1` (demo/idle). `&speed=N` multiplies game time.

## Balance (tuned)
- HP `12 * 8^i`, reward `8 * 8.5^i`, trace/s `0.5 + 0.5i`
- Signal Amp +30%/lv (cost `10 * 1.42^n`); Clock Rate +0.5/s; Salvage +30%; Containment -9% (max 6)
- Verified curve (real page, speed=4): depth 3 ~64s, depth 5 ~100s, depth 9 ~190s game-time.

## Tools
- `tools/playtest.js` — headless CDP harness (see repo; rebuilt on demand).

Open the file directly in a browser; no build step.
