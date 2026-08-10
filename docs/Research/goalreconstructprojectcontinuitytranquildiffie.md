# VetTrack — Pilot → Public Distribution Plan (Apple resubmission + Google Play first submission, both mandatory)

> Routing: Lead **Release Captain** · consulting App Store Master, Mobile Master, Railway Master, QA/E2E Master, Product Strategist · vetoes: **Security Master** consulted (Railway secrets read MASKED — names/lengths only, zero values in transcript), **Clinical Safety Officer** PASS (audit read-only; no emergency-path change proposed; frozen surfaces untouched throughout).
> Tier: **phase** (cross-cutting, store-facing) → full pipeline per phase-delivery gate.
> Caveman mode active for execution; this doc uses auto-clarity (multi-step sequences).
> Prior plan (pre-pilot QA harness) absorbed: committed as `docs/audit/pre-pilot-qa-harness.md` v2 on branch `claude/refine-local-plan-zqgp3v` — becomes Phase 1's audit tool.
>
> **v2 update (2026-07-28 evening, owner decision gate):** Phases 0+1 EXECUTED to completion (7 PRs
> merged; C-6 closed with prod evidence; Lighthouse a11y 100/100 — see the 2026-07-28 PROOF entries).
> **v3 (2026-07-28 late, owner): PHASE ORDER SWAPPED — Android is now Phase 2 (the lead lane) and
> Apple is Phase 3.** Checklist section numbers below follow the swap (§2 = Play, §3 = Apple).
> In-repo docs still say "distribution-program Phase 3" for the Android ship — de-numbering those
> references is task T0 of the Android-phase plan.
> **Phases 2+3 still run in PARALLEL** — the Play 12×14d tester clock is the calendar-critical path:
> tester recruitment + keystore + H3/H4 start alongside the Apple steps, closed testing runs while
> Apple reviews. The Android phase absorbs from roadmap Task 1.3 (transferred here, PR #150): adaptive icon +
> splash, Android deep-link / Clerk OAuth-redirect verification, full system-back audit (sheets,
> scanner, Code Blue). FCM push deliberately NOT absorbed (not a store requirement — future 2.0).
> **2.0 unfreeze re-decided:** no longer waits for the pilot verdict — 2.0 (next: 1.2 Case Spine)
> resumes once BOTH submissions are in review; guardrail: zero native-shell build-path changes while
> a store review is open. Dependency discipline: hold Capacitor bumps (dependabot #124/#125) until
> both submissions are in.

## Context

VetTrack is LIVE on the App Store (1.2.0, build 25 shipped; build 26 staged in pbxproj vs `ios/.last-shipped-build`=25). Never submitted to Google Play. Pilot: doctor-only, 2 ultrasound units, QR/NFC, no real users yet. Goal: production-ready public distribution — **Apple resubmission + first-time Play submission, neither optional**. Everything below grounded in output run 2026-07-28 on this machine + prod, not static reading.

## Evidence ledger (run this session, 2026-07-28)

| Check | Result |
|---|---|
| `pnpm typecheck` (both tsconfigs) | **0 errors** |
| `pnpm test` | **687 files / 6100 passed / 11 skipped / 0 failed** (40s; DB up; measured on checkout `f003d811d` = main minus docs/CodeRabbit/haptics deltas — re-run on clean main in Phase 0) |
| `pnpm i18n:check` | deep key parity ✓ |
| `pnpm knip` | exit 1 — pre-existing baseline noise ("131 unused files" config hint + unused-export list); no baseline established (M4) |
| Prod health `vettrack.uk/api/health` | `{db:ok, clerk:ok, vapid:ok, worker:ok}` |
| Railway vars (CLI, masked) | **NO VAPID/PUSH vars on VetTrack OR Worker** — keys live in `vt_server_config` (DB), per `server/lib/push.ts` env→DB→generate fallback; health `vapid:ok` validates the DB pair |
| Android project | exists; `applicationId uk.vettrack.app`; **targetSdk/compileSdk 36, minSdk 24**; NFC+CAMERA+READ_MEDIA_IMAGES permissions declared; `@capgo/capacitor-nfc@8`; **versionCode 1 / versionName "1.0" (unaligned — H4, fix in flight)**; no release signing config (expected — keystore is an Android-phase step) |
| iOS | MARKETING_VERSION 1.2.0, CURRENT_PROJECT_VERSION 26 (> shipped 25 ✓); Xcode 26.5 on machine (meets Apple's post-2026-04-28 Xcode 26 / iOS 26 SDK mandate) |
| 4-flow audit (2026-07-18) CRITICAL | **FIXED + verified in-file**: CROSS-FLOW-1 pending-account deletion → `requireAuthAny` + AuthGuard delete affordance (PR #116, `a428cba42`); IPHONE-1 safe-area (`handover-artifact-panel.tsx:59`), IPHONE-2 Print-QR native-hide (`EquipmentDetailToolsSheet.tsx:41`), IPHONE-4 locale apply (`use-auth.tsx:192`) all verified fixed |
| Allowlist commit `b2b4eeb7c` | exists **locally only** (not on origin) — stranded (M6) |
| Harness branch `claude/refine-local-plan-zqgp3v` | committed (`1d434f0`) — **no PR** (M7) |

## §1 Severity-ranked audit findings

**CRITICAL — none open.** (The one pre-resubmission CRITICAL, 5.1.1(v) deletion-unreachable, is fixed and file-verified.)

**HIGH**
- **H1 (CLOSED 2026-07-28 — root cause was Clerk-config junk-clinic minting; fixed + #149 guard) · C-6 Clerk↔app identity parity** — 15 Clerk users / 0 visible in app clinic. Gates pilot J-0/J-1 AND any store demo/review account sanity. Mechanism verified: web `useAutoSelectOrg` picks `memberships[0]` (native unaffected — bails `isCapacitorNative`, server falls back to `vt_users.clinic_id`); backfill reads+writes the admin's ACTIVE org (`users.ts:1142/1155/1199`) → wrong-org run = near no-op AND `clerkId`-only upsert (`:1208`) can relocate your own row. Corrected 3a→3b wording staged (chat, ready to commit on harness branch). Owner decision-tree in harness §C-6.
- **H2 (CLOSED 2026-07-28 — owner activated push on prod successfully; subscribe leg proven) · Push "error on activation" — root-cause superseded.** Brief's suspicion (missing `VAPID_PRIVATE_KEY` on Railway) is **disproven as a defect**: no env keys BY DESIGN, valid pair in DB, prod health `vapid:ok`. Real historical cause was CROSS-FLOW-4 (build-time public-key precedence mismatch) — **fixed in #116** ("server-key preference", deployed since). Must REPRODUCE on prod before calling open. Hardening either way: promote DB pair → Railway env on BOTH services (env-snapshot gotcha: force redeploy after set).
- **H3 · Play data-deletion web URL absent.** Play requires account-creating apps to provide in-app deletion (have ✓) AND a web deletion path/URL for Data Safety. Grep found no public web deletion page. Need `/account-deletion` page (or `/privacy#deletion` anchor with request flow) before Data Safety form.
- **H4 · Android version fields unaligned** — versionCode 1 / versionName "1.0" vs iOS 1.2.0(26). Align before first AAB (scheme: versionName=marketing, versionCode monotonic e.g. 10200).
- **H5 · Physical-device gate open (Task 0.7)** — haptics + Android NFC (`@capgo/capacitor-nfc`) never confirmed on real hardware; roadmap explicitly gates Android ship on it. Simulator is a non-substitute (no Taptic/NFC).

**MEDIUM**
- M1 anonymize-tombstone PII residue: `vetLicenseNumber` + `avatarUrl` survive deletion fallback (`account-deletion.service.ts:107` area) — contradicts 5.1.1(v) representation; small fix + test.
- M2 privacy copy overclaims push ("device push notification tokens") while native shell has no push at all (IPHONE-6) — fix copy for both stores' privacy answers.
- M3 clinic-less Apple-ID deletion residual (#116 documented skip) — owner decision: Clerk org auto-enrollment vs clinic-less self-delete route.
- M4 knip baseline absent (131-file noise) — establish baseline config, then enforce.
- M5 living-doc drift: CLAUDE.md references dead repo `literate-dollop` + Expo/RN companion (repo list verified: only vettrack, VetCrew, aethel-orchestrator); PLAN.md/TASKS.md 16 days stale claiming Phase-0A open (fixed 2026-07-12, proof-logged). Staged diffs from founder review ready.
- M6 allowlist commit `b2b4eeb7c` stranded on stale local branch — cherry-pick to main via PR.
- M7 pre-pilot harness v2 (+ Clerk census prompt) sitting PR-less on `claude/refine-local-plan-zqgp3v`.
- M8 `needs_client_trust` has zero in-app handling by design — owner procedural gate (runbook §C/§G) must run before every archive.

**LOW** — L1 local runs measured on stale branch (re-run on main); L2 apple-sign-in pkg sourcemap warnings (cosmetic); L3 board kiosk exit + 768px flip fixed in #116, re-verify once on device matrix.

## §2 Google Play first-time submission checklist (SWAPPED to lead — was §3)

1. **Account (OWNER INPUT #1 — schedule-critical):** RESOLVED — personal account created after 2023-11-13 → **12 opted-in testers × 14 continuous days closed testing before production access**. Recruit testers (hospital staff qualify) and START THE CLOCK at step 10.
2. Signing: generate upload keystore (password manager, NEVER commit) → enroll Play App Signing.
3. Versions: fix H4 (versionCode/versionName align to 1.2.0-line) in `android/app/build.gradle` — **in flight (worktree commit 7df1940ff + guard test)**.
4. Build: `pnpm cap:build:native:android` (script `--android`; same bundled-shell law) → release AAB; verify Clerk sign-in in the built shell on device.
5. Target API: **already compliant** — targetSdk 36 meets the 2026-08-31 rule (new apps must target API 36 from that date; today's floor 35). Also verify API-36 edge-to-edge rendering on device.
6. Device QA (physical Android — H5): NFC read/confirm dialog parity, haptics (0.7 confirm), camera QR, Hebrew RTL, predictive back, WebView quirks vs WKWebView.
7. Data Safety form: collects email/name/(vet license)/avatar photos; encrypted in transit; deletion = in-app + **H3 web URL (in flight — page code complete in worktree)**; NO push-token claim (post-M2); no location/ads/PHI.
8. Content rating questionnaire; Data deletion + privacy policy URLs (`https://vettrack.uk/privacy` live ✓).
9. Listing: he+en title/descriptions, phone + 7" + 10" screenshots, feature graphic; "Tasks" terminology. Absorbed from Task 1.3: adaptive icon + splash; deep-link / Clerk-OAuth-redirect verify; full system-back audit.
10. Closed testing track → **12×14d clock** → production access application → staged rollout 20%→100%; pre-launch report review.

## §3 Apple resubmission checklist (1.2.0, build 26→27) (SWAPPED to second — was §2)

1. Phase-1 fixes merged → `pnpm resubmit` (build bump; never hand-edit) — build must exceed shipped 25 AND any uploaded 26.
2. `export REVIEWER_PASSWORD=…` → `scripts/verify-resubmission.sh` **16/16**, incl.: demo login prints `LOGIN: complete` (a `needs_client_trust` result = Clerk Client Trust re-enabled → runbook §G dashboard revert FIRST); Apple-sign-up config `True`; icon 1024 no-alpha; **BUNDLED: True / NATIVE CLERK CHUNK: present** (no `server.url` — 4.2 + OAuth).
3. Build ONLY `pnpm cap:build:native` (bakes `VITE_CLERK_PUBLISHABLE_KEY` + `VITE_API_ORIGIN` from `.env`; never `CAPACITOR_SERVER_URL`).
4. Privacy: PrivacyInfo manifests vs Sentry SDKs; ASC privacy answers reconciled with M2 copy fix (no push-token claim); account-deletion path re-record §K video with FRESH Apple ID (now passes post-#116; M3 residual = decide before recording).
5. Metadata: What's New he+en ("Tasks" terminology, coordinate Marketing); screenshots refresh if UI drifted since build 25.
6. Xcode 26 archive (human) → upload → submit; poll ASC; rejection → `apple-appstore-reviewer` skill → targeted fix loop.
7. SDK compliance: Xcode 26 / iOS 26 SDK mandatory since 2026-04-28 — machine ✓.

## §4 Phased execution (dependency order; ▶ = the one next actionable step)

**Phase 0 — Stabilize & truth** (repo/identity/push/docs) — ✅ DONE 2026-07-28
0.1 Re-run suite on clean main checkout; PROOF-log this session's + that evidence.
0.2 Land strays: PR for `b2b4eeb7c` allowlist (M6); PR for harness branch incl. staged C-6 3b-wording fix (M7); apply M5 doc de-drift diffs (CLAUDE.md literate-dollop/Expo lines, PLAN.md/TASKS.md status banners).
0.3 C-6 owner runbook: prod web `GET /api/users/me` → `clinicId` = `org_3CPrzr…`? → branch 3a (org fix + delete "My Organization" = C-7) / 3b (backfill AFTER 3a) / 3c (filters). Exit bar: staff visible + fresh join-code signup approvable.
0.4 H2: attempt push-activation repro on prod web; if repro → Railway logs + fix; either way promote VAPID pair DB→env both services + force redeploy (hardening).
▶ DONE — C-6 closed end-to-end (Clerk reconfig + prod purge + owner retest incl. live 5.1.1(v) self-delete); H2 disproven-as-defect (push activated live).

**Phase 1 — Audit-to-green** (the full release-bar audit; no new features) — ✅ DONE 2026-07-28
1.1 Execute pre-pilot harness v2 Layers 0–4 (identity plane → suites → doctor J-rows → UI/UX → failure injection) — it doubles as the store-readiness functional audit; extend device matrix with one Android phone.
1.2 Live browser UI/UX pass (dev-browser installed ✓ + claude-in-chrome; senior-frontend + design-critique lenses; 320/768/1024/1440, he-RTL+en, both themes n/a) — browser clicks need your confirmation per allowlist.
1.3 WCAG 2.1 AA targeted audit on core path (accessibility-review skill; contrast/44pt/keyboard/RTL-a11y).
1.4 Security pass (`security-scan`): new-ish routes rate-limited (push, join-clinic, action-proposals ✓ 20/min), secrets scan, tenancy spot-greps.
1.5 Close M1 (tombstone PII) + M2 (privacy copy) small TDD fixes; owner decides M3.
1.6 Performance sanity: Lighthouse on `/` + `/equipment` (budgets: eager 353kB gz baseline from #104).
▶ DONE — L0–L4 matrix recorded (flow-walk 6/6; CI canonical); Lighthouse a11y 100/100 both; #147/#148/#149 merged.

**Phase 2 — Android first submission (SWAPPED to lead lane, owner 2026-07-28 late)** — execute §2 (Play). Depends: Phase 1 QA ✓ + H3/H4/H5 + physical Android device (OWNER INPUT #3). Account RESOLVED: personal-post-2023 → 12×14d clock confirmed. Absorbed from roadmap Task 1.3 (PR #150): adaptive icon + splash · Android deep-link / Clerk-OAuth-redirect verify · full system-back audit (sheets, scanner, Code Blue). FCM excluded (future 2.0). Runs in parallel with Phase 3 (Apple), but the tester clock leads.
▶ **NEXT: owner recruits the 12 testers NOW (clock gate); agent finishes H3+H4 PRs; then keystore + closed-testing AAB starts the clock. Detailed execution plan: the Android-phase plan (planned in plan mode, 2026-07-28 late).**

**Phase 3 — Apple resubmission (SWAPPED to second)** — execute §3 end-to-end, in parallel with Phase 2. Depends: Phase 1 fixes merged ✓. Human steps: REVIEWER_PASSWORD (received in-session 2026-07-28 — never persisted), Xcode archive, §K recording.
▶ **NEXT: run `bash scripts/verify-resubmission.sh` with REVIEWER_PASSWORD → 16/16 (run was owner-deferred once — awaiting go).**

**Phase 3.5 — NFC sticker E2E audit & field rollout (owner-added 2026-07-28)** — the app reads NFC
in-app today; this phase makes ORDERED STICKERS open the app end-to-end on both platforms and audits
the chain. Grounding: owner research report, operative digest at `~/.claude/plans/nfc-e2e-research-report.md`.
3.5.0 **Decisions gate (owner):** (a) chip tier — NTAG213/215+LOCK (recommended: tags are
identification only, custody stays human per ADR-006) vs NTAG424 DNA (only if clone-resistant
custody evidence is wanted; needs TapLinx-class tooling); (b) NDEF spec — hybrid: record 1 = https
URI `https://vettrack.uk/equipment/<id>`, record 2 = AAR `uk.vettrack.app` (AAR context-loss caveat
accepted for staff devices); (c) App-Links-ify `vettrack.uk` on Android (behavior change: verified
links open in-app, not Chrome).
3.5.1 Server plumbing: `/.well-known/assetlinks.json` (package + SHA-256 of **Google's app-signing
cert** from Play Console App integrity [post-first-AAB] + upload cert) and
`/.well-known/apple-app-site-association` (no extension, `application/json`, TeamID+bundle,
`/equipment/*` paths; Apple-CDN caching — clean serve, no redirects).
3.5.2 iOS: **Associated Domains entitlement (`applinks:vettrack.uk`) — currently ABSENT** (Info.plist
has only the `vettrack://` OAuth scheme). Requires a build+review → ⚠️ DECISION INTERACTS WITH THE
IMMINENT APPLE BUILD: fold into build 27 (recommended if stickers are near-term — additive, zero UX
change) or defer to the next release. Background-reading constraints acknowledged (first NDEF record
only, screen lit, user taps the notification — no bypass; in-app ScanScreen = the mandatory fallback,
already built).
3.5.3 Android: https `autoVerify` intent-filter for `/equipment/*` (separate from T4's `vettrack://`
OAuth filter) — can ride the pre-AAB window if 3.5.0(c) says yes.
3.5.4 Encode + LOCK runbook: batch-encode (NXP TagWriter / in-app foreground-dispatch writer later;
Web-NFC Chrome-Android stopgap), then lock bits or NTAG21x password — **never field an unlocked
sticker**; QA-sample per batch on both platforms; antenna-aware placement (top of device).
3.5.5 The audit matrix: iPhone background scan → notification → tap → correct equipment page ·
Android tap → app opens right screen (installed) / Play-jump (not installed) · in-app scan fallback ·
locked-tag write-attempt rejected · clone/replay assessment vs the ADR-006 threat model · sanitize
the URI payload before acting in-app.
Gates: sticker ORDER waits on 3.5.0; encoding waits on the Play listing being live (AAR target) +
assetlinks (post-first-AAB); iOS tap-through waits on the entitlement build.
▶ **NEXT: owner answers 3.5.0(a/b/c) + the build-27 entitlement question (⚠️ before the Apple archive).**

**Phase 4 — Launch & monitor**
4.1 Staged rollouts both stores; Sentry release tagging + alert rule for new-release regressions; Railway metrics/log watch first 72h.
4.2 Store-review response playbook (Apple reply-in-Resolution-Center; Play policy strikes).
4.3 Support surface verify (`/support`, reply address); pilot-expansion decision after pilot verdict. **2.0 unfreeze RE-DECIDED (owner 2026-07-28): resumes at both-submissions-in-review (next: 1.2 Case Spine), NOT after pilot verdict; guardrail — no native-shell build-path changes while a store review is open.**
▶ **NEXT: after both approvals — enable Sentry release for the shipped builds and open the 72h monitor window.**

## Guardrails (unchanged, binding)
No frozen-surface changes (SSE/outbox, Code Blue semantics, Dexie 3.2.7, `vt_appointments`, `off|shadow|enforce`). No design-token changes. Allowlist boundary respected — every mutating step (commit/push/PR/install/build/migrate/browser-click/Railway set-variable) individually confirmed. One concern per PR; Merge-gate green + CodeRabbit resolved; PROOF entry per phase.

## Owner inputs (status as of 2026-07-28 evening)
1. ~~Play account type + creation date~~ RESOLVED: personal-post-2023 → 12×14d clock. **NEW ACTION: recruit the 12 testers NOW.**
2. ~~`GET /api/users/me` clinicId~~ RESOLVED — C-6 closed with prod evidence.
3. ~~REVIEWER_PASSWORD availability~~ (Apple gate) — RECEIVED 2026-07-28 in-session (held for execution only, never persisted to disk).
4. ~~Physical Android device~~ — RESOLVED-BY-RESTRUCTURE 2026-07-29 (owner has no access to one):
   H5's vehicle = emulator matrix (pre-upload) + Google pre-launch report (auto, real devices) +
   closed-track tester-fleet checklist (days 1–2 of the window). iPhone-side (0.7 haptics + §K
   recording) stays with the owner's iPhone — STILL OPEN.
5. ~~M3 decision~~ RESOLVED via #149 (org-cleanup + SoleClinicAdminError→409) + Clerk reconfig (membership optional, org-creation OFF); final proof = the §K recording.

## Sources (store policy, checked 2026-07-28)
Play closed-testing 12×14d: [Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) · Target API 36 by 2026-08-31: [Play Console Help](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) · Apple Xcode 26 / iOS 26 SDK since 2026-04-28: [Apple Developer upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=02032026a)
