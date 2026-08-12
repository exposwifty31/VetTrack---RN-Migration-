# VetTrack — Gated React Native Migration (consolidated, evidence-locked)

> **Owner:** Dan · **2026-07-30** · Consolidated authoritative version. Two audit passes folded in:
> **(A)** every repo claim verified against files + git; **(B)** every React-Native/platform claim
> verified against primary sources (RN release notes, library repos, Expo docs, Apple/Google docs).
> A third cross-reference pass then closed the remaining gating checks against tag-pinned source,
> the npm registry, local clones, and `gh` (see **Verification Addendum** at the end).
> **The gate ladder survives. Several of its premises did not, two "open decisions" are now closed by
> evidence, and one finding has a 31-day fuse that has nothing to do with React Native.**
> 2.0's Case Spine thesis remains platform-neutral and continues independently.

---

## Branch-state update (2026-07-31) — 6 commits landed after the audit

> **Read this before the corrections tables below.** The audit's "current state" premise
> (1.2.0 / build 26, entitlements set, ripcord) was captured against `origin/main`. Since then
> **6 commits — the NFC-sticker release — landed on branch `claude/apple-ios-question-7x1fft`**
> (`origin/main...HEAD` = 6, **unpushed**). Re-verified each pass-A finding they could touch;
> mapped below. **Scope boundary:** these commits touch only pass-A (repo) findings and
> current-state premises. **Pass-B (RN/platform, tag-pinned source) and the empirical-only gating
> checks (16 KB alignment, device NFC) do not go stale from repo commits — those stand exactly as
> marked in the addendum.** The five landing commits touching code: `23388bf9a` (NFC sticker lock +
> NDEF entitlement), `c49ff01e7` (sticker payload + UID binding), `9418a75b4` (pbxproj object-id fix),
> `8849e9171` (submission wizards + monitoring specs), `f25da7323` (version bump).

| Finding | Re-verified 2026-07-31 | Detail |
|---|---|---|
| **#3** — "1.3.0 / build 27 never existed on any ref" | ⚠️ **NOW SUPERSEDED (branch), still true for `origin/main`** | `f25da7323` was committed **2026-07-30 19:52** — *after* the audit pass, via `pnpm resubmit:release 1.3.0` — and **does** set `MARKETING_VERSION = 1.3.0` / `CURRENT_PROJECT_VERSION = 27` in `project.pbxproj`. It exists **only on this branch**, 6 ahead of `origin/main`, **unpushed**. ⚠️ **Do not read `ios/.last-shipped-build` = 25 as ground truth** — `PROOF_ALIGNMENT_LOG.md` (2026-07-30) records live ASC state (`asc versions view`) as the authority: **1.2.0 / build 26 is APPROVED** (`READY_FOR_DISTRIBUTION`, held on MANUAL release); `.last-shipped-build=25` is a **known-stale artifact that was never updated**. So the iOS shipping state is: **26 approved-but-unreleased**, **27 (=1.3.0) engineering-green and committed locally**, awaiting owner Mac archive+upload + ASC 1.3.0 creation. → **G0 item 2 is effectively done in engineering** (bump run, committed, `verify:resubmission` 17/0); what remains is owner store actions the owner has set aside. The audit was not wrong — it read the pre-bump repo state; the bump, and the live-ASC correction, are both newer than the audit. |
| **#2** — "Critical Alerts entitlement absent, never applied for" | ✅ **STILL HOLDS (re-verified)** | The entitlements file **advanced** — `23388bf9a` added `com.apple.developer.nfc.readersession.formats` (NDEF, TAG). But `com.apple.developer.usernotifications.critical-alerts` is **still absent** from `ios/App/App/App.entitlements` (present keys: nfc formats, applesignin, `aps-environment=production`, associated-domains). Two different entitlements; the ordinary-push one is still all there is. |
| **#10 / R4** — "ripcord is a Mac-only manual ritual, unobservable" | ✅ **STILL HOLDS (re-verified)** | `8849e9171` did **not** touch `verify-resubmission.sh` or `release-gate.yml`. It added **new** tooling — `scripts/wizards/apple-resubmit.sh`, `scripts/wizards/play-console-setup.sh` — plus monitoring **specs** (`docs/ops/workflows/{submission-status-monitor,play-14day-clock}.md`). Useful context for **G0 item 4**, but they are unwired wizards/specs, not CI-observable gates — the observability gap the correction names is unchanged. |
| **#1** — "'entire backend untouched — client-only' is false" | ✅ **REINFORCED** | The 6 commits touched `server/lib/well-known-assetlinks.ts`, `server/lib/pg-errors.ts`, and a route handler — server code moving alongside a client feature. (These are NFC-sticker changes, not the shared-package extraction #1 predicts; the general point stands. The assetlinks edit is also relevant to **G4**'s association-files item.) |

### G0 item 1 / R7 — empirically CLOSED 2026-07-31 (the "31-day fuse" was a false alarm)

Both Android release-gate checks the plan marked as unresolved-until-a-real-build are now **verified
green on the current Capacitor app** — checked directly, not inferred:

- **targetSdk 36 — already satisfied.** `android/variables.gradle` = `targetSdkVersion 36` /
  `compileSdkVersion 36` (AGP 8.13.0, Capacitor 8). Present **since the file was created**, and on
  **`origin/main`**, not a branch artifact. The 2026-08-31 deadline is met in code. **The
  extension-to-2026-11-01 request is unnecessary** — owner confirmed intent to file it as a safety net
  on 07-31, but it is moot given this.
- **16 KB page alignment — verified.** `bundletool dump config --bundle=android/app/build/outputs/bundle/release/app-release.aab`
  → `"alignment": "PAGE_ALIGNMENT_16K"`. The AAB carries 8 `.so` (Capacitor camera/image-processing
  libs, all four ABIs); Android NFC rides the web/Capacitor layer and adds no native `.so`, so the NFC
  commits don't change this. (AAB dated 07-29, pre-NFC-commits, but the native `.so` set is unaffected —
  a fresh AAB is belt-and-suspenders, not a blocker.)

**Net:** R7's "🔴 Android release gates bind the current app, now" downgrades to ✅ **not binding** for the
current Capacitor app. The RN-side residual (G1: confirm 16 KB on the first RN AAB, since op-sqlite ships
`.so`) is unchanged and still pending a real RN build.

### G0 item 4 / R4 — ripcord Lane A now observable in CI (2026-07-31)

Split done. The Linux-CI-runnable static subset of `verify-resubmission.sh` is extracted to
`scripts/verify-resubmission-static.sh` (7 gates: icon 1024/no-alpha via a pure-Python PNG-header
parse replacing `sips`; build > last-shipped; no literal `CFBundleVersion` in tracked source plists;
3 Control-widget files; `applinks:vettrack.uk` entitlement — all git-tracked files, no Mac/network/
secret/build-output). **Anti-rot:** the gates live in that one script; the Mac `verify-resubmission.sh`
now *calls* it and folds its `STATIC_RESULT PASS/FAIL` into its own totals, so CI and the Mac run cannot
diverge. New workflow `.github/workflows/ios-resubmission-static.yml` runs it on every push/PR to `main`
(+ `workflow_dispatch`). Verified: static run green (7/0) standalone and inside the Mac script; the
Mac/network gates still fail-closed without secrets (Lane B, expected).

