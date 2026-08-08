# g3-results.md — G3 Daily-Driver Parity Exit Pass

**Slice 12 (Menu front door + account essentials + exit pass).** This document
records the G3 exit checklist from `docs/G3-PLAN.md` §1. The **automatable**
parts were run and recorded here; the **on-device** parts (he+en RTL sweep,
G2Measure frame-floor spot-check, owner daily-driver verdict) are the owner gate
and are captured as an explicit protocol below — **not** claimed as done.

Environment: Expo SDK 57 · RN 0.86.2 · New Architecture · CNG prebuild · npm.
Base: `main` @ `d0fbc58` (post PR #34). Recorded 2026-08-09.

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
- **G5 seam (NOT built):** account deletion (`DELETE /api/users/delete-account`,
  Apple + Google both mandate in-app deletion before store submission) and avatar
  upload — noted in `src/lib/api/account.ts`; the web deletion page is the interim.

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

```
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

```
Owner daily-driver verdict — Pixel 7 / Android (date, build, verdict, notes):
  … to be filled by the owner …

Owner daily-driver verdict — iPhone 16 Plus / iOS (date, build, verdict, notes):
  … to be filled by the owner …
```

---

## 6. Deviations & notes

1. **Display-name editor is inline, not a `BottomSheet`.** The nav contract is
   frozen (Slice 1 pre-registered all routes; this slice adds none), so the
   `transparentModal` route `BottomSheet` documents itself as needing cannot be
   registered, and hosting a Pan-gesture sheet in an in-tree overlay has a
   hit-testing footgun. Inline is an explicitly sanctioned option (G3-PLAN §2
   Slice 12: "BottomSheet … **or an inline field**") and keeps the Menu at **zero
   blur layers** (≤1 satisfied trivially).
2. **`MeUser` gained `displayName?: string | null`** (`src/types/api.ts`). The
   `/api/users/me` route already returns it; the constraint "don't touch api.ts"
   is about `src/lib/api.ts`, not the types file.
3. **`menu.devSection` i18n key removed**, replaced by `menu.sections.developer`
   (+ `operations`/`session`/`account`). No other referent (grep) and
   `config.test.ts` pins `home.signIn`, not it — parity stays green.
4. **Mine menu entry hidden for custody-scoped roles** (`isCustodyScopedRole`):
   students already get the Mine **tab** (Slice 4); the Menu entry serves everyone
   else, avoiding a duplicate for students.
