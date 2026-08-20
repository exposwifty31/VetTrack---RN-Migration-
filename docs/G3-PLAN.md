# G3-PLAN.md — Daily-Driver Parity Gate

**Repo:** `VetTrack---RN-Migration-` (Expo SDK 57 · RN 0.86.2 · New Architecture · CNG prebuild · Uniwind/Aurora · npm) 
**Written:** 2026-08-07, synthesized from four scouts (Capacitor surface map · RN repo state · server API surface · G4 readiness); **v1.1 — revised same day per adversarial-critic verification** (sequencing rebased on post-#21 main; route-registration collision model fixed; 4 seams pre-resolved against server code; 2 API body specs corrected). 
**Governance:** per `AGENTS.md`, slice PRs ship under the owner's standing 2026-08-07 instruction to execute G3; each slice = one PR from one agent in an isolated worktree, merged only after CI green + genuine CodeRabbit review + 0 unresolved threads. Jest + tsc are necessary but NOT sufficient — every slice verifies on a booted simulator/device before claiming done.

---

## 1. G3 Definition + Exit Bar

**G3 = staff can use the RN app as their daily driver for a full shift.** The Capacitor app remains installed as fallback; the gate verdict is the owner's written daily-driver verdict after real-shift use on his Pixel (same protocol shape as G2: release artifact, `npm ci`, production `https://vettrack.uk`).

### Platform matrix (4 targets)

VetTrack targets **four** platform surfaces. G3 advances only the RN app; the other two ship unchanged. Recorded here per the owner's 2026-08-08 restatement that **Tablet-iOS is a hard requirement currently missing from the gate ladder** — now captured as Slice 13 (pre-G5 gate).

| Target | What ships it | Status in this plan |
|---|---|---|
| **Mobile iOS + Android** | this RN app | the whole of G3 |
| **Tablet iOS (iPad)** | this RN app **+ an iPad layout** | **Slice 13** (pre-G5 gate) — same Apple binary as Mobile-iOS |
| **Web management console** | the `vettrack` web app (React + Vite) | **unchanged** — never touched by RN work |
| **TV ward board** | the `/board` kiosk target (in the `vettrack` repo) | **unchanged** — never touched by RN work |

**Store submission = BOTH the Apple App Store AND Google Play** — the RN app's iOS and Android binaries both get submitted. Tablet-iOS is **not** a separate submission: it rides the **same Apple binary** as Mobile-iOS, which is exactly why Apple reviews the iPad layout once `ios.supportsTablet` is declared. The Web console and TV board are not store-submitted.

### Coverage bar

| Grade | Requirement | Screens |
|---|---|---|
| **A — all present** | Every A flow works end-to-end on RN | Home daily pulse (uplifted to parity, not just readiness metrics) · Equipment list · Scan→confirm hero · **Equipment detail** · **Tasks** |
| **B — mostly present** | Target all 7; minimum bar = first 5. Dispense + Autopilot may slip only with explicit owner sign-off | My Equipment · Alerts · Rooms + sweep · Shift chat · Handover (end shift) · Inventory dispense/restock · Autopilot queue |
| **C — explicitly deferred** | Not in G3. A thin "account essentials" subset (sign-out, locale toggle, display-name edit) ships in the Menu slice because a daily driver needs them | Inventory-items catalog · New/edit equipment · Full profile (avatar, shift-activity list) · Full settings · What's New/Help · Shift-chat archive |
| **G4 — out of scope** | Code Blue flows, crash-cart check (emergency-readiness — classified G4 per Scout 1), native push, offline write queue | `/code-blue`, `/crash-cart` |

### Quality bar (every slice, and the gate as a whole)

1. **Aurora design language throughout** — dark default, semantic tokens from `src/global.css`, one blur layer max per screen, opaque list rows, motion only via `src/lib/motion.ts` presets (`DURATION`/`SPRING`/`PRESS_SCALE`), danger surfaces never glassed and never animated.
2. **i18n parity** — Hebrew default, English fallback, every new key in BOTH `src/i18n/locales/{he,en}.json`, `parity.test.ts` green, zero hardcoded Hebrew in source.
3. **RTL correct** — logical props (`pe/ps/end/start`), FSI/PDI isolates around Latin names/emails, `writingDirection: "ltr"` on numbers/equipment names, `Intl.DateTimeFormat("he-IL" | "en-GB")` prefix-matched.
4. **Zero polling** — no `refetchInterval`, no `setInterval` fetch loops. Freshness = SSE invalidation via the singleton `RealtimePort` (subscribe-only hooks; KEEPALIVE never invalidates) + ETag/304 on `GET /api/equipment`. **One documented exception:** shift-chat incremental `?after=` fetch, bounded to screen-focused + app-foreground (its transport on web is gt-poll + collab nudge, not SSE; see Slice 8).
5. **Measurement harness intact** — closed `MARK` vocabulary untouched; existing latch call sites (Home/EquipmentList `screenInteractive`, `scanTap`/`scanVisualAck`/`scanServerConfirmed` in the hero path) undisturbed; `G2MeasureScreen` export still works; no new marks without extending the closed union deliberately. Any UI work inherits the G2.5 bar: **no frame-floor regression** (Aurora pooled UI p95 11.08 ms vs 11.11 ms floor, 0 dropped — `docs/g2_5-results.md`).
6. **Roster-derived role handling** — every technician+/senior+ surface pre-gates UI with `hasRoleAtLeast(effectiveRole, …)` AND handles server 403 `INSUFFICIENT_ROLE` gracefully (off-shift users resolve below the floor).
7. `npm run typecheck` = 0 errors · `npm run lint` = 0 warnings · `npm test` green — per slice, plus booted-device verification.
8. **Five-React-skills mandate (standing owner rule, 2026-08-07, until migration complete):** every building agent loads the applicable subset of the five React skills via the Skill tool BEFORE writing code — `react-native-best-practices` + `react-native-architecture` + `react-native-design` for any UI/screen/component slice; best-practices + architecture for infra/fetch-layer slices; `upgrading-react-native` for upgrades; `argent-react-native-app-workflow` for sim/emulator debugging — applies their guidance, and adds a "Skills compliance" section to the PR body (skills loaded + what changed, or a reasoned no-change per skill). The mandate binds every slice above AND every G4-memo work item executed from this plan (incl. the parallel offline read-cache track). Dispatch prompts must state the mandate; the `react-skills-audit` workflow enforces it retrospectively.

### Exit checklist (final pass, Slice 12)

- [ ] All Grade-A flows demoed end-to-end on device (he + en, RTL screenshots)
- [ ] Grade-B minimum bar met; any slips have written owner sign-off
- [ ] `grep -rn "refetchInterval" src/` → only the documented shift-chat site; `grep -rn "setInterval" src/` audited
- [ ] `parity.test.ts` + full jest suite + typecheck + lint green
- [ ] G2Measure export run on release artifact — harness contract intact, no frame-floor regression on Equipment list + one new list screen
- [ ] Owner daily-driver verdict recorded (the gate)

---

## 2. Ordered Slices

**Sequencing rules.** `feat/g2_5-aurora-list-sheet` merged to main 2026-08-07 (PR #21, `bb842d7`) — **every slice bases on current main**; re-verify main's file state at dispatch time. Collision avoidance for parallel agents:

1. **Slice 1 pre-registers ALL G3 routes** (`EquipmentDetail`, `Tasks`, `MyEquipment`, `Alerts`, `Rooms`, `RoomDetail`, `ShiftChat`, `Handoff`, `Inventory`, `AutopilotQueue`) in `src/navigation/types.ts` + `RootNavigator.tsx`, each pointing at a gated placeholder screen file. Later slices then only rewrite **their own screen file** — no slice after 1 touches the navigation files.
2. **Entry-point wiring lives with the file owner:** every `HomeScreen` edit (attention-card jump to Alerts, shift-chat header launcher, daily-pulse) belongs to Slice 5; every `MenuScreen` edit (all menu entries) belongs to Slice 12. Slices 6/8/9/11 add NO entry points themselves — their screens are reachable via the pre-registered routes until 5/12 land.
3. **New API domains go in new per-domain modules `src/lib/api/<domain>.ts`** (canonical key factory + typed fns per module, same idioms as `api.ts`); only the equipment domain continues to live in `src/lib/api.ts` — Slices 2 and 4 both extend it, so they run **serially** (2 → 4).
4. `MainTabs.tsx` has exactly one G3 writer (Slice 4's role-conditional tab swap).

Every screen touching `/api` mounts under `BootstrapGate`.

Common verification commands (every slice; per-slice extras noted inline):

```sh
npm run typecheck && npm run lint && npm test
npx expo run:ios          # or run:android — booted-device smoke per AGENTS.md bar
```

---

### Slice 1 — G3 Foundations (shared kit + nav + realtime generalization) — **startable now**

- **Scope:**
  - Navigation: register **ALL** G3 routes (`EquipmentDetail: { equipmentId: string }`, `Tasks`, `MyEquipment`, `Alerts`, `Rooms`, `RoomDetail: { roomId: string }`, `ShiftChat`, `Handoff`, `Inventory`, `AutopilotQueue`) in `RootStackParamList` + `RootNavigator` (module-scope `BootstrapGate` wrappers like `GatedScan`), each pointing at a minimal gated placeholder screen file (`src/screens/<Name>Screen.tsx` — honest empty-state rendering the new `common.comingSoon` i18n key (never hardcoded Hebrew, per the parity bar), no data fetch). This makes every later slice new-file-only: it rewrites its own placeholder and never touches the navigation files.
  - Shared UI kit (new files, `src/components/ui/`): `SectionCard`, `ListEmptyState`, `ErrorNote` (retry affordance), `RowSkeleton`, `Chip`. All Aurora-tokened, opaque surfaces, PressableScale where pressable, ≥44pt.
  - `src/components/ui/BottomSheet.tsx` — reusable sheet primitive following the CheckoutConfirm pattern exactly (Gesture Handler `Pan` + Reanimated, T2 glass `bg-glass-strong` intensity 55, radius-sheet, SPRING rise, 200 ms plain-dim backdrop, drag-down >120 px dismiss). **New file — do NOT refactor CheckoutConfirm to use it in this slice** (G2.5 owns that file; adoption is a post-G3 cleanup).
  - `src/hooks/useRealtimeInvalidation.ts` — generic subscribe-only hook: `{ typePrefixes?: string[], auditActionTypes?: string[], queryKeys: QueryKey[] }`. Doctrine identical to `useEquipmentRealtimeSync`: never opens/closes the stream, invalidates on matching `event` (domain-type prefix match OR `type === "audit_log"` with watched `actionType`) and on `reset`; **ignores `keepalive` and `state`**. This is how tasks/alerts/rooms/etc. get freshness — the server emits no dedicated domain events for them; every `logAudit()` inserts an `audit_log` outbox row (Scout 3).
  - `src/lib/datetime.ts` — `Intl.DateTimeFormat` helpers (he-IL/en-GB, prefix-match on `i18n.language`), relative-time formatting.
- **API endpoints:** none (pattern + plumbing only).
- **Aurora notes:** kit components define the visual grammar for all pushed screens — native-stack header (already Aurora-colored `#0D0B1C`/`#F3F1FA`) for chrome; zero blur layers in the kit itself.
- **i18n keys:** only the MISSING `common.*` keys — `common.retry`, `common.empty`, `common.errorGeneric`, `common.offline`, `common.confirm`, `common.offShift`, plus a `comingSoon` key for the placeholders (both locales). `common.loading`/`cancel`/`close` already exist — do not duplicate.
- **Tests:** `useRealtimeInvalidation` hook test with fake port (mirror `useEquipmentRealtimeSync.test.tsx` — lock keepalive-never-invalidates + hook-never-opens/closes + audit actionType filtering); datetime unit tests; kit derivation tests where logic exists. **Verify the `audit_log` envelope payload field path (`actionType`) against a live SSE event on the RealtimeDebug screen before finalizing the hook.**
- **Size:** M (~400–700 lines incl. tests).

---

### Slice 2 — Equipment Detail + custody actions + waitlist (largest A-grade gap)

- **Scope:** `src/screens/EquipmentDetailScreen.tsx` + `src/components/equipment/detail/*`. Sections: identity/status header (reuse `equipment-row-status.ts` derivations) · custody card (holder, since, expected return; FSI/PDI on emails) · location · deployability/readiness · waitlist (position, join/leave) · history (paginated logs) · transfers. Custody actions: **Checkout/Return buttons navigate to `ScanConfirm` with prefill** — reuses the proven `useScanToggle` optimistic path and its instrumentation untouched. Dedicated return-with-charging prompt (`isPluggedIn` + optional deadline) via the direct return endpoint. Report-issue via `POST /:id/scan` with status enum.
- **API (extend `api.equipment` in `src/lib/api.ts`):**
  - `GET /api/equipment/:id`
  - `GET /api/equipment/:id/logs?page=&limit=` (limit ≤200, default 50; `{items,total,page,pageSize,hasMore}`)
  - `GET /api/equipment/:id/transfers`
  - `GET /api/equipment/:id/waitlist` · `POST /api/equipment/:id/waitlist` · `DELETE /api/equipment/:id/waitlist`
  - `GET /api/equipment/:equipmentId/deployability`
  - `POST /api/equipment/:id/checkout` `{location?, emergencyReason?}` (checkoutLimiter)
  - `POST /api/equipment/:id/return` `{isPluggedIn?, plugInDeadlineMinutes?}` (checkoutLimiter)
  - `POST /api/equipment/:id/scan` `{status, note?, photoUrl?}` (scanLimiter) — report-issue path
  - `GET /api/equipment/:id/truth` (Asset Copilot evidence graph) — seam §6.8 **pre-resolved positive**: `EquipmentTruthResponse` is exported from vendored `@vettrack/shared` at the pinned SHA (`.vendor/vettrack/shared/equipment-truth.ts:19`, re-exported via `shared/index.ts:15`). Build the truth section.
  - All custody mutations carry `equipmentReplayIdempotency` server-side; send `x-request-id: Crypto.randomUUID()` per the established scan idiom.
- **Realtime:** mount `useEquipmentRealtimeSync` (its `equipmentKeys.all` invalidation already covers `detail(id)`); no new subscription machinery.
- **Aurora:** zero blur layers; sections = opaque `SectionCard`s; status colors via semantic tokens (`stale`, `warning`, `danger` never animated); path id `encodeURIComponent`-ed (CWE-29, matches `revert` idiom).
- **i18n keys:** `equipmentDetail.*` (title, custody.holder/since/expectedReturn, location.*, readiness.*, waitlist.join/leave/position, history.title/empty, transfers.title/empty, actions.checkout/return/reportIssue, return.pluggedInPrompt).
- **Tests:** API shape tests per endpoint (mock `authFetch`, assert pagination shape + 304-never-touches-json where relevant); pure derivation module `equipment-detail-derive.ts` extracted and unit-tested (avoid dragging Reanimated into jest, per `EquipmentRow.status` precedent); waitlist join/leave mutation test.
- **Size:** L (~800–1,200 lines).

---

### Slice 3 — Tasks (second A-grade gap)

- **Scope:** `src/screens/TasksScreen.tsx` (day view + my-tasks segment + day nav; rewrites the Slice-1 placeholder — route already registered) + create/edit via the Slice-1 `BottomSheet`. Off-shift 403 state = dedicated empty-state UX, not an error toast.
- **API (`src/lib/api/tasks.ts` + `taskKeys` factory):**
  - `GET /api/appointments?day=YYYY-MM-DD` (or `start`+`end`, optional `vetId`)
  - `GET /api/appointments/meta?day=` (vets/technicians/shifts for the assignee picker)
  - `POST /api/appointments` (201 `{appointment}`; technician+ & rbac `task.create`, `task.assign` if vetId; idempotency scope `appointments:create` — **verify key source, seam §6.7**)
  - `PATCH /api/appointments/:id` (≥1 field) · `DELETE /api/appointments/:id` `{reason?}`
  - `GET /api/tasks/dashboard` · `GET /api/tasks/me` · `GET /api/tasks/active` · `GET /api/tasks/recommendations` (optional)
  - `POST /api/tasks/:id/start` · `POST /api/tasks/:id/complete` (idempotency scopes `tasks:start`/`tasks:complete`)
- **Realtime:** `useRealtimeInvalidation` on task-related `audit_log` actionTypes → `taskKeys.all` (tasks emit **no** dedicated domain events — Scout 3).
- **Aurora:** list rows opaque; the create/edit sheet is the screen's single blur layer (T2); day nav uses 200 ms status-change timing; priority/status chips semantic-colored.
- **i18n keys:** `tasks.*` (title, today, mine, active, create, edit, cancel, cancelReason, start, complete, assignee, status.*, priority.*, taskType.*, offShift, empty). Copy = "Tasks"/"משימות". (The web `appointmentsPage.*` freeze binds the *server/web* surfaces — routes/table/web-keys — not this repo's key names; the server route stays `/api/appointments` and we call it as such.)
- **Tests:** API shape tests (list/create/lifecycle); day-window param building; 403 `INSUFFICIENT_ROLE` → off-shift state mapping test; audit-invalidation hook wiring test.
- **Size:** L–XL (~1,000–1,400). **Permitted split if needed:** 3a read + start/complete lifecycle, 3b create/edit/meta — 3a alone satisfies the A-grade daily bar.

---

### Slice 4 — My Equipment (+ student tab swap)

- **Scope:** `src/screens/MyEquipmentScreen.tsx` — personal custody list ("what I hold"), custody-debt labels ported as a pure lib; row press → `EquipmentDetail`. **Role-conditional 4th tab:** web parity — custody-scoped roles (student) get **Mine** in the tab bar instead of Emergency; implement in `MainTabs` keyed on `effectiveRole` (Slice 4 is `MainTabs`' only G3 writer).
- **API (extend `api.equipment`):** `GET /api/equipment/my` (array; folder/room/lastVerifiedBy joined).
- **Realtime:** covered by the global equipment invalidation (`/api/equipment/my` key nests under `equipmentKeys`).
- **Aurora:** same row grammar as Equipment list (reuse `EquipmentRow`); zero blur.
- **i18n keys:** `myEquipment.*` (title, empty, debt.*, returnHint).
- **Tests:** debt-label pure derivation tests; API shape test; tab-swap logic test (role → tab set).
- **Size:** S (~250–400).

---

### Slice 5 — Home daily-pulse uplift (A-grade parity for Home)

- **Scope:** Uplift `HomeScreen` from readiness-metrics-only to daily-pulse parity: shift hero (on-shift / next shift / streak / tasks-completed / scans-today), recent-activity feed (cursor-paged), tasks chip, nudges chip, shift-adjustment controls (request extend/leave-early with time picker, view/cancel). **Slice 5 owns ALL G3 HomeScreen edits** — including the entry points other slices need: attention-card jump to `Alerts` (Slice 6's surface) and the shift-chat header launcher (Slice 8's surface). **Preserve untouched:** the `screenInteractive` latch, the single GlassTopBar blur layer (T1 — remains the screen's only blur), the `useEquipmentRealtimeSync` mount, and the client-side readiness derivations.
- **API (`src/lib/api/home.ts` + `src/lib/api/shift-adjustments.ts`):**
  - `GET /api/home/dashboard` → `{shift, nextShift, streak, tasksCompletedToday, scansToday}`
  - `GET /api/activity?cursor=<ISO>` (PAGE_SIZE 30, `{items, nextCursor}`)
  - `GET /api/activity/my-scan-count` → `{count}`
  - `GET /api/tasks/dashboard` (reuse Slice-3 module)
  - `POST /api/shift-adjustments` `{kind: "extend"|"leave_early", requestedEndTime: "HH:MM" (required), reason (3–500)}` — verified against `server/routes/shift-adjustments.ts` (`INVALID_KIND`/`INVALID_TIME` rejections; the field is `kind`, NOT `type`, and `requestedEndTime` is mandatory → the adjustment sheet needs a time picker) · `GET /api/shift-adjustments` · `POST /api/shift-adjustments/:id/cancel`
  - `GET /api/nudges` — seam §6.6 **pre-resolved positive** (`server/routes/nudges.ts` GET `/` requireAuth, mounted at `/api/nudges`). Nudges chip ships in this slice.
- **Realtime:** `useRealtimeInvalidation` (audit actionTypes for scans/shift-adjustments) → home/activity keys; keepalive ignored as ever.
- **Aurora:** hero card on `surface-raised`; streak/counters `writingDirection: "ltr"`; activity rows opaque; adjustment sheet reuses `BottomSheet`.
- **i18n keys:** `home.shift.*` (onShift, until, nextShift, streak, scansToday, tasksDone), `home.activity.*` (title, empty, loadMore), `shiftAdjustments.*` (request, extend, leaveEarly, reason, reasonHint, pending, cancel, status.*).
- **Tests:** API shape tests; cursor-pagination accumulation test; adjustment-direction validation mirror test; snapshot-free derivation tests.
- **Size:** M–L (~600–900).

---

### Slice 6 — Alerts

- **Scope:** `src/screens/AlertsScreen.tsx` + pure derivation lib `src/lib/alerts-derive.ts` **ported from web `use-alerts-controller` semantics** (alerts are client-derived from equipment statuses — issue/overdue/expiry/charge — joined with ack rows; two-level model: SEEN keeps alerting, RESOLVED stops it, rows never deleted). Acknowledge/resolve actions pre-gated to senior_technician+ (`hasRoleAtLeast`); reads universal. Jump-to-equipment → `EquipmentDetail`. Entry points are NOT this slice's: Home attention-card jump = Slice 5, Menu entry = Slice 12.
- **API (`src/lib/api/alert-acks.ts`):**
  - `GET /api/alert-acks?includeResolved=true`
  - `POST /api/alert-acks` `{equipmentId, alertType}` (senior_technician+; idempotent upsert)
  - `PATCH /api/alert-acks/:id/resolve` `{resolutionNote?}` (senior_technician+)
  - **Do NOT port `DELETE /api/alert-acks`** — the web client calls it but no server route exists (dead call, Scout 3 ⚠️).
- **Realtime:** equipment invalidation covers the derivation inputs; add `useRealtimeInvalidation` on audit actionTypes `alert_seen`/`alert_resolved` → ack key.
- **Aurora:** severity via semantic tokens (`warning`/`danger`/`stale`); **no animation on danger-colored rows**; resolve sheet = `BottomSheet`.
- **i18n keys:** `alerts.*` (title, empty, type.issue/overdue/expiry/charge, ack, acked, ackedBy, resolve, resolutionNote, resolved, reopenHint, seniorOnly).
- **Tests:** derivation lib unit tests (the meat — port the web fixture cases); ack/resolve API shape tests; role pre-gate test.
- **Size:** M (~500–800).

---

### Slice 7 — Rooms + Room detail + Sweep

- **Scope:** `RoomsScreen` (rooms + equipment counts + lastSwept meta) and `RoomDetailScreen` (room contents, last-5 activity, sweep flow: worklist → confirm-present checklist → commit; bulk-verify; not-found-here per item). Routes `Rooms`, `RoomDetail { roomId }`.
- **API (`src/lib/api/rooms.ts` + `src/lib/api/docking.ts`):**
  - `GET /api/rooms` (student+; counts + `lastSweptAt`/`lastSweptByName`)
  - `GET /api/rooms/:id` · `GET /api/rooms/:id/activity` (last 5 scan-log entries)
  - `GET /api/docking/rooms/:roomId/sweep` (sweep worklist)
  - `POST /api/docking/rooms/:roomId/sweep` `{confirmedEquipmentIds}` (writeLimiter)
  - `POST /api/equipment/bulk-verify-room` (technician+)
  - `POST /api/docking/equipment/:id/not-found-here`
  - (`POST /api/docking/equipment/:id/citizen-anchor` exists for the scan flow; wire only if the sweep UX needs it.)
- **Realtime:** `useRealtimeInvalidation` (`EQUIPMENT_*` prefixes + room/docking audit actionTypes) → rooms keys.
- **Aurora:** room cards opaque `SectionCard`; sweep checklist rows = press-scale sanctioned, content/layout never animated; commit CTA prominent, 380 ms sheet if modalized.
- **i18n keys:** `rooms.*` (title, empty, count, lastSwept, neverSwept), `roomDetail.*` (activity, sweep.start/confirmAll/commit/committed, notFoundHere, bulkVerify).
- **Tests:** sweep worklist→commit payload test; API shape tests; lastSwept relative-time derivation test.
- **Size:** L (~800–1,100).

---

### Slice 8 — Shift chat

- **Scope:** `ShiftChatScreen` — messages within the caller's roster-derived chat window, send, ack, reactions, typing; pin pre-gated senior+. Entry points are NOT this slice's: Home header launcher = Slice 5, Menu entry = Slice 12. Archive route = deferred (C).
- **API (`src/lib/api/shift-chat.ts`; all technician+ floor — handle 403 for off-window users):**
  - `GET /api/shift-chat/messages?after=<cursor>` — incremental fetch. **The sanctioned polling exception:** interval fetch ONLY while the chat screen is focused AND app is foregrounded (AppState + navigation-focus gated; stop on blur/background). This mirrors web transport (gt-poll + collab nudge — shift chat is explicitly NOT on SSE).
  - `POST /api/shift-chat/messages` · `POST /api/shift-chat/messages/:id/ack` · `POST /api/shift-chat/reactions` · `POST /api/shift-chat/typing`
  - `POST /api/shift-chat/messages/:id/pin` (senior_technician+, pre-gated)
  - Socket.io `/collab-ws` "new message" nudge: **deferred seam §6.9** — no socket.io-client in the RN repo; G3 ships focused-poll-only.
- **Aurora:** message list opaque; composer bar `surface-raised`; own-vs-other bubble contrast via tokens; FSI/PDI isolates on Latin names; timestamps `datetime.ts`.
- **i18n keys:** `shiftChat.*` (title, placeholder, send, ack, acked, pin, pinned, typing, offWindow, empty, seniorOnly).
- **Tests:** after-cursor accumulation + dedupe test; focus/AppState poll-gating test (poll must provably stop on blur); send/ack API shape tests; 403 off-window mapping.
- **Size:** L (~800–1,100).

---

### Slice 9 — Shift handover (end shift)

- **Scope:** `HandoffScreen` — render the latest generated handover artifact, acknowledge / unconfirm. Menu "End shift" entry = Slice 12. Generation is server-scheduler-only (frozen R-SH-F1 design) — **no generate button, no generate call**.
- **API (`src/lib/api/shift-handover.ts`; plain requireAuth):**
  - `GET /api/shift-handover/current` → `{handover}`
  - `POST /api/shift-handover/:id/acknowledge` · `DELETE /api/shift-handover/:id/acknowledge`
- **Aurora:** document-style read surface; single confirm CTA; zero blur.
- **i18n keys:** `handoff.*` (title, empty/noneYet, acknowledge, acknowledged, unconfirm, generatedAt).
- **Tests:** API shape tests; acknowledged-state toggle test.
- **Size:** S (~200–350).

---

### Slice 10 — Inventory: containers, dispense, restock basics

- **Scope:** `InventoryScreen` (container list w/ blueprint targets + aggregate qty) + `DispenseSheet` (BottomSheet; item picker, quantities, emergency toggle with required bypass reason) + restock (`addedQuantity`) + blind audit. Container NFC/QR entry: extend `ScanScreen` — when `extractEquipmentId` fails, try `GET /api/containers?nfcTagId=` before falling back to `EquipmentList` query seed (verify tag format at build).
- **API (`src/lib/api/containers.ts`):**
  - `GET /api/containers` (student+; `?nfcTagId=` returns single container **with items** or 404)
  - `POST /api/containers/:id/dispense` — **`Idempotency-Key` header** (`Crypto.randomUUID()`), body `{items:[{itemId, quantity}], isEmergency, bypassReason?}`. **`bypassReason` is a closed server enum, NOT free text:** `"EMERGENCY_CPR" | "PROTOCOL_OVERRIDE" | "TECH_ERROR"` (`server/routes/containers.ts` Zod enum, required when `isEmergency=true`) → UI = segmented choice with an i18n key per enum value. Handle 422 `ORPHAN_DISPENSE_BLOCKED` (clinical-invariant enforce mode) with a loud, translated error
  - `PATCH /api/containers/emergency/:eventId/complete` (close emergency dispense)
  - `POST /api/containers/:id/restock` `{addedQuantity}` (technician+)
  - `POST /api/containers/:id/blind-audit` `{physicalCount, note?}` (technician+)
  - `POST /api/containers/bootstrap-defaults` (technician+) — wire only if the empty-clinic state needs it
  - Full restock-session program (`/api/restock/*` start/scan/finish): seam §6.11 **partially pre-resolved** — the POST session routes are `requireEffectiveRole("student")` (mobile-eligible; only `GET /sessions` is admin-only), so expect the verification to come back mobile-usable and budget the slice accordingly. Container-level restock still ships first.
- **Realtime:** `useRealtimeInvalidation` on container/dispense audit actionTypes → containers key (no dedicated inventory domain events).
- **Aurora:** DispenseSheet = the screen's one blur layer (T2); **emergency dispense toggle styled danger — solid fill, zero glass, zero animation**; quantities LTR.
- **i18n keys:** `inventory.*` (title, containers, target, qty, restock, addedQuantity, blindAudit, physicalCount), `dispense.*` (title, items, quantity, confirm, emergency, bypassReason.*, emergencyOpen, completeEmergency, blocked orphan message).
- **Tests:** dispense payload + Idempotency-Key header test; 422 mapping test; emergency-requires-reason validation test; nfcTagId 404 fallback test.
- **Size:** L (~900–1,200).

---

### Slice 11 — Autopilot approval queue

- **Scope:** `AutopilotQueueScreen` — proposal cards, approve / edit / reject (mobile-first human-approval surface; explicitly not web-only on the Capacitor app). Menu entry = Slice 12.
- **API (`src/lib/api/action-proposals.ts`):** seam §6.5 **pre-resolved positive** — `server/routes/action-proposals.ts`: `GET /` + `POST /:id/approve` · `POST /:id/edit` · `POST /:id/reject`, all `requireAuth` + `actionProposalDecisionLimiter` + Zod bodies. No discovery phase needed; read the Zod schemas for exact body shapes at build time and wire directly.
- **Realtime:** `useRealtimeInvalidation` on proposal audit actionTypes.
- **Aurora:** proposal cards `surface-raised`; approve = primary, reject = danger-outline (no animation on danger); edit via BottomSheet.
- **i18n keys:** `autopilot.*` (title, empty, approve, reject, edit, proposedBy, rationale, applied).
- **Tests:** API shape tests against the verified routes; approve/reject optimistic-or-plain mutation tests.
- **Size:** M (~400–600) + verification time.

---

### Slice 12 — Menu front door + account essentials + G3 exit pass

- **Scope:**
  - `MenuScreen` restructure from debug-launcher to real front door: **Operations** (Tasks, Rooms, Mine, Alerts, Inventory, Autopilot) · **Session** (End shift → Handoff) · **Account** (display-name edit, locale toggle, sign out) · **Developer** (existing debug screens, `__DEV__`-gated or collapsed).
  - Account essentials: `PATCH /api/users/:id/display_name` `{display_name}` (1–60, self); locale toggle — **client-local only** (persist `"vettrack-locale"` via MMKV; no server write path exists — seam §6.2); Clerk sign-out.
  - Deferred to G5 (store submission): `DELETE /api/users/delete-account` (App-Store-mandated — required before submission, not before daily-driver), avatar upload.
  - **G3 exit pass:** run the full exit checklist from §1 (device RTL/he sweep, polling grep, harness E2E, frame-floor spot-check, evidence doc `docs/g3-results.md`), then hand the owner the gate-verdict protocol.
- **i18n keys:** `menu.*` (sections + entries), `account.*` (displayName, save, language, he, en, signOut).
- **Tests:** ParamFreeRoute-style compile-checked route map (existing pattern); display-name API shape test; locale persistence test.
- **Size:** M (~400–600) + exit-pass time.

---

### Slice 13 — Tablet-iOS layout (pre-G5 gate) — **after Slice 12, before any store submission**

> Added 2026-08-08 per owner: Tablet-iOS is one of the four platform targets (see §1 Platform matrix) and a hard submission prerequisite. It is a **pre-G5 gate** item — it needs the daily-driver screens to exist (Slices 2/3/5/7 landed) and must land **before** the G5 store submission — captured here so the gate ladder is complete.

- **Scope:**
  - **(a) Declare tablet support — already present, verify/keep.** `app.json` `ios.supportsTablet` is **already `true`** (`app.json:10`), so no edit is required; the slice's job is to make the declared support *honest*. **Declaring tablet support is what forces Apple to review the iPad layout** — an unadapted (letterboxed / stretched-phone) iPad build is a classic App Review rejection, which is why this slice is a submission prerequisite, not polish.
    - **Do NOT change `app.json` `orientation` from `"portrait"` to `"default"`** (verified against `@expo/config-plugins@57.0.6` source; see the research note `docs/Research/vettrackg4g5slice13verified.md` §3, kept as a working reference outside the repo). `supportsTablet: true` makes the config plugin auto-write all four orientations into **`UISupportedInterfaceOrientations~ipad`** (`RequiresFullScreen.js:57-64`, gated on `!requiresFullScreen`, which we never set), while `orientation: "portrait"` only writes the base `UISupportedInterfaceOrientations` (iPhone). So **iPad already rotates in all four orientations; iPhone stays locked to portrait** — exactly what we want. Changing to `"default"` would unlock landscape on the *iPhone*, opening a phone-landscape QA surface no RN screen was designed for, with zero benefit. (Expo forces the `~ipad` key precisely to dodge Apple's `ITMS-90474` rejection of a `supportsTablet` binary that omits any iPad orientation.)
    - **Gate item 0 (verify the plist, fail closed):** `npx expo prebuild -p ios` (cleaning is the default on `@expo/cli` 57.0.11 — there is no `--clear` flag; `ios/` is generated + gitignored so regenerating is safe), then `plutil -p ios/*/Info.plist`. **Assert exactly:** base `UISupportedInterfaceOrientations` = the two portrait values (`Portrait`, `PortraitUpsideDown`) AND `UISupportedInterfaceOrientations~ipad` = all four values. The gate **fails (exit non-zero) if either key is missing or has any other value** — do not treat a wrong/absent key as a pass. Only if this assertion fails is an `app.json` change warranted (a plugin/`infoPlist` override is dorsing the plist).
  - **(b) Responsive layout adaptations for the primary daily-driver screens**, each adapted *within its existing screen* — **no new or combined routes** (the Slice-1 route contract stays frozen; phone taps still push, e.g., `EquipmentDetail`; tablet renders that same detail in a right pane). Introduce **one** tablet gate + **one** presentational two-pane primitive, mirroring the Capacitor precedent (read-only reference in the `vettrack` repo: `src/native/tablet/` — `useIsNativeTablet`, `TwoPaneLayout`, `RoomsMasterDetail`, `SelectItemPlaceholder`):
    - `src/lib/use-is-tablet.ts` — RN analog of `useIsNativeTablet`, keyed on `useWindowDimensions()` **short-side ≥ 600 dp** (the repo has no breakpoint hook today — only `AuroraBackground` reads `useWindowDimensions`; this is the one new hook). **Deliberately deviate from the Capacitor precedent** `vettrack/src/lib/use-tablet-viewport.ts` (`width≥768 && height≥500`), which is buggy despite its own comment: it mis-buckets **iPad mini portrait (744×1133) as a phone** and flips class on rotation. Short-side ≥ 600 is rotation-stable (a device keeps its class when rotated), includes iPad mini in **both** orientations, excludes every phone (Pro Max short side ≈ 430), and matches Android's `sw600dp`. It also degrades correctly under iPad Split View / Slide Over: `UIRequiresFullScreen` is unset → iPadOS may hand us a narrow width → short-side drops below 600 → we fall back to one-pane automatically. Accepted gap: the same iPad mini portrait is two-pane in RN, one-pane in the retired Capacitor app — fine, Capacitor is the throwaway fallback. Lock the threshold in the unit test.
    - `src/components/tablet/TwoPane.tsx` — presentational master-detail (persistent master pane, swappable detail, RTL-correct via logical `start/end` props; opaque Aurora-tokened surfaces) + a `SelectPlaceholder` for the empty detail pane.
    - **Equipment list → detail** and **Rooms → room detail**: genuine master-detail — on tablet the list stays mounted in the master pane and the selected row renders in the detail pane (the `RoomsMasterDetail` pattern); on phone, unchanged push navigation.
    - **Tasks**: master-detail — the day / my-tasks list in the master pane, the selected task's detail/edit in the detail pane (the create/edit `BottomSheet` still overlays as the screen's single blur layer).
    - **Home**: **not** master-detail (a daily-pulse dashboard has no "detail") — its tablet adaptation is a **wider multi-column / bento reflow** (hero + activity feed + chips use the extra width) reusing the existing cards; the single GlassTopBar blur layer (T1) and the `screenInteractive` latch stay untouched.
  - **(c) iPad-simulator verification is the gate evidence.** Because tablet support is declared, Apple reviews the iPad layout; the gate is a clean run on a booted **iPad simulator** (`expo run:ios` onto an 11"-class iPad + a 12.9"/13" device, **portrait + landscape**), with the **locale/direction protocol** stated explicitly: capture **two separate app launches**, one per locale — Hebrew (`he`, **RTL**) and English (`en`, **LTR**) — because `src/i18n/rtl.ts` sets `I18nManager.forceRTL`, which only takes effect after a **fresh JS reload / relaunch** (a mid-session locale switch leaves stale direction and would validate the wrong layout). Screenshots of all four adapted screens × both orientations × both locales attached to `docs/g3-results.md`. tsc/lint/jest stay necessary-but-not-sufficient per the AGENTS.md bar.
  - **(d) No new server work.** Pure client layout; every screen calls the same endpoints its phone slice already wired.
- **API endpoints:** none — no new server work (item d).
- **Aurora:** two-pane surfaces opaque, Aurora tokens only; **≤1 blur layer per screen preserved** (Home keeps its T1 GlassTopBar; Tasks keeps its create/edit T2 sheet; the two-pane frame itself adds **zero** blur); danger surfaces never glassed/animated; **no content/layout animation** on pane swaps (frozen motion doctrine — pane changes are instant; press feedback via `PressableScale` only).
- **i18n keys:** `tablet.*` (`selectEquipment`, `selectRoom`, `selectTask` select-placeholder copy) in BOTH `src/i18n/locales/{he,en}.json`, `parity.test.ts` green, zero hardcoded Hebrew. Reuse existing screen titles / empty-states where they already exist.
- **Measurement harness:** this slice touches **Home and Equipment list**, so per §5 risk 4 its verification **re-runs a G2Measure export** — closed `MARK` vocabulary and existing latch call sites undisturbed, no frame-floor regression vs the G2.5 evidence on list scroll (two-pane must not regress the pooled UI p95).
- **Five-React-skills mandate (§1.8):** UI slice — loads `react-native-best-practices` + `react-native-architecture` + `react-native-design` before writing, `argent-react-native-app-workflow` for the iPad-sim run; Skills-compliance section in the PR.
- **Tests:** `use-is-tablet` breakpoint derivation unit test (short-side threshold, orientation flip); `TwoPane` selection-state logic (pure — no Reanimated in jest, per the `equipment-row-status` precedent); Home column-reflow derivation test if layout logic is extracted; i18n parity.
- **Size:** M (~500–800) + iPad-sim verification time.

---

### Parallel track (optional, per gated plan line 450) — Offline read-cache for equipment/rooms

The gated plan places the offline **read**-cache in G3 (in this repo that means an MMKV read-through seam in the equipment/rooms fetch path plus the consuming UI cache states — the plan's original Dexie wording described the Capacitor client; the engine decision below supersedes it). It is not required for the daily-driver verdict if the owner accepts online-only reads for G3, but it is sanctioned to build in parallel any time after Slice 1:

- Define `OfflineStorePort` in `src/core/ports/` (mirror existing port style, fail-loud).
- Engine decision is **closed: MMKV** (`react-native-mmkv`), via the existing `StoragePort`.
  **Corrected 2026-08-19 — this line previously read "closed: op-sqlite".** That was never true of this
  repo: `package.json` has `react-native-mmkv@^4.3.2` and **no** `op-sqlite`/`expo-sqlite` dependency at
  all, so the op-sqlite caveats it listed (rowid-vs-PK reactivity keys, transaction-only callbacks, the
  `"expo.updates.useThirdPartySQLitePod": "true"` Podfile clash workaround) do not apply and no such
  workaround is configured. Evidence: `src/lib/offline-queue/offline-queue-store.ts:1-15` records the
  empirical reversal (verified 2026-08-11, when the write-queue landed on MMKV); `docs/parity-triage.md:250-253`
  records the decision explicitly and warns that re-adopting op-sqlite now would add a native dependency,
  a config plugin and the Podfile workaround for a cache that demonstrably fits in an MMKV JSON blob.
- Scope: equipment list/detail + rooms read-through cache only. **The write queue / mutation replay is explicitly NOT G3** (see G4 memo — it must wait for the api.ts idempotency/conflict surface to settle). **Never cache any emergency endpoint** (`EMERGENCY_CACHE_BYPASS_PATHS` in vendored contracts is the source of truth).
- Size: L. One PR, separate agent, no shared files with Slices 2–12 except a read-through seam in the equipment fetch path (coordinate with whoever owns `api.ts` that week).

---

## 3. Slice dependency graph

```text
Slice 1 (foundations + ALL route registrations, on current main)
  ├─ Slice 2 (equipment detail) ── Slice 4 (my equipment; serial after 2 — both extend api.ts)
  ├─ Slice 3 (tasks) ───────────── Slice 5 (home uplift; uses tasks module, owns HomeScreen)
  ├─ Slice 6 (alerts; jumps to detail)
  ├─ Slice 7 (rooms/sweep)
  ├─ Slice 8 (shift chat)
  ├─ Slice 9 (handover)
  ├─ Slice 10 (inventory/dispense)
  └─ Slice 11 (autopilot)
          └─ Slice 12 (menu front door + exit pass; needs all surviving slices landed)
                  └─ Slice 13 (Tablet-iOS layout; pre-G5 gate — after 12, all daily-driver screens landed)
Parallel: offline read-cache track (after Slice 1)
```

After Slice 1 lands, Slices 2, 3, 6, 7, 8, 9, 10, 11 are mutually independent **by construction**: routes pre-registered (no navigation-file writers), each rewrites only its own placeholder screen + new `src/lib/api/<domain>.ts` module, and all Home/Menu entry wiring is owned by Slices 5/12. The only serializations: 2→4 (shared `api.ts`) and 3→5 (tasks module reuse). Parallelism up to the owner's appetite, honoring one-writer-per-file.

---

## 4. G4 Readiness Memo

### Binding doctrine (verbatim — these are frozen surfaces)

> **"No offline emergency queueing. Code Blue mutations must fail loud when offline. Do not extend the sync engine to cover them."**
>
> **"No polling-based recovery for Code Blue."** Reconnect goes through replay + reconciliation; the snapshot endpoint is reached only via the bounded degraded-mode path.
>
> **"No optimistic local termination of emergency state. UI follows server confirmation."** Session end is server-confirmed.
>
> KEEPALIVE events carry `{activeCodeBlueSessionId, stormHint}` and **never invalidate query caches**.
>
> ADR-009 (proposed): **push = alert only, never a state channel**; on wake, reconcile via existing SSE replay.

### Startable NOW, in parallel with G3 (ordered by leverage, from Scout 4)

1. **Critical Alerts entitlement request (owner paperwork, zero code) — overdue, not merely startable.** Scheduled at G0; still unsubmitted as of 2026-07-31; `ios/App/App/App.entitlements` has **no critical-alerts entitlement key** (it does carry NFC reader-session formats, Sign in with Apple, aps-environment, and associated-domains — do not "fix" the file, only the missing key matters). Apple approval is unbounded and possibly denied — the single longest lead-time item in all of G4. Same class: Firebase project creation + FCM service-account + APNs `.p8` into the secret manager (env-bootstrap precedence, AES-256-GCM posture).
2. **Port the offline emergency-block classifier into the RN fetch layer.** Everything needed is vendored (`classifyEmergencyEndpointFromManifest`, `EMERGENCY_OFFLINE_BLOCK_MUTATIONS`); FIFO ≤200 buffer maps to the `StoragePort` "session" kind. Enforces doctrine, pure client, small and testable. Precondition for any future emergency screen.
3. **Code Blue read-only viewer.** Doctrine-compatible today: reads are not offline-blocked; KEEPALIVE already delivers `activeCodeBlueSessionId` through the typed port. Constraints: no polling — freshness comes from SSE events plus *bounded* reconciliation only on reconnect/`reset` or on an observed `activeCodeBlueSessionId` **transition** in the keepalive payload; KEEPALIVE itself never invalidates caches and must not drive unconditional refetching. Never persist emergency responses in any cache/persister, and visually honest — "viewer, not controller" (extends the current placeholder's no-pretense doctrine).
4. **Offline read-cache for equipment/rooms** — G3 work by the plan's own text; see the parallel track above.
5. **Client push scaffolding behind an `AlertingPort`** (token acquisition, permission state machine incl. `criticalAlert` runtime grant, foreground handling) with **one hard exclusion: do NOT create the production Android notification channel** — channels are immutable after creation and the Android urgency spec is undecided; dev-build channels under a throwaway ID only.
6. **Contracts promotion PRs (vettrack repo, separate PRs per frozen-surface rule):** promote `RealtimeEnvelope` into `@vettrack/contracts` (flagged in `realtime.port.ts` itself); optionally a shared push-payload type for the ADR-009 alert envelope. RN consumes via `VETTRACK_SHA` bump in `vendor-vettrack.mjs`.
7. **Reset→snapshot resync consumer (generic layer, equipment-first).** `SseAdapter` documents full-snapshot resync + cursor rebaseline as a deferred consumer responsibility; building it retires a known gap and is exactly the machinery Code Blue reconciliation reuses.

### MUST WAIT (and why)

1. **Code Blue mutation screens (start/log/end/presence)** — wait for the classifier wiring + loud-offline UX, the snapshot-reconciliation consumer, and G3's parity base. This is literally the G4 gate content; its no-go trigger is "Code Blue can't meet its frozen guarantees on RN."
2. **Server push build** (vt_push_subscriptions migration to platform-tagged tokens, branched validator — `server/routes/push.ts` currently Zod-rejects non-URL tokens — APNs + FCM send paths, fan-out across ~15 `sendPush*` callers). ADR-009 scopes the build to G4 and moves proposed→accepted in the implementing PR; it is a DB migration + cross-cutting server change and the Android send path depends on the unresolved urgency decision.
3. **Production Android notification channel creation** — one-way door (immutable after creation on every installed device) until the Android alerting design decision lands.
4. **Offline write queue / mutation replay** — the contract exists (`packages/contracts/src/pending-sync.ts`, full state machine, MAX_RETRIES=5, idempotency keys), but replay correctness depends on the RN api layer reaching web-client parity on idempotency keys + structured errors + conflicts — that parity is G3's deliverable. Read-cache first; write queue after G3's api surface settles.
5. **AASA/assetlinks/`ALLOWED_ORIGIN` identity edits + Web Push retirement on native** — these break the live Capacitor app if done early; they belong to the G4 cutover proper (assetlinks once the RN Android signing keystore is fixed).
6. **RN/Expo SDK upgrades** — stack frozen (RN 0.86.2 / SDK 57) through G4; the one deliberate upgrade is scheduled before G5 submission.

### Surfaced inconsistency (owner decision input)

ADR-009 and the gated plan both note the emergency-alerting gap is an **existing production defect on the shipped Capacitor app** (Web Push can't reach the Android WebView; no APNs path on iOS) — "not a G4 migration cost." The gate ladder nevertheless schedules the fix at G4. If the owner wants the wake path sooner, the server-side dual-path work is identical either way — which strengthens doing the zero-regret pieces (entitlement request, credentials, decisions) immediately.

---

## 5. Risks + Collision Notes

1. **`feat/g2_5-aurora-list-sheet` MERGED** (PR #21 → main `bb842d7`, 2026-08-07). Its actual diff touched 9 files: `EquipmentRow.tsx` (+status test), `equipment-row-status.ts`, both locale JSONs, `home-readiness.ts`, `motion.ts`, `CheckoutConfirm.tsx`, `EquipmentListScreen.tsx` (it did NOT touch `useDualFrameSampler`, `MainTabs`, or `src/types/api.ts`). All slices base on current main; re-verify file state at dispatch.
2. **`src/lib/api.ts` is a single-writer hotspot.** Mitigation (a decision this plan makes): new domains live in new per-domain modules `src/lib/api/<domain>.ts`; only the equipment domain continues in `api.ts` (Slices 2 and 4 extend it — sequence those serially).
3. **Governance:** slice PRs ship under the owner's standing 2026-08-07 instruction to execute G3 (ultracode). Each slice is dispatched in an isolated worktree, built, verified on-device, PR'd, and merged only after CI green + genuine CodeRabbit review of the latest push + 0 unresolved threads.
4. **Measurement harness is a contract.** Closed `MARK` vocabulary; existing latch call sites untouched; `G2_EXPORT` chunked-logcat shape unchanged; `EXPO_PUBLIC_FRAME_BUDGET_MS` unset must still fail loud. Any slice that touches Home or Equipment list re-runs a G2Measure export as part of verification.
5. **Frame-floor bar inherited:** no UI slice may regress the pooled UI p95 vs the G2.5 evidence on list scroll / sheet enter.
6. **Roster-derived 403s** will hit real users daily (off-shift technicians on Tasks/Chat). Every gated surface needs the off-shift state, not an error toast — this is a correctness requirement, not polish.
7. **Server companion work lives in the vettrack repo** under its own rules (frozen surfaces, separate PRs): contracts promotion, optional typed `TASK_*` events (see seam §6.4), future Expo-push contract. Never edit frozen web/server surfaces from RN work.
8. **Emergency tab honesty:** the placeholder stays visually honest ("no pretense of emergency capability") through G3. If the parallel read-only viewer lands, it must stay "viewer, not controller."
9. **Zero-polling bar vs shift chat:** the focused-foreground `?after=` fetch is the one documented exception; the exit-pass grep enforces that it stays the only one.
10. **npm, not pnpm**, in this repo; vendored `@vettrack/contracts`/`@vettrack/shared` change only via `VETTRACK_SHA` bumps in `scripts/vendor-vettrack.mjs`.

---

## 6. Honest Data Seams (things that do NOT exist yet — do not pretend)

1. **`DELETE /api/alert-acks` does not exist server-side.** The web client calls it; it 404s. Do not port (Slice 6).
2. **No `preferredLocale` write endpoint.** `GET /api/users/me` reads it, nothing writes it. RN locale stays client-local (MMKV `"vettrack-locale"`). If the owner wants server-synced locale, that's a new vettrack endpoint (separate PR).
3. **Push subscribe is web-push/VAPID-shaped.** `POST /api/push/subscribe` Zod-validates `endpoint` as a URL — an Expo/APNs/FCM token is rejected before the DB. **Do not wire any `/api/push/*` from RN in G3**; per-device notification prefs therefore have no RN surface until the G4 server build.
4. **Tasks/alerts/rooms/containers emit no dedicated realtime domain events.** Invalidation rides `audit_log` outbox rows. If actionType granularity proves too coarse in practice (over-invalidation), the fix is typed `TASK_*`/`INVENTORY_*` events — an additive vettrack-repo PR, not an RN workaround. Verify the audit envelope's payload field path in Slice 1.
5. **Autopilot routes — RESOLVED (critic, 2026-08-07).** `server/routes/action-proposals.ts`: `GET /` + `POST /:id/approve|edit|reject`, `requireAuth` + `actionProposalDecisionLimiter` + Zod bodies. Slice 11 wires directly (read the Zod schemas for exact shapes).
6. **Nudges endpoint — RESOLVED (critic, 2026-08-07).** `GET /api/nudges` exists (`server/routes/nudges.ts`, requireAuth, mounted in `server/app/routes.ts`). Nudges chip ships in Slice 5.
7. **Idempotency key sourcing for `appointments:create` / `tasks:start` / `tasks:complete`** — `idempotencyMiddleware(scope)` key source (header vs body vs request-id) unverified. Slice 3 reads `server/middleware` before wiring; offline-replay-adjacent semantics must preserve whatever it reads.
8. **`EquipmentTruthResponse` — RESOLVED (critic, 2026-08-07).** Exported at the pinned SHA (`.vendor/vettrack/shared/equipment-truth.ts:19` → `shared/index.ts:15`). Slice 2 builds the truth section.
9. **No socket.io-client in the RN repo** — the shift-chat `/collab-ws` new-message nudge cannot be wired in G3 without adding the dependency. G3 ships focused-poll-only; the nudge is a follow-up decision (dep add + ephemeral-only doctrine).
10. **`RealtimeEnvelope` is defined locally** in `realtime.port.ts` — contracts has no realtime envelope type. Promotion = separate vettrack contracts PR (G4 memo item 6).
11. **Restock scope conflict — MOSTLY RESOLVED (critic, 2026-08-07).** Scout 3's "console/program routes" classification was partially wrong: `server/routes/restock.ts` POST session routes are `requireEffectiveRole("student")` (mobile-eligible); only `GET /sessions` is `requireAdmin`. Slice 10 ships container-level restock first and should expect the session-program verification to come back mobile-usable.
12. **Container NFC tag format** for the scan→dispense entry (`?nfcTagId=`) — verify what the physical tags encode before extending `extractEquipmentId`'s fallback chain (Slice 10).

---

## 7. pre-G5 store-compliance gates (NOT in the original plan — deadline-bearing)

Reconciled from the research note `docs/Research/vettrackg4g5slice13verified.md` §9 (external store requirements verified against Apple/Google policy, not the repo; the note is kept as a working reference outside the repo, so THIS section is the authoritative in-repo version). These are **submission prerequisites with hard calendar deadlines** that the original ladder never captured. Several are already past or imminent as of 2026-08-09 — treat as an owner action list, one repo issue each. Each deadline below should be re-checked against the official source (linked per row) before acting, since store policies shift.

| # | Gate | Platform | Deadline | Status note |
|---|---|---|---|---|
| P1 | `PrivacyInfo.xcprivacy` privacy manifest present **and accurate** — the declared required-reason API codes must actually cover the resolved RN/Expo dependency set (e.g. `NSPrivacyAccessedAPICategoryUserDefaults`, `FileTimestamp`, `SystemBootTime`, `DiskSpace`); presence alone is not compliance | Apple | in force (ITMS-91053 since 2024-05; 91061 since 2025-02) | **verify contents + API coverage in the built app, not just file existence** |
| P2 | Age-rating questionnaire answered ("Medical/wellness") | Apple | **2026-01-31 (PAST)** | submissions blocked until answered — check ASC |
| P3 | Build with Xcode 26 / iOS 26 SDK | Apple | **2026-04-28 (PAST)** | collides with "stack frozen" — this IS the one deliberate SDK upgrade, must land pre-submit |
| P4 | Target API 36 (Android 16) | Google | **2026-08-31 (~3 wks)** | extension possible to 2026-11-01 |
| P5 | Closed test — **12 testers × 14 consecutive days** | Google | rolling | **only if the Play account is personal, created after 2023-11-13** — if so the clock must start NOW, not at G5. Org/older accounts exempt. **OWNER: confirm account type.** |
| P6 | Data Safety form + privacy-policy URL + account-deletion URL | Google | at submit | account-deletion web page already exists (vettrack PR #153) |
| P7 | Developer verification | Google | enforced 2026-09-30 | |
| P8 | Screenshots: 6.9" iPhone (1320×2868) + **13" iPad (2064×2752)** | Apple | at submit | 13" iPad required because `supportsTablet: true` |
| P9 | `DELETE /api/users/delete-account` wired in the RN app | both | at submit | Apple 5.1.1(v) wants in-app *initiation*; Google allows in-app path to link to the web resource. Deferred-to-G5 per Slice 12 seam |

**Already done (do not re-flag):** the Critical Alerts entitlement request was **submitted 2026-08-07** (Apple Request ID `763HU9ZH38`) — the G4 memo / verified-doc "overdue, not yet submitted" note predates the submission (the repo `App.entitlements` file doesn't reflect an external request).

**Critical path (hard deadlines, none in the original ladder):** P2, P3, P4, P5. P5 in particular can only be shortened by starting immediately — hence the account-type question is the single most time-sensitive owner decision.

---

*End of G3-PLAN.md (v1.2). Slices 1–12 landed; Slice 13 (Tablet-iOS) is the last **product-development** gate — but it is **not** the last thing before G5: the §7 store-compliance gates (P1–P9, critical path P2/P3/P4/P5) still remain and must clear before either store submission. v1.2 folds in the code-verified Slice-13 orientation mechanism (§2 Slice 13a), the rotation-stable short-side≥600 breakpoint deviation, and the §7 pre-G5 deadline gates.*
