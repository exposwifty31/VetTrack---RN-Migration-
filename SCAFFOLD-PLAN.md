# VetTrack RN — G1 Scaffold Plan (proposed)

> Per the Master Migration Anchor (`~/.claude/plans/goofy-mapping-hellman.md` §Anchor): the AI proposes a
> documented work plan; **no Commit/Push/PR without explicit approval from Dan.** This is that proposal.
> Stack is frozen by the Anchor — not up for debate here; only the slice sequence is.

## Frozen stack (Anchor — do not deviate)
- **Expo SDK 57 / RN 0.86.2 / React 19.2.3**, New Architecture **mandatory** (Bridgeless: Fabric + TurboModules)
- Workflow: **Bare RN under Expo Prebuild (CNG)** — `ios/`+`android/` are generated and gitignored;
  `app.json` + config plugins are the native configuration source of truth, never hand-edited
- State: **Zustand** (client) + **TanStack Query** (server) — no React Context for high-frequency state
- UI: **Uniwind 1.10.0** (Tailwind v4, CSS-first — adopted in slice 1b, replaced the NativeWind v4 mandate), **FlashList 2.x** (mandatory for lists), **Reanimated 4.x** + **Gesture Handler 2.x**
  > **Correction 2026-08-20 (this line previously read ~~"Gesture Handler 3.x"~~):** the installed range is
  > `react-native-gesture-handler@~2.32.0` (Expo SDK 57's pin). Live truth: `AGENTS.md` §Frozen stack.
- Persistence: **op-sqlite** (WatermelonDB forbidden). Storage access **only via a Port adapter (MMKV)** — **fail-loud**, never silent no-op
  > **Correction 2026-08-19 (superseded — kept as written for the historical record):** op-sqlite never shipped.
  > The app's persistence engine is **MMKV** (`react-native-mmkv@^4.3.2`); `package.json` contains **no**
  > `op-sqlite`/`expo-sqlite` dependency and never has. The Port-adapter half of this line is correct and still
  > binding. Evidence: `src/lib/offline-queue/offline-queue-store.ts:1-15` (empirical reversal, verified
  > 2026-08-11); `docs/parity-triage.md:250-253` (decision record). Live truth: `AGENTS.md` §Frozen stack.
- Auth: **@clerk/expo**. Realtime: **react-native-sse** (foreground-only). i18n: i18next + **I18nManager RTL**
  > *Corrected 2026-08-20 (this line previously read ~~@clerk/clerk-expo~~):* the SDK was swapped to
  > `@clerk/expo@^4.5.0` in commit `2672a6e`. Caught by CodeRabbit on PR #85, not by the claim gate —
  > the package was named in **bold prose** rather than a code span, which the scanner did not read.
  > That gap is closed in the same stack (`scripts/verify/scan.js` now reads `@scope/name` from prose).

## Current repo state (verified 2026-08-04)
- `main` holds **slices 0 / 1 / 1b / 2 / 3 / 4 / 5 / 6 / 7 — all MERGED.** RN PRs #2–#5 (storage / contracts / Clerk / API) were un-stuck and merged in dependency order (#3→#2→#4→#5) on 2026-08-04; then slice 5 (SSE, #6) + slice 6 (i18n/RTL, #8) landed, plus the jest-preset fix (#7) and CI (#9). `tsc --noEmit` = 0 and CI (typecheck + test) is green on `main` after `npm install` (incl. `@vettrack/contracts` + `@vettrack/shared` resolving).
- Verified GREEN on iPhone 17 sim (nav) + physical Pixel 7 (NFC `isSupported=true` under New Arch).
  <!-- vt-claim: attested g1-device-smoke -->
- **G1 is complete except slice 8 (NFC real-tag, hardware-blocked on an NTAG). Next: G2 — hero flow.**

## Slice sequence (each slice: build/run green on the booted sim, THEN commit *with approval*)

**Slice 0 — Baseline commit.** Commit the existing Expo scaffold + NFC spike + `patches/` + `.gitignore` as the clean git foundation (right now everything rides on an empty "Initial commit"). *Needs commit approval.*

**Slice 1 — Structure + navigation + state + styling foundation.**
- `src/` architecture: `app/`, `navigation/`, `screens/`, `features/`, `components/`, `lib/`, `store/`, `i18n/`, `infrastructure/`.
- Install (via `npx expo install`, Expo-pinned): `@react-navigation/native` + `native-stack`, `react-native-screens`, `react-native-safe-area-context`, `zustand`.
- `RootNavigator` (native-stack) + `HomeScreen` + move the NFC spike to `screens/NfcSpikeScreen.tsx`; `App.tsx` mounts the navigator.
- **Verify:** `npx expo prebuild` + `npx expo run:ios` green on the sim → app boots into navigation. (New-Arch nav stack composes = the G1 bridge foundation.)
**Slice 1b — Uniwind styling (adopted; replaced the NativeWind mandate).** NativeWind 4.2.6 pulls in
`react-native-reanimated` 4.5.3 + worklets and is **incompatible with Expo SDK 57's Metro** — the
bundler dies with `Cannot read properties of undefined (reading 'transformFile')` (transformer-init
failure from its Babel integration, confirmed via 3 bisects); the v5 engine (`react-native-css`) is
frozen since Apr 2026 with no SDK-57-compatible release. Adopted **Uniwind 1.10.0** instead —
Tailwind v4, CSS-first, **Babel-free** (`withUniwindConfig` in Metro only), no reanimated dependency.
`src/global.css` holds the semantic VetTrack theme (dark default, light for parity per Uniwind rule 9);
`App.tsx` forces dark; `HomeScreen` + `NfcSpikeScreen` use `className`.
<!-- vt-claim: attested slice-1b-uniwind-sim -->
Verified on the iPhone 17 sim
(bundle 5.58 MB + `tsc` 0 + both screens rendered). The Anchor §1 (UI/UX) and §6 were amended
NativeWind v4 → Uniwind with owner approval. Reanimated 4.x stays in the Anchor for the G2 delight
stack but is no longer force-pulled by styling.

**Slice 2 — Storage port (MMKV, fail-loud).** ✅ **MERGED to main (#2, 2026-08-04).** `StoragePort` + `MmkvStorageAdapter` (fail-loud `StorageUnavailableError`) +
`safe-storage` shim + StorageDebugScreen. Local = MMKV `vt.local`; session = process-lifetime
memory (MMKV v4 has no in-memory mode). Deps: `react-native-mmkv` 4.x + `react-native-nitro-modules`.
Dirs: `core/ports`, `infrastructure`, `lib`, `i18n`, `features`, `components` + `@/` alias.
Skipped `src/app/` — Expo treats that path as Expo Router root and would hijack the entry.

**Slice 3 — Clerk-Expo auth.** ✅ **MERGED to main (#4, 2026-08-04).**
`@clerk/expo` (landed as ~~`@clerk/clerk-expo`~~; swapped in commit `2672a6e`) + SecureStore `tokenCache`
(not MMKV), `ClerkTokenBridge` →
`setClerkTokenGetter`, SignInScreen with azp decode helper. Live azp confirm gated
on `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` + real sign-in → record in PROOF.

**Slice 4 — API client + TanStack Query.** ✅ **MERGED to main (#5, 2026-08-04).**
`resolveApiUrl` + Bearer `authFetch` + thin `api` (`users.me`, realtime, `equipment.quickToggle`)
+ QueryClientProvider. RN native `fetch` only.

**Slice 5 — SSE (react-native-sse).** ✅ **MERGED to main (#6, 2026-08-04).** Foreground-only: `AppState` → `close()` on background, `open()` + replay-from-cursor on foreground (#14, #18 — no consumer cursor bookkeeping).

**Slice 6 — i18n + RTL.** ✅ **MERGED to main (#8, 2026-08-04).** i18next + he/en locales, `I18nManager.forceRTL` — reuse the vettrack locale JSON where portable.

**Slice 7 — Shared/contracts + Metro `.js`→`.ts` resolver (R5).** ✅ **MERGED to main (#3, 2026-08-04).** npm cannot install git `#ref:path` subdirs — pin
vettrack SHA via `scripts/vendor-vettrack.mjs` + `file:.vendor/...` deps.
`metro.resolve-ts-js.js` retries `.js`→`.ts`/`.tsx`; Uniwind stays outermost.

**Slice 8 — NFC device + real tag.** Close the wedge-flow no-go: run on a **physical iPhone** with an **NTAG** (owner has iPhone; no NTAG yet → blocked on a tag). Until then, slice 1's spike-on-device (isSupported=true + scan sheet opens) is the partial close.

## Gates that stay respected throughout
- No autonomous commit/push/PR (Anchor). Five RN skills are the standing lens each slice.
- op-sqlite × expo-updates Podfile clash → `"expo.updates.useThirdPartySQLitePod": "true"` when op-sqlite lands (Decision 1c).
  > **Correction 2026-08-19: this gate is moot.** op-sqlite never landed — persistence is MMKV — so the clash
  > cannot occur and the flag is deliberately **not** set (`grep -rn useThirdPartySQLitePod app.json` = no match
  > <!-- vt-claim: absent useThirdPartySQLitePod scope=app.json -->
  > at commit a06cbb5). Do not add it. See the Frozen-stack correction above.
- Reanimated/FlashList/Gesture Handler are the G2 delight stack — installed when the hero flow needs them, not slice 1.
