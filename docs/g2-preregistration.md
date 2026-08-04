# G2 Pre-Registration — Hero-Flow Go/No-Go

> **This document is the lock.** Once committed, the commit SHA freezes every threshold, device, tool, and sample size below. No value may change after the lock SHA is recorded in §8 — a miss is a miss. Amending, force-pushing, or re-committing to move a number voids the gate.

## 1. What G2 decides
A real scan→checkout hero flow, built on the full delight stack (Reanimated 4.5.1 + worklets 0.10.1 + Gesture Handler ~2.32.x + FlashList 2.0.2), must **beat the current Capacitor app** on locked objective floors on a named budget device AND win a blind ≥70% staff preference. Miss either and the migration **STOPS — we polish Capacitor instead.**

## 2. Named devices (owner fills before lock — record exact values)
| Role | Device | Refresh rate | SoC | RAM | OS build |
|---|---|---|---|---|---|
| Android gate (primary, low-end) | `<e.g. Samsung Galaxy A16>` | `<Hz>` | `<SoC>` | `<GB>` | `<build>` |
| Android secondary (no-regression) | `<optional, e.g. Moto G Play 2024>` | `<Hz>` | | | |
| iOS floor | `<e.g. iPhone SE 3rd gen>` | `<Hz>` | | | |

All frame/tap/TTI floors are evaluated on the **Android gate (primary)** device. iOS is a secondary confirmation, not a veto.

## 3. Refresh budget → frame floor (parameterized)
| Refresh | Per-frame budget |
|---|---|
| 60 Hz | 16.67 ms |
| 90 Hz | 11.11 ms |
| 120 Hz | 8.33 ms |

**Locked gate-device budget = `<pick the row matching §2 primary>` ms.**

## 4. Objective floors (ALL must pass on the named gate device)
| # | Metric | Threshold | Method / tool |
|---|---|---|---|
| O1 | p95 frame time during the hero transition + FlashList scroll | **≤ device budget (§3)** | rAF-delta frame sampler (§6) cross-checked with Perfetto / Android Studio Profiler (Android) · Instruments Time Profiler + os_signpost (iOS) · RN DevTools Performance panel |
| O2 | Frames over budget during the same interaction | **< 1% of sampled frames** | same rAF sampler; count(frameΔ > budget) / total |
| O3 | tap→response (perceived) | **< 100 ms** | react-native-performance mark `scan_tap` → `scan_visual_ack` (optimistic UI commit) |
| O4 | Cold TTI | **< 2 s** | react-native-performance `nativeLaunchStart` → `screenInteractive`, **cold starts ONLY** (exclude warm/hot/prewarm) |
| O5 | Hero task-time | **≤ Capacitor** across the same ≥5 staff | wall-clock scan→checkout per participant, both apps |

> O1/O2 are **not** performance-mark measurable. They come from a requestAnimationFrame delta sampler (JS thread) PLUS a Reanimated `useFrameCallback` UI-thread source; report both threads separately.
> O3 measures PERCEIVED responsiveness at the optimistic commit. The separate `scan_server_confirmed` mark (network round-trip) is recorded for diagnostics but is NOT the O3 floor.

## 5. Subjective floor
| # | Metric | Threshold | Method |
|---|---|---|---|
| S1 | Blind preference | **≥70% of ≥5 staff prefer RN AND articulate a concrete reason** | counterbalanced unlabeled A/B (blind-preference kit); "concrete" = a named speed/tap/feel difference, not "looks nicer" |

## 6. Measurement harness
- Add `react-native-performance` via `npx expo install` (resolves 6.0.0, unpinned). Three distinct mechanisms: (a) cold-TTI marks O4; (b) tap marks O3; (c) rAF frame sampler + Reanimated `useFrameCallback` + `withTiming` completion callback for O1/O2.
- Capture ≥5 cold runs per metric per app; report median and p95. Discard warm/prewarm starts.
- Results CSV schema: `app,device,run,metric,value_ms,frames_total,frames_over_budget,participant_id,order`.
- Numbers are captured from a `--no-dev --minify` / release build on the §2 gate device only. Simulator + dev-mode samples are wiring smoke, never the verdict.

## 7. Verdict rule (binding)
**PASS requires ALL objective floors (O1–O5) met on the named gate device AND ≥70% blind preference (S1) AND hero task-time ≤ Capacitor (O5).** Miss any objective floor OR <70% blind preference → **STOP the migration and polish Capacitor.** The gate does not pass on management enthusiasm.

## 8. Lock
- Pre-registration lock SHA: `<filled by owner at commit>`
- Date locked: `<YYYY-MM-DD>`
- Stack under test (frozen): reanimated 4.5.1 · worklets 0.10.1 · gesture-handler ~2.32.x · flash-list 2.0.2 · Expo SDK 57 / RN 0.86.2 / New Arch / Hermes · react-native-performance 6.0.0.
- Owner sign-off: `<name>`
