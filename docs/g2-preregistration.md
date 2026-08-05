# G2 Pre-Registration — Hero-Flow Go/No-Go

> **This document is the lock.** Once committed, the commit SHA freezes every threshold, device, tool, and decision rule below. No value may change after the lock SHA is recorded in §8 — a miss is a miss. Amending, force-pushing, or re-committing to move a number voids the gate.
>
> **Revision 2026-08-06 (pre-lock):** adapted to the owner's real constraints — stated as final facts in-session — before any lock SHA was ever recorded (§8 of the original template was never filled, so no lock existed to void). Two changes from the template: (1) the gate device is the owner's **Google Pixel** — the only Android device available — replacing the hypothetical low-end device; (2) the ≥5-staff blind preference arm is **not feasible** (no staff panel available) and is replaced by objective floors + the owner's explicit side-by-side judgment (§5).

## 1. What G2 decides

A real scan→checkout hero flow, built on the full delight stack (Reanimated 4.5.1 + worklets 0.10.1 + Gesture Handler ~2.32.x + FlashList 2.0.2), must **beat the current Capacitor app** on locked objective floors on the owner's Pixel AND win the owner's explicit side-by-side preference. Miss either and the migration **STOPS — we polish Capacitor instead.**

> **Honesty note (locked in, eyes open):** the original design called for a *low-end* Android device because that is where frame budgets break. A Pixel is a mid-to-high-tier device, so the objective floors are **easier to pass** than the template intended. This is accepted deliberately — we measure on the hardware that actually exists — and it means a PASS here says "RN beats Capacitor on good hardware", not "RN survives weak hardware". If a low-end device ever becomes available, O1/O2 may be *re-run* on it as extra evidence, but the verdict of record is the Pixel's.

## 2. Named devices (record exact values at measurement setup, BEFORE the first measured run)

| Role | Device | Refresh rate | SoC | RAM | OS build |
|---|---|---|---|---|---|
| Android gate (primary — verdict device) | Google Pixel (owner's device) — exact model: `<record via adb getprop ro.product.model>` | `<record via dumpsys display>` | `<record>` | `<record>` | `<record>` |
| iOS floor (secondary, non-veto) | physical iPhone if available; otherwise omitted | `<Hz>` | | | |

All frame/tap/TTI floors are evaluated on the **Android gate (primary)** device. Recording the exact model/refresh/OS rows is a **mandatory setup step before the first measured run**; measurements taken before these rows are filled do not count.

## 3. Refresh budget → frame floor (parameterized — the RULE is locked, the row is picked by the measured refresh rate)

| Refresh | Per-frame budget |
|---|---|
| 60 Hz | 16.67 ms |
| 90 Hz | 11.11 ms |
| 120 Hz | 8.33 ms |

**Locked rule: gate-device budget = 1000 / (measured refresh rate in Hz) ms**, using the §2 recorded value. If the Pixel runs an adaptive refresh rate, measure with the display forced to its **highest** rate (strictest budget) and record the forced value.

## 4. Objective floors (ALL must pass on the named gate device)

| # | Metric | Threshold | Method / tool |
|---|---|---|---|
| O1 | p95 frame time during the hero transition + FlashList scroll | **≤ device budget (§3)** | rAF-delta frame sampler (§6) cross-checked with Perfetto / Android Studio Profiler (Android) · Instruments Time Profiler + os_signpost (iOS) · RN DevTools Performance panel |
| O2 | Frames over budget during the same interaction | **< 1% of sampled frames** | same rAF sampler; count(frameΔ > budget) / total |
| O3 | tap→response (perceived) | **< 100 ms** | react-native-performance mark `scan_tap` → `scan_visual_ack` (optimistic UI commit) |
| O4 | Cold TTI | **< 2 s** | react-native-performance `nativeLaunchStart` → `screenInteractive`, **cold starts ONLY** (exclude warm/hot/prewarm) |
| O5 | Hero task-time (paired, owner-run) | **median of paired (RN − Capacitor) task-time ≤ 0** across ≥5 paired runs by the owner | wall-clock scan→checkout per run on both apps, alternating app order (RN-first on odd runs, Capacitor-first on even) to cancel practice effects; one paired difference per run (see §6 for missing-data handling) |

> O1/O2 are **not** performance-mark measurable. They come from a requestAnimationFrame delta sampler (JS thread) PLUS a Reanimated `useFrameCallback` UI-thread source; report both threads separately.
> O3 measures PERCEIVED responsiveness at the optimistic commit. The separate `scan_server_confirmed` mark (network round-trip) is recorded for diagnostics but is NOT the O3 floor.

## 5. Subjective floor (replaces the staff blind test — see revision note)

| # | Metric | Threshold | Method |
|---|---|---|---|
| S1 | Owner side-by-side judgment | **Owner runs the same hero flow on both apps back-to-back on the Pixel and issues an explicit written verdict: "RN" or "Capacitor", with at least one concrete reason** (a named speed/tap/feel difference, not "looks nicer") | Verdict + reason recorded verbatim in the results file. The owner is not blinded (infeasible with n=1 who also knows the codebase); this is acknowledged as weaker evidence than the original blind design and is compensated by the objective floors carrying the primary weight |

## 6. Measurement harness

- Install the locked dependency set with **`npm ci`** (drives `package-lock.json`, which already resolves `react-native-performance` 6.0.0 and the full delight stack exactly). Do **not** run `npm install` / `npx expo install` for the measurement build — an unpinned resolve could drift a dependency version out from under the lock and invalidate the numbers. Three distinct mechanisms: (a) cold-TTI marks O4; (b) tap marks O3; (c) rAF frame sampler + Reanimated `useFrameCallback` + `withTiming` completion callback for O1/O2.
- Capture ≥5 cold runs per metric per app; report median and p95. Discard warm/prewarm starts.
- Results CSV schema: `app,device,run,metric,value_ms,frames_total,frames_over_budget,participant_id,order` (`participant_id` = `owner` for every row under this revision).
- **Verdict numbers require a native release ARTIFACT** — `npx expo run:android --variant release` (or an EAS release build) on the §2 gate device. `--no-dev --minify` on a JS bundle is a **smoke check only**, not a verdict source; simulator + dev-mode samples never count.
- **O5 pairing / missing data:** each run contributes exactly one `(RN − Capacitor)` difference. If a run lacks a valid paired time on either app (error, retry loop, incomplete run), that run is **excluded from O5** (not imputed) and the exclusion is recorded; the ≥5 minimum must still be met by *complete* pairs.

## 7. Verdict rule (binding)

**PASS requires ALL objective floors (O1–O5) met on the owner's Pixel AND an explicit owner verdict of "RN" with a concrete reason (S1).** Miss any objective floor OR an owner verdict of "Capacitor" → **STOP the migration and polish Capacitor.** The gate does not pass on enthusiasm — the written verdict and the CSV are the record.

## 8. Lock

- Pre-registration lock SHA: the SHA of the commit that lands this revision on `main` (recorded in the merge PR; any later edit to this file voids the gate).
- Date locked: 2026-08-06
- Stack under test (frozen): reanimated 4.5.1 · worklets 0.10.1 · gesture-handler ~2.32.x · flash-list 2.0.2 · Expo SDK 57 / RN 0.86.2 / New Arch / Hermes · react-native-performance 6.0.0.
- Owner sign-off: approved in-session 2026-08-06 (device = Pixel, staff panel infeasible → owner judgment; commit explicitly requested by owner).
