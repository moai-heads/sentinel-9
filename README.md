# NEXUS-7 — Fake Movie-Hacker GUI

A single-file, dependency-free web page that looks like the mainframe interface
you only ever see in movies: amber-on-black CRT terminal, gratuitous system
logs, a rotating wireframe globe, live hex dumps, and a dramatic
ACCESS GRANTED / ACCESS DENIED verdict with a glitch pop.

Pure HTML/CSS/JS on `<canvas>` — no libraries, no assets. Open `index.html` in
any browser.

## Scenes

1. **Boot** — fake BIOS/POST self-test with a "SECURE KERNEL" banner.
2. **Idle desktop** — rotating wireframe globe, scrolling memory hex-dump,
   endless `[OK]`/`[WARN]` system log.
3. **Auth drama** — "AUTH REQUIREMENTS" console types a status, flashes
   ACCESS GRANTED (green) or ACCESS DENIED (red, glitchy), flips a bar graph,
   then loops.

Includes CRT scanlines, a radial glow, and occasional screen flicker.

(Recorded to video with Xvfb + x11grab, since headless Chromium throttled rAF.)
