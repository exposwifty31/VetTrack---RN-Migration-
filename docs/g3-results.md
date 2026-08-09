# g3-results.md — G3 Daily-Driver Parity Exit Pass

**Slice 12 (Menu front door + account essentials + exit pass).** This document
records the G3 exit checklist from `docs/G3-PLAN.md` §1. The **automatable**
parts were run and recorded here; the **on-device** parts (he+en RTL sweep,
G2Measure frame-floor spot-check, owner daily-driver verdict) are the owner gate
and are captured as an explicit protocol below — **not** claimed as done.

Environment: Expo SDK 57 · RN 0.86.2 · New Architecture · CNG prebuild · npm.
Base: `main` @ `d0fbc58` (post PR #34). Recorded 2026-08-09.

> **§1–§6 record Slice 12.** Slice 13 (Tablet-iOS / iPad layout) is recorded
> separately in **§7** with its own gate run — the numbers in §3.1 are Slice 12's
> and are deliberately left as recorded.

---

## 1. Exit checklist (G3-PLAN §1) — status

| # | Checklist item | Kind | Status |
|---|---|---|---|
| 1 | All Grade-A flows demoed end-to-end on device (he + en, RTL screenshots) | on-device (Pixel + iPhone) | ⏳ **owner gate** (protocol §5) |
| 2 | Grade-B minimum bar met; slips have written owner sign-off | code + gate | ✅ all 7 B-screens present (§4); no slips |
| 3 | `grep -rn "refetchInterval" src/` → only shift-chat; `setInterval` audited | automatable | ✅ done (§3.2) |
| 4 | `parity.test.ts` + full jest + typecheck + lint green | automatable | ✅ done (§3.1) |
| 5 | G2Measure export on release artifact — harness intact, no frame-floor regression on Equipment list + one new list screen | on-device (Pixel + iPhone) | ⏳ **owner gate** (protocol §5) |
| 6 | Owner daily-driver verdict recorded (the gate) | on-device (Pixel + iPhone) | ⏳ **owner gate** (protocol §5) |

---

## 2. Slice 12 deliverables (what this PR adds)

- **Menu front door** — `src/screens/MenuScreen.tsx` rewritten from the G1
  debug-launcher into four grouped sections: **Operations** (Tasks · Rooms ·
  Mine · Alerts · Inventory · Autopilot), **Session** (End shift → Handoff),
  **Account** (display-name · locale · sign out), **Developer** (collapsible,
  default-collapsed but **always rendered** so every old debug screen stays
  reachable on release — SignIn, ApiSmoke, NfcSpike, StorageDebug, RealtimeDebug,
  I18nDebug, G2Measure; NOT `__DEV__`-gated, because G2Measure must run on the
  release artifact for the exit-pass). Route map extracted + compile-checked in
  `src/screens/menu/menu-routes.ts` (every entry is a param-free root-stack route).
- **Account essentials** — `src/features/account/AccountSection.tsx`:
  - Display-name edit via **inline field** (frozen nav forbids registering the
    `transparentModal` route `BottomSheet` needs; inline keeps the Menu at
    **zero blur layers**). `PATCH /api/users/:id/display_name {display_name}`
    (1–60, self), new module `src/lib/api/account.ts`; invalidate-not-optimistic
    on the identity query.
  - Locale toggle (he⇄en) — **client-local only** (no server locale write path,
    seam §6.2): persists `"vettrack-locale"`, flips i18next live, aligns the
    native RTL flag, and surfaces an **honest "restart to apply"** hint (direction
    only flips on the next JS reload — never faked). Logic in
    `src/features/account/locale-toggle.ts`.
  - Sign out via Clerk (`useAuth().signOut`), confirm-gated (`Alert`), rendered
    only under `ClerkProvider` (dev-bypass has no session).
- **G5 seam (NOT built):** account deletion (`DELETE /api/users/delete-account`)
  and avatar upload — noted in `src/lib/api/account.ts`. The two stores differ:
  **Apple** (Guideline 5.1.1(v)) requires an in-app path that **initiates** account
  deletion; **Google Play** requires a deletion-request path and permits that
  in-app path to **link out to the existing web deletion resource** (which must
  also be provided as a Play Console web URL). Both are store-submission
  prerequisites, not daily-driver blockers — the web deletion page is the interim.

---

## 3. Automatable evidence (run 2026-08-09)

### 3.1 Gates

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ **0 errors** |
| Lint | `npm run lint` (`eslint . --max-warnings=0`) | ✅ **0 warnings** |
| Tests | `npm test` (jest) | ✅ **68 suites / 638 tests passed** |
| Parity | `parity.test.ts` (within the suite) | ✅ he⇄en key sets identical, no empty values |
| iOS export | `npx expo export --platform ios` | ✅ **clean (exit 0)** — `index.ts` bundled, 2146 modules, iOS hbc 5.9 MB, 20 assets |

New tests added by this slice (part of the 638):
- `src/lib/__tests__/api.account.test.ts` — display-name API shape (path-encoded
  id, `{display_name}` body trimmed, `x-request-id`, 403/404 coded errors) +
  `isValidDisplayName` bounds.
- `src/features/account/__tests__/locale-toggle.test.ts` — `nextLocale` pure swap
  + `applyLocaleChange` (persist + forceRTL + honest `reloadPending`).
- `src/screens/menu/__tests__/menu-routes.test.ts` — compile-checked route map;
  locks the Operations/Session sets and that **every** debug screen is preserved.

### 3.2 Zero-polling audit (checklist item 3)

`grep -rn "refetchInterval" src/` — the ONLY runtime use is the documented
shift-chat exception:

```text
src/features/shift-chat/useShiftChat.ts:81   refetchInterval: (q) => …computeRefetchInterval(…)
```

`computeRefetchInterval` (`src/features/shift-chat/poll-gate.ts`) returns `false`
unless the chat screen is focused AND the app is foregrounded — the single
sanctioned exception (G3-PLAN §1.4 / §5.9). Every other `refetchInterval` hit is
a **comment** in a screen explicitly documenting "no refetchInterval" (Equipment
Detail, MyEquipment, Tasks, Alerts, Inventory, Rooms) or the gate module/test.

`grep -rn "setInterval" src/` → **no matches** (zero interval loops).

`setInterval`/`setTimeout` audit: `setInterval` = none. `setTimeout` appears at
three non-polling one-shot sites: `EquipmentDetailScreen.tsx:144` (a single
self-clearing custody-countdown clock tick), `SignInScreen.tsx:72` (a `setTimeout(r,0)`
next-tick after `setActive`), and `SseAdapter.test.ts` (test-only). None is a
fetch/poll loop.

---

## 4. G3 coverage table (screen ↔ merged PR)

Grade per G3-PLAN §1. "Baseline" = landed pre-G3 (G2/G2.5) and unchanged.

### Grade A — all present (every A flow must work E2E)

| Screen | Merged PR | Present? |
|---|---|---|
| Home daily pulse (uplifted to parity) | **#28** — Slice 5 | ✅ |
| Equipment list | baseline (G2.5 #21) | ✅ |
| Scan → confirm hero | baseline (G2) | ✅ |
| Equipment detail | **#26** — Slice 2 | ✅ |
| Tasks | **#25** — Slice 3a + **#38** — Slice 3b | ✅ |

### Grade B — target all 7; minimum bar = first 5

| Screen | Merged PR | Present? |
|---|---|---|
| My Equipment | **#27** — Slice 4 | ✅ |
| Alerts | **#35** — Slice 6 | ✅ |
| Rooms + sweep | **#36** — Slice 7 | ✅ |
| Shift chat | **#34** — Slice 8 | ✅ |
| Handover (end shift) | **#32** — Slice 9 | ✅ |
| Inventory dispense/restock | **#37** — Slice 10 | ✅ |
| Autopilot queue | **#33** — Slice 11 | ✅ |

**All 7 Grade-B screens present** — exceeds the minimum bar of 5; no slips, so no
owner sign-off required for slips.

### Grade C — thin subset shipped in the Menu (this slice)

| Item | Status |
|---|---|
| Sign out | ✅ this PR (Slice 12) |
| Locale toggle (he⇄en, client-local) | ✅ this PR (Slice 12) |
| Display-name edit | ✅ this PR (Slice 12) |
| Full profile / settings / avatar / What's New / chat archive | deferred (Grade C — out of G3) |

### Foundations / G4-out-of-scope

| Item | Note |
|---|---|
| Slice 1 foundations (routes + UI kit + realtime invalidation) | **#23** |
| Account deletion + avatar upload | **G5** seam (store-submission prerequisite), not built |
| Code Blue / crash-cart, native push, offline write queue | **G4** — out of G3 scope |

---

## 5. Owner on-device gate protocol (NOT done by the agent)

These are the gate. tsc/lint/jest/export above are necessary but **not
sufficient** (AGENTS.md). Run on **BOTH of the owner's devices — Pixel 7
(Android) AND iPhone 16 Plus (iOS)** — against production `https://vettrack.uk`,
from a release artifact (`npm ci`), per the G2 protocol.

**Why both:** G3's success feeds two-store submission (Apple App Store + Google
Play), so both platform targets are gated. G2 was Pixel-only because that was
that gate's single declared device; G3/G4/G5 device verification is
dual-platform. The iOS run needs a real RN iOS build (CNG prebuild + Xcode
signing; the NFC-entitlement caveat from slice-8 applies — the measurement build
may strip the NFC entitlement like the sim path did). Run every checkbox below
**once per device**; note device + build per capture.

### 5.1 he + en RTL screenshot sweep (checklist item 1)

- [ ] Boot in **Hebrew** (default). Menu front door: confirm Operations / Session
      / Account / Developer groups render RTL (labels right-aligned, rows mirrored).
      Screenshot.
- [ ] Open **Account → Language**, tap **English**. Confirm copy flips to English
      **live**, and the **"restart to apply" hint appears** (direction is still RTL
      until reload — this is expected and honest, not a bug).
- [ ] Relaunch the app. Confirm layout is now **LTR** and English persisted.
      Screenshot the Menu in en/LTR.
- [ ] Switch back to **Hebrew**, relaunch, confirm RTL restored + persisted.
- [ ] Demo each **Grade-A** flow end-to-end in **both** locales (Home pulse,
      Equipment list, Scan→confirm hero, Equipment detail, Tasks). RTL screenshots
      of each.
- [ ] Account → **Display name**: edit to a new value, Save, confirm it persists
      after relaunch (identity refetched). Try a 61-char value → Save disabled +
      the 1–60 hint. Try a Latin name → confirm it isolates correctly in the RTL row.
- [ ] Account → **Sign out**: confirm the Alert appears; cancel; then sign out and
      confirm you land on Sign in and must re-auth.

### 5.2 G2Measure frame-floor spot-check (checklist item 5)

- [ ] From the release artifact, open **Menu**, tap **Developer** (the section is
      collapsed by default; it is **always rendered**, so G2 Measure is reachable
      even on a `__DEV__ === false` release build), then **G2 Measure**.
- [ ] Run the export on **Equipment list** (the required existing list) **and one
      new list screen** (e.g. Tasks or Rooms — the "one new list screen").
- [ ] Confirm the `MARK` vocabulary/latch contract is intact (export runs, chunked
      logcat shape unchanged) and **no frame-floor regression** vs the G2.5 evidence
      (`docs/g2_5-results.md`: pooled UI p95 ≈ 11.08 ms, 0 dropped). Menu is not a
      FlashList surface, so the risk is the pre-existing list screens, not the Menu.

### 5.3 Daily-driver verdict (checklist item 6 — THE gate)

- [ ] Use the RN app as the **daily driver for a full shift** on **each** device —
      Pixel 7 (Android) and iPhone 16 Plus (iOS) — Capacitor app installed as
      fallback only.
- [ ] Record the written **go / no-go** verdict here, **one line per device**:

```text
Owner daily-driver verdict — Pixel 7 / Android (date, build, verdict, notes):
  … to be filled by the owner …

Owner daily-driver verdict — iPhone 16 Plus / iOS (date, build, verdict, notes):
  … to be filled by the owner …
```

---

## 6. Deviations & notes

1. **Display-name editor is inline, not a `BottomSheet`.** The nav contract is
   frozen (Slice 1 pre-registered all routes; this slice adds none), so the
   `transparentModal` route the `BottomSheet` primitive needs cannot be registered
   under the frozen navigation contract, and hosting a Pan-gesture sheet in an
   in-tree overlay has a hit-testing footgun. Inline is an explicitly sanctioned
   option (G3-PLAN §2 Slice 12: "BottomSheet … **or an inline field**") and keeps
   the Menu at **zero blur layers** (≤1 satisfied trivially).
2. **`MeUser` gained `displayName?: string | null`** (`src/types/api.ts`). The
   `/api/users/me` route already returns it; the constraint "don't touch api.ts"
   is about `src/lib/api.ts`, not the types file.
3. **`menu.devSection` i18n key removed**, replaced by `menu.sections.developer`
   (+ `operations`/`session`/`account`). No other referent (grep) and
   `config.test.ts` pins `home.signIn`, not it — parity stays green.
4. **Mine menu entry hidden for custody-scoped roles** (`isCustodyScopedRole`):
   students already get the Mine **tab** (Slice 4); the Menu entry serves everyone
   else, avoiding a duplicate for students.

---

## 7. Slice 13 — Tablet-iOS (iPad) layout

Base: `main` @ `492b891` (post PR #40). Recorded 2026-08-09. Scope per
`docs/G3-PLAN.md` §2 Slice 13: four screens gain an iPad layout, **no new routes**.

### 7.1 Gate item 0 — iPad orientation plist (fail-closed)

Asserted against the CNG-generated `ios/VetTrack/Info.plist` (`plutil`):

| Key | Required | Observed | |
|---|---|---|---|
| `UISupportedInterfaceOrientations` (iPhone base) | the two portrait values | `[Portrait, PortraitUpsideDown]` | ✅ |
| `UISupportedInterfaceOrientations~ipad` | all four | `[Portrait, PortraitUpsideDown, LandscapeLeft, LandscapeRight]` | ✅ |
| `UIRequiresFullScreen` | unset/false (Split View allowed) | `false` | ✅ |

`app.json` keeps `orientation: "portrait"` + `ios.supportsTablet: true`. The plist
above is the proof that this pair is already correct: `@expo/config-plugins`
writes the `~ipad` key itself, so **iPad rotates all four ways while iPhone stays
portrait**. Changing `orientation` to `"default"` would unlock iPhone landscape —
a surface no RN screen was designed for — and is **not** warranted.

### 7.2 Automatable gates (run 2026-08-09 on this branch)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ **0 errors** |
| Lint | `npm run lint` (`eslint . --max-warnings=0`) | ✅ **0 errors, 0 warnings** |
| Tests | `npm test` (jest) | ✅ **72 suites / 667 tests passed** (69 suites at `492b891` + the 3 new pure-logic suites) |
| Parity | `parity.test.ts` (within the suite) | ✅ he⇄en key sets identical |
| iOS export | `npx expo export --platform ios` | ✅ clean — `index.ts` bundled, 2156 modules, iOS hbc 5.9 MB, 20 assets |

New pure-logic suites: `src/lib/__tests__/use-is-tablet.test.ts` (short-side ≥ 600
threshold, rotation stability), `src/components/tablet/__tests__/two-pane-layout.test.ts`
(master width clamp + derived selection), `src/components/home/__tests__/home-bento-layout.test.ts`
(column reflow incl. 50/50 Split View → 1 column).

### 7.3 iPad simulator render evidence

Built via CNG (`npx expo run:ios`) and installed on two booted simulators,
iOS 26.4: **iPad Pro 11-inch (M5)** and **iPad Pro 13-inch (M5)**.

All captures are against a **live local API** (`pnpm dev:api` on the legacy repo
in dev-bypass), so the panes hold real records rather than empty states.

| Screen | Device | Orientation | Locale | Evidence |
|---|---|---|---|---|
| Home (bento reflow) | iPad Pro 11" | portrait | he (RTL) | [home-ipad11-portrait-he.png](g3-slice13-ipad/home-ipad11-portrait-he.png) |
| Home (bento reflow) | iPad Pro 13" | portrait | he (RTL) | [home-ipad13-portrait-he.png](g3-slice13-ipad/home-ipad13-portrait-he.png) |
| Equipment (two-pane, detail populated) | iPad Pro 11" | portrait | he (RTL) | [equipment-ipad11-portrait-he.png](g3-slice13-ipad/equipment-ipad11-portrait-he.png) |
| Equipment (two-pane, detail populated) | iPad Pro 13" | portrait | he (RTL) | [equipment-ipad13-portrait-he.png](g3-slice13-ipad/equipment-ipad13-portrait-he.png) |

What these prove:

- **Home reflow.** `resolveHomeColumns` returns 2 and `BentoRow` pairs the cards
  side by side (shift hero ⟷ scan hero, attention ⟷ readiness), with the
  activity feed still a single full-width FlashList below.
- **Two-pane master/detail.** The Equipment list stays mounted in the master pane
  while the selected unit renders the full `EquipmentDetailContent` in the detail
  pane — the same body the phone route pushes. Before a selection the detail pane
  shows `SelectPlaceholder` with the new `tablet.selectEquipment` copy.
- **`resolveMasterWidth`, both branches, one per device.** On the 11" (834 pt) the
  ratio applies: 834 × 0.42 ≈ **350 pt**, under the cap. On the 13" (1032 pt) the
  ratio would give 433 pt, so the master is **clamped to `MASTER_MAX_WIDTH` = 380**.
  The two screenshots show exactly that difference.
- **RTL is correct.** The `start` slot renders on the **right** in both the bento
  rows and the two-pane frame — `I18nManager` flips `flex-row` on its own, with no
  `row-reverse` double-flip.

**Capture harness (not part of this branch).** The RN client fails closed without
a Clerk session, so these screens cannot render on a bare simulator at all. The
run applied the dev-only seam from PR #42 (`EXPO_PUBLIC_DEV_AUTH=1`) as a local,
uncommitted change plus a local `.env`. Neither is in this branch — `git status`
on the capture worktree was returned to clean afterwards.

### 7.4 Still open — landscape and the `en` LTR pass

The populated master/detail half of the gate is **closed** (§7.3). What is **not**
claimed:

| Item | Status | Why |
|---|---|---|
| Rooms / Tasks two-pane captures | not captured | Same primitive, same wiring, same `resolveSelectedItem` path as Equipment, which is captured. Covered at the layout-math level by `two-pane-layout.test.ts`. |
| Landscape captures (both devices) | **blocked** | Neither the simulator-control tool nor `xcrun simctl` exposes a rotate verb, and the AppleScript fallback is refused (`osascript is not allowed to send keystrokes`, needs Accessibility). Widths are covered by unit tests at 1194 / 1366; the 13" portrait (1032 pt) already exercises the `MASTER_MAX_WIDTH` clamp that landscape would. |
| `en` LTR pass | not captured | The locale toggle needs an app reload to re-run `I18nManager`; deferred with landscape rather than run half-way. |

All three join the existing **on-device owner gate** (§1 items 1/5/6, protocol §5)
on Pixel 7 / iPhone 16 Plus, where a real signed-in session and physical rotation
both exist.

**Root cause of the original block, now fixed upstream.** `authFetch`
(`src/lib/auth-fetch.ts:145`) throws `AUTH_INVALID` **before any network
dispatch** without a valid Clerk JWT, and `BootstrapGate` then blocks the whole
app below Home — so Equipment / Rooms / Tasks rendered the re-auth screen, not an
empty list. The client had no dev seam (`setStoredBearerToken` had no production
call site). PR #42 adds one; §7.3 was captured with it.

### 7.5 Measurement harness — integrity verified, comparison deferred

Verified by inspection on this branch:

- `src/screens/G2MeasureScreen.tsx` present, and the harness is untouched across
  the whole branch — asserted over the commit range, not just the working tree:

  ```console
  $ git diff --quiet 492b891...HEAD -- src/lib/instrumentation src/screens/G2MeasureScreen.tsx
  $ echo $?
  0     # no committed changes in the measurement harness
  ```
- Closed `MARK` vocabulary unchanged (`scan_tap`, `scan_visual_ack`,
  `scan_server_confirmed`, `screenInteractive`).
- `MARK.screenInteractive` latch call sites unchanged: `EquipmentListScreen.tsx`
  and `HomeScreen.tsx` (the Home latch still guards on a successful `mark()`).

**No pooled-p95 number is reported here, deliberately.** The G2.5 baseline
(pooled UI p95 11.07 ms, floor 11.11, 1/1962 drops) is a **physical Pixel**
release-artifact measurement; this slice's only run is a **dev-mode iPad
simulator** build, where renders are ~3× inflated. Comparing the two would be a
fabricated result, not evidence. The frame-floor comparison therefore stays on
the on-device exit pass (§1 item 5, protocol §5.2).