- **Lane B remainder (still Mac/network/build-only, deliberately NOT in CI):** demo login (prod Clerk +
  `REVIEWER_PASSWORD`), Clerk admin config (`sk_live`), API CORS, bundled-shell + native-auth checks
  (read gitignored `public/assets/*`), live AASA fetch. **"Schedule set 2" is an owner infra decision**
  — it needs a macOS runner + prod secrets wired as repo/Actions secrets + acceptance that it probes the
  production Clerk instance. Not wired blindly; flagged for the owner.
- **Optional follow-up:** mark the new workflow a *required* status check in branch protection (owner
  Settings action) so a regression on a static invariant actually blocks a `main` merge.

### G1 shared/contracts extraction — started 2026-07-31 (Approach A) + R2 downgraded

- **shared/ is now package-shaped** (`@vettrack/shared`: manifest + barrel), WITHOUT rewriting the 68
  in-repo import sites (Approach A — zero touch to Code Blue/authority import lines). The G1 no-go trigger
  "can't extract shared/ without destabilizing web CI or touching frozen surfaces" is **disproven**:
  frontend+server tsc 0, contracts:typecheck 0, `pnpm build` 0, `pnpm test` 6158 passed. Commits
  `417c8f716` (dead `shared-contracts` residue removed) + `41cc35021`. Deferred: subpath/tree-shaking
  `exports` design (#20) and actual publish (registry — owner). Full import-rewrite (B) optional/later.
- **R2 was over-stated — the fork is already collapsed.** `contracts/emergency.ts` is the single source;
  `shared/emergency-surfaces.manifest.ts` re-exports it + appends non-emergency Phase-9 pairing routes
  (collapsed in `d960d45d6`). RN consumer (`offline-emergency-block.ts`) imports from contracts → gets all
  emergency surfaces; the OFF-07 parity gate guards divergence (63 tests green). Only a misleading
  "ported FROM shared" comment remained → fixed (`5e662251e`). R2 needs no structural change.
- **ADR-009** (native push, R3/G0-item-3 design) landed proposed (`298d3b5f3`).
- **R1 was over-stated — no clinical-safety fix needed, and the prescribed fix is wrong.** Traced the
  offline emergency block (`src/lib/request-core.ts:243-251`): `classifyEmergencyEndpoint` (pure logic, no
  storage) → `toast.error` → `throw OfflineEmergencyMutationBlockedError` (blocks, never queues) →
  `reportEmergencyBlockedSilently` (counter POST). **The entire loud-failure path is storage-independent
  and works on RN.** The only storage-dependent call is `recordEmergencyBlockLocally` — a **best-effort
  telemetry buffer** (`writeBuffer` already try/catches with a "best-effort only" comment; silent no-op is
  intended even on web private-browsing). Making it throw loud would *contradict* the design and could
  break web private-mode users. CSO PASS — the Code Blue offline-loud-fail doctrine holds on RN as-is.
  Real (non-safety) residual: the RN scaffold must inject a storage adapter (MMKV/AsyncStorage) so
  persistence-wanting features (settings, i18n, the telemetry buffer) don't silently degrade — a
  **scaffold-time** concern, not a src/core change now.
- **Clerk `azp` — verified likely no-op.** `server/index.ts:302` → `clerkMiddleware({ authorizedParties })`.
  Installed **@clerk/backend@1.34.0** `assertAuthorizedPartiesClaim` (`dist/jwt/index.js:329`):
  `if (!azp || !authorizedParties || authorizedParties.length === 0) return;` — an **azp-absent token skips
  the check**; it only throws when azp is present and unlisted. @clerk/expo tokens (no browser origin)
  typically carry no azp → **no server change to `resolveClerkAuthorizedParties` expected.** Empirical
  confirm (decode a real Expo token) deferred to the scaffold; if it carries an azp, add that one value.
- **Meta:** FOUR of the plan's risks/items now deflate on deep tracing — **R7** (Android gates, closed),
  **R2** (manifest fork, already collapsed), **R1** (storage silent-fail, not a safety issue), **Clerk azp**
  (native tokens skip the check). The risk section was written from a shallower read; the migration's
  blocking-risk surface is smaller than the draft implied. R3/R4/R5/R8 remain real.
- **Inflection:** the **vettrack-repo side of G1 is essentially complete + de-risked** (shared packaged,
  R2 fixed, R1/azp/R7/16KB no-op, ripcord in CI, push ADR'd). The substantive remaining G1 work — the
  **Expo scaffold** (Clerk/API/SSE/i18n, Metro R5 `resolveRequest`, storage adapter for R1's residual, NFC
  device+tag) — lives in the **separate RN repo**. `contracts` "publish for real" is registry-blocked
  (owner) and partly premature (Metro can consume `contracts` src directly via a git dependency). The next
  real move is either the **registry decision** or **starting the RN scaffold**.

---

## Operating constraint — mandatory skills (applies to EVERY gate, G0→G5)

- **The five React Native skills are MANDATORY throughout the whole plan** — every RN-touching task,
  in every gate, must be executed through them: `react-native-architecture`,
  `react-native-best-practices`, `argent-react-native-app-workflow`, `react-native-design`,
  `upgrading-react-native`. They are the standing lens for scaffolding, native modules, offline,
  navigation/state, the delight stack, performance, and version upgrades.
- **Any other skill is permitted** at the executing agent's discretion (e.g. `clerk-expo`,
  `nfc-tools`, `hebrew-rtl-best-practices`, the `vettrack-team` router, security/QA gates) — use
  whatever the task calls for on top of the mandatory five.
- **Graceful degradation (verified necessary):** the pass-B cloud session found these five are
  user-level (Mac) skills and were **absent** in the Linux cloud container — only `react-native-skills`
  / `vercel-react-native-skills` (duplicate) + `vettrack-expo-migration` existed there. So: in any
  remote/CI/cloud session lacking the five, apply their guidance through the nearest available RN
  skill and **state in one line that the named skill was unavailable** — never skip the RN discipline,
  never invent a skill name.

---

## Context — why this revision exists

**Pass A (repo).** The draft's *quantitative* claims are unusually accurate (11 of 12 LOC figures within
~1%). Its *structural* claims are not:

1. **"The entire backend is untouched — client-only" is false.** Push is 100% Web Push/VAPID with zero
   APNs; the deep-link association files hardcode the Capacitor bundle ID and signing key *in server
   code*; extracting the shared package forces `server/` import rewrites.
2. **The Critical Alerts entitlement doesn't exist and was never applied for.** The draft cites
   `aps-environment` as proof it's handled — that's ordinary push.
3. **G0's definition-of-done describes state that never existed.** The draft asserts 1.3.0/build 27 via
   commit `f25da7323`. That commit is on no ref, and **no commit in any branch ever introduced 1.3.0 or
   build 27**. The repo is at 1.2.0/build 26.

**Pass B (React Native + platforms).** Verified against primary sources. Three of the draft's five "open
decisions" are now effectively **closed by evidence**, and two hard blockers surfaced. Full detail in the
RN corrections table below.

