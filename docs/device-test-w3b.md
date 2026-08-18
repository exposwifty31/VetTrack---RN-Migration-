# W3B device test script — NFC write/lock, torch, app-resume, text size

> **Nothing in this document has been executed.** This is the procedure, not a
> result. Every step ships with a blank result line. A step with no recorded
> result is untested — not passed.
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

```
# Android
adb shell pm list packages | grep vettrack
```

**Expect:** `uk.vettrack.app`, and only that.
**Fail looks like:** `uk.vettrack.rnmigration` present, or both present. Then
you are driving a different build than this script describes — stop, and record
which id you actually have. Step 2.5 (AAR dispatch) is meaningless otherwise.

Result: ☐ pass ☐ fail — ....................................................

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
  app binds lowercase (`/Users/dan/vettrack/src/lib/nfc-capgo-decode.ts:24`,
  `toString(16)`). This build normalizes to lowercase (`normalizeTagUid` in
  `src/lib/nfc-provision.ts`) **specifically so the two agree**.
  `vt_equipment.nfcTagId` is `.unique()` globally
  (`/Users/dan/vettrack/server/schema/equipment.ts:136`) and matched
  byte-exactly, so if the bound line ever renders an **uppercase** UID the
  normalization has regressed and one physical sticker can occupy two rows.
  Lowercase is the pass.
- Physically label each tag before you start: `S2-iOS`, `S2-AND`,
  `SACRIFICIAL-1`, `SACRIFICIAL-2`. Stage 3 depends on you knowing which is
  which, and a locked tag is indistinguishable by eye.

Result: ☐ ready — tags labelled, count: ......

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

Result: ☐ pass ☐ fail — account used: ......................................

### 0.4 — Build integrity

```
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

Result: ☐ pass ☐ fail — ....................................................

### 0.5 — The card is actually on screen

Open any equipment detail (Equipment tab → tap a unit).

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

Result: ☐ pass ☐ fail — ....................................................

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

Result: ☐ pass ☐ fail — ....................................................

### 1.2 — Android: same blank-tag diagnostic

**Do:** identical to 1.1 on the Pixel. Note that Android shows **no system NFC
sheet** — reader mode has no UI of its own, so the only feedback is in-app.

**Expect:** **"No equipment id on this tag."**
**Fail looks like:** as 1.1. Additionally: if nothing at all happens and the
screen never updates, check NFC is enabled in Android settings — a disabled
radio can surface as a silent non-event rather than an error.

Result: ☐ pass ☐ fail — ....................................................

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

Result: ☐ pass ☐ fail — ....................................................

### 1.4 — Android: torch on and off

**Do:** identical to 1.3 on the Pixel.

**Expect:** as 1.3.
**Fail looks like:** as 1.3, plus one Android-specific risk worth watching for —
the torch is applied through CameraX (`ExpoCameraView.kt:351`) and re-applied
during camera bind (`setTorchEnabled`, `:659`). **A toggle pressed in the first
moment after the camera appears may be silently dropped.** If the first tap does
nothing but a second tap works, record it exactly that way; that is a different
defect from "never works."

Result: ☐ pass ☐ fail — ....................................................

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

Result: ☐ pass ☐ fail — ....................................................

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
the edge; the version line at the bottom is still readable.
**Fail looks like:** text that keeps growing past ~2x on this screen (the cap is
not applying through Uniwind's `Text` wrapper — this is the single thing the
jest coverage cannot prove, because jest renders RN's `Text` while the app
renders Uniwind's), **or** text capped at 2x that still overflows the viewport
(the cap applies but 2x is too generous for this layout).

Result: ☐ pass ☐ fail — ....................................................

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

Result: ☐ 1.6 and 1.7 visibly differ ☐ identical (investigate) — ...........

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

Result: ☐ pass ☐ fail — UID recorded (must be lowercase): ..................

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

Result: ☐ pass ☐ fail — ....................................................

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

Result: ☐ pass ☐ fail — UID recorded: ......................................

### 2.4 — Pixel: read it back

**Do:** as 2.2, on the Pixel.
**Expect:** as 2.2.
**Fail looks like:** as 2.2.

Result: ☐ pass ☐ fail — ....................................................

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

Result: ☐ pass ☐ fail — which of the above: ................................

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

Result: ☐ pass ☐ fail ☐ skipped — ..........................................

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
> destined for real equipment. Never the tags from Stage 2.**
>
> If you are interrupted mid-stage, treat every tag on the bench as suspect.

### 3.1 — Lock a sacrificial tag

**Do:** write `SACRIFICIAL-1` first by repeating step 2.1 or 2.3 (the lock needs
a programmed tag — an unprogrammed one gives "This sticker cannot be locked.
Program it first."). Then, on that same unit: tap **"Lock sticker permanently"**
→ a red-bordered block appears reading **"Lock this sticker permanently?"** →
read the body copy → tap **"Lock permanently"** → present `SACRIFICIAL-1`.

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

Result: ☐ pass ☐ fail — ....................................................

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

Result: ☐ pass ☐ fail — exact string shown: ................................

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

Result: ☐ pass ☐ fail — ....................................................

---

## Summary

| Stage | Steps | Result |
|---|---|---|
| 0 — Gate | 0.1–0.5 | ☐ pass ☐ fail |
| 1 — Diagnostic (nothing written) | 1.1–1.7 | ☐ pass ☐ fail |
| 2 — Reversible writes | 2.1–2.6 | ☐ pass ☐ fail |
| 3 — Irreversible | 3.1–3.3 | ☐ pass ☐ fail ☐ not reached |

**Tags consumed:** ......  **Tags permanently locked:** ......

Anything recorded as a failure above is a finding, not a retry instruction —
carry it back before the branch goes to PR. In particular, an unrecorded step is
untested; a blank result line is not a pass.
