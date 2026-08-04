# AGENTS.md — VetTrack React Native migration

> **IMPORTANT — Expo has changed.** This project is on **Expo SDK 57**. Read the exact versioned docs at
> https://docs.expo.dev/versions/v57.0.0/ before writing any code. Do not rely on memory of older Expo/RN APIs.

`CLAUDE.md` imports this file (`@AGENTS.md`) — this is the single source of guidance for every agent tool.

## What this repo is

The target repo for migrating VetTrack from its current stack (React + Vite + Capacitor) to **React Native**.
The Capacitor app on the `vettrack` repo stays the always-shippable production safety net; **this repo is
isolated and never touches it.**

## Governance (read before any change)

- **The frozen source of truth is the Master Migration Anchor** (`~/.claude/plans/goofy-mapping-hellman.md`, owner's
  local plan). The stack below is frozen by the Anchor and is **not up for debate** — only the slice sequence is.
- **IMPORTANT: no Commit / Push / PR without explicit approval from the owner (Dan).** The AI proposes a documented
  work plan; the owner approves before anything lands. See `SCAFFOLD-PLAN.md`.
- Slices merge in dependency order via approved PRs. Current state and the next slice live in `SCAFFOLD-PLAN.md`
  (verify against `main` — it drifts as work lands).

## Frozen stack (Anchor — do not deviate)

- **Expo SDK ~57.0.9 · React Native 0.86.2 · React 19.2.3.** New Architecture is **mandatory** (Bridgeless:
  Fabric + TurboModules).
- **Workflow: Bare RN under Expo Prebuild (CNG).** `ios/` + `android/` are **generated and gitignored**;
  `app.json` + config plugins are the native-configuration source of truth — **never hand-edit the native dirs.**
- **State:** Zustand (client) + TanStack Query (server). No React Context for high-frequency state.
- **UI:** Uniwind 1.10.0 (Tailwind v4, CSS-first — replaced NativeWind, which is incompatible with SDK 57's Metro) ·
  FlashList 2.x (mandatory for lists) · Reanimated 4.x + Gesture Handler 3.x.
- **Persistence:** op-sqlite (WatermelonDB forbidden). Storage access **only via a Port adapter (MMKV)** —
  **fail-loud, never a silent no-op.**
- **Auth:** `@clerk/clerk-expo`. **Realtime:** `react-native-sse` (foreground-only). **i18n:** i18next +
  `I18nManager` RTL (Hebrew-first, same convention as the Capacitor repo).

## Commands

```bash
npm install                 # runs preinstall vendoring + postinstall patch-package (see Vendoring)
npm start                   # expo start (Metro)
npm run ios                 # expo run:ios   (prebuild + build + run on simulator)
npm run android             # expo run:android
npm run web                 # expo start --web
npm run typecheck           # tsc --noEmit — must be 0 errors
npm test                    # jest --watchman=false
npm run vendor:vettrack     # vendor @vettrack/contracts + @vettrack/shared from the Capacitor repo
```

**Native builds go through Expo prebuild** (`expo run:ios` / `expo run:android` regenerate `ios/`+`android/` from
`app.json`). Never commit the native dirs and never edit them by hand — change `app.json` / config plugins instead.

## Vendoring

`scripts/vendor-vettrack.mjs` vendors the shared `@vettrack/contracts` and `@vettrack/shared` packages from the
Capacitor `vettrack` repo. It runs automatically at **preinstall**, and `postinstall` applies `patch-package` from
`patches/`. A contract bump on the Capacitor side may need a companion re-vendor here.

## Structure

```
App.tsx              Mounts the root navigator
app.json             Native configuration source of truth (config plugins; bundle id uk.vettrack.rnmigration)
metro.config.js      Metro + Uniwind (withUniwindConfig); metro.resolve-ts-js.js for TS/JS resolution
src/
  app/               App-level composition
  navigation/        React Navigation (native-stack) — RootNavigator
  screens/           Screen components
  features/          Feature-scoped modules
  components/        Shared UI
  store/             Zustand stores
  lib/               Utilities (+ __tests__)
  i18n/              i18next + locales/ (Hebrew-first, RTL)
  core/ports/        Hexagonal ports (storage, etc.) — adapters live under infrastructure/
  infrastructure/    auth/ · storage/ (MMKV port adapter) · realtime/ (SSE)
  types/             Shared TypeScript types
patches/             patch-package patches (applied at postinstall)
scripts/             vendor-vettrack.mjs + migration scripts
```

## Working conventions

- **Verify on a real target before claiming done.** `tsc --noEmit` passing is necessary but **not sufficient** —
  build/run green on the booted simulator (and, for native modules like NFC, a physical device) is the bar.
- Storage/realtime/auth go **through their Port adapter**, never called directly from screens. A missing adapter
  must fail loud, never silently no-op.
- New user-facing copy goes through i18n (Hebrew-first); no hardcoded Hebrew in `.ts`/`.tsx`.
- Keep native configuration in `app.json` + config plugins; if a change needs native code, add/adjust a config
  plugin rather than editing `ios/`+`android/` by hand.