**And two findings that outrank all of the above**, both surfaced while checking something else:

**0a. 🔴 The safety net has a 31-day fuse, and React Native is irrelevant to it.**
From **2026-08-31**, Google Play requires new apps *and updates to existing apps* to target **API 36**
([target-sdk requirements](https://developer.android.com/google/play/requirements/target-sdk)). Miss it
and **you cannot ship an Android update** — the ripcord stops working on half of G0's own success
metric. An extension to 2026-11-01 is requestable. Separately, **16 KB page-size support has been
mandatory since 2025-11-01** for targetSdk ≥ 35, and the extension path (2026-05-31) **has already
expired** ([page-sizes](https://developer.android.com/guide/practices/page-sizes)). Every Capacitor app
ships native `.so`, so this binds the app on `main` today. Verify:
`bundletool dump config --bundle=app.aab | grep alignment` → want `PAGE_ALIGNMENT_16K`.

**0b. 🔴 iOS *and* Android push are both broken on the shipped app today.**
No `@capacitor/push-notifications` anywhere; the client is Web Push
(`src/hooks/use-push-notifications.tsx`) against a pure-VAPID server. On iOS there is no APNs token path
at all, so `aps-environment=production` is a **vestigial entitlement**. On Android it's worse — MDN
browser-compat data records `PushManager` as `webview_android: version_added: false`, i.e. **the Push
API does not exist in the Android WebView that Capacitor embeds**. Capacitor's own docs route Android
push through FCM. So the emergency-alerting story is not "a G4 migration cost"; it is an **existing
production gap on the current app**.

Plus two omissions no research finds: **no gate defines a no-go**, and **G2 — the gate that justifies the
entire migration — was unfalsifiable**. Both fixed below.

---

## Coverage boundary

**Verified:** every repository claim (files + git history), and every RN/platform claim below (primary
sources cited inline). **Caveat:** in the pass-B research proxy, `reactnative.dev`, `docs.expo.dev`,
`npmjs.com` and several vendor doc hosts 403'd, so many citations resolve to the **doc site's own source
repo** (`facebook/react-native-website`, `expo/expo/docs`, library repos) or `registry.npmjs.org`. The
third cross-reference pass (Verification Addendum) re-grounded the load-bearing ones on tag-pinned
`raw.githubusercontent.com`, the npm registry, local clones, and `gh`. Items still marked
**⚠️ GATING CHECK** could not be closed from any reachable primary source and must be resolved
empirically before the relevant gate.

---

## Corrections against ground truth — repo (pass A)

| # | Draft claim | Evidence | Corrected |
|---|---|---|---|
| 1 | "entire backend untouched — client-only" | `server/lib/push.ts:1` `import webpush from "web-push"`; zero `apns\|node-apn` in `server/`; `server/index.ts:319` hardcodes `appIDs: ["87F5G378M6.uk.vettrack.app"]`; `server/middleware/authority.ts` + 2 services import `../../shared/…` | **False.** No server change for REST/SSE **transport or auth**; changes **required** for APNs/FCM, association files, shared-package consumption |
| 2 | "Critical Alerts — entitlement already present" | `App.entitlements:13` has `aps-environment=production`; `com.apple.developer.usernotifications.critical-alerts` appears **nowhere** in `ios/`. Owner: never applied | **Two different entitlements** |
| 3 | "1.3.0 / build 27", bumped by `f25da7323` | `git show f25da7323` → unknown revision. `git log --all -S'MARKETING_VERSION = 1.3.0'` → **zero commits**. pbxproj: 1.2.0 / 26; `.last-shipped-build`=25 | **Settled: never existed on any ref.** Repo is 1.2.0/build 26 |
| 4 | client reuse **25–30%** | Portable = contracts 184 + shared 929 + core 326 + `src/lib` **minus its own non-portables** (3,575 for offline-db/sync-engine/realtime/api.ts + 1,418 for 12 Capacitor/Clerk wrappers) ≈ **14.6k / 75,656** | **~19%, likely lower.** 32 of 102 `src/lib` files touch Capacitor or DOM globals |
| 5 | "Dexie contained to 2 files" | Raw `dexie` import: 2 files. **16 files** consume the `offline-db` model — incl. `src/lib/api.ts:112`, `sync-queue-sheet.tsx`, `sync-status-banner.tsx`, `nfc-foreground-scan.tsx`. `use-sync.tsx:2` uses `liveQuery` | **Overstated.** The *package* is contained; the *data model* radiates into the API client and UI |
| 6 | "`core/ports` framework-free" | True for React/wouter/Capacitor/Dexie. But `src/core/lib/safe-storage.ts:6` + `offline-emergency-block.ts:120` use `window.localStorage`/`sessionStorage` | **Framework-free, not browser-free** → silent failure on RN (**R1**) |
| 7 | contracts "names an SQLite mobile adapter" | `packages/contracts/src/pending-sync.ts:1` doc-comment names `expo-sqlite`; `PENDING_SYNC_SCHEMA_VERSION = 2` is real | **Accurate but thin** — intent in a comment |
| 8 | RN repo "consumes `@vettrack/contracts`" | `"private": true`, no build script, `noEmit:true`, `exports` → raw `./src/index.ts`, linked `workspace:*` | **Not consumable externally today** |
| 9 | "extract shared domain package" | `shared/` has no `package.json`/`index.ts`; all imports relative; no `@shared` alias | **Not a package.** Extraction rewrites every import site in `src/` **and** `server/` |
| 10 | ripcord "one-command ship proven" per gate | `verify:resubmission` is Mac-only, hits `clerk.vettrack.uk`, in **no** workflow. `release-gate.yml`'s 9 gates all web/PWA | **Manual single-machine ritual** — will rot silently (**R4**) |
| 11 | "~60 pure `src/lib` files" | 89 top-level / **102** recursive | Understated ~50% |
| 12 | "`resubmit` → `build-native-shell.sh`" | Only `cap:build:native` does; `resubmit*` → `scripts/resubmit.sh` | Imprecise |

**Confirmed and load-bearing — the plan's real foundation.** Backend ~77k LOC; `shared`/`core`/contracts
LOC; all `src/pages|features|components|hooks` figures; locale size; the three named file sizes;
`event-reducer.ts` (381 LOC); `pending-sync` v2; 17 real gates in `verify-resubmission.sh`; NFC
entitlement + usage description; `docs/design/program-plan.md`. **And genuinely good news the draft
undersold:** auth is already Bearer-capable (`getAuth(req, {acceptsToken:"any"})`, mounted globally) —
**no server change for RN auth**; the SSE *server* already accepts Bearer (`realtime.ts:721`, no
query-param token); CORS is not a native blocker (`callback(null,false)` omits the header, RN `fetch`
isn't subject to it); EventSource genuinely is 1 file; NFC + DeepLink genuinely have port adapters;
`api.ts` is genuinely insulated from the Clerk SDK via `auth-store` token indirection.

---

## Corrections against ground truth — React Native + platforms (pass B)

| # | Draft/assumed claim | Primary source | Corrected |
|---|---|---|---|
| 13 | "New Arch stable, default since 0.76" | [v0.76.0 release](https://github.com/facebook/react-native/releases/tag/v0.76.0): *"enables the New Architecture by default"* | **VERIFIED** — and stronger: **0.82 removed the opt-out**. New Arch is **mandatory**, not a choice (tag-verified — see Addendum) |
| 14 | "on iOS, RN ALSO cannot hold a background socket" | Apple [Preparing your UI to run in the background](https://developer.apple.com/documentation/uikit/preparing-your-ui-to-run-in-the-background): apps get no extra time outside 7 named categories; none of the 13 `UIBackgroundModes` permits an arbitrary socket. RN's Headless JS is **Android-only** | **VERIFIED — true on every stack incl. native Swift.** The persistent connection is held by the **OS**, not your process. Rewriting native buys nothing here |
| 15 | "2026 guidance leans Expo even for native-heavy apps" | Expo glossary: *"**Deprecated**: Expo no longer separates 'managed' and 'bare' workflows. All projects use… CNG."* reactnative.dev: recommends a Framework, escape hatch only for *"unusual constraints"* | **VERIFIED and superseded** — "native-heavy" is no longer a category Expo recognizes as a reason to opt out. See Decision 1 (glossary line clone-verified — Addendum) |
| 16 | Offline lib = "WatermelonDB **vs** op-sqlite" | WatermelonDB latest **0.28.x (2025-04-07)**, ~16 months stale. CHANGELOG has **zero** New-Arch/Fabric/TurboModule/bridgeless content; `codegenConfig` **= 0**. Open, maintainer-unanswered bridgeless issues | 🔴 **WatermelonDB is a hard blocker — decision closed** (clone-verified — Addendum). See Decision 2 |
| 17 | "op-sqlite = thin JSI SQLite, rebuild reactivity by hand" | [op-sqlite reactive queries](https://op-engineering.github.io/op-sqlite/docs/reactive_queries): native `update hook`; `reactiveExecute`; `OPSQLiteSpec` = TurboModule. **17.x published 2026-07-27** | **Refuted.** op-sqlite has **native** reactive queries and confirmed New-Arch support (source-verified — Addendum) |
| 18 | `react-native-sse` "doesn't manage Last-Event-ID" *(earlier self-error)* | `src/EventSource.js`: stores `lastEventId` from `id:` lines, replays via `Last-Event-ID` header, honors server `retry:` | **Self-correction: wrong.** Maps cleanly onto the `vt_event_outbox` cursor + `/api/realtime/replay` with no consumer bookkeeping |
| 19 | Cold start: "disable JS bundle compression on RN ≤0.78" | `ReactExtension.kt` `enableBundleCompression … .convention(false)`; landed **RN 0.79**; absent in 0.78 | **Already optimal by default on RN ≥0.79.** Setting the flag is a no-op; `true` would *hurt* (tag-verified — Addendum) |
| 20 | "barrel imports defeat tree-shaking under Metro" | Core Metro has **no** tree-shaking. Expo SDK 54+ **does** (ESM-only, on by default), and `babel-preset-expo` strips barrels under static ESM | **Half right, and it inverts the Expo/CLI tradeoff.** True for bare CLI; **false for Expo SDK 54+ with ESM** |
| 21 | Apple OTA rule "Guideline 3.3.2" | The code rule is **ADPLA §3.3.1(B)**; App Review **2.5.2**. (§3.3.2 is now "Regulatory Compliance" — separately relevant to a clinical app) | **Citation stale.** OTA JS is *affirmatively permitted* if it doesn't change the app's primary purpose |
| 22 | Android "Critical Alerts equivalent" | Ceiling is `IMPORTANCE_HIGH`; channels **immutable after creation**; `setBypassDnd` bypasses **DND only, not silent mode**; full-screen intents *"calling and alarms only"* since Android 14, with Play **revoking** the default grant | 🔴 **No Android equivalent exists.** Do not plan Android alerting as if it does |

---

## Risks

**R1 — `safe-storage` fails silently on RN, under the Code Blue offline path. (Clinical safety.)**
`src/core/lib/safe-storage.ts:3` guards on `typeof window === "undefined"`. In RN `window` *is* defined
but `localStorage` is not → `?.getItem` returns `null`, `safeStorageSetItem` returns `false`. No throw,
no build error, no test failure. `offline-emergency-block.ts:21` depends on it, so **the offline
emergency-mutation buffer silently stops working** — while CLAUDE.md's doctrine is that Code Blue must
*fail loud* offline. Dependency-cruiser can't catch it (`window` is a global, not an import).
**Fix before any RN code depends on it:** inject a storage port, adapt to MMKV/AsyncStorage, add a test
asserting loud failure when storage is unavailable.

**R2 — the emergency manifest has already forked, and the ratchet is blind to it.**
`packages/contracts/src/emergency.ts:1` says "ported verbatim from `shared/emergency-surfaces.manifest.ts`."
But `shared/emergency-surfaces.manifest.ts:38` has already diverged (`EMERGENCY_SERVER_ROUTE_ALLOWLIST`
= base + `PHASE_9_DISPLAY_PAIRING_ROUTES`). All four guard suites import from `shared/`, not contracts.
**Future emergency-surface additions will land in `shared/` and silently never reach an RN consumer.**
Collapse the fork while the divergence is one export.

**R3 — the emergency-alerting path is missing today on both platforms, and no stack fixes it.**
Stacked gaps, none RN-specific: (1) no native push client on either platform — Web Push doesn't even
exist in the Android WebView; (2) no APNs *or* FCM server path (`server/lib/push.ts` is `web-push`);
(3) no Critical Alerts entitlement, never applied for; (4) **no Android equivalent of Critical Alerts
exists at all** (correction #22). And per correction #14, **no stack can hold a background socket** — so
push is the only mechanism, on Capacitor, RN, or native Swift/Kotlin alike.
**Design constraint (verified):** it must be a **user-visible alert push**, not silent. Apple: background
notifications are *"low priority… the system doesn't guarantee their delivery"*, throttled to *"two or
three per hour"*, and coalesced. **Do not architect Code Blue as "silent push wakes the app, app fetches
over SSE."** The alert must be the payload. **Move to G0** — this is unstarted product work on the
current app's most safety-critical feature, not a migration cost.

**R4 — the ripcord can't be observed.** See correction #10.

**R5 — `.js` specifiers won't resolve under Metro.** `shared/` uses NodeNext-style
`from "./doctor-operational-shift.js"` pointing at `.ts` files. Vite resolves this
(`moduleResolution: "bundler"`); **Metro does not**, without a custom `resolveRequest`.

**R6 — docs already contradict each other.** `CLAUDE.md:135` says literate-dollop is retired with an
unnamed successor; `docs/MAINTENANCE_MODE.md:20` still lists it as the live Expo repo.

**R7 — 🔴 Android release gates bind the current app, now.** targetSdk 36 by **2026-08-31**; 16 KB pages
already mandatory with **no extension path left**. See Context 0a. Note RN itself is 16 KB-compliant only
from **0.77**. **op-sqlite** ships `cpp/` + `CMakeLists` so 16 KB binds it — but this is ✅ **CLOSED**:
its `libop-sqlite.so` 16 KB crash (issue #241, v11.4.4) was fixed by **PR #275** (`-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`,
2025-05-18) and the pinned 17.x carries it; only a `bundletool` confirmation on the first real AAB
remains (belt-and-suspenders). (`react-native-nfc-manager` and FlashList 2 ship **no** native `.so` —
16 KB does not bind them; see Addendum.)

**R8 — `react-native-nfc-manager` is the highest-risk dependency in the stack — but the top open bug is a one-line fix.**
Stable **3.17.2** is **legacy-architecture only** (no `codegenConfig`). New-Arch support exists only in
**4.0.0-beta.7**, published **2025-11-28 — the same day as stable 3.17.2**, and unshipped since. It still
*runs* via the interop layer (present at RN 0.86.x, stated to persist "for the foreseeable future"), but
that layer is actively shrinking.
**Issue #833 — CLOSED by this pass (`gh`, App Store Master lens):** OPEN, filed **2026-07-30**, unlabeled.
`getTag()` on iOS invokes its callback twice when no session is active → under the New Architecture that
is a **fatal glog `CHECK` → `SIGABRT`**, not a promise rejection. **Root cause is a missing `return`** in
`ios/NfcManager.m` `getTag:` (line 430 master / 416 in 3.17.2): the no-session branch calls the callback
and falls through to a second callback. **Mitigation is cheap** — a one-line `return` via `patch-package`
or a thin fork — *not* a Nitro/Turbo rewrite. So R8's severity is: real, must be patched, but **not a
showstopper**. `expo-nfc` remains a **0.0.0 placeholder with no code**.
⚠️ **GATING CHECK:** confirm the beta's `codegenConfig` and whether #833 lands upstream. **Prototype NFC
first, at G1** — NFC is the wedge flow; if it can't work reliably under New Arch, the migration can't.

---

## The invariant (unchanged — this part was right)

- **The Capacitor app on `main` is the always-shippable production safety net.**
- **The RN app lives in a separate repo and cannot touch `main`.**
- **Shared TS is the bridge** — *but see G1: that bridge does not exist yet, and building it is itself a
  backend-touching task.*

## The ripcord — now with a second, faster exit

Store path (`pnpm resubmit` + wizards + Railway CI) and pilot path (clinic join-code) as before. **Add a
third asset the draft omitted entirely: OTA.** `expo-updates` ships JS/styling/asset fixes without store
review — with `eas update:rollback`, rollback-to-embedded, and percentage rollouts. It **cannot** change
native code, native deps, permissions, or the SDK version. Permitted under ADPLA §3.3.1(B) so long as it
doesn't change the app's primary purpose (correction #21).
✅ **CLOSED (2026-07-31):** Google Play's Device-and-Network-Abuse policy explicitly carves out
interpreted code (JavaScript in a VM/interpreter) from its "no downloaded executable code" rule, so OTA
JS is permitted (see Verification Addendum). Native code / deps / permissions still can't be OTA'd.
**Note this does not force Expo** — `expo-updates` works in bare RN too. **CodePush is dead** — Microsoft
retired it **2025-03-31**, and it *"won't support new Architecture."*

---

## Decisions now closed by evidence (were "open")

**Decision 1 — Expo (CNG/prebuild + config plugins), not bare CLI. Revisit the 2026-07-22 CLI decision.**
"Bare workflow" is **formally deprecated by Expo** (glossary, clone-verified); reactnative.dev recommends
a Framework with the only carve-out being *"unusual constraints."* Custom native is explicitly supported.
Both supposed blockers dissolve: `react-native-nfc-manager` **already ships an Expo config plugin**
(`app.plugin.js` sets the NFC entitlement :43-52, iso7816/felica, and `android.permission.NFC` :103 —
source-verified), and the Critical Alerts plist key is settable via `ios.entitlements` /
`withEntitlementsPlist` — **the manual App-ID step is identical on bare**, because it's an Apple gate.
Secondary win: Expo SDK 54+ gets tree-shaking core Metro never will (#20).
**Honest costs, carried into G1/G4:** (a) EAS's managed keystore complicates the assetlinks SHA-256
fingerprint (G4); (b) op-sqlite **clashes with expo-updates** over SQLite — fix is
`"expo.updates.useThirdPartySQLitePod": "true"` in `Podfile.properties.json`; (c) Critical Alerts is
**absent from EAS's capability auto-sync table** — set `EXPO_NO_CAPABILITY_SYNC=1` if needed; (d)
`inlineRequires` is **on** by default in bare CLI but **off** in Expo — enable it deliberately.

**Decision 2 — WatermelonDB is out. Choose op-sqlite (default) or expo-sqlite + Drizzle.**
WatermelonDB's observables are real and richer than Dexie's — but it's **~16 months without a release,
`codegenConfig` = 0, no New-Arch claim anywhere, bridgeless issue open since 2024** (clone-verified). On
a mandatory-New-Arch RN, that's disqualifying. The premise that op-sqlite means hand-rolling reactivity
is **false** (#17).
- **op-sqlite (recommended):** `OPSQLiteSpec` TurboModule + native `reactiveExecute`/update-hook
  (`src/types.ts:135,152-155`), published **2026-07-27**, **zero imposed sync** — right given the frozen
  SSE-outbox doctrine. Caveats to design around: reactivity keys on **rowid, not your primary key**;
  callbacks fire **only on transactions**; plus the expo-updates Podfile clash above.
- **expo-sqlite + Drizzle `useLiveQuery` (alternative):** least toolchain friction, nearest drop-in for
  `liveQuery`, but **table-granular only** and no subqueries.
- **Impedance note:** WatermelonDB's sync is timestamp-windowed (`lastPulledAt`) where yours is
  **monotonic-cursor** — adopting it would introduce a wall-clock dependency you deliberately don't have.
  Maintenance, not impedance, is what closes this decision.

**Decision 3 — pin RN 0.86.2 / Expo SDK 57; freeze until G5.**
Latest stable is **0.86.2** (`registry.npmjs.org`); React aligns at **19.2.3**; Expo **SDK 57 pins exactly
RN 0.86.2 + React 19.2.3**. Support window is **latest + previous two minors** (~4 months from a 0.86.2
pin) — roughly the G1→G3 span. **Policy: freeze through G4, schedule one deliberate upgrade before G5
submission** (use the `upgrading-react-native` skill + Upgrade Helper / rn-diff-purge). Note the RN repo
moved from the `facebook` org to the `react` org (React Foundation).

---

## Gate ladder (revised)

Each gate = RN increment + **verified** ripcord + **pre-registered** go/no-go. **Every gate executes
through the five mandatory RN skills (see Operating constraint).**

### G0 — Safety net, platform deadlines, and the external approval queues *(mandatory first)*

The draft treated G0 as near-done paperwork. It now also owns everything with a clock outside our control.

1. **🔴 Android target API 36 before 2026-08-31**, or file the extension to 2026-11-01. **Verify 16 KB
   alignment** on the current AAB (`bundletool dump config --bundle=… | grep alignment`). Without this
   the Android ripcord is already broken. *(R7)*
2. **Run the version bump — it was never run.** No `f25da7323`, no 1.3.0, no build 27 on any ref. Ship 26
   as 1.2.0 or run `pnpm resubmit:release 1.3.0` and **commit it**. Only the ASC-side state is unknown —
   owner must confirm from App Store Connect; if ASC and git disagree, git is the one that can be fixed.
3. **Close the push gap.** *(R3)* Submit the **Critical Alerts** request (form is live, sign-in gated,
   **no published criteria or SLA** — treat approval as unbounded and possibly denied). Decide the native
   push path per platform: **APNs for iOS, FCM for Android** — and accept that Android has **no** DND/
   silent-mode escape hatch, so the Android alerting design must differ, not mirror iOS.
4. **Make the ripcord observable.** *(R4)* Split `verify-resubmission.sh`'s 17 gates into Linux-CI-runnable
   static file checks and the Mac/network-only remainder. Wire set 1 into `main` CI; schedule set 2.
5. Ship to both stores + verify the pilot join-code path.

**No-go trigger:** none — G0 is unconditional. **Nothing in G1+ starts until 1–5 are green.**

### G1 — Foundation: build the bridge, and de-risk NFC first *(separate repo)*

- **Prototype NFC on day one.** *(R8)* This is the wedge flow and the stack's weakest dependency. If
  `react-native-nfc-manager` can't be made to work reliably under the New Architecture — patch #833's
  one-line fix via `patch-package`, pin the beta, or fork — **and that failing is a migration no-go.**
  Cheapest to learn now.
- **Publish contracts for real:** remove `"private": true`, add a build with actual emit (drop `noEmit`),
  add `publishConfig` + `files`, pick a registry, establish versioning.
- **Then extract `shared/`:** add `package.json` + `index.ts` and rewrite every import site in `src/`
  **and** `server/` (`middleware/authority.ts`, `services/cursor-bug-fixer.service.ts`,
  `services/equipment-command-board.service.ts`); amend `tsconfig.server.json`; teach the Railway/Docker
  build to resolve it. **This is the backend change that falsifies "client-only."** Clean up the dead
  `@contracts/* → ./shared-contracts/*` tsconfig path (residue from a prior extraction attempt).
- **Fix R1 (storage port) and R2 (collapse the manifest fork) before anything depends on them.**
- **Scaffold on Expo SDK 57 / RN 0.86.2** (Decision 1, 3). Wire Clerk auth, API client, SSE
  (`react-native-sse` — no cursor bookkeeping needed, #18), i18n + `I18nManager` RTL.
- **Verify Clerk `azp`:** `server/lib/clerk-authorized-parties.ts:20` pins authorized parties to
  `capacitor://localhost`/`ionic://localhost`. Decode a real Clerk-Expo token; don't assume it's a no-op.
- Handle **R5** (Metro `resolveRequest` for `.js`→`.ts`). Compression is deliberately off for the SSE path
  (`server/index.ts:241`).
- **SSE is foreground-only by design** (#14). Wire `AppState` to `close()` on background and `open()` +
  replay-from-cursor on foreground — the library's own documented pattern.
- ✅ **Both prior gating checks CLOSED** (Verification Addendum): op-sqlite 16 KB fixed by PR #275
  (in the pinned 17.x); Play OTA/interpreted-code carve-out permits JS OTA. Only residual is a
  belt-and-suspenders `bundletool` alignment check on the first real RN AAB.

**No-go trigger:** NFC unworkable under New Arch; **or** publishing contracts / extracting `shared/`
can't be done without destabilizing web CI or touching frozen surfaces.

### G2 — Hero flow: the gate that justifies the project *(now falsifiable, and buildable)*

**The stack is not optional — these floors are unreachable without it.** RN's own performance doc:
16.67ms/frame at 60Hz, and *"if the JavaScript thread is unresponsive for a frame, it will be considered
a dropped frame."* `useNativeDriver` only reaches `transform`/`opacity`. Required, all New-Arch-only
majors: **Reanimated 4.5.x + react-native-worklets 0.11.x** · **Gesture Handler 3.x** · **react-native-
screens 4.x + native-stack 7.x** · **FlashList 2.x** · **Hermes** (default) · optionally **React
Compiler 1.0**.
⚠️ **Two traps:** React Compiler *"must run **first** in your Babel plugin pipeline"* while
`react-native-worklets/plugin` *"has to be listed **last**"* — satisfiable, but a careless `plugins`
array silently breaks one. And FlashList 2's peerDeps are `react-native: *`, so **npm will not stop a bad
install** on a legacy-arch project. (Execute this gate through `react-native-design` +
`react-native-best-practices`.)

**Pre-registered thresholds — locked before the demo.** ⚠️ RN publishes no official TTI definition, and
"60fps" is wrong on 120Hz hardware — so these name a device and a method:
- **Frame timing:** p95 frame time within the refresh budget on a **named low-end target device**,
  measured via Android Studio Profiler → Perfetto / Instruments / RN DevTools Performance panel.
- **tap→response <100ms** · **cold start <2s**, same named device, same tools.
- **Blind preference:** ≥5 clinic staff run the same scan→checkout flow on both apps, unlabeled.
  **Pass = ≥70% prefer RN *and* articulate a concrete reason.** Threshold and sample locked beforehand.
- **Task time / errors:** hero flow faster-or-equal to the current app across the **same ≥5** staff.

**No-go trigger:** miss the objective floors, or <70% blind preference. G2 does not pass because
management said "wow." If a native rebuild of the most-polished flow can't beat the WebView on
pre-registered numbers, the UX premise of the migration is wrong — stop and polish Capacitor instead.

### G3 — Daily-driver parity

equipment / tasks / scan / home / alerts → subset pilot. Expect the reimplementation surface to exceed the
draft's 54–58k by the amount correction #4 moves. Dexie's radiation into `api.ts` + 3 UI components (#5)
lands here; `liveQuery` maps onto op-sqlite `reactiveExecute` (mind rowid-vs-PK and transaction-only
firing) or Drizzle `useLiveQuery` (table-granular). Haptics needs the adapter CLAUDE.md advertises but
doesn't exist (22 direct importers) — **use `expo-haptics`**, not `react-native-haptic-feedback` (no
release since 2024-03). Clerk needs a port too (13 files, none behind one).

**No-go trigger:** parity velocity implies a G4 date past what management pressure can absorb, **or**
pilot staff report regressions on flows that work today.

### G4 — Code Blue + full offline + parity

- **Push is net-new server work, per platform.** `vt_push_subscriptions` (`server/schema/ops.ts:204`) has
  NOT NULL `endpoint`/`p256dh`/`auth` and `server/routes/push.ts:24` validates `endpoint` as a URL — an
  APNs or FCM token is rejected at the Zod validator before reaching the DB. Requires a **migration**, a
  branched validator, **two** send paths (APNs + FCM), and fan-out branching in every `sendPush*` caller
  including `server/workers/notification.worker.ts`.
- **Critical Alerts** must be granted by now (submitted at G0). Payload needs `interruption-level:
  critical` **and** `aps.sound.critical = 1`; the user must still grant `criticalAlert` at runtime. If
  denied: fall back to `time-sensitive` and **state the locked-device limitation explicitly.** On Android
  there is no equivalent to fall back to (#22) — say so plainly.
- **Association files:** `server/index.ts:319` (AASA `appIDs`) and `server/lib/well-known-assetlinks.ts:6,17`
  hardcode the Capacitor identity. A different bundle ID or **EAS-managed keystore** breaks equipment
  QR/NFC deep links until the server is edited and redeployed.
- **`ALLOWED_ORIGIN`** is a single value; widen it if any web/WebView surface survives.
- **If you enable R8/ProGuard:** the RN template ships `enableProguardInReleaseBuilds = false`. ⚠️
  **GATING CHECK:** no canonical keep-rule set is published — budget a release-build QA pass; failures
  appear only in release, as `ClassNotFoundException`/`UnsatisfiedLinkError`.

**No-go trigger:** Code Blue can't meet its frozen guarantees on RN (server-confirmed end, no offline
queueing, loud offline failure, replay-based recovery).

### G5 — RN to stores

Submit; retire the Capacitor client **only after** stated criteria: N weeks live with no Sev-1, error rate
≤ Capacitor baseline, pilot-clinic sign-off. **Define the rollback story now.** Take the one deliberate
RN/Expo SDK upgrade here (Decision 3, `upgrading-react-native` skill). Retiring the web SPA also makes
`/sw.js`, `/manifest.json`, and `express.static(dist/public)` dead weight to remove deliberately.

---

## Still open (genuinely)

1. **Navigation + state + design system** — React Navigation native-stack is settled by G2's stack
   requirement; keep TanStack Query + Zustand. ⚠️ **GATING CHECK:** React Compiler's interaction with
   external stores is undocumented; both use `useSyncExternalStore`, so no conflict is *expected* — verify
   empirically before enabling.
2. **Registry choice + cross-repo contract-bump workflow** (CLAUDE.md assumes a companion-PR discipline
   with no infrastructure behind it).
3. **Android alerting design** — given no Critical Alerts equivalent, decide what "urgent" means on
   Android before G4 commits to a UX.

---

## Verification

**Per gate:** ripcord drill (CI-observable subset green on `main` + Mac-only remainder run and logged) ·
RN increment on a **named device** against G2's locked thresholds · isolation check.
*Caveat: the isolation check weakens once G1's shared-package extraction rewrites `server/` imports —
that work is on `main` by necessity and goes through normal review gates.*

---

## Verification Addendum (2026-07-30) — cross-referenced against primary source

**Method.** The local Mac clones (`react-native`, `WatermelonDB`, `expo`, `drizzle-orm`, `upgrade-helper`,
…) plus a Linux cloud pass that substituted **tag-pinned `raw.githubusercontent.com` + `registry.npmjs.org`
+ `gh`** (the cloud container had no clones and no five-skill install — see Operating constraint). A tag
pin is reproducible by anyone and reads shipped source, so it is a **stronger** basis than a clone path.
**GitHub issue/HTML endpoints 403'd in the cloud** (`api.github.com`, `github.com`, `codeload`); those
items were closed instead from the Mac via authenticated `gh`.

**Closed against evidence:**

| Item | Status | Citation |
|---|---|---|
| #16 / Decision 2 — WatermelonDB out | ✅ CLOSED | Mac clone: `WatermelonDB` `0.28.1-0`, CHANGELOG last release **2025-04-07**, `codegenConfig` **= 0** |
| #15 / Decision 1 — Expo deprecates "bare workflow" | ✅ CLOSED | Mac clone: `expo/docs/pages/more/glossary-of-terms.mdx:55` (verbatim) |
| #19 — bundle-compression already optimal | ✅ CLOSED | `ReactExtension.kt:86` `.convention(false)`, comment "Default: false" |
| #13 — New Arch mandatory (opt-out removed) | ✅ CLOSED harder | Tag: `v0.81.0 ProjectUtils.kt:31-35` reads the property; `v0.82.0 ProjectUtils.kt:32` = `isNewArchEnabled(): Boolean = true` (hardcoded — no longer read) |
| #17 / Decision 2 — op-sqlite native reactivity + New Arch | ✅ CLOSED | Source: `OPSQLiteSpec` TurboModule + `reactiveExecute`/updateHook at `src/types.ts:135,152-155`; published **2026-07-27** |
| R8 — nfc-manager beta age | ✅ CLOSED | npm `.time["4.0.0-beta.7"]` = **2025-11-28**, same day as stable 3.17.2 |
| R8 — issue #833 (the #1 risk) | ✅ CLOSED | `gh` (Mac): **OPEN**, filed 2026-07-30, unlabeled; fatal-under-New-Arch iOS `getTag()` double-callback; **root cause = missing `return` in `ios/NfcManager.m` (line 430 master / 416 in 3.17.2)** → mitigable with a one-line `patch-package` fix, not a rewrite |
| Decision 1 — nfc-manager Expo config plugin | ✅ CLOSED | Source: `app.plugin.js:43-52` (entitlement, iso7816/felica) + `:103` (`android.permission.NFC`) |
| 16 KB scope for FlashList 2 + nfc-manager | ✅ NARROWED | Both ship **no** native `.so` (no podspec/CMakeLists) → 16 KB does not bind them. op-sqlite **does** ship `cpp/` + `CMakeLists` → 16 KB binds it (still needs bundletool) |

**Closed 2026-07-31 (off-proxy, from the Mac — the last two open ends):**

| Item | Status | Citation |
|---|---|---|
| op-sqlite 16 KB alignment (R7) | ✅ CLOSED (source) | op-sqlite issue **#241** ("Android 16KB page size", crash in `libop-sqlite.so` at **v11.4.4** on RN 0.77) → fixed by **PR #275** (CMake `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`), merged **2025-05-18**. The pinned **17.x (2026-07-27)** is far past the fix → the default (plain-sqlite) build is 16 KB-aligned. **Residual:** the prebuilt **SQLCipher** variant is a separate 16 KB risk ([expo#39792](https://github.com/expo/expo/issues/39792)) — N/A for VetTrack (operational data, no PHI → no encryption variant), but re-verify if SQLCipher is ever adopted. Belt-and-suspenders: confirm with `bundletool dump config --bundle=… \| grep alignment` at the first real AAB build. |
| Google Play interpreted-code / OTA policy | ✅ CLOSED (primary) | Play **Device and Network Abuse** policy: *"An app may not download executable code (such as dex, JAR, .so files) from a source other than Google Play"* — **but** *"This restriction does not apply to code that runs in a virtual machine or an interpreter… (such as JavaScript)."* So expo-updates / RN OTA **JS** is affirmatively permitted, provided it *"must not allow potential violations of Google Play policies"* and doesn't change the app's core purpose. Native code / native deps / permissions still cannot be OTA'd (matches expo-updates' own limits). |

**All gating checks are now closed except the two that inherently need a real Android build** (both
belt-and-suspenders, not blockers): confirming 16 KB alignment on the actual VetTrack AAB (G0 item 1,
R7) and on the first RN AAB (G1). Nothing else in the plan waits on external verification.

**Method traps to respect on any re-run:** `grep -c codegenConfig package.json` gives a **false negative**
at a monorepo root (e.g. gesture-handler's root is a `0.0.0` workspace stub — check the actual package
subdir), and it is **invalid for `expo-*` packages** entirely (Expo Modules API, not codegen).

---

## Boundaries

- **2.0 Case Spine stays platform-neutral** and continues independently.
- This document supersedes the draft's factual assertions; where they conflict, the corrections tables
  and the Verification Addendum govern.
- **No execution is authorized by this document.** Per `.claude/rules/agent-conduct.md` Rule 2, a
  "refine/review/audit/consolidate" request authorizes producing this analysis — not committing it,
  pushing it, opening a PR, or starting G0. Any session's branch framing does **not** override Rule 2;
  committing needs an explicit go.

VetTrack - Master Migration Anchor (Capacitor to Bare React Native)

זהו מסמך העוגן המחייב (Source of Truth) לכל עבודת AI במיגרציית ה-VetTrack. כל קוד שיוצר חייב לעמוד בעקרונות אלו. אין לחרוג מהנחיות אלו ללא אישור מפורש מ-Dan.

1. עקרונות ליבה וארכיטקטורה (Foundation)

Stack: React Native 0.86.2, Expo SDK 57 (CNG/Prebuild), React 19.2.3. גרסאות אלו קפואות עד לשלב G5.

New Architecture (Mandatory): הפרויקט מנוהל ב-Bridgeless Mode המלא של ה-New Architecture (Fabric + TurboModules). כל שימוש ב-Bridge הישן אסור. על ה-AI לוודא שכל מודול Native מותאם ל-JSI.

Workflow: עבודה כ-Bare RN (שליטה מלאה ב-ios/ ו-android/) אך תחת כלי ה-Prebuild של Expo (CNG). אין להשתמש ב-Managed Workflow ללא הבנה מלאה של מניפולציות ב-app.json ו-plugins.

Management: ניהול מצב אטומי באמצעות Zustand. אין להשתמש ב-React Context לנתונים משתנים בתדירות גבוהה (High-frequency state).

UI/UX: שימוש ב-Uniwind (Tailwind v4, CSS-first, Babel-free — Metro transformer בלבד; מצוות Unistyles/jpudysz), FlashList 2.x (חובה עבור רשימות), Reanimated 4.x (Worklets C++, לאנימציות בלבד — Uniwind אינו תלוי בו), ו-Gesture Handler 3.x. [תוקן 2026-07-31 באישור Dan: NativeWind v4/v5 אינו תואם ל-Metro של SDK 57 — ראה סעיף 6.]

2. חוקים למפתחי AI (Protocol & Conduct)

אין ביצוע אוטונומי: אסור לבצע Commit/Push/PR ללא אישור מפורש מ-Dan. ה-AI נדרש להציע תוכנית עבודה ולתעד אותה.

חמש מיומנויות הליבה: כל משימה (ספציפית ל-RN) חייבת לעבור דרך: react-native-architecture, react-native-best-practices, argent-react-native-app-workflow, react-native-design, upgrading-react-native.

מניעת שגיאות: אסור להניח ש-localStorage או sessionStorage קיימים. גישה ל-Storage תעבור דרך Port adapter (MMKV/AsyncStorage) בלבד. יש להבטיח "Fail-Loud" במקרה של כשל ב-Storage.

תאימות: תמיד לבדוק את ה-Privacy Manifest (PrivacyInfo.xcprivacy) והגדרות ה-Derived Data ב-Xcode. כל שימוש ב-Required Reason APIs (FileTimestamp, BootTime, DiskSpace) דורש תיעוד מלא.

3. מחסומי דרך (Gated Ladder) - סדר עדיפויות קשיח

G0 (Safety Net): תיעדוף עליון ל-Android targetSdk 36, בדיקת 16KB alignment, ועדכון הגרסאות (1.3.0/27).

G1 (Foundation): יצירת ה-Bridge: פרסום contracts ומיגרציית shared/. פרוטוטייפ NFC (ה-Wedge Flow) תחת New Arch הוא תנאי סף - אין להתקדם ל-G2 ללא NFC עובד.

G2 (Hero Flow): הגעה לביצועים (60fps/120Hz, Cold start < 2s). מעבר ל-Reanimated 4.x ו-FlashList 2.

G3-G5: השלמת parity של יתר המערכת, Code Blue, והכנה להפצה בחנויות.

4. ארכיטקטורת נתונים ו-Persistence

Persistence: WatermelonDB פסולה לחלוטין. השימוש ב-op-sqlite הוא ברירת המחדל (עם התחשבות ב-16KB alignment ב-Android ושימוש ב-TurboModule).

Backend: המערכת פועלת מול ה-Backend הקיים. כל שינוי ב-server/ (למשל עבור FCM/APNs) חייב להיבחן מול העיקרון שאין תמיכה ב-Background Sockets. במקרה של חוסר התאמה, יש להציע פתרון המבוסס על Notifications/Push.

5. תהליכי עבודה (DevOps & Testing)

CI/CD: GitHub Actions + Fastlane.

Static Analysis: שימוש ב-scripts/verify-resubmission-static.sh עבור 7 הגייטס הסטטיים בכל PR. ה-AI חייב לוודא שכל שורת קוד חדשה לא שוברת את ה-Static Analysis.

Code Signing: fastlane match למאגר Git פרטי. אין לכלול מפתחות ב-Repo.

6. דגשים למניעת שגיאות ו-Lessons Learned

Android Background: ללא אפשרות ל-Critical Alerts ב-Android; העיצוב חייב להשתנות בהתאם (שימוש ב-High Importance Notifications).

NFC Bug (#833): תיקון ה-getTag באמצעות patch-package הוא הכרחי. אין להסתמך על עדכונים עתידיים ללא בדיקה יסודית.

Offline-Loud-Fail: במקרה של כשל ב-Telemetry או Storage, המערכת חייבת לזרוק שגיאה ברורה. אסור לבצע "ספיגה שקטה" של שגיאות (Silent No-op).

Styling — NativeWind → Uniwind (2026-07-31, אומת אמפירית): NativeWind 4.2.6 שובר את ה-Metro של SDK 57 (TypeError: Cannot read properties of undefined (reading 'transformFile') — כשל אתחול transformer שמקורו ב-babel integration של NativeWind; 3 bisects אישרו). מנוע v5 (react-native-css) קפוא מאפריל 2026 ואין release המאוחר ל-SDK 57. הפתרון: Uniwind 1.10.0 — Tailwind v4 CSS-first, Babel-free (רק withUniwindConfig ב-metro), ללא תלות ב-reanimated/worklets — אומת עובד על SDK 57 / RN 0.86.2 / New Arch (bundle + render + tsc ירוקים על iPhone sim). לכן שורת ה-UI/UX בסעיף 1 שונתה מ-NativeWind v4 ל-Uniwind.

Conflict Handling: כל סתירה בזיכרון של ה-AI מול מסמך ה-Verification Addendum במסמך ה-Gated Migration המקורי - המסמך המקורי גובר ללא עוררין.

הערה: מסמך זה מחייב. כל עדכון למסמך זה יתבצע אך ורק בתיאום מלא ואישור של Dan.
