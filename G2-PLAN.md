
# VetTrack RN Migration — G2 + Tech-Debt Closure Plan

## 1. Executive read

**G2 is the migration's go/no-go kill-switch:** a pre-registered gate where a real scan→checkout hero flow, built on the full delight stack (Reanimated 4 + worklets + Gesture Handler + FlashList 2 under Uniwind/SDK-57 Metro), must beat the current Capacitor app on a *named budget device* on locked objective floors (p95 frame, tap<100ms, cold-TTI<2s) AND win a blind ≥70% staff preference — miss either and the migration **stops** and we polish Capacitor instead.

**What I can build now (agent-executable):** all four closeable tech-debt items (worktree cleanup, doc-sync PR, ESLint PR, expo-export fix), the delight-stack de-risk build + bisect, the hero-flow implementation, and the G2 harness/protocol/pre-reg *templates*. **What is owner-blocked:** the entire G2 *verdict* — procuring the low-end Android device, NTAG tags + physical iPhone (which also closes G1 slice 8), recruiting ≥5 clinic staff, and committing the pre-registration doc (the commit SHA is the lock). **One hard constraint threads everything:** per agent-conduct Rule 2, every commit/push/PR needs *explicit* owner approval this turn — read-only inspection and local build/bundle proofs may run now; the git side-effects may not until confirmed.

