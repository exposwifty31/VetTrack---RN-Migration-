# W3B device test script — NFC write/lock, torch, app-resume, text size

> **Stages 0-2 were executed on 2026-08-21; Stage 3 was not.** Results are recorded inline
> below and the findings are collected at the end. A step with no recorded result is still
> untested — not passed — and Stage 3's lines say so explicitly.
> <!-- vt-claim: attested nfc-write-readback-verified -->
> <!-- vt-claim: attested text-size-cap-selectable -->
>
> Both devices ran an installed build one number behind `app.json` (28 / 10300 against
> 29 / 10301), because each native prebuild predates the version bump. Nothing tested here
> is version-gated, so no result is weakened by it — but it is why the on-device build
> string does not match the repo, and reading that as a wrong build would be a false alarm.
>
> **Two tags of ten consumed, both still rewritable. Zero tags locked.**
>
> It exists because the W3B work (commits `e09decd`, `5915f37`, `ab9d533`,
> `d05597b` on `feat/w3b-device-features`) is covered by unit tests that cannot
> reach the thing that matters: a simulator has no NFC radio and no torch LED,
> and an NTAG215 lock is one-way. Three native entry points —
> `writeNdefMessage`, `makeReadOnly`, `queryNDEFStatus` — had **never been
> invoked from this codebase**, and they are reached through New-Architecture
> bridgeless interop with different completion-handler shapes than the read
> path. The read path working is not evidence for them.
> 
> **Status after the 2026-08-21 run:** `writeNdefMessage` has now been invoked
> successfully on both platforms (steps 2.1 and 2.3). `makeReadOnly` and
> `queryNDEFStatus` are reached only through the lock path, which Stage 3 owns —
> so both remain **never invoked**, and that is exactly what Stage 3 still has to prove.

**Order is load-bearing.** Stage 1 writes nothing. Stage 2 writes tags that can
still be rewritten. Stage 3 destroys tags. Do not run them out of order, and do
not start Stage 3 until Stages 1 and 2 have passed on both platforms.

**Tester:** repo owner (with Claude Code driving logs/screenshots)  **Date:** 2026-08-21

| Hardware | Model | OS version | Build / commit |
|---|---|---|---|
| iPhone | iPhone 16 Plus | iOS 26.6 | 1.3.0 (28), branch `feat/w3b-device-run` @ `8861c16` |
| Android | Pixel 7 (`panther`) | Android 16 | 1.3.0 (10300), same branch |

---

## Two things you must not "fix" while testing

If either of these looks like the problem, **stop and report it**. Fixing it
locally destroys the finding and collides with another workflow that owns the
file.

1. **Do not edit `app.json`.** Another workflow owns it. This includes
   `includeNdefEntitlement` — see step 2.1, where a failure there *is* the
   result we are after.
2. **Do not bump `react-native-nfc-manager`.** It is pinned at 3.17.2 and
   `patches/react-native-nfc-manager+3.17.2.patch` fixes a double-fire in the
   iOS RCT callback. A version bump silently drops the patch and the read path
   crashes with SIGABRT under New Arch.

---

## Step 0 — Gate. Do not skip any of it.

Every item here is a precondition whose failure is *invisible later*: the app
looks fine and the feature simply is not there. Each has been mistaken for "the
feature was never built."

### 0.1 — Device eligibility (destructive)

> **This build installs as `uk.vettrack.app` — the live App Store bundle id.**
> `app.json:12` (`ios.bundleIdentifier`) and `app.json:50` (`android.package`)
> both carry it. Installing this build **replaces the production Capacitor
> VetTrack app on that device and wipes its container** — its offline cache,
> its session, its pending sync queue.
>
> **Do not use a phone that anyone depends on, and do not use a phone carrying
> real clinic data.** Use a dedicated test handset on both platforms.

Note that `docs/g2-ntag-ndef-spec.md:28` still says the RN build is
`uk.vettrack.rnmigration`. That is **stale** relative to this branch. Confirm
empirically rather than trusting either document:

```sh
# Android
adb shell pm list packages | grep vettrack
```

**Expect:** `uk.vettrack.app`, and only that.
**Fail looks like:** `uk.vettrack.rnmigration` present, or both present. Then
you are driving a different build than this script describes — stop, and record
which id you actually have. Step 2.5 (AAR dispatch) is meaningless otherwise.

Result: ☑ pass — `uk.vettrack.app` only. Owner confirmed the live Capacitor app is not in
real use; the iPhone container already showed RN writes (MMKV) with the WebKit/Dexie data
frozen days earlier, i.e. the replacement had already happened.

### 0.2 — Tag stock

- Use **NTAG215** tags from a **fresh, unused pack**. Budget at least **5**: two
  for Stage 2, and **two or three sacrificial** for Stage 3, which destroys
  them.
- **Use tags that have never been written by either app** — not because of a
  known defect, but because you cannot tell by looking whether a used tag is
  already bound to other equipment (which gives the conflict error in 2.1) or
  already locked (which cannot be written at all). Both waste a step and read
  as a failure of the thing you were actually testing.
