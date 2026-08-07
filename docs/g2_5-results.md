# G2.5 Exit Bar — frame-floor evidence (Aurora Home, on-device)

Measured 2026-08-07 on the G2 gate device (Pixel 7 panther, 90 Hz forced, release
arm64 build of `main` @ `9653cdf` — Aurora merged), production backend, signed-in
session. Same instrument and interaction script as the G2 record (5 s FlashList
scroll + checkout-sheet enter transition; UI-thread `useFrameCallback` sampler;
raw arrays archived with SHA-256).

## Result — no regression vs the G2 baseline (DESIGN-LANGUAGE.md exit bar)

| Metric | G2 baseline | G2.5 Aurora | Floor | Verdict |
|---|---|---|---|---|
| UI pooled p95 | 11.09 ms (n=2886) | **11.08 ms** (n=2849) | ≤ 11.11 ms | **PASS** |
| Dropped frames (≥2×vsync, ≥22.22 ms) | 0 (0.000%) | **0 (0.000%)** | < 1% | **PASS** |

With the Aurora restyle in place — including its single glass blur layer on the
top app bar — the measured values remain within the 11.11 ms floor and show no
regression against the recorded baseline (11.08 ms vs 11.09 ms; 0 drops in both).
(No glass-off control run was taken, so no causal per-layer cost claim is made;
the claim is strictly no-regression against the recorded baseline.)

## Runs (raw arrays in `docs/g2_5-raw/`, recomputable)

Sample counts and drop counts are derived from the archived `deltasMs` arrays —
per the reproducibility contract, the arrays are authoritative; the in-payload
counters are advisory.

| file | ui frames (array) | drops ≥22.22ms | sha256 |
|---|---|---|---|
| aurora-run01.json | 574 | 0 | `40a63095f7a155280cca29a3697751fc67dc2e86bbc3efe65007dfda17a37f12` |
| aurora-run02.json | 570 | 0 | `c72fe6f395ca59fc5e6fd8e97953fb79f8a7bab31841933e07c4707ba0b4163c` |
| aurora-run03.json | 562 | 0 | `d79a2ab5571d82ef49c7034aa16dd8674606bcd7001bace578d5f6224e896ade` |
| aurora-run04.json | 571 † | 0 | `5ba22acc740ff40b3d4d2a11e454361bb0e2fb4b308760bca9b7e157c2b9a73d` |
| aurora-run05.json | 572 | 0 | `448a4137bfe650d049565dfe9faff2fc7c403dd8b2b287a24f4947fade28f79c` |

† `aurora-run04.json` records `framesTotal` 570 with 571 archived deltas — a
known one-frame race at sampler stop (the JS-side reads of the shared counters
and the delta array are not atomic against the still-settling UI-thread
callback). The archive is kept exactly as captured; the array is the record.
The race class is eliminated going forward by deriving counters from the array
at `stop()` (fix in this PR).

## Remaining exit-bar items (honest state)

- AA contrast: measured evidence tables live in the hand-off
  (`docs/design/aurora-home/direction-1c-aurora.md`); on-device light-theme render
  not yet exercised — the app currently pins the dark theme (theme toggle is an
  open G2.5 seam).
- RTL verified on-device (Hebrew-default screenshots, 2026-08-07).
- Equipment-list + checkout-sheet Aurora passes: **landed** (PR #21, merged to main
  `bb842d7`, 2026-08-07). Still open: one combined three-screen no-regression run
  on the device covering the restyled list scroll + sheet.
