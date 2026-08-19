# OTA Acceptance Test

**Until a human has run every step below, this repo does not have OTA. It has OTA
configuration.** Those are different things, and only one of them helps during an
incident. No agent can settle this: the only proof that matters is an *installed*
binary silently taking a new JS bundle without a store submission, watched by a
person holding the device.

Run it once. Record the result in the log at the bottom. Re-run it after any change
to `runtimeVersion`, `updates.*`, the channel wiring, or the native dependency set.

---

## What a full pass proves

1. A build can be produced on a channel and installed on a real device.
2. An update published to that channel is **delivered** to that installed build.
3. Delivery is **two-phase** — download, then apply on reload — with a known bound.
4. A bad update can be **rolled back**, and rollback was rehearsed before it was needed.
5. An update built against an **incompatible runtime** is **not** delivered.

## What a full pass does NOT prove

- It does not make OTA a safety mechanism for the Code Blue path. See
  [Timing and the Code Blue gate](#timing-and-the-code-blue-gate). Routine JS fixes:
  yes. Emergency-path bugs: no. Never describe it as the latter.
- It does not cover native changes. Native code, native dependencies, and permissions
  can never ship over the air — they need a store release.
- It does not prove local data survives a rollback. See
  [The rollback caveat that is not boilerplate](#the-rollback-caveat-that-is-not-boilerplate).

---

## Verified state at the time of writing (2026-08-18)

Everything below was checked live, not assumed. Re-check anything that looks stale.

> **Re-verified 2026-08-19 against commit `a06cbb5`.** Two rows below were already false and are corrected
> in place (strikethrough = the original 2026-08-18 claim). Both were falsified within an hour of writing by
> commit `017ae43`. The remaining rows are EAS-service observations that were **not** re-checked in this pass —
> they still carry their 2026-08-18 date and should be re-run before being relied on. Re-derivation here was
> done from `package.json` + `package-lock.json` + `git log`; this worktree has no `node_modules`, so the
> lockfile-resolved version is the authority for the version claims.

| Fact | Evidence |
| --- | --- |
| ~~`expo-updates` is **not installed**~~ → **`expo-updates` IS installed** (corrected 2026-08-19) | `package.json:29` → `"expo-updates": "~57.0.15"`, resolved to `57.0.15` in `package-lock.json`. Installed by commit `017ae43` "feat(ota): install expo-updates" (2026-08-18 21:50), **51 minutes after** this doc's last edit `534049c` (2026-08-18 20:59) — i.e. the doc was accurate when written and was never revisited after the very next commit closed its own P2 action item. |
| No channel has ever existed | `eas channel:list --json --non-interactive` → `{"currentPage": []}` |
| iOS builds 27 and 28 are `FINISHED`, both `1.3.0`, both with **no channel and no runtimeVersion** | `eas build:list --platform ios --json --non-interactive` |
| `runtimeVersion` and `updates` now resolve | `eas config --profile preview --platform ios --json` → `{"policy":"fingerprint"}` and the `updates` block |
| `{"policy":"fingerprint"}` is valid on SDK 57 | live app-config schema, `definitions.RuntimeVersion` |
| EAS env `production` holds `EXPO_PUBLIC_API_ORIGIN` + `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; `preview` and `development` hold **nothing** | `eas env:list production` / `preview` / `development` |
| ~~The repo has two lockfiles~~ → **One lockfile** (corrected 2026-08-19) | `package-lock.json` (tracked) is the only lockfile in the tree: `find . -name pnpm-lock.yaml -not -path '*/node_modules/*'` returns nothing, tracked or untracked, and no `yarn.lock` exists either. `package-lock.json` resolves `expo` to `57.0.9`, matching `package.json`'s `~57.0.9` range — not `57.0.12`. Where the `57.0.12` figure came from is **not established** — `git log --all -- pnpm-lock.yaml` is empty (the file was never tracked, so no cleanup is observable in history) and this pass found no evidence either way. Recorded as unexplained rather than guessed at. |
| 31 of 40 fingerprint sources resolve outside the project root in a worktree | `eas fingerprint:generate --platform ios --build-profile preview --json --non-interactive` |

**Builds 27 and 28 can never take an update.** They shipped without an updates client
and carry no runtimeVersion. The first OTA-capable binary is the next one you build.

### What this branch changed

`app.json` — added a top-level `runtimeVersion` and an `updates` block:

```json
"runtimeVersion": { "policy": "fingerprint" },
"updates": {
  "url": "https://u.expo.dev/c45b4abf-8c8e-4bb6-b977-b258d632436e",
  "checkAutomatically": "NEVER",
  "fallbackToCacheTimeout": 0
}
```

`app.config.js` spreads `...appJson.expo` and overrides only `android`, so both keys
carry through untouched — verified, don't re-derive it.

`eas.json` — **exactly two inserted lines**, both a `channel` at the top of a build
profile (`"channel": "preview"` in `preview`, `"channel": "production"` in
`production`). Nothing else in that file was touched. Stated explicitly because
another branch is editing `eas.json` concurrently — and because `eas.json` is itself a
fingerprint input, so whatever that merge produces changes the runtime version.

Nothing here installs `expo-updates`. That is a `package.json` + lockfile change and
belongs to the owner, from the repo root — see [P2](#p2--install-the-updates-client).

### Why `checkAutomatically: "NEVER"`

`ON_LOAD` is the Expo default, and it means the app can silently swap bundles on the
next cold launch, mid-shift, with nobody deciding. On an app that carries Code Blue,
an ambient unattended bundle swap is not acceptable. `NEVER` means **nothing checks
unless code asks** — which is why [P3](#p3--build-the-observable-not-optional) is not
optional. Without an app-controlled trigger, Step 3 can never pass, and you will
misread that as OTA being broken.

---

## Preconditions

Do these in order. Steps 1-5 are not runnable until all of them are done.

### P0 — Run everything from the repo root

```text
the RN migration checkout
```

**Never publish an update from a git worktree.** With `policy: fingerprint`, the
runtime version is a hash over the project's native inputs — and most of those inputs
live in `node_modules`. Measured in this worktree, whose `node_modules` is a symlink
into the main checkout: **31 of 40 fingerprint sources resolved outside the project
root** (`eas fingerprint:generate --platform ios --build-profile preview --json`,
counting `filePath` entries beginning with `..`). Byte-identical `app.json` /
`package.json` / `eas.json` have been observed producing two different hashes from the
two locations. Publishing from a worktree yields a runtimeVersion **no binary
carries**, and the update silently reaches nobody — the hardest failure mode to
diagnose, because every command reports success. This document was itself written
inside a worktree; the rule exists because this whole program runs agents in
`wt-audit/w*` and `.claude/worktrees/`.

### What the fingerprint actually hashes

Enumerated from a real run, not from memory. Sources, by reason:

| Input | Reason tag |
| --- | --- |
| `.gitignore` | `bareGitIgnore` |
| **`eas.json`** | `easBuild` |
| `assets/icon.png` | `expoConfigExternalFile` |
| `patches/` | `patchPackage` |
| 31 autolinking directories under `node_modules` | `expoAutolinkingIos`, `rncoreAutolinkingIos` |
| the resolved app config | `expoConfig` |
| the `react-native` package + `package.json` `scripts` | `package:react-native`, `packageJson:scripts` |

Three consequences that bite:

- **`eas.json` is a fingerprint input.** Editing it between the build and the publish
  moves the runtime version and silently breaks delivery. Another branch is editing
  `eas.json` concurrently — rebuild after any merge that touches it.
- **The resolved dependency tree is an input** (31 of 40 sources). This is why
  [P1](#p1--one-authoritative-lockfile) is a precondition and not housekeeping.
- **Application JS is not an input.** Nothing under `src/` appeared in the source list.
  That is exactly why a JS fix can reach an existing binary — and exactly why a native
  change cannot.

### P1 — One authoritative lockfile

An untracked `pnpm-lock.yaml` sits beside the tracked `package-lock.json`. The
tracked lockfile resolves `expo@57.0.9`; the installed tree is `57.0.12`; EAS cloud
installs a third tree neither local state predicts. **A fingerprint is only
reproducible when the dependency graph is.** Delete or commit one lockfile, reinstall
clean, and confirm `require('expo/package.json').version` matches the lockfile before
going further.

### P2 — Install the updates client

> **DONE 2026-08-19 — no action left here.** `expo-updates` was installed by commit `017ae43`
> (2026-08-18 21:50); `package.json:29` now pins `~57.0.15`. The steps below are kept as the record of
> what was run. See the corrected first row of the verified-state table above.

```bash
cd "/absolute/path/to/VetTrack-RN-Migration"   # <-- replace with your checkout
npx expo install expo-updates
```

This rewrites `package.json` and the lockfile. Do it once, from the repo root, on a
branch — not from a worktree, and not in parallel with other dependency work.

### P3 — Build the observable (NOT optional)

Without a mechanical readout, Steps 3, 4 and 5 are unfalsifiable — "nothing changed"
and "I didn't look hard enough" produce the same screenshot. Step 5 is worst: it
asserts an *absence*.

**Do not put this behind a debug screen.** `src/screens/menu/menu-routes.ts` gates
`DEBUG_LAUNCHERS` on `__DEV__` (see its header comment), and every build in this test
is a release-config build where `__DEV__` is `false`. A debug-screen readout would be
invisible in exactly the builds that matter, and you would burn a full build cycle
finding that out.

Put the rows on **Settings → About**, which is release-visible and already renders a
`selectable` version line (`src/screens/SettingsScreen.tsx`, the About card). Render,
each on its own selectable line:

| Field | Source |
| --- | --- |
| Update ID | `Updates.updateId` |
| Created at | `Updates.createdAt` |
| Embedded launch? | `Updates.isEmbeddedLaunch` |
| Channel | `Updates.channel` |
| Runtime version | `Updates.runtimeVersion` |

Plus two buttons:

- **Check for update now** → `await Updates.checkForUpdateAsync()`, then
  `await Updates.fetchUpdateAsync()` if `isAvailable`. Show the raw result.
- **Apply now (reload)** → `await Updates.reloadAsync()`.

Keep them separate. Merging them hides the two-phase behaviour that Step 3 exists to
demonstrate. Note that `expo-updates` is **inert in Expo Go and in a dev build** — if
you try this against `expo start`, every field reads empty and every step looks
broken.

Also update the caveat in `src/lib/app-version.ts` (module header, and the
`getRunningAppVersion` doc comment): once `expo-updates` is installed,
`Constants.expoConfig` is served from the downloaded update manifest, so it stops
meaning "the installed binary's version". The binary version is
`expo-application`'s `nativeApplicationVersion`.

### P4 — Decide the build number before you build

`eas.json` sets `appVersionSource: "local"` with `autoIncrement: false` on every
profile, and nothing in this repo bumps a version. `refusesDuplicateBuildNumber`
(`scripts/release-config/checks.js`) already refuses the current `ios.buildNumber`
of `28` as ALREADY CONSUMED.

Raise `ios.buildNumber` to `"29"` and `android.versionCode` to `10301` before the
acceptance build. **`eas build:list` is not filtered by profile**, so the internal
preview build you are about to make consumes that number for good — the next
production build must go above it. Leave `expo.version` alone; the `fingerprint`
policy does not read it.

### P5 — Decide code signing before you build, not after

Update code signing (`updates.codeSigningCertificate` / `codeSigningMetadata`, both
present in the live SDK 57 schema) embeds a certificate **in the binary**. It is a
build-time gate: if you want signed updates and skip it now, you wait for the *next*
build to get them.

For an app that carries Code Blue onto a ward device, sign the updates — without it,
the integrity of what lands there rests entirely on transport plus Expo account
control. But run this acceptance pass **unsigned first**: fewer moving parts, and a
failure is unambiguous. Once enabled, every `eas update` and every rollback command
needs `--private-key-path`.

**An unsigned pass does not transfer to a signed build.** The resolved app config is
a fingerprint input, so adding `codeSigningCertificate` to `app.json` **changes the
runtime version** — the signed binary is a different runtime, running a
differently-configured updates client, with an untested rollback path. If you enable
signing, **Steps 1–5 must be re-run against the signed build**, and the result log
records which one was tested. A green log against an unsigned binary is not a
sign-off for the binary that goes to the ward.

### P6 — `--environment production` on every publish, always

`eas update` requires `--environment` on SDK 55+. **`production` is the only EAS
environment that holds this project's variables** — `preview` and `development` are
empty (verified). `EXPO_PUBLIC_*` values are inlined into the JS bundle at bundle
time, so publishing with `--environment preview` ships a bundle with no API origin
and no Clerk key. The update would deliver perfectly and the app would be dead on
arrival: no data, no sign-in. Every command in this document therefore says
`--environment production`, on every channel. That is deliberate, not a copy-paste
slip.

---

## Shared setup

Run once per session, from the repo root:

```bash
cd "/absolute/path/to/VetTrack-RN-Migration"   # <-- replace with your checkout
export BRANCH=preview
export CHANNEL=preview
eas whoami            # expect: exposwifty31
```

The acceptance run uses the **preview** channel and internal distribution, because
the whole claim under test is "an installed build takes it *without a store
submission*". Do not rehearse this on `production`.

---

## Step 1 — Build and install a binary on the channel

```bash
eas build --platform ios --profile preview
```

Install the resulting build on a real device via the internal-distribution link on
the build page (`eas build:view`). Note that `eas build:run` is **not** the tool
here — it runs *simulator/emulator* builds only, per its own help. Do the same for
Android if that lane is in scope.

**Then, before publishing anything, record the baseline** from Settings → About:

- `Channel` reads `preview`
- `Runtime version` reads a fingerprint hash (a long hex string, not `1.3.0`)
- `Embedded launch?` reads **true**
- `Update ID` — write it down; this is the value every later step compares against

Confirm the app **works**: it reaches the API and you can sign in. The `preview`
profile declares no `environment` key, so it is not certain to inherit the
server-side variables the way `production` does.

**PASS:** all five fields populated, `Embedded launch? = true`, app functional.

**FAILURE looks like:**

| Symptom | Meaning |
| --- | --- |
| Fields blank / `Updates.channel` is `null` | The build did not pick up `channel` or the `updates` block. Re-check `eas config --profile preview --platform ios --json`. |
| Runtime version reads `1.3.0` | The `fingerprint` policy did not apply — something is overriding `runtimeVersion`. Stop; every later step is meaningless. |
| App loads but shows no data / cannot sign in | The env-variable hole from **P6**, at build level. Add `"environment": "production"` to the `preview` profile in `eas.json`, or populate the `preview` environment. Fix before Step 2 — otherwise Step 3 is unreadable. |
| `eas build` refuses on the build number | P4 was skipped. |

---

## Step 2 — Publish a visible no-op through the channel

Make one trivial, unmistakable, **JS-only** change. Recommended: a marker constant
the About card renders next to the update ID.

```ts
export const OTA_MARKER = "ota-marker-A";   // change to "ota-marker-B"
```

Editing files under `src/**` does **not** change the fingerprint (verified — see
[What the fingerprint actually hashes](#what-the-fingerprint-actually-hashes)). That
is precisely why this update can reach the binary from Step 1. Confirm it before
publishing:

```bash
eas fingerprint:generate --platform ios --build-profile preview \
  --json --non-interactive | jq -r '.hash'
```

The hash must **equal** the `Runtime version` you recorded in Step 1. If it does not,
stop — something moved a native input (most likely `eas.json`, which is a fingerprint
source) since the build.

```bash
eas update --branch "$BRANCH" --channel "$CHANNEL" \
  --environment production \
  --message "acceptance: no-op marker B"
```

**PASS:** the command prints an update group ID and a runtime version equal to the
binary's. Confirm independently:

```bash
eas update:list --branch "$BRANCH" --json --non-interactive \
  | jq -r '.currentPage[0] | "\(.group)  rt=\(.runtimeVersion)  \(.message)"'
```

**FAILURE looks like:**

| Symptom | Meaning |
| --- | --- |
| `eas fingerprint:generate` hash ≠ the binary's runtime version | You are publishing to a runtime no binary carries. Almost always **P0** — you are in a worktree. Nothing will be delivered and nothing will report an error. |
| Command errors asking for `--environment` | P6. |
| Published runtime version differs from Step 1's | Same as row 1. Do not proceed; fix, republish. |

---

## Step 3 — Confirm the installed build takes it

**This step is two-phase. Read this paragraph before you decide it failed.** A check
downloads the bundle; the bundle only becomes the running code on the next JS
reload. Expected sequence: tap **Check for update now** → result reports available,
download completes in seconds to tens of seconds → **the screen still shows
`ota-marker-A`** → tap **Apply now (reload)** → app reloads → marker reads
`ota-marker-B`.

Seeing the old marker after a successful download is **correct**, not a failure.

On the device:

1. Foreground the app, go to Settings → About.
2. Tap **Check for update now**. Expect `isAvailable: true`.
3. Tap **Apply now (reload)**.
4. Read the card again.

**PASS, all four together:**

- Marker reads `ota-marker-B`
- `Update ID` **differs** from the Step 1 baseline and **matches this platform's
  update inside the group published in Step 2** — `Updates.updateId` is the
  platform-specific id and is never the group id, so comparing it against the
  group value fails on a correct run. Resolve the group first:
  `eas update:view "$GRP" --json | jq -r '.updates[] | select(.platform=="ios") | .id'`
  (swap `"android"` on the Pixel).
- `Embedded launch?` now reads **false**
- `Runtime version` is **unchanged**

**FAILURE looks like:**

| Symptom | Meaning |
| --- | --- |
| `checkForUpdateAsync()` returns `isAvailable: false` | Runtime mismatch (Step 2 row 1), wrong channel, or the channel is paused. Check `eas channel:view preview`. |
| Nothing happens on tap, no error | `checkAutomatically: "NEVER"` is working as designed and your button is not wired. This is a P3 defect, not an OTA defect. |
| Downloads but marker never changes after reload | The update applied but carries the old bundle — you published before saving the edit, or `--skip-bundler` was used. |
| Update ID changes but the app is now broken/blank | Almost certainly the P6 env hole at *publish* level. Roll back (Step 4) and republish with `--environment production`. |

**Do not use `eas update:insights` to decide this step.** Installs register on the
device's *next* update check — up to 24h later — and a fresh publish shows zeros.
Insights is a lagging secondary signal. The device screen is the primary one.

---

## Step 4 — Publish a deliberately broken update and roll it back

An untested rollback is not a rollback. Do this on `preview`, on a device you can
reinstall, and never for the first time during a real incident.

**4a. Break it on purpose.** Something loud, immediate, and unambiguous — a thrown
error on the Home screen render, or the marker changed to `ota-marker-BROKEN` plus a
visible banner. Prefer a *visible* break over a launch crash for the first rehearsal:
a launch crash is harder to observe and harder to recover from on-device.

```bash
eas update --branch "$BRANCH" --channel "$CHANNEL" \
  --environment production \
  --message "acceptance: DELIBERATE BREAK - do not leave live"
```

Deliver it to the device exactly as in Step 3. Confirm the break is visible. **Write
down the update group ID.**

**4b. Stop the bleeding first.** Before publishing anything, pause the channel. It is
instant, reversible, and publishes nothing:

```bash
eas channel:pause "$CHANNEL"
```

This belongs *above* rollback in any real incident: it stops new devices taking the
bad bundle while you decide.

**4c. Roll back to the embedded bundle.** For a clinical incident this is the right
lever — the embedded bundle shipped inside the binary, passed store review, and is
the best-understood state on the device.

```bash
RT=$(eas update:list --branch "$BRANCH" --json --non-interactive \
      | jq -r '.currentPage[0].runtimeVersion')
echo "$RT"

eas update:roll-back-to-embedded \
  --branch "$BRANCH" --channel "$CHANNEL" \
  --runtime-version "$RT" \
  --message "acceptance: rollback to embedded"
```

**Do not reach for `eas update:rollback` here.** Its own help: *"The update group
published before it is republished; if there is none, a roll back to the embedded
update is published."* You do not choose — it republishes the previous group, which
during a real incident may be a bundle you have not tested. Quoted so nobody
re-litigates this at 3am. `eas update:republish` is the deliberate form of the same
thing: use it only when you can name a specific known-good update.

Note that `--runtime-version` under the `fingerprint` policy is a hash a human must
look up mid-incident. That retrieval one-liner is part of the runbook, not a detail.

**4d. Resume and verify.**

```bash
eas channel:resume "$CHANNEL"
```

On the device: check, apply, read the card.

**PASS:** the break is gone, and `Embedded launch?` reads **true** again (or
`Update ID` matches the rollback group). The app is functional.

**FAILURE looks like:**

| Symptom | Meaning |
| --- | --- |
| `roll-back-to-embedded` errors on runtime version | The `$RT` lookup returned the wrong hash — read it from `eas update:list`, not from memory. |
| The rollback publish is rejected because the channel is paused | Unverified branch — whether EAS accepts a publish to a paused channel was not tested here, and the first time you find out must not be during an incident. If it rejects: `eas channel:resume` first, then roll back, accepting a brief window in which new devices can still take the bad bundle. Record which behaviour you saw in the log below. |
| Break persists after rollback + reload | The device did not fetch. Re-check; if it still persists, the rollback published to a different runtime or branch. |
| App crashes on launch and cannot be recovered on-device | The unrecoverable case — see below. Reinstall the binary. |
| Data looks wrong *after* a successful rollback | The local-state hazard below. Do not dismiss this; it is the reason this rehearsal exists. |

### The rollback caveat that is not boilerplate

Expo's own warning is that rolling back *"may not always be safe; your broken update
may, for example, have modified persistent state ... in a non-backwards-compatible
way."* **This app has exactly that exposure**: an offline sync queue and local
persistence. An update that migrates a queued row or a stored shape forward, then
gets rolled back to a bundle that cannot read it, turns a JS bug into local data
corruption on a ward device.

So: rehearse the rollback against a device with **real state** — signed in, with
queued offline work pending — not a fresh install. And record in the log below what
happened to that state. Any real incident runbook must include restoring or clearing
local state as a step, not as an afterthought.

### The case no configuration fixes

A bad update that crashes on launch *before first render*, on a device with no
network, cannot download a fix and cannot always recover locally. Expo's local
fallback only applies to a first-launch pre-render crash, and only if an older good
update is present on the device. On a device whose only prior state is the embedded
bundle, `useEmbeddedUpdate` (default `true`, left at default here) is what saves it.
Recovery of last resort is uninstall and reinstall — which on a ward device means a
human physically walking to it.

---

## Step 5 — Confirm an update does NOT reach an incompatible binary

**This step reads backwards: NOT delivering is the PASS.** This is the failure mode
that crashes the field — an update judged compatible with a binary that cannot run
it — and it must be demonstrated, not assumed.

Keep the Step 1 binary installed and untouched. Now change a **native** input so the
fingerprint moves. The cheapest honest change is a package this repo already wants
(`src/lib/app-version.ts` names it):

```bash
npx expo install expo-application
eas fingerprint:generate --platform ios --build-profile preview \
  --json --non-interactive | jq -r '.hash'
```

The printed hash must now **differ** from the binary's `Runtime version`. If it does
not, the change was not native-affecting — pick another one and re-check. Do not
publish until the hash has actually moved.

```bash
eas update --branch "$BRANCH" --channel "$CHANNEL" \
  --environment production \
  --message "acceptance: incompatible runtime - must NOT deliver"
```

Prove the mismatch mechanically, off-device. `fingerprint:compare --update-id` wants a
**platform-specific** update id, and `update:list` returns update *groups* — so
resolve the group to its iOS update first:

```bash
GRP=$(eas update:list --branch "$BRANCH" --json --non-interactive \
        | jq -r '.currentPage[0].group')   # a GROUP id, shared across platforms
UPD=$(eas update:view "$GRP" --json \
        | jq -r '.updates[] | select(.platform=="ios") | .id')

eas fingerprint:compare --build-id <STEP-1-BUILD-ID> --update-id "$UPD"
```

Get `<STEP-1-BUILD-ID>` from
`eas build:list --platform ios --limit 5 --json --non-interactive | jq -r '.[].id'`.

Then on the device: tap **Check for update now**.

**PASS, all three together:**

- `eas fingerprint:compare` reports the two fingerprints **differ**
- `checkForUpdateAsync()` returns `isAvailable: false`
- `Update ID` on the card is **unchanged** after the check

**FAILURE looks like:**

| Symptom | Meaning |
| --- | --- |
| The device downloads and applies it | **Critical.** The runtime gate is not working. Stop all OTA use and re-examine `runtimeVersion` before anything reaches a ward. This is the crash-in-the-field scenario. |
| `fingerprint:compare` says they match | The change was not native-affecting; the test did not test anything. Pick a different change. |
| `isAvailable: false` but fingerprints match | You proved nothing — it did not deliver for some *other* reason (paused channel, wrong branch). Ambiguous result; re-run. |

**Clean up:** revert the native change if `expo-application` is not being kept, and
delete or roll back the incompatible update so it cannot confuse a later run.

---

## Timing and the Code Blue gate

Check and apply are separate, and the worst case is their **sum**: time-to-next-check
plus time-to-next-clinically-safe-reload. `reloadAsync()` tears down the SSE
connection and all in-memory state, so it must **never** fire during an active arrest.

The shipped trigger — the one to build after this acceptance pass, not for the
acceptance pass itself — is an explicit app-controlled check on **cold launch** and on
**foreground-after-idle** (resumed after N minutes backgrounded), both hard-gated on
no active arrest. The gating signal already exists: `activeCodeBlueSessionId` on the
SSE keepalive (`src/core/ports/realtime.port.ts`, `RealtimeKeepalive`) — check and
apply only when it is `null`.

Do **not** hang the check on sign-in: a shared ward tablet stays signed in for days,
which leaves the window unbounded.

**Worst case, stated honestly:** a device that is backgrounded and never cold-launched,
or offline, or inside a running Code Blue, does not check. On a ward tablet that stays
foregrounded through a shift, the realistic bound is **one shift boundary**. Offline
devices are unbounded until they regain network. No configuration beats this without
reintroducing the ambient mid-shift swap that `NEVER` exists to prevent.

---

## Incident runbook (after this test has passed, not before)

1. **Pause.** `eas channel:pause production` — instant, reversible, publishes nothing.
2. **Identify.** `eas update:list --branch production --json --non-interactive | jq '.currentPage[0]'` — note `group` and `runtimeVersion`.
3. **Roll back to embedded.** `eas update:roll-back-to-embedded --branch production --channel production --runtime-version "<RT>" --message "incident: rollback"`.
4. **Resume.** `eas channel:resume production`.
5. **Check local state.** Whatever the bad bundle may have written to the sync queue or local storage. This is a step, not a footnote.
6. **Devices that are offline or mid-arrest have not recovered yet.** Track them; the bound is a shift boundary, not minutes.

---

## Result log

Fill this in. An empty log means the capability is unproven.

| Step | Date | Platform | Build # | Signed? | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 — build installed on channel | | | | ☐ yes ☐ no | ☐ PASS ☐ FAIL | baseline update ID: |
| 2 — no-op published | | | | ☐ yes ☐ no | ☐ PASS ☐ FAIL | group ID: |
| 3 — installed build took it | | | | ☐ yes ☐ no | ☐ PASS ☐ FAIL | time check→applied: |
| 4 — broken update rolled back | | | | ☐ yes ☐ no | ☐ PASS ☐ FAIL | local state after rollback: |
| 5 — incompatible runtime blocked | | | | ☐ yes ☐ no | ☐ PASS ☐ FAIL | fingerprint:compare output: |

The **Signed?** column is not bookkeeping. Enabling code signing changes the runtime
version, so a pass recorded against an unsigned binary does not cover the signed one
— see [P5](#p5--decide-code-signing-before-you-build-not-after). Run the table twice
if you sign.

**Signed off by:** ______________  **Date:** ____________

Until every row reads PASS, against the binary you actually intend to ship, OTA is
configuration.