- **Record the UID case in 2.1 — it is a real check, not a formality.** Native
  returns UPPERCASE hex on both platforms (`ios/Util.m:16` `"%02lX"`;
  `android/Util.java:19` `hexArray = "0123456789ABCDEF"`) while the Capacitor
  app binds lowercase (`vettrack:src/lib/nfc-capgo-decode.ts:24`,
  `toString(16)`). This build normalizes to lowercase (`normalizeTagUid` in
  `src/lib/nfc-provision.ts`) **specifically so the two agree**.
  `vt_equipment.nfcTagId` is `.unique()` globally
  (`vettrack:server/schema/equipment.ts:136`) and matched
  byte-exactly, so if the bound line ever renders an **uppercase** UID the
  normalization has regressed and one physical sticker can occupy two rows.
  Lowercase is the pass.
- Physically label each tag before you start: `S2-iOS`, `S2-AND`,
  `SACRIFICIAL-1`, `SACRIFICIAL-2`. Stage 3 depends on you knowing which is
  which, and a locked tag is indistinguishable by eye.

Result: ☑ ready — tags labelled, count: 10 (NTAG215 wet inlay, one sealed pack; supplier
invoice 02/000340, Maker Depot). Budget of ≥5 satisfied. Chip model confirmed three
independent ways: the supplier invoice, the Android tech list (`MifareUltralight` + NDEF
type 2), and the 7-byte UID shape with the `04` NXP prefix.

### 0.3 — Account and backend

The provisioning card is **admin-gated** and requires a live backend:

- `NfcProvisionCard.tsx` returns `null` unless
  `hasRoleAtLeast(identity.data?.role, "admin")`. Role is read from
  `vt_users.role` server-side, never from a JWT claim.
- This client has **no dev-bypass auth** — without a valid Clerk session
  `authFetch` throws `AUTH_INVALID` before dispatch and every list renders
  empty.
- The write step's second half (`api.equipment.bindNfcTag`) is a network call
  against a real equipment row.

**Expect:** signed in as an **admin**, equipment list populated, at least two
equipment rows with **no sticker bound**.
**Fail looks like:** empty lists (no session — sign in again, do not read it as
a data bug), or the card absent (see 0.5).

Result: ☑ pass — account used: the owner's admin account, signed in via Apple SSO against
production, after the owner added `vettrack://sso-callback` to the PRODUCTION Clerk
allowlist mid-session (see F-SSO in the findings). Equipment list populated (65 ready);
`W3B-TEST-1/2/3` created for this run.

### 0.4 — Build integrity

```sh
npm ci          # NOT pnpm — package-lock.json is authoritative
npx expo run:ios      # and, on the other machine/device
npx expo run:android
```

`postinstall` runs `patch-package`. Confirm it applied:

**Expect:** install output shows the `react-native-nfc-manager@3.17.2` patch
applied.
**Fail looks like:** no patch line, or a version other than 3.17.2. Then the
read path will SIGABRT on the first tag and every NFC step below is invalid.
Re-run `npx patch-package` before continuing.

Result: ☑ pass — `npm ci` printed `react-native-nfc-manager@3.17.2 ✔`. The signed binary
carries `com.apple.developer.nfc.readersession.formats = [TAG]` and an explicit
`application-identifier` (not the wildcard profile).

### 0.5 — The card is actually on screen

Open any equipment detail. **On a phone the Equipment tab does not reach detail** — a
row press pushes ScanConfirm by deliberate Slice-1 design, and only a tablet's row
press selects into the detail pane (`src/screens/EquipmentListScreen.tsx:52-56`; filed
under *Not defects* below). On a phone, use the deep link `vettrack://equipment/<id>`
(`src/navigation/linking.ts:35`), taking the id from the equipment list.

**Expect:** a card titled **"NFC sticker"** with the line **"No sticker bound to
this equipment"**, a **"Program sticker"** button and a **"Lock sticker
permanently"** button.
**Fail looks like:** no card at all. Two causes, and they are indistinguishable
without checking:
  - not admin (0.3), or
  - `useNfcSupported()` has not returned `true` — the hook renders nothing while
    the probe is `null` (undetermined) and nothing when it is `false`. Confirm
    NFC is enabled in OS settings on Android; confirm the device has NFC at all.

The card rendering nothing is a **deliberate** design (a wrong flash is worse
than a delay). Do not report its absence as "the feature is missing" without
ruling out both causes above.

Result: ☑ pass — card present with both buttons, reached by the deep link on the phone.
The run found this step's instruction wrong: it said "Equipment tab → tap a unit", which
on a phone lands on ScanConfirm and never reaches the card. The instruction above has
since been corrected to name the deep link, so a re-run does not fail at the gate on a
route that was never a defect. See F-DETAIL in the findings.

---

## Stage 1 — Diagnostic and non-destructive

**Nothing is written to any tag in this stage.** All of it is repeatable.

