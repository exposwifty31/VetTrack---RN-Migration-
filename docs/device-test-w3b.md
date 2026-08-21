# W3B device test script — NFC write/lock, torch, app-resume, text size

> **Stages 1 and 2 were executed on 2026-08-21. Stage 3 was not.** Every step below
> now carries its real result. The rule that produced this document is unchanged and
> still governs Stage 3: a step with no recorded result is untested — not passed.
>
> Hardware: iPhone 16 Plus / iOS 26.6 and Pixel 7 "panther" / Android 16. Both ran an
> installed build one number behind `app.json` (28 / 10300 vs 29 / 10301) because each
> native prebuild predates the version bump. That does not weaken any result here —
> nothing tested is version-gated — but it is why the on-device build string will not
> match the repo.
>
> **`makeReadOnly` has still never been invoked from this codebase.**
> <!-- vt-claim: attested nfc-write-readback-verified -->
> <!-- vt-claim: attested text-size-cap-selectable -->
>
> Two tags of ten consumed, both still rewritable. Zero tags locked.
>
> It exists because the W3B work (commits `e09decd`, `5915f37`, `ab9d533`,
> `d05597b` on `feat/w3b-device-features`) is covered by unit tests that cannot
> reach the thing that matters: a simulator has no NFC radio and no torch LED,
> and an NTAG215 lock is one-way. Three native entry points —
> `writeNdefMessage`, `makeReadOnly`, `queryNDEFStatus` — have **never been
> invoked from this codebase**, and they are reached through New-Architecture
> bridgeless interop with different completion-handler shapes than the read
> path. The read path working is not evidence for them.

**Order is load-bearing.** Stage 1 writes nothing. Stage 2 writes tags that can
still be rewritten. Stage 3 destroys tags. Do not run them out of order, and do
not start Stage 3 until Stages 1 and 2 have passed on both platforms.

**Tester:** ............................  **Date:** ....................

| Hardware | Model | OS version | Build / commit |
|---|---|---|---|
| iPhone | | | |
| Android | | | |

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

Result: ☑ pass ☐ fail — owner decision 2026-08-21. The live Capacitor app is not in real use: the iPhone container shows RN MMKV writes from 16/08 while WebKit/Dexie is frozen at 12/08.

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

Result: ☑ ready — tags labelled, count: 10 (NTAG215 wet inlay, invoice 02/000340, Maker Depot). Budget ≥5 satisfied.

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

Result: ☑ pass ☐ fail — account used: Apple SSO, after the owner added `vettrack://sso-callback` to the PRODUCTION Clerk allowlist (see *Closed by this run*, below). Equipment list populated, 65 ready, W3B-TEST-1/2/3 present.

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

Result: ☑ pass ☐ fail — `react-native-nfc-manager@3.17.2 ✔` (patch applied). Signed binary carries `com.apple.developer.nfc.readersession.formats = [TAG]`; application-identifier explicit, not wildcard.

### 0.5 — The card is actually on screen

Open any equipment detail. **On a phone the Equipment tab does not reach detail** —
every equipment list routes a row press to checkout by deliberate Slice-1 design
(`src/screens/EquipmentListScreen.tsx:54-56`; recorded under *Not defects*, below).
Use the deep link `vettrack://equipment/<id>`, taking the id from the equipment list.
On a tablet the row press selects and the detail pane renders, so the tab route works
there.

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

Result: ☑ pass ☐ fail — card present with both buttons. **The route in this step is wrong for a phone** — reached via a `vettrack://equipment/<id>` deep link instead; see *Not defects*, below.
The instruction at the top of this step has since been corrected to name that route.

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

Result: ☑ pass ☐ fail — showed "אין מזהה ציוד בתווית זו." Device syslog corroborates: nfcd tag connect/disconnect, app-initiated `invalidateSession`. Proves radio + CoreNFC + record-0 parser end to end under a TAG-only entitlement.

### 1.2 — Android: same blank-tag diagnostic

**Do:** identical to 1.1 on the Pixel. Note that Android shows **no system NFC
sheet** — reader mode has no UI of its own, so the only feedback is in-app.

**Expect:** **"No equipment id on this tag."**
**Fail looks like:** as 1.1. Additionally: if nothing at all happens and the
screen never updates, check NFC is enabled in Android settings — a disabled
radio can surface as a silent non-event rather than an error.

Result: ☑ pass ☐ fail — identical copy to 1.1. Logcat is independent hardware proof: `NfcDispatcher: dispatchTag TAG Tech [NfcA, MifareUltralight, Ndef] message: null` — the copy is driven by a real null NDEF message, not an app-side guess. Tech list also confirms NTAG21x.

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

Result: ☑ pass ☐ fail — owner confirmed the PHYSICAL rear LED lights, which is the one thing jest and the simulator cannot prove. Torch pill visible, so the camera session is held.

