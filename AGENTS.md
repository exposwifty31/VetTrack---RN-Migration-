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
  FlashList 2.x (mandatory for lists) · Reanimated 4.x + Gesture Handler 2.x.
  *Corrected 2026-08-20 (this line previously read ~~"Gesture Handler 3.x"~~):* `package.json` carries
  `react-native-gesture-handler@~2.32.0` — the version Expo SDK 57 pins — and no 3.x release was ever
  installed here. Caught by `npm run verify:claims`, which compares this line to the manifest.
- **Persistence:** **MMKV** (`react-native-mmkv`) — WatermelonDB forbidden. Storage access **only via a Port
  adapter** (`StoragePort` in `src/core/ports/storage.port.ts`, implemented by
  `src/infrastructure/storage/MmkvStorageAdapter.ts`) — **fail-loud, never a silent no-op.**
  *Corrected 2026-08-19 (this line previously read "op-sqlite"):* no `op-sqlite`/`expo-sqlite` dependency has
  ever existed in this repo — `package.json` carries `react-native-mmkv@^4.3.2` and no SQLite package at all.
  Evidence: `src/lib/offline-queue/offline-queue-store.ts:1-15` records the empirical reversal (verified
  2026-08-11); `docs/parity-triage.md:250-253` records the decision. The op-sqlite reference was aspirational
  web-side contract text, never this codebase's state.
  <!-- vt-claim: absent sqlite scope=deps -->
- **Auth:** `@clerk/expo`. **Realtime:** `react-native-sse` (foreground-only). **i18n:** i18next +
  `I18nManager` RTL (Hebrew-first, same convention as the Capacitor repo).
  *Auth package corrected 2026-08-20 (this bullet previously read ~~`@clerk/clerk-expo`~~):* the SDK was
  swapped to `@clerk/expo@^4.5.0` in commit `2672a6e`; that package has not been a dependency since. `src/__tests__/clerk-import-boundary.test.ts` pins that exactly one `@clerk/*` package is installed.

## Commands

```bash
npm install                 # runs preinstall vendoring + postinstall patch-package (see Vendoring)
npm start                   # expo start (Metro)
npm run ios                 # expo run:ios   (prebuild + build + run on simulator)
npm run android             # expo run:android
npm run web                 # expo start --web
npm run typecheck           # tsc --noEmit — must be 0 errors
npm run lint                # eslint . --max-warnings=0 — must be 0 warnings
npm run verify:claims       # claim gate: every statement in a governed doc must be accounted for
npm run verify:evidence     # run the declared gates and record the result (layer 3)
npm test                    # jest --watchman=false --forceExit
npm run vendor:vettrack     # vendor @vettrack/contracts + @vettrack/shared from the Capacitor repo
npm run release:preflight:offline   # EAS env accounting + build-number floor; no credentials needed
npm run release:preflight   # the same plus the networked half (needs EXPO_TOKEN)
```

**`lint` and `release:preflight:offline` are CI-enforced, but only indirectly — which is exactly why
they are easy to miss.** Neither is named in `.github/workflows/ci.yml`; the `Evidence gates` step
runs `npm run verify:evidence`, which executes the gates declared in `verify.config.json` — among
them `lint` and `release-preflight-offline`. A slice that passes `typecheck` + `test` can still be
refused by either, so run both before pushing.

**Native builds go through Expo prebuild** (`expo run:ios` / `expo run:android` regenerate `ios/`+`android/` from
`app.json`). Never commit the native dirs and never edit them by hand — change `app.json` / config plugins instead.

## Vendoring

`scripts/vendor-vettrack.mjs` vendors the shared `@vettrack/contracts` and `@vettrack/shared` packages from the
Capacitor `vettrack` repo. It runs automatically at **preinstall**, and `postinstall` applies `patch-package` from
`patches/`. A contract bump on the Capacitor side may need a companion re-vendor here.

## Structure

```text
App.tsx              Mounts the root navigator
app.json             Native configuration source of truth (config plugins; bundle id uk.vettrack.app — store-identity migration from uk.vettrack.rnmigration, owner decision 2026-08-10)
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
  infrastructure/    auth/ · storage/ (MMKV port adapter) · realtime/ (SSE) · push/ (native APNs/FCM device tokens)
  types/             Shared TypeScript types
patches/             patch-package patches (applied at postinstall)
scripts/             vendor-vettrack.mjs + migration scripts
```

## Claim verification (the docs are checked, not trusted)

Every statement in a governed document is resolved by `npm run verify:claims`, and the same engine runs
inside `npm test` (`src/__tests__/claims-ledger.test.ts`), so a document that starts lying fails CI. This
exists because it has already happened: the frozen-stack bullet named **op-sqlite** for months in a repo
that never had it, and said ~~**Gesture Handler 3.x**~~ while `package.json` carried `~2.32.0`.