### 1.1 — iPhone: the radio, the session, and the parser (blank tag)

This is the cheapest real signal that NFC works at all, and it costs no tag.

**Do:** Scan tab → tap **"Scan with NFC"** → tap **"Scan tag"** → hold a
factory-blank NTAG215 against the top of the phone.

**Expect:** the iOS NFC sheet appears, the tag is detected, the sheet closes,
and the screen shows **"No equipment id on this tag."** That is the correct
result — the tag is blank. It proves radio + session + record-0 parser
end to end (`useNfcAdvisoryScan` → `decodeRecord0` returns
`{ id: null, payload: null }` → `scan.noId`).

**Fail looks like — three different failures, do not conflate them:**
- **"NFC is not available on this device."** → hardware/capability gate failed.
  Nothing downstream is testable. Stop.
- **"Could not read the tag. Try again."** → the session itself rejected (cancel,
  tag lost, or a session failure). Retry twice; if persistent, the reader session
  is broken and Stage 2 will not work.
- **The app crashes / disappears.** → almost certainly the missing patch (0.4).

Result: ☑ pass — showed "אין מזהה ציוד בתווית זו." Device log corroborates: a real tag
connected and the app closed its own session (3s), versus a prior attempt that polled 16s
with no tag and ended on user cancel. **Proves radio + CoreNFC session + record-0 parser
end to end on iOS with a TAG-only entitlement.**

### 1.2 — Android: same blank-tag diagnostic

**Do:** identical to 1.1 on the Pixel. Note that Android shows **no system NFC
sheet** — reader mode has no UI of its own, so the only feedback is in-app.

**Expect:** **"No equipment id on this tag."**
**Fail looks like:** as 1.1. Additionally: if nothing at all happens and the
screen never updates, check NFC is enabled in Android settings — a disabled
radio can surface as a silent non-event rather than an error.

Result: ☑ pass — same copy as 1.1. Logcat is independent hardware proof:
`NfcDispatcher: dispatchTag TAG Tech [NfcA, MifareUltralight, Ndef] message: null` — the
copy is driven by a real null NDEF message, not an app-side guess — then `connect to Ndef`
and a clean `unregisterTagEvent`. The tech list also confirms NTAG21x.

### 1.3 — iPhone: torch on and off

The torch has **no verification path from jest or a simulator** — neither has an
LED. This step is the only proof the prop is actually wired to the hardware.

**Do:** Scan tab (QR is the default mode, so the camera is already up) → tap the
**"Torch"** pill at the bottom centre of the viewfinder → tap it again.

**Expect:** the rear LED lights on the first tap and the pill turns white with
black text; the LED goes out on the second tap and the pill returns to
translucent black with white text.
**Fail looks like:** the pill changes colour but the LED never lights — the prop
is not reaching native. Record it; do not "fix" it by adding a capability probe,
expo-camera 57 exposes none.
**Also record:** if the pill is not visible at all, the camera session is not
held (the toggle only renders while `cameraActive`).

Result: ☑ pass — the physical rear LED lit and went out. Pill visible, so the camera session
was held.

### 1.4 — Android: torch on and off

**Do:** identical to 1.3 on the Pixel.

**Expect:** as 1.3.
**Fail looks like:** as 1.3, plus one Android-specific risk worth watching for —
the torch is applied through CameraX (`ExpoCameraView.kt:351`) and re-applied
during camera bind (`setTorchEnabled`, `:659`). **A toggle pressed in the first
moment after the camera appears may be silently dropped.** If the first tap does
nothing but a second tap works, record it exactly that way; that is a different
defect from "never works."

Result: ☑ pass — LED on and off. The Android first-tap-after-bind hazard described above was
NOT reproduced and was not separately probed.

### 1.5 — Background mid-scan, then resume

This is the original symptom the app-state gate was built for. Jest proves the
listener fires and the camera unmounts, but the jest camera is a stub `<View>` —
it cannot prove the real session recovers.

**Do:** Scan tab, QR mode, camera live → **turn the torch ON** → send the app to
the background (swipe up to home; do not kill it) → wait ~5 seconds → return to
the app.

**Expect:**
- the camera preview returns and is **live** (point it at any QR code; it
  scans), and
- the torch is **back on**. This is **intentional**, not a bug: the session drops
  while away so the LED is physically off, and the choice is deliberately
  re-armed on resume because a dark ward is still dark. It is locked by a test
  name in `QrScanner`'s suite. If the owner wants it to reset instead, that is a
  product change, not a defect.

**Fail looks like:** a **frozen or black preview** on resume that never
recovers — that is the original hang, and it means the gate did not do its job.
Record whether a second background/resume cycle clears it.

Result: ☐ pass ☑ **fail (torch half only)** — the camera preview DID return live, so the
app-state gate did its job and the original hang did not occur. But the torch did NOT come
back on while the pill STAYED WHITE: the UI claimed on, the hardware was off. Root cause is
recorded in the findings section; it is iOS-only (1.4 passes on Android).

