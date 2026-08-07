# G2 Pre-Registration v2 — Hero-Flow Go/No-Go

> **This document is the lock (v2).** Once merged to `main`, the merge-commit SHA freezes every
> threshold, device, tool, and decision rule below; that SHA is recorded in the merge PR. Any
> later edit to this file voids the gate. **v2 supersedes the v1 lock `0d85f83c`, which was
> VOIDED per its own §8 on 2026-08-07** (owner decision, declared in PR #16) after the first
> measurement runs exposed three instrument-design flaws — not app failures:
> 1. Zero jitter tolerance: any inter-frame delta >11.11 ms counted as "over budget", so
>    invisible 1–5 ms pacing jitter was graded as jank (counted 2.29%; true full-vsync misses
>    were 0.17%).
> 2. The JS-thread rAF sampler measures JS event-loop scheduling, not rendered frames —
>    FlashList scroll renders on the UI thread (which measured p95 11.09 ms).
> 3. The TTI capture included ~1–1.5 s of uiautomator automation overhead plus manual
>    navigation, none of it app-attributable.
>
> All v1 raw arrays are preserved in `docs/g2-raw/` (sha256-verified) and remain auditable.
> Device identity, backend, apps under test, and O3/O5/S1 arms are unchanged from v1.

## 1. What G2 decides

A real scan→checkout hero flow, built on the full delight stack (Reanimated 4.5.1 + worklets
0.10.1 + Gesture Handler 2.32.0 + FlashList 2.0.2), must **beat the current Capacitor app** —
pass every locked objective floor on the owner's Pixel (O5 is match-or-beat; the strict wins
live in O1–O4) — AND win the owner's explicit side-by-side preference. Miss either and the
migration **STOPS — we polish Capacitor instead.**

## 2. Devices, budget, environment (unchanged from v1)

- Gate device: **Google Pixel 7** (panther, serial 32101FDH20035A) · Tensor G2 · 8 GB ·
  Android 16 (CP1A.260405.005) — recorded once in the `docs/g2-results.csv` header block.
- Display forced to its highest rate: **90 Hz** (`min_refresh_rate 90`), verified via
  `dumpsys display` (`renderFrameRate 90.0`). Frame budget = **11.11 ms** — 1000/90
  quantized to the exact value baked as `EXPO_PUBLIC_FRAME_BUDGET_MS=11.11`; the dropped-frame
  threshold below is derived from it (2 × 11.11 = 22.22 ms), so sampler, env, and doc share one value.
- Debug overlays OFF during measured runs (pointer location, refresh-rate overlay, show-touches).
- Backend: production (`https://vettrack.uk`), same account and data for both apps.
- Builds: RN = `assembleRelease` arm64 with `npm ci` lockfile discipline; Capacitor = the
  signed release build of the production app. Simulator/dev-mode samples never count.

## 3. Objective floors (ALL must pass on the gate device)

| # | Metric | Threshold | Method |
|---|---|---|---|
| O1 | Pooled p95 inter-frame delta, **UI thread**, during hero transition + FlashList scroll | **≤ 11.11 ms** | Reanimated `useFrameCallback` sampler; ≥5 valid runs (≥100 frames each), pooled frames |
| O2 | **Dropped frames**, UI thread, same interaction | **< 1%** where a dropped frame = inter-frame delta **≥ 2× vsync (≥ 22.22 ms)** — the industry jank definition; sub-vsync pacing jitter is NOT a drop | same sampler, same pooled set |
| O3 | tap → visual ack (optimistic commit) | **< 100 ms** | `scan_tap` → `scan_visual_ack` marks, ≥5 runs |
| O4 | Cold TTI to first interactive screen (Home) | **< 2 s** | `nativeLaunchStart` → `screenInteractive` where Home marks interactive on first mount — measures app boot ONLY, no navigation and no automation overhead. Cold = process force-stopped first. ≥5 runs, median. Cold-to-equipment-list is recorded as a **diagnostic**, not a floor |
| O5 | Hero task-time (paired, owner-run) | median (RN − Capacitor) ≤ 0 (match-or-beat) across ≥5 complete pairs, alternating order, ≥2 pairs per order | wall-clock scan→checkout per run on both apps; `run` = pair key; no silent exclusions — any RN-side failure fails O5 outright |

**JS-thread sampler is DIAGNOSTIC-ONLY in v2** — recorded and archived per run, never a floor:
it measures JS scheduling latency, which does not correspond to rendered frames in RN's
threading model.

## 4. Subjective floor (unchanged)

S1 — the owner runs the same hero flow on both apps back-to-back on the Pixel and issues an
explicit written verdict ("RN" or "Capacitor") with at least one concrete reason, recorded
verbatim in the results-file footer.

## 5. Measurement harness & reproducibility (unchanged mechanics)

- Instrumentation: `src/lib/instrumentation/perf.ts` + `useDualFrameSampler` +
  `G2MeasureScreen` (this PR). Budget baked via `EXPO_PUBLIC_FRAME_BUDGET_MS=11.11`;
  a missing budget fails loud.
- Every run's export JSON is archived as `docs/g2-raw/<tag>.json` with SHA-256 recorded in
  `docs/g2-results.csv` (`raw_sha256`). **O1/O2 must be recomputable from the archived raw
  frame-delta arrays alone**; O3/O4 are mark-derived scalars archived in the same export
  JSONs; O5 is owner wall-clock recorded directly in the CSV.
- **The archive filename is the authoritative run id.** The in-payload `run` field is a
  session-local counter that resets on app relaunch (plus `exportedAt` for disambiguation);
  analysis keys runs by filename, never by the payload counter.
- Runs with <100 frames on a sampler are invalid (`insufficient_samples`) and are replaced.
- CSV schema and O5 pairing rules as in v1 (schema row in `docs/g2-results.csv`).

## 6. Verdict rule (binding)

**PASS requires ALL of O1–O5 on the gate device AND an owner verdict of "RN" with a concrete
reason (S1).** Miss any objective floor OR an owner verdict of "Capacitor" → **STOP the
migration and polish Capacitor.** The written verdict and the CSV are the record.

## 7. Lock

- Lock SHA: the merge commit landing this file on `main` (recorded in the merge PR).
- Stack under test (frozen, exact resolved versions): reanimated 4.5.1 · worklets 0.10.1 ·
  gesture-handler 2.32.0 · flash-list 2.0.2 · Expo SDK 57 / RN 0.86.2 / New Arch / Hermes ·
  react-native-performance 6.0.0.
- Owner sign-off: v1-void + v2-relock decision approved in-session 2026-08-07.