**Authoritative pin table (SDK-57, verified against `node_modules/expo/bundledNativeModules.json` — supersedes the brief's wrong `worklets 0.11.x`/`GH 3.x` everywhere):**

| Package | Pin | Notes |
|---|---|---|
| react-native-reanimated | **4.5.1** | peer requires worklets 0.10.x exactly |
| react-native-worklets | **0.10.1** | NOT 0.11.x |
| react-native-gesture-handler | **~2.32.x** | NOT 3.x |
| @shopify/flash-list | **2.0.2** | v2 removed `estimatedItemSize` — never pass it |
| expo-haptics | ~57.0.1 | |
| react-dom | **19.2.3** exact | lockstep = react@19.2.3 |
| eslint | **^9** | eslint-config-expo@57 peer is `>=8.10`, so npm will NOT enforce this — pin is load-bearing |
| eslint-config-expo | ~57.0.1 | |

**Install discipline (mandatory, non-negotiable):** `.npmrc` has `legacy-peer-deps=true`, so npm's peer guard is dead. Use `npx expo install` for every native/SDK package — never manual version pins. The pin table above is only protected by Expo's bundledNativeModules table.

---

## 2. Tech-debt closure (agent-executable, but git side-effects need explicit owner OK)

Ordered. Steps that persist anything land through **slice-PR discipline**: PR → required checks green → CodeRabbit-to-green → merge (repo auto-merge is disabled; green checks alone are not merge authority).

> **⚠ Pre-flight (do first, once):** the specs assume `SonarCloud` is a required branch-protection context, but there is **no** sonar workflow/config file in the repo — only rule-ID comments. Confirm the *actual* required contexts before relying on "keep job name `typecheck + test`" or "Sonar passes trivially": `gh api repos/exposwifty31/VetTrack---RN-Migration-/branches/main/protection --jq '.required_status_checks.contexts'`. Low risk, but verify, don't infer.

### 2A. Worktree + branch hygiene → doc-sync PR (spec: debt-closure-hygiene — verdict: sound)

Repo: the current checkout root (`git rev-parse --show-toplevel`) — never a hard-coded `/Users/...` path; the commands below fail unchanged on anyone else's machine. All 5 worktrees verified clean + merged; local `main` is 15 behind origin (pure FF); the two uncommitted doc edits (README, SCAFFOLD-PLAN) are base-identical between `63783b0` and origin/main → stash-pop is conflict-free.

- [ ] **Re-verify before mutating** (abort if any prints porcelain lines or `NOT-MERGED`):

  ```bash
  cd "$(git rev-parse --show-toplevel)" && git fetch origin --quiet && for w in 2 3 4 5 7; do d=.worktrees/g1-slice-$w; echo "== $d =="; git -C "$d" status --porcelain; c=$(git -C "$d" rev-parse HEAD); git merge-base --is-ancestor "$c" origin/main && echo MERGED || echo NOT-MERGED-STOP; done
  ```

- [ ] **Remove the 5 clean worktrees** (no `--force`; fails loud if dirty):

  ```bash
  for w in 2 3 4 5 7; do git worktree remove .worktrees/g1-slice-$w; done && git worktree prune && git worktree list
  ```

- [ ] **Snapshot the doc edits** before switching branches:

  ```bash
  git stash push -m "g1-complete doc drift fixes (README+SCAFFOLD)" -- README.md SCAFFOLD-PLAN.md
  ```

- [ ] **Branch off origin/main** (never local main — it's 15 behind → phantom commits):

  ```bash
  git checkout -b docs/g1-complete-drift origin/main && git stash pop && git diff --stat
  ```

- [ ] Confirm `git stash list` no longer shows the entry (pop consumed it); never `git stash drop` manually. Recovery if needed: `git fsck --lost-found`.
- [ ] **[NEEDS EXPLICIT OWNER OK]** Commit (new commit only — no amend/force/`--no-verify`), push, open docs-only PR `--base main`:

  ```bash
  git add README.md SCAFFOLD-PLAN.md && git commit -m "docs: mark G1 complete (slices 0-7 merged), next G2"
  git push -u origin docs/g1-complete-drift && gh pr create --base main --head docs/g1-complete-drift --title "docs: G1 complete — sync README + SCAFFOLD-PLAN" --body "Founder-review drift fix. Docs-only, no code change."
  ```

- [ ] **Optional hygiene (last):** FF local main (`git branch -f main origin/main`); delete merged branches with **`-d` only** (refuses unmerged), looping over the 8 merged branches. **Never touch** `backup/superseded-slice-5-alt-2026-08-04` (intentionally unmerged) or `main`.
- [ ] Keep the synthesized **G2-PLAN.md in a SEPARATE later PR** — do not bundle it behind the trivial drift fix.

### 2B. ESLint flat config → CI (spec: eslint — verdict: needs-fix: CI collision)

- [ ] Add devDeps: `eslint@^9`, `eslint-config-expo@~57.0.1`. Do **not** add typescript-eslint / react-hooks / react / import / globals directly — expo-config-57 pins them. **The `^9` pin is load-bearing:** the config's `require('eslint/config')` only exists in ESLint 9+, and the package peer (`>=8.10`) won't enforce it.
- [ ] Create `eslint.config.js` (CommonJS — repo has no `"type":"module"`): `defineConfig([ require('eslint-config-expo/flat'), { ignores: ['dist/*','.vendor/*','.worktrees/*','node_modules/*','**/*.d.ts'] } ])`. **Must ignore `.vendor/`** (vendor-vettrack populates it pre-install in CI) and generated `.d.ts`. Use the `/flat` subpath — the default export is legacy `.eslintrc`.
- [ ] Add script `"lint": "eslint . --max-warnings=0"`; run and drive to zero (fix at source; downgrade a genuinely RN-inappropriate rule in the rules block with a one-line justification, never blanket-disable).
- [ ] Wire lint as a **step inside the existing `quality` job** (`name: typecheck + test`) — do NOT add a new job or rename (would mint an unmatched required context). `--ignore-scripts` is safe (eslint + plugins have no lifecycle scripts).

### 2C. expo-export bundle fix (spec: expo-export-fix — verdict: sound; collides with 2B on ci.yml)

Root cause reproduced: `@clerk/clerk-expo` declares `react-dom` a non-optional peer and pulls `@clerk/clerk-react` (which `require('react-dom')`) transitively; react-dom is simply absent → Metro bundle fails. Real tech debt — **not** a types issue.

- [ ] Install the declared peer, exact-pinned: `npx expo install react-dom` (yields 19.2.3, lockstep with react@19.2.3). **Reject** any metro resolver shim/alias/blocklist — it weakens the withUniwindConfig chain the Operating Constraint forbids.
- [ ] Verify locally (this is the real DONE gate, unprovable read-only): `npx expo export --platform ios --output-dir /tmp/expo-export-check && rm -rf /tmp/expo-export-check`. If a *second* missing peer surfaces (Metro aborts on first), install it and re-run.
- [ ] Add an **`Expo export (bundle gate)` step inside the same existing `quality` job**, after Test: `./node_modules/.bin/expo export --platform ios --output-dir /tmp/expo-export-check`. **No `npx`** (SonarCloud S6505/S8543 policy — mirror the existing `./node_modules/.bin/patch-package` call). Bump the job `timeout-minutes` (15→~20) for the ~1-2 min bundle.
- [ ] One-time sim smoke (confidence, not a merge blocker): `npx expo run:ios` boots to Home with no react-dom import redbox.

> **CI COLLISION (both critics):** 2B and 2C both add a step to the same `ci.yml` `quality` job. Landed in parallel they merge-conflict. **Land them as ONE combined CI PR** (lint step + export step together), or sequence 2C to rebase on 2B. The docs PR (2A) is docs-only and doesn't touch ci.yml, but whichever of the three merges later must rebase on origin/main.

### 2D. Slice-8 NFC — **OWNER-BLOCKED** ⛔

Not closeable by agent. Requires physical NTAG tag + physical iPhone (see §5). Prep I can do read-only now: the NDEF payload spec (equipment-sticker URL record + AAR matching `buildEquipmentStickerRecords` in `src/lib/nfc-sticker-payload.ts` — verified 2026-08-19; `src/lib/nfc-platform.ts` does not exist) and write instructions. **Landmine:** `react-native-nfc-manager@3.17.2` carries a local patch (`patches/…+3.17.2.patch`, the #833 getTag guard) — a fresh install without `patch-package` re-run reintroduces the bug; the slice-8 read path depends on it.

---

## 3. Top-5 G2 implementation (sequenced, dependency-gated)

### STEP 1 — Delight-stack de-risk (THE LYNCHPIN — spec: delight-stack-derisk — verdict: sound)

The single spec executable independently, and the gate the entire G2 UI track rests on. The original NativeWind `transformFile`-undefined crash was **never isolated** between NativeWind's babel plugin and worklets-under-SDK-57 Metro. Uniwind is architecturally clean (adds *zero* babel plugin; delegates every non-CSS file to the Expo transform-worker which runs `babel-preset-expo` + the worklets plugin), but that does **not** prove worklets 0.10.1 is safe on the SDK-57 worker. This step proves it empirically via a bisected build.

1. **PRECONDITION — check it AFTER a clean install, not before.** `package.json` already declares `babel-preset-expo` at `~57.0.0` as a direct dependency (verified 2026-08-19), and the worktree this was originally written in had **no `node_modules` at all** — so the `MODULE_NOT_FOUND` that produced the "confirmed failing today" note proved nothing about the manifest. Do NOT edit `package.json` on the strength of a failed `require.resolve` in an uninstalled tree; that is a dependency edit chasing a phantom.
   Run `node scripts/vendor-vettrack.mjs && npm ci` first, *then* `node -e "require.resolve('babel-preset-expo')"`. The vendoring step is not optional: `package.json` carries `file:.vendor/vettrack/...` deps for `@vettrack/contracts` and `@vettrack/shared`, so a bare `npm ci` on a clean checkout fails before the resolve is ever reached — which is why `.github/workflows/ci.yml` runs it first too. **Gate:** it prints a path. Only if it still fails after a clean install is there a real hoisting problem to fix (pin the version Expo nests, or reinstall clean) — and a root `babel.config.js` does die before worklets is exercised, which is why the gate is here at all.
2. **Install via expo install only:** `npx expo install react-native-reanimated react-native-worklets react-native-gesture-handler @shopify/flash-list expo-haptics`. Verify package.json shows the pin-table versions (worklets **0.10.1**, GH **~2.32.x** — not the brief's numbers).
3. **Create `babel.config.js`** (`npx expo customize babel.config.js`, then edit): `presets:['babel-preset-expo']`, `plugins:['react-native-worklets/plugin']` as the **LAST** plugin. **DEFER React Compiler** entirely (it would add a second unproven variable to the same bisect and must be FIRST if ever added).
4. **BISECT — the actual falsification.** Before touching GH/FlashList, add ONE trivial worklet animation (`useSharedValue`+`useAnimatedStyle`+`withSpring` on an `Animated.View`, per Reanimated's [Your First Animation](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/your-first-animation/)) and `npx expo start -c`. **This isolates "does worklets 0.10.1 crash the SDK-57 transform-worker" from any GH/FlashList interaction.**
   - **🚨 STOP BRANCH:** if this reproduces `Cannot read properties of undefined (reading transformFile)` or any transform-worker init crash → the "G2 buildable" assertion is **FALSIFIED**, worklets-under-SDK-57 (not NativeWind) is the culprit. Do NOT layer GH/FlashList on a red bundle. Report the crash signature as a **buildability finding**; fix path = pin/patch worklets or escalate the SDK. **This is a G2 no-go signal, not a footnote.**
5. **Layer the rest (only if step 4 green):** add `GestureHandlerRootView` as the **outermost** element in App.tsx (grep count is 0 today — gestures silently no-op without it), keep `withUniwindConfig` outermost in metro.config.js, add a FlashList 2 render (no `estimatedItemSize`). Re-bundle green.
6. **Native run:** `npx expo prebuild --clean` (safe — ios/android are gitignored CNG, 0 tracked files; NFC entitlement regenerates from app.json's plugin) → `npx expo run:ios` **and `npx expo run:android`** on the named gate device (§4: Samsung Galaxy A16/A15). New Arch is mandatory (Reanimated 4 hard-requires it). Validating only iOS would let a native link failure on the platform the perf gate actually measures reach Step 2.
7. **Verify + record:** `npx tsc --noEmit` = 0. Gate PASS only when tsc 0 AND bundle green on sim AND the worklet animation runs on-thread.

**Uniwind guardrails (rules 6 & 7, non-negotiable):** `withUniwindConfig` stays outermost; **never** wrap RN/Reanimated components (`Animated.View`, `Pressable`, `FlashList`) with `withUniwind` — they already support `className`. Do NOT "fix" a perceived Uniwind/Babel conflict by editing metro.config.js. The babel.config.js + package.json changes here are **real committed artifacts** — they land via slice-PR discipline with explicit owner approval, same as §2.

### STEP 2 — Hero flow (spec: hero-flow — verdict: needs-fix; DONE hard-gated on Step 1)

Scan→checkout on the real backend (staging). **Do not start the animated centerpiece until Step 1 step-4 bundles green** — hard sequencing block, not soft dependency.

Ground-truth corrections folded — **restated 2026-08-19, the earlier version of this line was wrong.** The **delight stack** (Reanimated / Gesture Handler / FlashList / haptics) is genuinely absent; that is what STEP 1 exists to land. **SSE and i18n are NOT absent — both are merged and on `main`:** `src/infrastructure/realtime/{SseAdapter.ts,RealtimeBridge.tsx,defaultRealtime.ts}` (`getDefaultRealtimePort()` returns the shared `RealtimePort`) and `src/i18n/{config.ts,rtl.ts}` (`i18n` default export, `isRtlLocale` / `applyRtlDirection` / `isRtlReloadPending`). **Verify and reuse those APIs; do not build a second one.** A per-feature `EventSource` would break the frozen "one SSE connection per clinic" contract, and an inline strings module would bypass i18n entirely — both are worse than the gap they would be filling. Keep the degrade-gracefully fallback only for a *specific symbol* confirmed missing at build time. Backend contracts (`POST /api/equipment/scan` toggle semantics, 409 `checkedOutByEmail`, `undoToken`, list ETag/304) are sourced from `~/vettrack`, **not verified against this RN repo** — the must-fixes below enforce verification before the blind test.

Build order:

1. **Verify the seam files exist first** (critics flagged unverified): `src/infrastructure/auth/ClerkTokenBridge.tsx`, `src/lib/query-client.ts`, and `api.ts` helpers (`requestJson`/`authFetch`/`setCurrentUserId`). If absent, the auth-bootstrap/409-typing work has no foundation — build or adjust accordingly.
2. **Typed API surface** in `src/lib/api.ts` + `src/types/api.ts`: `equipment.list()` (do NOT send `If-None-Match` — `requestJson` calls `res.json()` unconditionally; a bodiless 304 throws) and `equipment.scan()` (the hero action — **use `POST /api/equipment/scan`, NOT `/:id/toggle`** which hardcodes `isPluggedIn`). Type the 409 as a first-class `ConflictResult` carrying `checkedOutByEmail`, not a thrown error.
3. **Auth bootstrap:** prefetch `users.me` (sets `currentUserId`) BEFORE any scan/list; `authFetch` throws `AUTH_INVALID: missing userId` on every non-/me route otherwise. Gate the Scan CTA until populated.
4. **Instrumentation = the literal deliverable, THREE distinct mechanisms** (add `react-native-performance` via `npx expo install`): (a) cold-start TTI `nativeLaunchStart→screenInteractive`, **cold starts only** (exclude warm/prewarm — react-native-best-practices); (b) tap-response mark `scan_tap→scan_confirmed`; (c) **frame-time/jank is NOT mark-measurable** — a `requestAnimationFrame` delta sampler counting frames >budget during the Reanimated transition + FlashList scroll, plus a Reanimated completion callback. "Add performance marks" does NOT satisfy the frame half.
5. **ScanScreen:** primary scan CTA (NFC via existing manager seam / camera-barcode from delight stack) + search that debounces the REQUEST, not just the render — **and `src/hooks/useEquipmentSearch.ts` already exists**, so this is extend, not build. Two separate jobs, which the earlier wording conflated: `useDeferredValue` deprioritises re-rendering the result list, it does **not** debounce anything. The shipped hook feeds `deferredQuery` straight into the TanStack query key, so every settled keystroke is a new key and a new `api.equipment.list({q})` round trip. Add an explicit debounce (~250–300 ms) in front of the query key and keep `useDeferredValue` for the list render only + recent equipment. NFC stays **advisory** (frozen surface): a read pre-fills, human confirms in the sheet, never auto-commits custody. Tag-payload fallback: if payload matches the id format → deep-link to CheckoutConfirm; else resolve via `equipment.list({q:payload})`.
6. **FlashList v2 list** (no `estimatedItemSize`): `EquipmentRow` with Reanimated press-scale + expo-haptics tick, `renderItem` outside render, `getItemType` by status.
7. **CheckoutConfirm** (delight centerpiece): Reanimated shared-element-style transition + Gesture Handler dismiss. `useScanToggle` with `onMutate` optimistic status flip + snapshot, `onError` rollback + loud toast, **always reconcile to the server-returned action**. 409 = first-class conflict screen naming the holder. Success = checkmark/haptic + Undo wired to `undoToken`. **Equipment custody is NOT emergency state → optimistic-with-rollback is allowed** (the no-optimistic rule is Code-Blue-only); but the scan route is **online-only — fail loud offline, never queue**.
8. **Realtime seam — 🔒 FROZEN-CONTRACT MUST-FIX (2nd critic, anchor violation):** `useEquipmentRealtimeSync` must **SUBSCRIBE to the single shared per-clinic SSE connection** and only `invalidateQueries({ queryKey: ['equipment'] })` on relevant events (v5 object signature — the positional-array form was removed, and this repo is on `@tanstack/react-query` ^5.101.4) — it must **NOT instantiate its own EventSource** (a per-feature connection breaks the frozen "one SSE connection per clinic" contract even on the same transport). The SSE client seam **exists** (`getDefaultRealtimePort()` in `src/infrastructure/realtime/defaultRealtime.ts`) — subscribe through it. Degrade to `refetchOnWindowFocus` + invalidate-on-mutation only if a specific required symbol turns out to be missing, not as the default path. **PROHIBITED:** any `refetchInterval`/`setInterval` polling to fake "live" (doctrine violation) — grep must confirm zero.
9. **i18n/RTL seam:** route all copy through `t()` (Hebrew default) against the **existing** `src/i18n/config.ts` — it is merged, so there is no "if it lands" and no inline strings module to write. **no hardcoded literals**. Logical spacing (`ps-`/`pe-`, `I18nManager.isRTL`); RTL flip needs an app reload (frozen).
10. **E2E on sim against staging** (DONE gate — contingent on Step 1 green): drive Scan→search/NFC→FlashList→CheckoutConfirm→server-confirmed toggle, capturing all three instrumentation outputs. **Before the blind test, run the step-2 staging contract check for real** (scan semantics, 409 shape, undoToken) and verify tag payload on device.

### STEP 3 — G2 gate machinery — **OWNER-BLOCKED verdict** (spec: g2-gate-prereg — verdict: needs-fix: version drift)

Honestly ownerBlocked (hardware + humans + the pre-reg commit-lock). **Version must-fix folded:** the spec's landmine #4 + step 5 repeat the brief's wrong `worklets 0.11.x`/`GH 3.x` — **corrected to the pin table** (0.10.1 / ~2.32.x) so the pre-registration locks numbers against a stack that actually builds.

Agent-preparable now (read-only, buildable on approval):

- Pre-registration doc **template** (`docs/g2-preregistration.md`) with thresholds parameterized by the named device's refresh budget (60Hz=16.67ms · 90Hz=11.11ms · 120Hz=8.33ms): p95 frame ≤ device budget AND <1% frames over; tap→response <100ms; cold-TTI <2s (cold only); blind ≥70% of ≥5 staff prefer RN with a concrete reason; hero task-time ≤ Capacitor.
- Measurement harness (`react-native-performance` markers) + trace-capture scripts (Perfetto/Android Studio Profiler + adb; Instruments Time Profiler + os_signpost; RN DevTools Performance panel) + results CSV schema.
- Blind-preference kit: counterbalanced A/B, unlabeled identical chassis, standardized spoken prompt, per-participant capture sheet, reason-coding rubric ("concrete" = a named speed/tap/feel difference, not "looks nicer").
- NTAG NDEF payload spec (equipment-sticker URL record + AAR).

Owner-only (see §5). **Verdict rule (binding, from the Anchor):** PASS requires ALL objective floors met on the named low-end device AND ≥70% blind preference AND task-time ≤ Capacitor. Miss any floor OR <70% preference → **STOP the migration, polish Capacitor.** The gate does not pass on management enthusiasm.

---

## 4. Sequenced timeline

```bash
NOW (read-only + local proofs, no git side-effects):
  ├─ Verify actual branch-protection required contexts (pre-flight)
  ├─ Prep G2 templates (pre-reg doc, harness, blind kit, NDEF spec)   [parallel, no deps]
  └─ Local proofs: expo-export local bundle; lint-to-zero locally

STEP 1  Delight-stack de-risk  ◀── SINGLE LYNCHPIN, run FIRST
        └─ bisect step 4 = the falsification. RED → STOP (G2 no-go finding).
                                   │ (must be GREEN to proceed)
        ┌──────────────────────────┴───────────────────────────┐
        ▼                                                        ▼
STEP 2  Hero flow build (blocked on Step 1 green)      TECH-DEBT (parallelizable, Step-1-independent):
        └─ instrumented, on-sim, staging contract         ├─ 2A docs-sync PR      (ci.yml-free)
                                   │                        └─ 2B+2C COMBINED CI PR (lint + export step)
                                   ▼                            └─ whichever merges 2nd rebases on origin/main
STEP 3  G2 measurement + blind test  ◀── OWNER-BLOCKED
        (needs Step 2 built + owner hardware/humans + committed pre-reg lock)
```

**Parallelizable:** all tech-debt (§2A–2C) runs alongside Step 1 — ESLint/expo-export are orthogonal to the Metro/Babel/worklets chain. **Serial gates:** Step 2 blocks on Step 1 green; Step 3 blocks on Step 2 built AND the owner deliverables AND the pre-reg commit landing *before* any measurement. **CI serialization:** 2B and 2C must be one PR or rebased — same `quality` job.

---

## 5. Owner asks (the minimal owner-only set)

1. **Explicit approval to commit/push/open PRs this turn** (agent-conduct Rule 2 — memory notes prior "tech-debt closure" intent but that is not standing consent for these specific side-effects). Gates: §2A docs PR, §2B+2C CI PR, and Step-1's babel/package artifacts.
2. **Named low-end Android gate device** — **Samsung Galaxy A16/A15** (best-selling budget line, ~90Hz→11.11ms) primary; Moto G Play (2024) optional harder floor. **NOT the Pixel 7** — it's flagship-class (Tensor G2/8GB) and hides the exact jank the gate exists to expose; keep it only as a "no regression on decent hardware" secondary. Record model + refresh-rate + SoC + RAM.
3. **iOS floor device** — iPhone SE (3rd gen, 60Hz) named, or the owner's iPhone with its exact model + refresh rate recorded.
4. **NTAG tags** (NTAG213, 144B, sufficient for the sticker URL) **+ a physical iPhone** — this single artifact **closes G1 slice 8 AND feeds the blind scan→checkout** (do not plan them as two things). Ensure the nfc-manager patch is re-applied via `patch-package`.
5. **≥5 clinic staff recruited + scheduled** for the on-site, counterbalanced blind sessions (physical, human-subject — cannot be automated).
6. **Approve + COMMIT the pre-registration doc BEFORE any measurement** — the dated commit SHA is the lock; no threshold/device/sample-size may change after it. A miss is a miss.
7. **Confirm required-check contexts** (or confirm whether `SonarCloud` is genuinely a required check) so the "wire into existing job" strategy is correct. If the owner *wants* lint/export as separate required contexts, that needs an owner branch-protection edit.

---

## 6. Done-definition for Step 1 (unambiguous next action)

**The very next action is executable and read-only-safe up to the git-commit boundary.** Step 1 is **DONE (PASS)** iff ALL of:

1. `node -e "require.resolve('babel-preset-expo')"` prints a path (precondition hoisted).
2. `npx expo install` yielded exactly: reanimated **4.5.1**, worklets **0.10.1** (NOT 0.11.x), gesture-handler **~2.32.x** (NOT 3.x), flash-list **2.0.2**, **expo-haptics `~57.0.1`**; `npm ls` shows no ERESOLVE. (haptics is installed at step 2 above and required by the hero flow's `EquipmentRow` tick — omitting it from this gate let Step 1 be marked PASS with a package the next step depends on missing.)
3. `babel.config.js` exists at root with `babel-preset-expo` preset and `react-native-worklets/plugin` as the **LAST** plugin; **no** React Compiler plugin.
4. **Bisect (step 4): a bundle is actually REQUESTED and comes back green** with a trivial worklet Reanimated animation active — no `transformFile`-undefined / transform-worker init crash. `npx expo start -c` alone does not satisfy this: it starts Metro and waits, and no transform runs until a client asks for a bundle, so a green-looking terminal proves nothing. Satisfy it with `npx expo export` (transforms the whole graph headlessly) **or** by launching a client against Metro and recording that the worklet animation ran.
5. Full four-library set coexists: `GestureHandlerRootView` outermost, `withUniwindConfig` outermost, FlashList 2 rendering, bundle still green.
6. `npx expo prebuild --clean && npx expo run:ios` launches on the sim **and `npx expo run:android` launches on the Galaxy A16/A15 (or its emulator)**; the worklet animation runs on-thread on both; no native link errors on either.
7. `npx tsc --noEmit` exits 0.

**FAIL / STOP branch:** if step 4 (or any bundle) reproduces the transform-worker crash → **do not proceed to hero-flow.** Record the exact crash signature as the deliverable: the Anchor's "G2 buildable" claim is **falsified**, worklets-under-SDK-57 Metro (not NativeWind) is the culprit, and this is a **G2 no-go signal** requiring a worklets pin/patch or SDK escalation decision from the owner — not a workaround layered on a red bundle.

**No spec was found unsound**, so no workstream is marked BLOCKED-as-unsound; hero-flow and g2-gate-prereg are needs-fix (fixes folded above), and g2-gate-prereg + slice-8 NFC are the only genuinely owner-blocked items.
