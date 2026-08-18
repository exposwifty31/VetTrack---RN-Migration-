# Parity triage — Capacitor → RN

**Phase 4 output.** Fifteen parity items from the W4 audit, classified PORT / DEFER, with
every defer carrying a named gate. Research only; no source changed by this document.

**Repos read:** RN at `/Users/dan/wt-audit/w4` (branch `chore/w4-parity-triage`, HEAD `cfbed40`) ·
Capacitor at `/Users/dan/vettrack` (`main`, HEAD `8d379facc`). Every line/file citation below was
re-checked against those trees on 2026-08-18; where a citation is from a prior audit and could not
be re-verified here, it is marked as such in §4.

**Counts:** 8 PORT · 7 DEFER · 3 WON'T-DO carve-outs (all sub-items inside the 35-endpoints row,
none is a top-level parity item).

---

## 1. The table

| # | Item | Bucket | Consequence | Gate (defers) | Smallest useful version (ports) |
|---|---|---|---|---|---|
| 1 | **Auth strategies** — RN wires one (`signIn.create({identifier,password})`); Capacitor code-wires four (password, phone_code, oauth_apple, oauth_google) | **PORT** | Every user whose Clerk account was created via Apple / Google / phone is locked out at the in-place `uk.vettrack.app` update. No account-creation path exists anywhere in RN. A pending-approval account gets an unbreakable "session expired" loop. | — | Wire `useSSO` (already in `@clerk/clerk-expo@2.20.0`) for Apple + Google; add phone_code via `prepareFirstFactor`/`attemptFirstFactor` on the `useSignIn` resource `SignInScreen.tsx:63` already holds; add a SignUp screen via `useSignUp`; map `ApiCodedError.reason` into `resolveBootstrapView` instead of collapsing every 403 to `reauth`. **Prereq (human):** add `vettrack://sso-callback` to Clerk's allowed-redirect list. |
| 2 | **Crash-cart checklist** — `src/pages/crash-cart.tsx` (310 ln), nav `native-nav-model.ts:56`, Operations, no `adminOnly` | **PORT** | The vet's start-of-shift focal action links to `/crash-cart`, which RN does not have. Emergency-readiness verification becomes an admin/lead act on a laptop, about a physical cart in a treatment room. RN already *renders* cart state in the Code Blue viewer and on the TV board while being unable to produce it. | — | One `CrashCartScreen` + `src/lib/api/crash-cart.ts` (`GET /items`, `POST /checks`, `GET /checks/latest`) + a `crashCart` i18n namespace (he+en) + an entry in `OPERATIONS_ENTRIES`. **Zero server work.** Rides the existing offline write queue with no new code. |
| 3 | **Offline READ persister** — RN mounts a bare 13-line `QueryClient`; nothing survives a cold start | **PORT** | Offline cold start does not produce "empty lists" — it produces a false security wall. `GET /api/users/me` network-fails, `isAuthError` is false, `resolveBootstrapView` returns `reauth`, and the user reads *"Session expired. Sign in again to continue."* beside a Try-again button that cannot succeed. Every operational route sits behind `BootstrapGate`. The shipped G4-6 write queue is stranded — it can replay writes but can never capture one. | — | **Two slices, do the first alone.** (a) ~1 file: make `resolveBootstrapView` distinguish a network failure with an active session from an auth failure, so the app stops lying. (b) L-sized remainder — a try/catch read-through in `src/lib/api/equipment.ts` + `rooms.ts` on the already-exported `isNetworkFailure()`, writing through MMKV. **Not** a `PersistQueryClientProvider` (see §4). |
| 4 | **Clinic join-code onboarding** — `JoinClinicScreen` + redeem side of `POST /api/auth/join-clinic` | **PORT** | A signed-in RN user with no `vt_users` row is hard-locked with no exit: 403 `MISSING_CLINIC_ID` on every route → `canSignIn:false, canReauth:true` → the one button signs out → signing back in reproduces the 403. A closed loop. The same session on Capacitor gets a code field and self-serves. | — | Pass `ApiCodedError.reason` (already parsed) through to `resolveBootstrapView`; add a JoinClinicScreen (Capacitor's is 112 ln); add `/api/auth/join-clinic` to the pre-identity allowlist at `src/lib/auth-fetch.ts:330`. **Zero backend work** — the endpoint is deliberately identity-only and already accepts native tokens with an absent `azp`. |
| 5 | **Equipment EDIT** — `PATCH /api/equipment/:id` | **PORT** | A technician permanently moves an ultrasound and cannot correct `roomId` from the phone. Under the pinned precedence (`resolver/location.ts:89-93`) a stale human `roomId` **outranks RFID**, which ADR-006 makes advisory-only by design — so every surface reads the wrong room and the reads that would say otherwise are structurally forbidden from correcting it. The floor note (`usuallyFoundHere`) is likewise render-only in RN. | — | `equipmentApi.patch` + a Move-room sheet on `LocationCard` fed by the existing read-only `rooms.list()` + an inline floor-note editor modeled on `ReportIssueCard`. Gate with the already-present `hasRoleAtLeast(role,"technician")` — do **not** copy Capacitor's `isAdmin` pencil gate, which is stricter than the server. Offline-eligible with zero extra code (`WRITABLE_METHODS` already contains PATCH). |
| 6 | **35 "verified mobile-shaped" endpoints** → **22 real gaps** after removing 12 non-gaps and 1 admin-only | **PORT** | Clinical, and specific: an RN clinic cannot record or read crash-cart readiness at all (the same gap as #2, which is why that is the smallest clean screen build in the set). Secondary: without `auth/join-clinic`, self-onboarding needs a human with console access every time. | — | 13 of the 22 are a **mutation on a card that already renders** (`src/components/equipment/detail/*`). Start with the equipment operational cluster — damage, confirm-in-room, condition-states, location-inference — on `EquipmentDetailScreen`'s existing card stack. 2 are genuinely new screens (crash-cart, join-clinic) and are already rows #2 and #4. |
| 7 | **Settings depth** — Capacitor `settingsPage` (105 keys, ~27 controls) vs RN (36 keys, ~8 controls) | **PORT** | The item is **overstated**, not understated: control-by-control triage dissolves ~25 of ~27. The residue that matters is the **haptics gate** — RN fires haptics at 4+ sites with no off-switch, so a technician running a bulk sweep, or anyone holding the phone through a Code Blue, can only silence it by disabling system haptics for every app on the device. Plus one piece of false copy shipped in `settings.notificationsPlaceholder`. | — | **One line.** Capacitor's `src/lib/haptics.ts` has `if (!hapticsEnabled()) return;` and RN's does not. Add the gate + a toggle persisted via the existing `safeStorage`/MMKV pattern (`vettrack-*` key), and delete the false placeholder copy. **Split out, do not carry here:** the 6 push / role-notification controls — that block is gated `!isCapacitorNative()` on Capacitor (never phone-visible) and its real defect is in the shared push contract, not in parity. |
| 8 | **inventory-items** — `src/pages/inventory-items.tsx` (420 ln), `native-nav-model.ts:68`, management section, `adminOnly:true` | **PORT** | An RN-only clinic cannot set a reorder point, which silently disables a feature **RN already shipped**. `autopilotRestockBurnWorker` (registered unconditionally, `start-schedulers.ts:32,104`, daily 07:00) selects clinics having an active item with a non-null `reorderPoint`; the sole writer of that column product-wide is this page; neither the restock blueprint seed nor PMS sync sets it. So `AutopilotQueueScreen` renders `autopilot.empty` forever with no in-app fix. | — | An admin-gated list + edit sheet writing `parLevel`/`reorderPoint` through the existing `PATCH /api/inventory-items/:id`. **Server complete** — full CRUD already ships, reads are student-floor, only mutations are `requireAdmin`. |
| 9 | **Tablet master-detail + nav adaptation (iPad)** | **DEFER** | *Stated as inference, not observation — no iPad was run.* No clinical action is blocked: TwoPane already covers Equipment, Rooms and Tasks, which is where side-by-side pays. What degrades is ergonomics on an unshipped form factor — a phone bottom tab bar stretched across 1024pt, and 15 non-list screens at iPad width. The one non-hypothetical cost is that Apple's required 13-inch iPad screenshot would photograph a stretched phone UI. | **The RN app's first iOS App Store submission (G5).** `app.json` sets `ios.supportsTablet: true`, so the build ships iPad-installable by construction and iPad users arrive whether or not anyone plans for them. Apple requires ≥1 13-inch iPad screenshot; VetTrack already paid this toll once on the Capacitor lane (`ipad-01-equipment.png` et al.). Self-enforcing: nobody produces that screenshot without first looking at RN on an iPad. Deliberately **not** gated on "an iPad is added to the exit-verdict device list" — that is circular. | — |
| 10 | **Equipment CREATE** — `POST /api/equipment` | **DEFER** | A technician or vet finds an untracked device mid-shift — a loaner, a return from service, an untagged pump — and cannot enter it from the phone. RN's scan degrades an unrecognized payload into a list search, which returns nothing for a device that does not exist yet. The desktop console is not a fallback for either role (`ManagementWebGate`'s only affordance is Sign out). The device stays in use, uncustodied and invisible to every sweep surface. | **PRIMARY: the first RN build promoted to a production store track under `uk.vettrack.app`.** Verified basis — RN `app.json` declares that bundle for both platforms, the same as the live Capacitor app, so RN lands as an *update that overwrites it*; at that moment vet/technician/vet_tech have zero create surface anywhere. **EARLIER TRIP-WIRE:** one occurrence in a real shift during the G3/G4 on-device verdict run promotes this to PORT immediately. **NOT a gate:** "when someone asks" — the affected roles cannot see the capability is missing and will route around it via an admin, producing no signal. | — |
| 11 | **sign-up** — `src/pages/signup.tsx` (167 ln); RN has no `SignUp` route, no `useSignUp` call, no `signUp` namespace | **DEFER** | No technician is blocked during a shift — account creation happens once. The break is at onboarding: a new hire meets a sign-in wall and must be handed credentials or the `vettrack.uk/signup?clinic=CODE` link. Today that handoff is nearly free because the same phone can still carry the live Capacitor app. It becomes structural only when RN replaces it on `uk.vettrack.app`. Apple review is unaffected (pre-provisioned demo account); Play's 12-tester lane costs 12 one-time manual provisions, already the documented plan. | **When the RN build is *scoped* for submission to the `uk.vettrack.app` production App Store listing (the G5 scoping step)** — sign-up, join-clinic and pending-approval re-enter scope as **one unit**, because that update removes in-app account creation from every existing iPhone. Gated at scoping, not at submission, because three surfaces cannot be built at the instant they are needed. **Secondary:** if the Play cohort widens beyond the hand-provisioned roster, per-tester provisioning stops being one-time. |
| 12 | **/my-profile** (avatar + shift activity) | **DEFER** | **The nil result is the finding.** I could not construct a task a technician cannot complete because of this, and I looked. Shift activity: zero consequence — `vt_shift_sessions` is called "the legacy clock-in table is orphaned" by its own schema, and three independent searches for a production writer came back empty, so Capacitor users get the empty state today. Avatar: identity is already carried three other ways in RN (name on GreetingHeader, initial in GlassTopBar, display name + edit in Menu), the top bar shows only the signed-in user's *own* initial (self-identification, not peer), and role is server-enforced on every mutation rather than read off a badge. | **A user asks for a profile photo — OR shift-chat / Code-Blue presence rows need face-level disambiguation that name+role text no longer provides.** Both peer-identity surfaces already exist in RN and render identity as *text* today (`MessageBubble.tsx:115,171`; `CodeBlueViewer.tsx:127`); an avatar starts carrying information at the moment that text stops being sufficient. **Gate explicitly REJECTED on review:** "when the Capacitor avatar path is device-verified in production" — nobody schedules cosmetic device-verification on the surface RN is replacing. **Split the item:** shift activity must NEVER be ported as-built; if shift history is ever wanted it must be **rebuilt on the roster-window / `vt_shifts` model**. | — |
| 13 | **shift-chat archive** — `ShiftChatArchive.tsx` (69 ln), `GET /api/shift-chat/archive/:shiftId` | **DEFER** | A senior technician cannot read the previous shift's raw chat when the generated handover omitted something. **But they cannot on the shipping Capacitor app either** — a whole-tree grep finds no Link and no `setLocation` to `/shift-chat/:shiftId`, it is in no nav model, no deep-link map and no server-generated URL, and the only id a client can obtain (`GET /api/shifts`, requireAdmin) is a roster row the handler rejects. Shipping RN without this regresses no one; it preserves an existing inability. | **Either of two events. DEMAND (primary):** the first time a senior_technician or admin asks to read a previous shift's chat — in practice the first handover dispute where the curated artifact is challenged. **OBJECTIVE (checkable):** any work that adds a past-shift *index* endpoint server-side, since that is the only genuinely missing piece. **Explicitly NOT gated on Capacitor first building an entry point** — that platform is being retired, so waiting on it parks this permanently. | — |
| 14 | **report-a-bug** — More-sheet row → `ReportIssueDialog` → `POST /api/support` | **DEFER** | RN has **no defect-report channel of any kind** — no submit path, no `support`/`reportBug` namespace, and no Sentry/Bugsnag/crash dependency in `package.json`. A technician reproducing a wrong-custody state mid-shift has no in-app affordance; the build id and device string are never captured. The cost is not a blocked workflow — it is that the migration's bug-discovery loop runs blind on the platform being migrated *to*, going into a device pilot. | **The Capacitor phone app is retired for clinic staff** — the first release in which RN is the phone app of record and the More-sheet fallback is gone. On that day the row disappears from a staff phone with nothing behind it, so this must close **in the same release**, not after it. **Earlier trigger:** a second clinic onboards — that invalidates the "vendor email substitutes for the clinic-internal loop" reasoning outright, since the dialog is a `clinicId`-scoped ticket + push to that clinic's admins. |
| 15 | **what's-new** — `src/pages/whats-new.tsx` (180 ln), `routes.tsx:281`, AuthGuard only | **DEFER** | Bounded and one-morning: a technician opens RN the day after cutover, finds search and the alert bell moved, and has no in-app explanation. They can still complete every task. Contrast the same repo's damage-recording gap, where an action is impossible outright. **Consequence of deferring past the *second* gate is unbounded** — silent OTA versions with no channel of any kind. **Consequence of building now:** a second bilingual changelog under a CI parity gate, duplicating the store field, staffed by nobody — with the failure already on record (`whats-new.tsx:66-69`: the page read v1.1.0 while 1.1.2 was deployed). | **PRIMARY: the RN cutover release** (first EAS build under the reused bundle id replacing Capacitor in place). Deliverable there is **copy, not code** — a bundle-id-reuse update surfaces the store's own What's New field *before the user opens the app*. Write the notes; do not build the screen. **SECOND, STANDING: when RN adds `expo-updates` / EAS Update.** Today RN has no OTA channel at all, so the store field is the channel; an OTA bypasses it and the app becomes the only place a user can learn what changed. **That gate demands code.** |

### WON'T-DO carve-outs (sub-items inside row 6, not top-level parity items)

| Carve-out | Basis |
|---|---|
| `/api/folders` | Dead at **both** ends, not retired by policy. RN declares `folder?` (`src/lib/api.ts:68`) and serializes it (`:94`), but no call site passes it and no fetch exists. |
| `POST /api/equipment/:id/seen` | Strictly redundant with `/scan`, which RN already calls: `/scan` writes `lastSeen` (+`lastVerifiedAt` when ok); `recordEquipmentSeen` writes **only** `lastSeen`. Capacitor fires both back-to-back; the `/seen` half is a Phase-2 remnant whose patient-linking was removed in migrations 142-143. Both are in the offline registry, so it adds nothing for replay either. |
| `POST /containers/:id/restock` · `/blind-audit` | Disabled server-side — 409 `LEGACY_RESTOCK_DISABLED` (`server/routes/containers.ts:240-270`). RN documents this and deliberately uses `/api/restock/*`, which it already has. |

**Re-scoped, not carved out:** `/api/realtime/telemetry` is a *different cost class*, not a forgotten call — RN has no bounded-enum classifier and no counters, and `offline-queue-store.ts:112` / `OfflineQueueBridge.tsx:14,17` state outright that no telemetry backend exists in the repo. It is an unbuilt subsystem; pricing it as one endpoint is how it gets mis-sized again.

---

## 2. The ports, ranked by clinical consequence

Ranked by *what a person cannot do, and how close to the patient they are standing* — not by effort.
A thing a technician cannot do at the bedside outranks a thing an admin cannot do at a desk.
Effort is shown only to make the inversions visible.

### 1 — Auth strategies *(effort: wiring, not building)*
The broadest bedside failure there is: a user who cannot sign in has **no** Code Blue, **no** custody,
**no** scan, **no** crash cart. `authFetch` throws `AUTH_INVALID` before dispatch without a JWT.
Three distinct populations: existing Apple/Google/phone users locked out by the in-place update;
new hires with no account-creation path anywhere in the system (`server/routes/users.ts` has no
`POST /api/users`; `/admin/people` manages roles, not provisioning); and every technician in the
window between redeeming a join code and admin approval, who gets an unbreakable "session expired"
loop with no explanatory text.
*Why it outranks crash-cart:* it denies all clinical content rather than one clinical act. *Counter,
recorded honestly:* crash-cart is the only port squarely **on** the Code Blue path, and a reader who
weights "directly clinical" over "precondition to everything" would swap 1 and 2. Either ordering
puts both first.

### 2 — Crash-cart checklist *(effort: one screen, one api module, one namespace; zero server)*
The only port on the emergency path. `StartOfShiftCard.tsx:56` makes the vet's start-of-shift focal
action literally `href "/crash-cart"` and RN has no such screen; the desktop fallback does not exist
for that role, because `management.web` is granted only to admin + senior_technician +
lead_technician + secondary-admin. On the next Code Blue, RN's viewer shows the amber
"No recent crash cart check" chip — already implemented, already rendering — to a team that had no
way to clear it, and the daily 06:30 autopilot drift card nags every role with no resolvable action
(the `crash_cart_drift` proposal has **no** side effect builder; approving it writes nothing).

### 3 — Offline READ persister *(effort: (a) ~1 file, (b) L)*
A technician cold-starts in a basement imaging room — the exact condition the offline work exists
for — and is told *"Session expired. Sign in again to continue."* They can reach no data screen at
all. Worse, the plausible response to that message is to sign out and back in, which destroys the
persisted Clerk session and makes the app genuinely unrecoverable until they walk to signal.
Slice (a) alone stops the lie and is roughly one file; do it independently of the read cache.

### 4 — Clinic join-code onboarding *(effort: one screen + a reason pass-through; zero backend)*
A closed lockout loop with no exit and no explanation, for anyone whose `vt_users` row is missing,
soft-deleted, or reassigned mid-pilot. Narrower population than #1–#3, but total for whoever it
catches, and self-recovery is impossible — an admin has to find them in the database.

### 5 — Equipment EDIT (move-room + floor note) *(effort: one mutation + one sheet)*
Bedside, technician-audience, and it corrupts a **binding** surface: a stale human `roomId` outranks
RFID under ADR-006's pinned precedence, so the ultrasound reads "Room 3" on detail, radar, locate
and Asset Copilot while sitting in Prep, and the RFID reads that would correct it are structurally
forbidden from doing so. None of RN's three existing doors substitutes — bulk-verify only confirms
items *already* in a room, not-found-here only invalidates a dock anchor, and checkout wins the top
tier only *while held*, so the stale value re-surfaces on return.

### 6 — The 22 real endpoint gaps *(effort: 13 are mutation-only adds on cards that already render)*
Bedside equipment operational cluster: damage, confirm-in-room, condition-states,
location-inference. Ranked below #5 because #5 is the one that actively *poisons* a precedence
ladder rather than merely being absent. Note the composition: this is not "35 wiring jobs" — 12 were
not gaps at all, and 2 of the remainder are rows #2 and #4 above.

### 7 — Settings depth → the haptics gate *(effort: one line + a toggle)*
Bedside and physical, but recoverable: a technician running a bulk sweep or holding the phone
through a Code Blue cannot silence VetTrack's haptics without disabling system haptics for every app
on the device. Ranked here because the remedy exists (a bad one), where #1–#6 have none.

### 8 — inventory-items *(effort: list + edit sheet; zero server)*
Last by the stated rule: an **admin, at a desk**, cannot set a reorder point. The consequence is
real but indirect — it makes a *shipped* RN consumer (`AutopilotQueueScreen`, with ProposalCard,
ReasonSheet, accept/reject/edit) render empty forever. A practice manager cannot make the app tell
anyone that gauze is running low, because the threshold that defines "low" is unsettable from the
device they carry. Finished code sitting idle for want of one PATCH.

---

## 3. Already built, never called

This is the single most repeated finding in the migration (F1, C1, B2, B4, A3), and this triage
found **eleven more**. Every row below is *code that exists and works*, mis-sized in the backlog as
something to build. Read this section before funding any row in §1.

### Found in the RN repo (the target)

| # | What exists | Where | Why it was missed |
|---|---|---|---|
| 1 | **Tablet master-detail is complete and unit-tested**, not a stub — `TwoPane` (geometry + `SelectPlaceholder`, per-pane scroll, RTL-correct via logical `end` props), `two-pane-layout.ts` (`resolveMasterWidth` 260 floor / 380 cap / 0.42 ratio; `resolveSelectedItem` derives selection from live data so a stale id falls back to the placeholder), `use-is-tablet.ts` (short-side ≥ 600, matching Android `sw600dp`) | `src/components/tablet/*`, `src/lib/use-is-tablet.ts`; wired in `EquipmentListScreen`, `RoomsScreen`, `TasksScreen`; `HomeScreen` separately via `home-bento-layout` | The backlog line "3/18 screens" is arithmetically true and semantically misleading. It also **beats** the Capacitor original it replaced: `width>=768 && height>=500` mis-buckets iPad mini portrait and changes its answer on rotation. There is even a `tablet` i18n namespace. |
| 2 | **Action-proposals approve / edit / reject are fully built** | `src/lib/api/action-proposals.ts`, `components/autopilot/useProposalDecisions.ts`, `screens/AutopilotQueueScreen.tsx`, with tests | Invisible to a path-literal diff: RN composes from `const BASE = "/api/action-proposals"`, so no `/api/...approve` literal exists to grep. Three of the "35 endpoints" were never gaps. |
| 3 | **Display-name edit already ships** | `src/features/account/AccountSection.tsx:53,69,83` → `PATCH /api/users/:id/display_name`; `displayName` on `MeUser` | The one genuinely useful part of Capacitor's `ProfileHeroZone` is not a gap at all. |
| 4 | **Account deletion already ships** | `AccountSection.tsx:62,252` `DeleteAccountCard` | `docs/g3-results.md:152` still lists "Account deletion + avatar upload — G5 seam, not built". Half-stale, and it **mis-groups** the two: account deletion is the true store prerequisite (Apple 5.1.1(v)); avatar upload is required by neither store and inherited "G5" from its table-mate. |
| 5 | **The offline write queue is generic and path-agnostic** — `WRITABLE_METHODS` already contains POST/PUT/PATCH/DELETE, `methodToType` maps PATCH → `update`, and any non-emergency `/api/*` write is queued automatically | `src/lib/offline-queue/offline-queue.ts` (landed `e6ccef0`, PR #51) | `docs/G3-PLAN.md:33` still lists it out of scope. **Consequence:** `POST /api/equipment` and `PATCH /api/equipment/:id` are offline-eligible **today** with zero new code and zero per-path registration. |
| 6 | **Duplicate-safe replay already interlocks with the server** — the queue mints an idempotency key when absent and sends `Idempotency-Key` on replay; the server's create/update already carry `equipmentReplayIdempotency(...)` and the middleware reads exactly that header, passing through untouched when absent | RN `offline-queue.ts:141-160,413`; server `equipment.ts:292,297`, `middleware/equipment-replay-idempotency.ts:90` | Both halves exist; nothing calls them. Unbuilt and untested only because no RN code issues an equipment write. |
| 7 | **A network-failure classifier is already exported** — anchored to complete engine messages so a programming `TypeError` is never misread as offline | `src/lib/emergency-block.ts:117` `isNetworkFailure` | This is the exact primitive Capacitor's read-through fallback uses. The offline-read port needs no new detection logic. |
| 8 | **The MMKV KV port is shipped and proven surviving restart in production** | `src/infrastructure/storage/MmkvStorageAdapter.ts`, `defaultStorage.ts`, `src/lib/safe-storage.ts`; used by the G4-6 queue with serialize/deserialize, per-row validation, corruption-discard | Persistence infrastructure already exists. Neither the offline read cache nor the haptics toggle needs a new port. |
| 9 | **RN already fetches and holds a valid shift-chat archive id** — `HandoverArtifact.shiftSessionId` from `GET /api/shift-handover/current` (requireAuth only) returns the shift that just **ended**, and it is archive-compatible on **both** handler branches (generator and archive route import `parseWindowSessionId` from the same `server/lib/shift-window.js`) | `src/lib/api/shift-handover.ts:94`, `HandoffScreen.tsx:243-246` | Half the F1 shape: the id and a superset message renderer exist and are uncalled. What was never built *on either platform* is the **index** ("browse past shifts") — no endpoint, no surface. |
| 10 | **`useSSO` / `useOAuth` / `useSignInWithApple` / `useSignUp` are already installed** — `@clerk/clerk-expo@2.20.0` in `node_modules`, verified export barrel. `useSSO` does exactly what Capacitor's ~200-line hand-rolled `native-oauth.ts` does (create → `openAuthSessionAsync` → `rotating_token_nonce` → `reload` → `signUp.create({transfer:true})`). Its two deps (`expo-auth-session ~57.0.5`, `expo-web-browser ~57.0.2`) are already RN dependencies, and `"scheme": "vettrack"` already resolves the default redirect | RN `package.json`, `node_modules/@clerk/clerk-expo/dist/hooks/index.d.ts` | The WKWebView block that **forced** Capacitor to hand-roll OAuth does not exist in RN. Row #1 is wiring, not a subsystem. |
| 11 | **The haptics engine is fully built and simply never gated** | `src/lib/haptics.ts` (three intents, fire-and-forget), imported at 4+ call sites | Capacitor's equivalent has `if (!hapticsEnabled()) return;` at `src/lib/haptics.ts:34`. RN's does not. The whole of row #7 is that one missing line plus a toggle. |

### Found on the server (nothing to build)

| What exists | Where | Note |
|---|---|---|
| **The entire crash-cart API** — `GET /items` (auto-seeds 8 default items per clinic on first call, so no admin setup precedes first use), `POST/PATCH/DELETE /items` (requireAdmin), `POST /checks` and `GET /checks/latest` (**requireAuth, no role floor**) | `server/routes/crash-cart.ts:49,90,129,158,181,208`; tables `server/schema/er.ts:92,111` | Verified: the two check endpoints carry no `requireAdmin`. `POST /api/crash-cart/checks` is **absent** from the `@vettrack/contracts` emergency manifest, so it is a normal write that rides the RN offline queue. |
| **The entire avatar path, with infrastructure provisioned and running** — `POST /api/uploads/avatar` (multer, 5MB cap, image-type validation, PutObject, persists the object key) and `GET /api/users/me` presigning that key into `avatarUrl` on every identity fetch | `server/routes/uploads.ts:128,169`; `server/routes/users.ts:138,146-147,165` | Three Capacitor consumers already render it. The RN client simply never modelled the field. The server is not the gap. |
| **`POST /auth/join-clinic` is already RN-compatible by explicit design** — deliberately identity-only (not `requireAuth`, which would 403 `MISSING_CLINIC_ID` first), and `isAzpAllowed` accepts native Expo/RN tokens with an **absent** `azp` | `server/routes/clinic-join.ts`, `server/lib/clerk-session-auth.ts` | Zero backend work, no migration, no contract bump for rows #4 and #11. |
| **Full inventory-items CRUD**, with `PATCH /:id` already accepting exactly the two fields the smallest version needs | `server/routes/inventory-items.ts:59,88,103,178,237,260,291,330,388` | Reads are student-floor; only mutations are `requireAdmin`. |
| **The support-ticket pipeline and its triage UI** — `POST /api/support` (requireAuth, zod-validated, inserts `vt_support_tickets`, `sendPushToAll` to that clinic's admins) plus `/admin` → `SupportSection` with status/adminNote mutations and an unresolved-count badge, mounted under AuthGuard only (phone-reachable) | `server/routes/support.ts:45`; `src/pages/admin.tsx:34,198` | Row #14 is a submit surface + two key sets. Server and triage: 100% done. |
| **Equipment create and update are both `requireEffectiveRole("technician")`** — only DELETE is `requireAdmin` | `server/routes/equipment.ts:287-312` | Verified line-by-line. Capacitor's client-side `isAdmin` pencil gate at `equipment-detail.tsx:1123` is **stricter than the server** and applies to the admin metadata form, not the endpoint — three of the four callers of `api.equipment.update` are technician-facing. Do not port the client gate. |

### Two "already built" findings that landed on the **source** app

- **Capacitor's What's-New auto-surface capability was never called.** `isWhatsNewDismissed()` /
  `dismissWhatsNew()` exist and the S10-D3 comment describes "a one-time sheet keyed by app
  version… re-surfaces only after the app updates" — but a whole-repo grep finds exactly one caller:
  the page's own Got-it button (`whats-new.tsx:65`). It never auto-surfaces in Capacitor either.
- **`components/layout.tsx` is orphaned, which kills two cited entry points.**
  `import { Layout } from "@/components/layout"` has exactly **one** importer repo-wide:
  `components/skeletons/equipment-detail-skeleton.tsx`, a Suspense fallback. So the "new version
  available" `UpdateBanner` renders only inside the equipment-detail loading skeleton, and
  `layout.tsx:536`'s `/inventory-items` nav row is dead. Both were being counted as live entry
  points. *(Same dead-`Layout` finding previously reported for `/help`.)*

**Pattern to carry forward:** the two things that hid built capability were (a) **path composition**
(`const BASE = ...` defeats a literal grep — row 2) and (b) **stale planning docs asserting
"not built"** (rows 4, 5). Grep by *token* and by *symbol*, not by URL literal, and check the code
before trusting a plan line.

---

## 4. What this triage could be wrong about

A triage that sounds certain everywhere is not honest. These are the places the evidence is thin,
what would settle each, and — where it matters — which way the bucket would move.

### Thin evidence, named

1. **No iPad was ever run (row 9).** The tablet consequence is stated as *inference from reading
   code*, not observation. **Falsifier:** if any of the 15 non-master-detail screens is unusable at
   1024×768 — a form that cannot be completed, controls stranded at an edge, text running full width
   — the inference is wrong and row 9 reclassifies to **PORT immediately**. **Settles it:** one
   iPad-simulator pass via argent, which is available and takes minutes. This is the single cheapest
   uncertainty on the list and it is left open only because it sits behind a gate that forces it.

2. **Production Clerk credential distribution is unread (row 1).** The lockout argument assumes a
   non-trivial number of live users authenticate via Apple / Google / phone. That is grounded in
   *code* (all four are wired, and the 1.2.0 review notes list Apple first) and in the IL-market
   phone normalizer — but **not** in a headcount. The Clerk dashboard is the only thing that can
   settle it, and it is an owner action. **Which way it moves:** a read showing ~all users hold
   passwords would downgrade the *OAuth half* from core to deferred. It **cannot** downgrade
   sign-up, pending-approval, or join-clinic, which are unconditional.

3. **Production database contents are not visible from here (row 12).** The claim that
   `vt_shift_sessions` has no production writer is proven three ways in *code* (`insert(shiftSessions)`
   hits only test fixtures; raw `INSERT INTO vt_shift_sessions` outside `migrations/` is zero; seed
   and scripts are zero — re-verified today). It is **not** proven that the table is empty in
   production. If a clinic has historical rows from the pre-roster clock-in era, `/my-profile` shows
   real content on Capacitor and the "zero consequence" claim weakens to "no *new* data".

4. **One out-of-repo mechanism (row 15).** That an `eas submit` bundle-id-reuse update surfaces the
   store's What's New field to existing users *before they open the app* is verified from how EAS
   publishes listing metadata, **not** from a file in either checkout. If that is wrong, row 15's
   primary gate loses its "copy, not code" deliverable and the item gets larger.

5. **Play closed-track feedback (row 14).** TestFlight's screenshot+crash feedback channel is
   verified; the Play closed-track equivalent is **not**. It is carried as a supporting note only and
   carries no weight in the gate.

6. **The `email_code` fifth Capacitor auth strategy is comment-asserted, not code-verified (row 1).**
   `clerk-appearance.ts:59` says "keep only the email/password + email-code flows inside the Clerk
   component", but the appearance object only *hides social buttons* — what `<SignIn>` actually
   renders is Clerk dashboard state unreadable from either repo. Counted as 4 code-wired strategies,
   not 5.

### Judgment calls a reader can reverse

7. **Rows 1 and 2 could swap.** Auth is ranked above crash-cart because it denies *all* clinical
   content rather than one clinical act. A reader weighting "directly on the Code Blue path" over
   "precondition to everything" would put crash-cart first. Nothing downstream changes; both are top
   of the queue either way.

8. **Row 8 (inventory-items) has a live DEFER argument.** It is admin-only, once-per-item
   configuration, and admins are the least device-constrained users. If you weight that above the
   shipped-but-inert Autopilot consumer, DEFER is arguable — **but** its gate would have to be "when
   restock_burn generation is enabled for any clinic", and the worker is registered unconditionally
   on a daily 07:00 cron with **no** `off|shadow|enforce` envelope and no per-clinic flag (verified
   today at `start-schedulers.ts:32,104`). There is no future event to wait for. That is precisely
   why DEFER fails.

9. **Row 10 (equipment create) overrides no recorded decision but re-opens one.** `G3-PLAN.md:32`
   lists "New/edit equipment" by name under "C — explicitly deferred", and the G3 owner verdict was
   taken and passed with it absent. This triage keeps create deferred but **splits the lump**: the
   recorded deferral covers create *and* edit together, and the halves have different audiences —
   create is technician-floor and phone-tab-bar reachable; edit's *admin form* is `isAdmin`-gated but
   two of its four callers are ungated technician writes. Row 5 reopens the edit half only.

10. **Row 3 overrides a standing plan line.** `G3-PLAN.md:296-303` scoped the offline read cache as
    an optional parallel track, explicitly "not required for the daily-driver verdict if the owner
    accepts online-only reads for G3". A reader could keep it deferred through G4/G5 — store
    submission does not depend on offline reads. The override is narrow: the plan sized and deferred
    a **read cache** without noticing the same gap also produces a false *"session expired"* message,
    which is a correctness bug costing roughly one file. **Only slice (a) is being reclassified.**

11. **Row 3 also corrects a closed decision made on a false premise.** `G3-PLAN.md:299` declares the
    engine "closed: op-sqlite". `offline-queue-store.ts:1-15` records the later empirical finding
    (2026-08-11) that no op-sqlite/expo-sqlite dependency exists in `package.json` — the reference was
    aspirational web-side contract text — and chose MMKV. **Re-adopting op-sqlite now** would add a
    native dependency, a config plugin and the expo-updates Podfile clash workaround, for a cache the
    same team just demonstrated fits in an MMKV JSON blob.

12. **Row 3's mechanism choice is a constraint, not a preference.** Build it as Capacitor's
    mechanism — a try/catch read-through in the API layer — **not** as a
    `PersistQueryClientProvider`. An explicit per-endpoint cache can only ever contain what was
    deliberately written to it; a generic persister dehydrates everything by default and needs a
    maintained allowlist to stay legal under the frozen emergency cache denylist. That is exactly why
    `src/lib/api/code-blue.ts:22-30` had to pre-write a doctrine forbidding `codeBlueKeys.active()`
    from any future include-list. Satisfy the denylist by construction, not by vigilance.

13. **Row 7 is the one item argued *down*.** The audit framed 105-vs-36 i18n keys as a capability
    ratio; it is not. Seven of ~27 Capacitor controls already exist in RN, one (`textSize`) is
    delivered free by OS Dynamic Type (RN has **zero** `allowFontScaling`/`maxFontSizeMultiplier`
    overrides — porting it would fight the OS control Capacitor only needs because WKWebView does not
    inherit Dynamic Type), two have nothing to gate (RN has no audio dependency at all), three are
    other parity items, and **one must not be ported**: `criticalAlerts` writes `alertsEnabled`, and
    `server/lib/push.ts:465-471` documents that this sound-labelled toggle suppressed *delivery* and
    silenced Code Blue pages until `sendEmergencyPushToAll` was split out to bypass it. If this
    argued-down reading is wrong anywhere, it is in the two `timeFormat`/`dateFormat` controls, which
    are dismissed as low-value on the reasoning that both `en-GB` and `he-IL` are 24-hour — true for a
    Hebrew-default UK clinic, and wrong the moment a locale outside that pair matters.

### One thing this triage deliberately did not do

**It did not invent owner decisions.** Four items (rows 10, 11, 12, 13) were checked for an existing
WON'T-DO ruling and none was found; grepping RN `docs/*.md`, `docs/Research/*.md`, `AGENTS.md` and
`CLAUDE.md` for a sign-up / onboarding scope decision returns nothing. Calling any of them WON'T-DO
would mean manufacturing a decision rather than recording one. Equally, the
"web is a management console" precedent that legitimately retired monthly reports and Excel export
was tested against every item and **reached only four sub-items** (restock/sessions, code-blue
events, code-blue history, shift-adjustments PATCH). It needs three marks — `isAdmin &&`,
`hidden md:inline-flex`, and `WebOnlyGuard`+`ManagementGuard` — and applying it by vibe rather than
by those marks is how a phone-reachable clinical surface gets retired by accident.