### 1.6 — Text size AT the cap (a screen that has one)

**Only three files carry the 200% ceiling**: `SettingsScreen`,
`AccountSection`, `LanguageCard`. Test the cap on one of them or you will be
measuring a screen that has no cap.

**Do:** OS settings → set text size to the **largest available** (iOS: Settings
→ Accessibility → Display & Text Size → Larger Text → enable Larger Accessibility
Sizes → drag to **AX5**, the maximum. Android: Settings → Display → Font size →
**largest**). Return to the app → **Settings** screen.

**Expect:** text is visibly enlarged but **stops growing at roughly double**
normal size. Every control stays on screen and reachable; nothing is clipped off
the edge.

**Check these specific elements, not the screen as a whole.** The cap applies
only to text rendered through the `AppText` wrapper, so a single unmigrated node
is invisible against a screenful of capped ones:
- **The version line at the bottom of Settings** — check it first. It is
  `<AppText selectable>`, which routes through React Native's
  `NativeSelectableText` branch rather than the normal `NativeText` path, and it
  is the one element on this screen with **no automated coverage** asserting the
  ceiling reaches it.
- The section headings and row labels.
- The language rows (`LanguageCard`, rendered inside Settings at
  `SettingsScreen.tsx:48`) — Hebrew and English.

If the version line grows past ~2x while the rows around it stop, the cap is not
reaching the selectable branch. Record that specifically; it is a different
defect from "the cap does not apply at all."

**Then go to the Menu tab — this is the third capped surface and it is not on
the Settings screen.** `AccountSection` (`MenuScreen.tsx:59`) carries the cap
but was verified only by grep, never by a test: the automated adoption check
walks the Settings tree, and Account renders under Menu. It is therefore the
**least-evidenced** of the three files and the most worth a human eye.

**Expect:** the display-name field, the locale toggle and the sign-out row all
stop growing at ~2x, same as Settings.
**Fail looks like:** Menu/Account text keeps growing while Settings text caps →
the `AppText` migration did not take on that file, despite the grep. Record it
as a separate finding from 1.6's Settings result.