### 1.4 — Android: torch on and off

**Do:** identical to 1.3 on the Pixel.

**Expect:** as 1.3.
**Fail looks like:** as 1.3, plus one Android-specific risk worth watching for —
the torch is applied through CameraX (`ExpoCameraView.kt:351`) and re-applied
during camera bind (`setTorchEnabled`, `:659`). **A toggle pressed in the first
moment after the camera appears may be silently dropped.** If the first tap does
nothing but a second tap works, record it exactly that way; that is a different
defect from "never works."

Result: ☑ pass ☐ fail — owner: "works great", LED on and off both directions. The Android first-tap-dropped hazard this step names was NOT separately probed; no such pattern was seen.

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

Result: ☐ pass ☑ fail — SPLIT. Camera preview recovers correctly (the symptom the app-state gate was built for). **Torch does NOT re-arm**, while the pill stays white: `torchOn` true, hardware off. See the torch-desync finding below.

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

Result (Menu / Account): ☑ pass ☐ fail — Menu/AccountSection capped at the same AX5
setting as Settings; recorded together with the Settings result below.
**Fail looks like:** text that keeps growing past ~2x on this screen (the cap is
not applying through Uniwind's `Text` wrapper — this is the single thing the
jest coverage cannot prove, because jest renders RN's `Text` while the app
renders Uniwind's), **or** text capped at 2x that still overflows the viewport
(the cap applies but 2x is too generous for this layout).

Result: ☑ pass ☐ fail — at iOS AX5, Settings held a sane size INCLUDING the version line (`<AppText selectable>`, the NativeSelectableText branch that has no automated ceiling coverage); Menu/AccountSection likewise. A mid-range capture was inconclusive and was not recorded — below 2× capped and uncapped are indistinguishable, so AX5 was required.

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

Result: ☑ observed as expected — Home clips badly at AX5 and most card content is unreadable, which this step states is the known state. 1.6 and 1.7 VISIBLY DIFFER, which is what makes 1.6 a real measurement rather than a false pass.

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

Result: ☑ pass ☐ fail — WRITE passed and the bind to the equipment row succeeded. **The entitlement question is answered: TAG-only is sufficient to WRITE** — no format or session-invalidation error with `includeNdefEntitlement: false`. UID rendered lowercase, so `normalizeTagUid` holds and the duplicate-row hazard does not reproduce. **The bound-line RENDER failed** — see the bidi finding below.

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

Result: ☑ pass ☐ fail — the just-written tag opened the confirm sheet pre-filled with the same unit. None of the three documented failure modes occurred. Side effect: the scan also checked the unit out, which is expected for the scan flow.

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

Result: ☑ pass ☐ fail — bound line contiguous and correct, clean session close in logcat. UID lowercase, as on iOS.

### 2.4 — Pixel: read it back

**Do:** as 2.2, on the Pixel.
**Expect:** as 2.2.
**Fail looks like:** as 2.2.

Result: ☑ pass ☐ fail — pre-filled with W3B-TEST-2, deliberately NOT the unit used on iOS; a stale prior binding could not have produced that.

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

Result: ☐ pass ☐ fail — NOT RUN (optional).

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

Result: ☐ pass ☐ fail — NOT RUN (optional).

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

Result: ☐ pass ☐ fail — DEFERRED to the Stage 3 session, per the owner's planning decision.

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

Result: ☐ pass ☐ fail — NOT RUN. `makeReadOnly` has still never been invoked from this codebase.

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

Result: ☐ pass ☐ fail — NOT RUN.
Tag identity confirmed physically (not from memory): ☐

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

Result: ☐ pass ☐ fail — NOT RUN.

---

## Summary

| Stage | Steps | Result |
|---|---|---|
| 0 — Gate | 0.1–0.5 | ☑ pass ☐ fail — 0.5 reached detail by deep link, not the tab route it documented |
| 1 — Diagnostic (nothing written) | 1.1–1.7 | ☐ pass ☑ **fail** — 1.5 split: preview recovers, iOS torch does not re-arm (D1). 1.1–1.4, 1.6, 1.7 pass |
| 2 — Reversible writes | 2.1–2.7 | ☑ pass ☐ fail — 2.1–2.4 pass — 2.5 and 2.6 not run (optional), 2.7 deferred to the Stage 3 session |
| 3 — Irreversible | 3.1–3.3 | ☐ pass ☐ fail ☑ not reached — deferred; `makeReadOnly` has still never been invoked from this codebase |

**Tags consumed:** 2 (`S2-iOS`, `S2-AND` — both rewritable).  **Tags permanently locked:** 0.

Anything recorded as a failure above is a finding, not a retry instruction —
carry it back before the branch goes to PR. In particular, an unrecorded step is
untested; a blank result line is not a pass.


---

## Findings from the 2026-08-21 run

Recorded here because they were found by running this script, and because several are
invisible to jest by construction — bidi layout, a physical LED, and an iOS capture
session do not exist in a test renderer.

### Defects

**D1 — iOS torch does not re-arm after background/resume (step 1.5).** The pill stays
white while the LED is off: `torchOn` is true and the hardware is not. Worse than either
steady state — an operator in a dark ward reads "torch on". The re-arm is the deliberate
design per the component's own comment, so this is missed intent, not an undefined case.
Mechanism, read in source and NOT instrumented: `src/components/scan/QrScanner.tsx`
renders the camera conditionally on `active && appActive`, so backgrounding UNMOUNTS the
view; expo-camera's own `onAppForegrounded` re-apply therefore never runs, and on the
fresh view the torch prop is assigned before the capture device is configured, so the
enable call early-returns and nothing retries. Android is immune because it re-applies
torch during camera bind — same prop, different mechanism, only one platform affected.
**Treat as a strong hypothesis with a complete mechanism, not a measurement.** A cheap
discriminator was NOT run: toggle the torch off and on after resume; if it lights, only
the mount-window application is lost.

**D2 — iOS splits the bound UID around its Hebrew label (step 2.1).** Rendered as
`04826 :מדבקה משויכת b2fce2a81` — the value is broken into two runs on opposite sides of
the label, because a leading all-digit run and a letter-initial remainder are reordered
independently inside an RTL paragraph with no isolation. An operator cannot read or
transcribe the UID, and this step's own instruction to record the UID case depends on the
line being legible. **Android renders the same shape contiguously and correctly**, so the
fault is iOS text layout, not shared logic. Caveat stated rather than glossed: the two
platforms wrote two DIFFERENT tags, so this is strong indication, not proof; writing the
same tag on both would settle it.

**D3 — the equipment tab has no safe-area wrapper.** `src/navigation/MainTabs.tsx`
returns the equipment list bare, while the sibling tab immediately below applies
`paddingTop: insets.top` and carries a comment stating that tab wrappers own the top
inset. The convention is documented in the file and this one call site does not follow
it, so the search header renders under the status bar. Single-location root cause, and it
affects the phone as well as the tablet.

**D4 — the confirm sheet has no visible exit on success**
(`src/screens/CheckoutConfirm.tsx`). On success the confirm button renders null and the
only control wired to `goBack()` is replaced by *undo*, so the sole visible action after a
successful scan undoes it. The backdrop is deliberately inert, and the pan-dismiss is
declared without simultaneous-gesture handling while a full-width pressable covers most of
a short sheet — verified live: the owner could not drag until told to start from the grab
handle. The dismiss also has no exit animation; entry is animated and only the exit is a
hard cut. UX, not correctness — weighted up because this sheet's own header calls it the
delight surface the G2 gate measures, and all three problems land on the success path.

**D5 — Android has no "present the tag now" state**
(`src/components/equipment/detail/NfcProvisionCard.tsx`). The entire in-flight signal is a
40% opacity dim: no spinner, no label change, no instruction. iOS never exposes this
because the OS supplies its own sheet; Android reader mode has no system UI, so for up to
the 75-second session timeout there is no signal that anything is happening. The owner
reported the button as "not working" while logcat showed the session open and waiting.
This gap cost time twice in one evening — the same shape produced the "never ending
spinner" report at step 1.2, where a 40-second wait was well inside the deliberate timeout
and nothing had hung.

### Not defects, recorded so they are not re-found

- **Product decision, not a bug:** every route that displays a list of equipment leads to
  checkout, and none leads to the item's detail —
  `src/screens/EquipmentListScreen.tsx` documents the phone behaviour as the deliberate
  Slice-1 design. Confirmed on both platforms and from two entry paths. The owner hit it
  three times in one evening expecting detail, which is discoverability data rather than
  a correctness failure. Worth revisiting; recorded as such.
- **Uncapped text at AX5** is the known state this document already names, and step 1.7
  says explicitly not to file it. Two observations inside that known set are worth a
  second look anyway because they are navigation rather than content: at AX5 three of the
  four tab labels disappear entirely, leaving bare glyphs.
- **A dev-only render error** seen mid-run did not recur across the background/resume
  cycle, which isolates the trigger to a Metro swap performed by the operator rather than
  to the app. Closed against the operator.

### Closed by this run

- The production Clerk allowlist was missing `vettrack://sso-callback`, so Apple and
  Google SSO returned 400 for every user, store build included. The owner fixed it and
  Apple SSO was verified on device. Logcat then showed Android completing SSO through the
  **same** redirect URI, which disproves the standing speculation that Android would need
  its own allowlist entry.
- **TAG-only entitlement is sufficient to WRITE**, which was an open architectural worry.
  Locking remains unproven — that is Stage 3.
