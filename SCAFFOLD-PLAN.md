# VetTrack RN — G1 Scaffold Plan (proposed)

> Per the Master Migration Anchor (`~/.claude/plans/goofy-mapping-hellman.md` §Anchor): the AI proposes a
> documented work plan; **no Commit/Push/PR without explicit approval from Dan.** This is that proposal.
> Stack is frozen by the Anchor — not up for debate here; only the slice sequence is.

## Frozen stack (Anchor — do not deviate)
- **Expo SDK 57 / RN 0.86.2 / React 19.2.3**, New Architecture **mandatory** (Bridgeless: Fabric + TurboModules)
- Workflow: **Bare RN under Expo Prebuild (CNG)** — `ios/`+`android/` are generated and gitignored;
  `app.json` + config plugins are the native configuration source of truth, never hand-edited
- State: **Zustand** (client) + **TanStack Query** (server) — no React Context for high-frequency state
- UI: **NativeWind v4** (Tailwind), **FlashList 2.x** (mandatory for lists), **Reanimated 4.x** + **Gesture Handler 3.x**
- Persistence: **op-sqlite** (WatermelonDB forbidden). Storage access **only via a Port adapter (MMKV)** — **fail-loud**, never silent no-op
- Auth: **@clerk/clerk-expo**. Realtime: **react-native-sse** (foreground-only). i18n: i18next + **I18nManager RTL**

## Current repo state (verified 2026-07-31)
- `git`: **"Initial commit" only** — App.tsx (NFC #833 spike, built+ran on iOS Sim), app.json, assets/, .gitignore, patch are **all untracked**. No `src/`. None of the scaffold deps installed.
- iPhone 17 simulator is booted.

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
`App.tsx` forces dark; `HomeScreen` + `NfcSpikeScreen` use `className`. Verified on the iPhone 17 sim
(bundle 5.58 MB + `tsc` 0 + both screens rendered). The Anchor §1 (UI/UX) and §6 were amended
NativeWind v4 → Uniwind with owner approval. Reanimated 4.x stays in the Anchor for the G2 delight
stack but is no longer force-pulled by styling.

**Slice 2 — Storage port (MMKV, fail-loud).** ✅ built on `scaffold/g1-slice-2-storage` (awaiting
commit approval). `StoragePort` + `MmkvStorageAdapter` (fail-loud `StorageUnavailableError`) +
`safe-storage` shim + StorageDebugScreen. Local = MMKV `vt.local`; session = process-lifetime
memory (MMKV v4 has no in-memory mode). Deps: `react-native-mmkv` 4.x + `react-native-nitro-modules`.
Dirs: `core/ports`, `infrastructure`, `lib`, `i18n`, `features`, `components` + `@/` alias.
Skipped `src/app/` — Expo treats that path as Expo Router root and would hijack the entry.

**Slice 3 — Clerk-Expo auth.** `@clerk/clerk-expo`, `ClerkProvider` + token cache via the MMKV/SecureStore port, minimal sign-in screen. **Empirically decode a real Clerk-Expo token to confirm the `azp` claim** against `resolveClerkAuthorizedParties` (plan G1 check — traced as likely no-op, confirm on device).

**Slice 4 — API client.** Port the `auth-store` token-indirection pattern; typed fetch client against the existing server over **Bearer** (server already accepts it — plan, `realtime.ts:721`).

**Slice 5 — SSE (react-native-sse).** Foreground-only: `AppState` → `close()` on background, `open()` + replay-from-cursor on foreground (#14, #18 — no consumer cursor bookkeeping).

**Slice 6 — i18n + RTL.** i18next + he/en locales, `I18nManager.forceRTL` — reuse the vettrack locale JSON where portable.

**Slice 7 — Shared/contracts + Metro `.js`→`.ts` resolver (R5).** Consume `@vettrack/shared`/`@vettrack/contracts` (via git/path dependency — no registry needed yet); add Metro `resolveRequest` for the NodeNext `.js` specifiers.

**Slice 8 — NFC device + real tag.** Close the wedge-flow no-go: run on a **physical iPhone** with an **NTAG** (owner has iPhone; no NTAG yet → blocked on a tag). Until then, slice 1's spike-on-device (isSupported=true + scan sheet opens) is the partial close.

## Gates that stay respected throughout
- No autonomous commit/push/PR (Anchor). Five RN skills are the standing lens each slice.
- op-sqlite × expo-updates Podfile clash → `"expo.updates.useThirdPartySQLitePod": "true"` when op-sqlite lands (Decision 1c).
- Reanimated/FlashList/Gesture Handler are the G2 delight stack — installed when the hero flow needs them, not slice 1.