**Four layers.** *Exists* — paths, line ranges, globs, dependency versions, npm scripts, the structure
tree, declared absence. *Executed* — a "MERGED"/"landed" line must cite a PR or commit, and that citation
must exist and be an ancestor of `main`. *Works* — the gates in `verify.config.json` must have run green
on this tree (`docs/audit/evidence-run.json`, written by `npm run verify:evidence`, never committed).
*Attested* — what the repo cannot prove (a device, the EAS store) is a dated entry in `docs/attestations.json`
with an expiry and a re-verify recipe.

**Every claim ends as** `verified` · `registered` · `attested` · `excluded by rule` · **FAIL**. There is no
"skipped": a silent skip and a passing check look identical from outside, and only one of them is honest.
One sixth label exists and is not an exception: on a tree where layer 2 cannot run at all (a shallow clone,
no `main`), commit and pull-request claims are counted `unresolvable` so the dispositions still sum to the
total. It appears only on a run that is **already failing** on `git-unavailable`, never on a passing one.

**When the gate fails, pick one — never a fourth option:**
1. The claim is **wrong** → fix the document. That is the common case and the point of the gate.
2. The claim is **true but unverifiable here** (a `vettrack` path, a transitive package, a planned file)
   → add an entry to `docs/claims-registry.json` with a reason a reader can audit.
3. The claim needs a **human on real hardware** → add an entry to `docs/attestations.json` and point at it.

Exemptions cannot rot: an entry that matches no live claim fails, and so does one whose claim would now
verify on its own — a planned file that gets built forces its own registry entry to be deleted.

**Writing claims:**
- Cite files in backticks (`` `src/lib/api.ts` ``, `` `src/lib/api.ts:12-20` ``). A shorthand that resolves
  as a path suffix is fine; a reference that resolves to nothing is not.
- A landing line must say what landed: `✅ MERGED to main (#4, 2026-08-04)`. A PR merged by rebase or squash
  has no merge commit — record its head sha in `docs/pr-ledger.json`, and the gate proves the merge locally
  by requiring that commit to be an ancestor of `main`.
- Superseded values go in `~~strikethrough~~`. Retracted text is not read as a claim, so the repo's
  correction style (`*Corrected YYYY-MM-DD (this line previously read ~~"…"~~)*`) stays safe to write.
- Two things prose cannot express unambiguously use an HTML comment, which changes nothing when rendered:
  `<!-- vt-claim: absent sqlite scope=deps -->` and `<!-- vt-claim: attested <id> -->`.
- **Device claims in prose are NOT auto-detected.** A heuristic was tried and produced four false alarms out
  of six matches on these very docs, so the marker is the only way a device claim enters the ledger. Adding
  the attestation is the author's job.
- **A marker inside `` `backticks` `` is an example, not a claim** — which is what makes the line above safe to
  write. A live marker sits in the prose on its own. Reading demonstrations as live meant an `attested <id>`
  example satisfied the "referenced by a governed document" rule by itself, and a stale attestation would
  never have been reported.
- **Close every `~~strikethrough~~` you open.** An unterminated run blanks the rest of the document, and its
  claims would vanish with no failure; the gate reports the run instead. A `` `~~` `` inside a code span is
  literal text and does not open one.

Scope lives in `verify.config.json` — governed documents, ignored prefixes, cross-repo prefixes, evidence
gates. A document that is not listed is deliberately ungoverned, not accidentally missed.

**The engine is shared with the Capacitor repo and cannot drift quietly.** `scripts/verify/*.js` here is the
same code that repo carries as `scripts/verify/*.cjs` (it is `"type": "module"`, so the copies differ only in
the extension inside their internal `require` calls). Nothing offline can compare two repositories, so
`scripts/verify/fingerprint.js` hashes the engine with that one difference normalised away, both repos record
the result in `verify.config.json` as `engineFingerprint`, and the gate fails when the local files stop
matching it. Editing the engine therefore costs a deliberate, reviewable line that says the shared code
changed — which is the moment to port it. The hash covers the fingerprint module itself, so the rule that
decides what counts as drift cannot drift for free.

## Working conventions

- **Verify on a real target before claiming done.** `tsc --noEmit` passing is necessary but **not sufficient** —
  build/run green on the booted simulator (and, for native modules like NFC, a physical device) is the bar.
- Storage/realtime/auth go **through their Port adapter**, never called directly from screens. A missing adapter
  must fail loud, never silently no-op.
- New user-facing copy goes through i18n (Hebrew-first); no hardcoded Hebrew in `.ts`/`.tsx`.
- Keep native configuration in `app.json` + config plugins; if a change needs native code, add/adjust a config
  plugin rather than editing `ios/`+`android/` by hand.
