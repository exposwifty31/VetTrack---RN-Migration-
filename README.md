# VetTrack — React Native migration

The target repo for migrating VetTrack from its current stack (React + Vite + Capacitor)
to **React Native**. The Capacitor app on the main `vettrack` repo stays the always-shippable
production safety net; this repo is isolated and never touches it.

> This README and `.gitignore` are kept updated as the migration progresses (per owner request).

## Stack (pinned — plan Decision 3)

| | Version |
|---|---|
| Expo SDK | `~57.0.9` (CNG / prebuild + config plugins — not bare CLI) |
| React Native | `0.86.2` (New Architecture is mandatory) |
| React | `19.2.3` |

Frozen through G4; one deliberate upgrade before G5 submission.

## Where this is in the plan

Gate ladder lives in the consolidated migration plan (owner-maintained, tracked outside this
repo); the table below is the repo-visible summary of gate status.

> **Corrected 2026-08-20.** The three rows below G2.5 were written on 2026-08-07 and were never
> updated as the work landed — they described G3 as "Slice 1", G4 as "first piece in flight", and
> G5 as "not started", all of which stopped being true within days. Every G3 slice, the whole G4
> ladder, and the G5 store configuration have since merged (PRs #22–#83). The line that said
> "store submissions are intentionally on hold" is also gone: the store push **is** the active
> program, and iOS build 27 had already reached App Store Connect's validator by 2026-08-14. Rows now
> carry the evidence that fixes them.

| Gate | State |
|---|---|
| **G1 — Foundation** | **code complete; hardware verification open** — slices 0–7 merged to `main` (incl. 5 SSE + 6 i18n/RTL); CI (typecheck + test) green. Not labelled *done*: `AGENTS.md` §Working conventions requires a physical-device pass before native-module work counts, and slice 8's NFC real-tag read is unrun. Capability shipped in W3b (PR #68); `docs/device-test-w3b.md` is the written protocol with every result box unticked. |
| **G2 — Hero flow (delight)** | **PASSED 2026-08-07** — pre-registration v2 lock `63c36b3` (PR #17): O1 pooled UI p95 11.09ms · O2 0/2886 dropped · O3 0.2–1.4ms · O4 cold-to-Home median 260ms · S1 owner verdict "RN"; O5 waived (declared deviation). Record: `docs/g2-preregistration.md` + `docs/g2-results.csv` + `docs/g2-raw/` |
| **G2.5 — Design language** | **implementation complete 2026-08-07** — Aurora shipped across Home + equipment list + checkout sheet (PRs #19/#21); exit bar passed on-device (UI pooled p95 11.08 ms, 0/2849 drops — `docs/g2_5-results.md`, PR #20). Open: combined three-screen device pass + light-theme seam. Scope + exit bar: `DESIGN-LANGUAGE.md` |
| G3 — Daily-driver parity | **code complete; owner gate open** — all 13 slices merged. Automatable half of the exit checklist passed (`docs/g3-results.md` §1 items 2/3/4); Slice 13 iPad recorded in §7. The three on-device items (items 1/5/6) are unrun: `docs/g3-results.md:214-218` still reads "… to be filled by the owner …" for both Pixel 7 and iPhone 16 Plus. **This unfilled verdict is the gate the whole ladder is waiting on.** |
| G4 — Code Blue + full offline | **built** — G4-1 viewer, G4-3 client push + Android FCM delivery, G4-4 snapshot resync, G4-5 Code Blue mutations, G4-6 offline write queue all merged. `src/screens/EmergencyScreen.tsx` mounts `CodeBlueActions` + `CodeBlueViewer` (no longer the "coming soon" placeholder). Server half is live too: `vettrack/server/lib/push-apns.ts` + `vettrack/server/lib/push-fcm.ts` sit beside web-push, and `POST /api/push/subscribe` accepts a native device `token`, not only a web `endpoint`. Unverified on hardware — push delivery has no device pass yet. |
| G5 — RN to stores | **config done; blocked on two owner actions** — `eas.json` carries production + submit profiles (ASC app `6778937527`, the existing store record); `app.json` carries `uk.vettrack.app`, privacy manifests, `ITSAppUsesNonExemptEncryption`, `associatedDomains`, Android `intentFilters`. iOS build 27 was uploaded and refused at validation (ITMS-90778, NDEF entitlement — fixed in PR #61); build 28 exists on EAS. ~~**Blocker 1:** `ios.buildNumber` is still `"28"`~~ **— closed 2026-08-21 (PR #89).** `app.json` now carries `ios.buildNumber` `"29"` and `android.versionCode` `10301`, and the collision gate no longer only runs in the networked mode: `scripts/release-config/ios-shipped-build-floor` records what App Store Connect has accepted, so `npm run release:preflight --offline` enforces it on every PR (`docs/release-config.md` §B1). **Carry forward:** the acceptance/preview build consumes 29/10301 permanently — `eas build:list` is not filtered by profile — so the submission build must be **30/10302**. **Blocker 2 (open):** no AAB has ever been uploaded to Play, so the Play App Signing SHA-256 does not exist and Android App Links cannot verify for store installs (`docs/release-config.md` §C). |

## G1 — progress

All foundation slices are merged to `main`: 0 (baseline), 1 (nav + Zustand), 1b (Uniwind styling),
2 (fail-loud MMKV storage port), 3 (Clerk-Expo auth), 4 (API client + TanStack Query),
5 (SSE, foreground-only), 6 (i18n + RTL), 7 (contracts/shared + Metro `.js`→`.ts` resolver).
`tsc` is clean and CI (typecheck + test) is green on `main`. The one open G1 item is slice 8
(NFC real-tag read). **Status corrected 2026-08-20:** it is no longer blocked on *capability* —
W3b (PR #68) shipped NFC write + lock, so the app can program a sticker — but the read itself is
still unproven on hardware. `docs/device-test-w3b.md` is the written protocol and its result boxes
are all unticked; the doc states plainly at line 5 that the result "is untested — not passed".

### NFC de-risk (done — kept here as reference)

NFC is the wedge flow. If `react-native-nfc-manager` can't work under the New Architecture,
the migration is a no-go — so it was de-risked first, before any other foundation work.
On a physical Pixel 7 the spike reports `isSupported=true` and the module initializes under New Arch;
the decisive real-tag read is the remaining partial (slice 8) — see the corrected status above.

- `react-native-nfc-manager@3.17.2` (stable / legacy-arch, runs via the New-Arch interop layer)
  with its Expo config plugin (NFC entitlement + usage string, in `app.json`). **The NDEF
  entitlement was removed 2026-08-14** — Apple refused build 27 with ITMS-90778 over it (PR #61);
  `app.json` now sets `includeNdefEntitlement: false`. Do not re-add it.
- **Issue #833 patch** — `patches/react-native-nfc-manager+3.17.2.patch` adds the one-line `return`
  in `ios/NfcManager.m` `getTag:` that otherwise double-invokes its callback → fatal `SIGABRT`
  under New Arch. Applied via `patch-package` on `postinstall`.
- `src/screens/NfcSpikeScreen.tsx` — spike screen with a real NDEF scan button and a **direct
  #833 repro** (calls `getTag()` with no session; must return a clean error, not crash).

**NFC hardware does not exist on the iOS Simulator** — the simulator build only proves the module
compiles/links under New Arch. The decisive on-device tag read runs on a physical iPhone.

## Run

```bash
npm install                 # runs patch-package via postinstall
npx expo prebuild -p ios    # generate ios/ with the NFC config plugin applied
npx expo run:ios            # simulator (compile/link check) — or a device for the real NFC test
```

## Conventions

- Bundle id `uk.vettrack.app` — the production store identity (migrated from the scaffold-era
  `uk.vettrack.rnmigration`; owner decision 2026-08-10, PR #52). This app ships to the existing
  store record and replaces the Capacitor shell there — the two cannot be installed side-by-side.
- `ios/` and `android/` are git-ignored — regenerated by `expo prebuild` (CNG). Native config lives
  in `app.json` config plugins, not hand-edited native folders.