Result (Menu / Account): ☑ pass — at iOS AX5, on ONE screen: the menu rows and section labels
grew without bound while the display-name, locale toggle and sign-out rows held ~2x. The
least-evidenced of the three cap carriers now has device evidence.
**Fail looks like:** text that keeps growing past ~2x on this screen (the cap is
not applying through Uniwind's `Text` wrapper — this is the single thing the
jest coverage cannot prove, because jest renders RN's `Text` while the app
renders Uniwind's), **or** text capped at 2x that still overflows the viewport
(the cap applies but 2x is too generous for this layout).

Result: ☑ pass — including the version line (`<AppText selectable>`, the
NativeSelectableText branch with no automated ceiling coverage), which stayed the smallest
text on the screen and did NOT outgrow its neighbours. The ceiling therefore DOES reach RN's
selectable-text branch. Nothing overflowed the viewport. **A mid-range capture was
inconclusive and is deliberately not recorded as a result** — below 2× capped and uncapped
are indistinguishable, so AX5 was required to measure anything at all.

### 1.7 — Text size ABOVE the cap (contrast — a screen that has none)

**Do:** with the OS still at maximum text size, go to **Home** (or the Equipment
list).

**Expect:** text here **keeps growing past 200%** and may wrap or clip. **This is
the known, expected state — do not file it as a defect.** 81 `.tsx` files still
import `Text` directly from `react-native` and are uncapped, including the Code
Blue path. The follow-up is an import swap in those files, tracked separately.

The purpose of this step is to prove 1.6 measured something real. If 1.6 and 1.7
look **identical**, then either the cap is not applying (1.6 is a false pass) or
you were on the wrong screen in one of them. Record which.

**Restore the OS text size to normal before continuing.**

Result: ☑ 1.6 and 1.7 visibly differ — at the same AX5 setting the uncapped Home screen
clipped badly while the capped surfaces held. 1.6 measured something real.

---

## Stage 2 — Reversible writes

Tags written here are **not locked** and can be rewritten. Use the `S2-iOS` and
`S2-AND` tags. Pick equipment with **no sticker currently bound**.

### 2.1 — iPhone: write a sticker (and the entitlement question)

**Do:** Equipment → open a unit with **"No sticker bound to this equipment"** →
tap **"Program sticker"** → hold the `S2-iOS` tag against the top of the phone
when the sheet appears.

**Expect:** iOS shows its NFC sheet reading **"Hold the sticker against the
phone"** → the sheet closes → green text **"Sticker programmed"** → a success
haptic → the bound line updates to **"Sticker bound: <hex uid>"** in lowercase
hex, pinned left-to-right.

**The entitlement question is answered here.** `app.json` sets
`includeNdefEntitlement: false`, which the config plugin turns into
`com.apple.developer.nfc.readersession.formats = ['TAG']` only
(`node_modules/react-native-nfc-manager/app.plugin.js:42-52`) — no `NDEF`
format. The write and the lock both operate on the TAG session's connected tag,
so this *should* be fine, but only this step proves iOS does not reject the
write for want of the NDEF format.

**Fail looks like:**
- **A format / entitlement / "session invalidated" error on iOS specifically,
  where Android (2.3) succeeds** → this is the entitlement finding.
  **Do not flip `includeNdefEntitlement` in `app.json`** — another workflow owns
  that file, and the read path already proves a TAG session opens. Record it and
  stop the iOS lane.
- **"Could not write the sticker. Reposition it and try again."** → the tag
  refused the NDEF write. Reposition and retry twice before recording a failure;
  antenna alignment on NTAG215 is finicky.
- **"The sticker was programmed, but linking it to this equipment failed."** →
  the tag is written correctly; the network bind failed. **Do not rewrite the
  tag** — re-writing a correctly-programmed tag fixes nothing. Check the session
  and retry.
- **"This sticker is already bound to other equipment. Use a blank one."** → you
  grabbed a used tag. Go back to 0.2.
- **Nothing happens for a long time.** iOS closes its own session at ~60s and you
  will get a session error. That is the OS bound, not a hang.
- **The bound UID renders in UPPERCASE hex** → the normalization regressed (see
  0.2). The write itself succeeded, so this is not a write failure — but it
  reopens the duplicate-row hazard against a global unique index. Record the
  exact string.

Result: ☑ pass — UID recorded (must be lowercase): **lowercase**, 14 hex chars, `04` NXP
prefix (full value in the uncommitted run log; redacted here per the NFC UID rule).
**The entitlement question is ANSWERED: the write SUCCEEDED with `includeNdefEntitlement`
false, i.e. a TAG-only session. No format or session-invalidation error.**
One defect found here: the bound line renders the UID SPLIT around the RTL label instead of
pinned left-to-right. See findings.

### 2.2 — iPhone: read it back through the app's own parser

A write that cannot be read back is not a write. This is the step
`docs/g2-ntag-ndef-spec.md:51` names as the only real verification.

**Do:** Scan tab → **"Scan with NFC"** → **"Scan tag"** → present the tag you
just wrote.

**Expect:** the app navigates to the **confirm sheet pre-filled with the same
equipment you wrote in 2.1** — same name, same unit.
**Fail looks like:**
- **"No equipment id on this tag."** → the bytes are on the tag but record 0 does
  not parse back. Encode/decode disagree. This is a hard failure; stop the NFC
  lane.
- **It navigates to the Equipment list with a search box seeded** → record 0
  decoded to a URL the extractor rejected (wrong origin or non-canonical path).
- **It pre-fills a DIFFERENT unit** → the worst outcome; record the two ids.

Result: ☑ pass — the confirm sheet opened pre-filled with the SAME unit written in 2.1.
None of the three documented failure modes occurred.

### 2.3 — Pixel: write a sticker

**Do:** as 2.1, on the Pixel, with the `S2-AND` tag and a different unbound unit.

**Expect:** **no system NFC sheet** (Android reader mode has no UI) — the only
feedback is in-app: **"Sticker programmed"**, success haptic, bound line updates.
**Fail looks like:** as 2.1, plus the Android-specific bound —
**if no tag is presented, there is no feedback at all for up to 75 seconds, then
"No sticker detected. Hold it against the phone and try again."** That 75s is the
deliberate timeout (`NFC_SESSION_TIMEOUT_MS`), the backstop for Android's
UI-less reader mode. **It is the bound, not a hang.** Do not report it as a
freeze; do report if it *never* times out.

Result: ☑ pass — UID recorded: **lowercase**, same shape as 2.1 (redacted as above).
**The 2.1 bidi split does NOT occur here** — Android renders the UID as one contiguous run,
which narrows that defect to iOS. Caveat: two different tags, so this is a strong indication
rather than a controlled comparison.

### 2.4 — Pixel: read it back

**Do:** as 2.2, on the Pixel.
**Expect:** as 2.2.
**Fail looks like:** as 2.2.

Result: ☑ pass — opened pre-filled with `W3B-TEST-2`, the unit written in 2.3 and
deliberately NOT the one used on iOS, so a stale prior binding could not have produced it.

### 2.5 — Pixel: AAR cold-tap dispatch (Android only, non-destructive)

Record 1 is an Android Application Record naming `uk.vettrack.app`. Until this
branch, the RN build shipped under a different id and the AAR could never reach
it — `docs/g2-ntag-ndef-spec.md:28` still says so. Now that `app.json:50` ships
`uk.vettrack.app`, **the AAR points at this build and is testable for the first
time.**

**Do:** fully close the app (swipe it away from recents — not just background it)
→ with the phone unlocked and on the home screen, tap the tag written in 2.3.

**Expect:** the VetTrack app launches and lands on that equipment.
**Fail looks like — each means something different, record which:**
- **The Play Store listing opens** → Android resolved the AAR but found no
  installed app under that package. The installed id is not `uk.vettrack.app`
  (re-check 0.1).
- **An app-chooser appears** → the AAR is not being honoured; another handler is
  competing.
- **Nothing happens at all** → the tag was not dispatched. Confirm the tag reads
  fine in-app (2.4 passed) to separate "tag is bad" from "dispatch is bad."
- **The app opens but lands on Home, not the equipment** → dispatch worked, deep
  link routing did not. A separate, lesser finding — record it as such.

Result: ☐ pass ☐ fail — **NOT RUN.** Optional step, out of scope for this session.

### 2.6 — Bind conflict (optional, reversible)

Proves the "wrong sticker" guard, and leaves nothing locked.

**Do:** open a **different** unbound unit → **"Program sticker"** → present the
tag already bound in 2.3.

**Expect:** red text **"This sticker is already bound to other equipment. Use a
blank one."**
**Fail looks like:** it succeeds and re-binds — the global unique index is not
holding, which means one physical sticker can point at two units. Record as
high severity.

**Afterwards:** the tag now carries the *second* unit's URL while still bound to
the *first*. Re-write it for its original unit (repeat 2.3) to leave it
consistent, or discard it.

Result: ☐ pass ☐ fail ☑ skipped — **NOT RUN.** Optional step, out of scope for this session.
Not executed, therefore not passed: the bind-conflict path remains unexercised on hardware.

### 2.7 — Program the sacrificial tags (do NOT lock them)

Stage 3 needs an already-programmed tag — and NOT because the lock would refuse
a blank one. **It will not refuse.** The guard checks NDEF status only, and a
factory NTAG215 frequently ships NDEF-formatted-and-empty, which reads
`ReadWrite` and locks. No layer shows a "program it first" message; nothing
stands between a blank tag and a permanent lock except this procedure. Doing the
write **here**, while still in the reversible stage, is what guarantees Stage 3
opens with a known-good tag and contains nothing but lock operations. If this
write fails you are still in reversible territory and have lost nothing.

**Do:** repeat step 2.1 (iPhone) or 2.3 (Pixel) against `SACRIFICIAL-1`, on any
unit. **Stop there — do not touch "Lock sticker permanently" yet.**

**Expect:** **"Sticker programmed"**, and the bound line updates.
**Fail looks like:** as 2.1/2.3. Resolve it before entering Stage 3 — do not
carry a half-written tag across the boundary.

**Keep `SACRIFICIAL-1` physically separate from `SACRIFICIAL-2` from this point
on.** Step 3.2 depends on you presenting the *same* tag twice, and once locked
they are visually identical.

Result: **DELIBERATELY DEFERRED to the Stage 3 session.** The reason this step sits before
Stage 3 — that a failed write should happen while still reversible — is preserved by running
it at the START of that session. Deferring avoids a labelled sacrificial tag sitting for days
waiting to be confused with its twin, which is the exact hazard 3.2 warns about.

---

## Stage 3 — IRREVERSIBLE. Sacrificial tags only.

> ## Read this before touching a tag in this stage.
>
> **An NTAG215 lock can never be undone.** There is no admin override, no
> rewrite, no recovery. A locked tag is permanently frozen with whatever is on
> it.
>
> **Any arm → confirm sequence is irreversible regardless of what you believe
> about the tag in your hand.** You cannot know a tag's status before presenting
> it, and a factory NTAG215 is frequently shipped NDEF-formatted-and-empty —
> which reads `ReadWrite`, sails past the guard, and **locks**. There is no
> "safe" tag to practise on.
>
> **Use only the tags you labelled `SACRIFICIAL` in step 0.2. Never a tag
> destined for real equipment. Never the `S2-iOS` / `S2-AND` tags used in steps
> 2.1–2.6 — only the `SACRIFICIAL` tag you programmed in 2.7.**
>
> If you are interrupted mid-stage, treat every tag on the bench as suspect.

### 3.1 — Lock a sacrificial tag

Uses the tag programmed in 2.7. Nothing in this stage writes.

**Do:** on the unit you programmed `SACRIFICIAL-1` against: tap **"Lock sticker
permanently"** → a red-bordered block appears reading **"Lock this sticker
permanently?"** → read the body copy → tap **"Lock permanently"** → present
`SACRIFICIAL-1`.

**Expect:** green text **"Sticker locked permanently"**, success haptic, and the
confirm block **disarms itself** (it disarms on every outcome, pass or fail).

**Fail looks like:**
- **"The sticker is NOT locked. Do not mark it as locked — try again."** → the
  lock did not take. This copy is deliberate and literal: the tag is still
  writable. Do not label it as locked. On Android this can mean
  `Ndef.makeReadOnly()` returned `false` rather than throwing — a path inferred
  from native source but never observed. **If you see this on Android, record it
  as the first observation of that branch.**
- **"This sticker cannot be locked. Program it first."** → status came back as
  neither ReadWrite nor ReadOnly. On Android a transient read error is swallowed
  into NotSupported, so this can be a false negative — retry once.
- **The confirm block stays armed after the attempt** → the disarm-on-every-
  outcome guarantee is broken. High severity: it leaves a hot confirm one tap
  from destroying the next tag.

Result: **NOT REACHED — by design.** Owner decision at planning time: stages 1+2 in this
session, stage 3 in its own. `makeReadOnly` has still never been invoked from this codebase.

### 3.2 — Re-lock the now-locked tag (the step a mock cannot stand in for)

This is the single behaviour no unit test can substitute for: whether a real
NTAG215 reports `ReadOnly` after the lock, and whether the app treats a re-tap
as success rather than failure. An operator re-tapping and seeing a failure is a
field-trust problem, not a cosmetic one.

**Do:** tap **"Lock sticker permanently"** → **"Lock permanently"** → present the
**same** `SACRIFICIAL-1` tag you just locked.

**Expect:** **"This sticker was already locked"** — in **green / success**
styling, not red. Success haptic.
**Fail looks like:**
- **Any red error text**, most likely "The sticker is NOT locked…" or "This
  sticker cannot be locked…" → the idempotent branch is not firing, which means
  the post-lock status is not reading back as `ReadOnly`. Record the exact
  string; it discriminates between "lock did not take" and "status read is
  wrong."
- **"Sticker locked permanently"** (the fresh-lock copy, not the already-locked
  copy) → the status query is not detecting the existing lock. Lesser, but
  record it.

> **Before recording ANY failure here, confirm you presented the same physical
> tag as 3.1.** A locked tag is visually identical to an unlocked one, so this
> cannot be done from memory — it depends on having kept `SACRIFICIAL-1`
> physically separate since 2.7. Presenting `SACRIFICIAL-2` by mistake produces
> **"This sticker cannot be locked. Program it first."** if it is blank, or
> **"Sticker locked permanently"** if it happens to be programmed — and that
> second one appears in the fail list above, so a wrong-tag slip would be
> recorded as a code defect **and would destroy a second tag**.

Result: **NOT REACHED — by design.**
Tag identity confirmed physically (not from memory): n/a

### 3.3 — Write to the locked tag (optional confirmation)

**Do:** on any unit, tap **"Program sticker"** → present the locked
`SACRIFICIAL-1`.

**Expect:** red **"Could not write the sticker. Reposition it and try again."**
The tag is locked, so the write must be refused. (The copy suggests
repositioning, which is unhelpful here — worth recording as a copy improvement,
not a defect.)
**Fail looks like:** **"Sticker programmed"** — the tag accepted a write after
being locked, meaning 3.1 reported a lock that did not happen. **This is the
highest-severity outcome in the whole script**: it means the app can tell an
operator a sticker is locked when it is not.

Result: **NOT REACHED — by design.**

---

## Summary

| Stage | Steps | Result |
|---|---|---|
| 0 — Gate | 0.1–0.5 | ☑ pass ☐ fail — 0.5 reached detail by deep link; the step's instruction has since been corrected to match |
| 1 — Diagnostic (nothing written) | 1.1–1.7 | ☐ pass ☑ **fail** — 1.5 splits: preview recovers, iOS torch does not re-arm (F-TORCH / #93). 1.1–1.4, 1.6, 1.7 pass |
| 2 — Reversible writes | 2.1–2.7 | ☑ pass ☐ fail — 2.1–2.4 pass; 2.5 and 2.6 not run (optional), 2.7 deferred to the Stage 3 session |
| 3 — Irreversible | 3.1–3.3 | ☐ pass ☐ fail ☑ not reached — deferred; `makeReadOnly` has still never been invoked from this codebase |

**Tags consumed:** 2 of 10 (both still rewritable)  **Tags permanently locked:** 0

Anything recorded as a failure above is a finding, not a retry instruction —
carry it back before the branch goes to PR. In particular, an unrecorded step is
untested; a blank result line is not a pass.

---

## Findings from the 2026-08-21 run

Ten findings. None is a Stage-1/2 step failure except F-TORCH; the rest surfaced *while*
running the script and are recorded because a device run is the only place they appear.

Six were filed as GitHub issues; the other four are resolved, a product question, or inside
an already-known set, and are recorded here so they are not re-found and re-filed:

| Finding | Filed as | Disposition |
|---|---|---|
| F-TORCH | #93 | open — mechanism read in source, not instrumented |
| F-BIDI | #94 | open — iOS bidi layout |
| F-NOFEEDBACK | #97 | open — Android in-flight state |
| F-NOEXIT | #96 | open — three problems on one surface |
| F-SAFEAREA | #95 | open — blocks the Lane 1a screenshot milestone |
| F-PUSH | #98 | open — cross-repo, server-side cause not diagnosed |
| F-DETAIL | not filed | product decision, not a code defect |
| F-SSO | not filed | resolved during the run |
| F-TABBAR | not filed | inside the known uncapped-`Text` set |
| F-DEVERROR | not filed | closed against the operator |

### F-TORCH — the torch does not re-arm after background/resume (iOS only) · step 1.5
`src/components/scan/QrScanner.tsx` keeps `torchOn` across the background→foreground remount
**deliberately** (its own comment says a dark ward is still dark). The pill therefore renders
white while the LED is off — the UI asserts a hardware state that is not true.
Mechanism, read from source rather than measured: our gate unmounts `<CameraView>` on
background, so expo-camera's own `onAppForegrounded` re-apply path never runs (it is guarded on
a session it paused itself). On the fresh mount the `enableTorch` prop assignment fires
`enableTorch()`, which early-returns while the capture device is still being configured on the
session queue — and nothing retries, because the prop never changes again.
Android is immune: it re-applies torch during camera bind, which is why 1.4 passes.
Cheap discriminator NOT run: toggle the torch off/on after resume — if it lights, only the
mount-window application is lost.

### F-BIDI — the bound UID renders split around its label (iOS only) · step 2.1
The hex UID is broken into two pieces on opposite sides of the Hebrew label instead of being
pinned left-to-right: a digit run and a letter run are reordered as separate bidi runs inside an
RTL paragraph. An operator cannot read or transcribe a tag's UID. Android renders the same shape
correctly (2.3), which narrows it to iOS text layout. A jest snapshot cannot catch this — jest
does not run bidi layout.

### F-NOFEEDBACK — no "present the tag now" state on Android · step 2.3
`src/components/equipment/detail/NfcProvisionCard.tsx` derives a `busy` flag from the mutation
and its only visual consequence is dimming the buttons to 40% opacity. iOS never exposes the gap
because the OS supplies its own "hold the sticker" sheet; Android reader mode has no system UI,
so nothing tells the user the session is open. Observed cost: the owner reported the button as
"not working" while the log showed the session had opened correctly and was waiting. The same
gap cost time twice in one evening (also at 1.2, reported as a "never ending spinner").

### F-NOEXIT — the confirm sheet has no visible exit on success · step 2.2
`src/screens/CheckoutConfirm.tsx`: on success the confirm button renders null and the cancel
button — the only control that navigates back — is REPLACED by undo. The backdrop is
`pointerEvents="none"`. The remaining exit is a pan-down gesture whose touch target is almost
entirely covered by the full-width button, which swallows the drag; it only worked once started
from the grab handle. And the dismiss itself calls `goBack()` with no exit animation, so the
drag's position and the backdrop fade are discarded and the navigator's pop reads as a jump.
Entry IS animated; only the exit is a hard cut. Three separate problems, all on the success path.

### F-SAFEAREA — the equipment tab ignores the top safe-area inset
`src/navigation/MainTabs.tsx`: the equipment tab wrapper renders the list screen with no
inset wrapper, while its sibling tab wrapper applies `paddingTop: insets.top` and the comment
directly above states that tab wrappers own the top inset. The search header therefore renders
under the status bar. Single omission, single location; the same list reached via a stack push
(which has a native header) renders correctly.

### F-DETAIL — no list on a phone reaches equipment detail
`src/screens/EquipmentListScreen.tsx` documents the phone row press → ScanConfirm behaviour as
deliberate. The consequence is broader than it reads: the equipment tab AND the exceptions card
both land on that same list, so every route that *shows* equipment leads to checkout. Detail is
reachable only from quick search, the activity feed, and alerts. The owner hit this three times
in one evening on two devices, each time expecting the device's details — discoverability data,
not a code defect. Worth a product decision.

### F-SSO — production SSO redirect was not allowlisted (RESOLVED during the run)
Apple/Google sign-in failed against the production Clerk instance with an unauthorized-redirect
error for every user, store build included. The app derives its redirect implicitly from the
scheme rather than passing one explicitly, which is why nothing caught it before a device run.
The owner added the redirect to the dashboard mid-session and Apple sign-in was then verified
working on device; Android was later shown to use the SAME redirect, so one entry covers both.
Residual work (pin the redirect in code, surface config faults distinguishably) is tracked
separately.

### F-PUSH — push registration fails against production
The client's initial push registration is rejected server-side and logged as non-fatal, so
nothing crashes. It sits on the Critical Alerts path, which is an open gate. Not investigated
further during this run.

### F-TABBAR — tab labels vanish at maximum accessibility text size
At iOS AX5 the tab bar's labels disappear entirely, leaving bare glyphs. This falls inside the
known set of uncapped `Text` imports, but it is navigation rather than content, and that set
also still includes the Code Blue path. Step 1.7 says explicitly not to file uncapped text at
AX5, which is why this is recorded rather than filed — the exception worth a second look is
that three of the four tab labels vanish, and that is navigation.

### F-DEVERROR — a dev-only render error, closed against the operator
A render error seen mid-run did NOT recur across the background/resume cycle, which isolates
the trigger to a Metro swap performed by the operator rather than to the app. Recorded so the
next reader does not chase it as an app defect; no issue filed, deliberately.
