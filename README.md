# crabcrt

CRT-style pixel animation for OpenCrabs releases. Built entirely by OpenCrabs itself.

## What it does

A 36-second looping animation with 4 phases:

1. **OPENCRABS** — text emerges from static noise, holds, dissolves
2. **v0.3.14 JUST DROPPED** — same pixel-emerge effect
3. **Highlights grid** — 8 key features/fixes in a 2×4 grid, emerging from pixels
4. **DOWNLOAD NOW** / **www.opencrabs.com** — call to action

Each phase follows the same rhythm: full noise wash → text coalesces from pixels → steady hold with subtle tremble → dissolves back into static.

## Effects

- Pixel-grain texture with brightness thresholding
- RGB channel split for CRT chromatic aberration
- CRT scanline overlay
- Static noise background
- Signal tremble during hold phases

## Usage

Just open `opencrabs-signal.html` in any modern browser. No dependencies, no build step.

## Built by OpenCrabs

Every line of this animation was written by OpenCrabs through iterative feedback. No human wrote any code.
