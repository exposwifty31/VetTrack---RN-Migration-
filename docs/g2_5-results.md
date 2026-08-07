# G2.5 Exit Bar — frame-floor evidence (Aurora Home, on-device)

Measured 2026-08-07 on the G2 gate device (Pixel 7 panther, 90 Hz forced, release
arm64 build of `main` @ `9653cdf` — Aurora merged), production backend, signed-in
session. Same instrument and interaction script as the G2 record (5 s FlashList
scroll + checkout-sheet enter transition; UI-thread `useFrameCallback` sampler;
raw arrays archived with SHA-256).

## Result — no regression (DESIGN-LANGUAGE.md exit bar)

| Metric | G2 baseline | G2.5 Aurora | Floor | Verdict |
|---|---|---|---|---|
| UI pooled p95 | 11.09 ms (n=2886) | **11.08 ms** (n=2849) | ≤ 11.11 ms | **PASS** |
| Dropped frames (≥2×vsync, ≥22.22 ms) | 0 (0.000%) | **0 (0.000%)** | < 1% | **PASS** |

The single glass blur layer (top app bar) cost zero dropped frames.

## Runs (raw arrays in `docs/g2_5-raw/`, recomputable)

| file | ui frames | drops ≥22.22ms | sha256 |
|---|---|---|---|
| aurora-run01.json | 574 | 0 | `40a63095f7a15528…` |
| aurora-run02.json | 570 | 0 | `c72fe6f395ca59fc…` |
| aurora-run03.json | 562 | 0 | `d79a2ab5571d82ef…` |
| aurora-run04.json | 570 | 0 | `5ba22acc740ff40b…` |
| aurora-run05.json | 572 | 0 | `448a4137bfe650d0…` |

## Remaining exit-bar items (honest state)
- AA contrast: measured evidence tables live in the hand-off
  (`docs/design/aurora-home/direction-1c-aurora.md`); on-device light-theme render
  not yet exercised — the app currently pins the dark theme (theme toggle is an
  open G2.5 seam).
- RTL verified on-device (Hebrew-default screenshots, 2026-08-07).
- Equipment-list + checkout-sheet Aurora passes: pending their Stage-A hand-offs.
