# Release config, and how it checks itself

Three facts govern whether a build reaches a store, and until now none of them
was checkable from this repository:

1. The launch-critical environment variables are **not in this repo at all**.
   They live in EAS's server-side environment store. Delete one there and every
   <!-- vt-claim: attested eas-production-env -->
   check here stays green.
2. **Nothing increments a build number.** `eas.json` sets
   `cli.appVersionSource: "local"` with `autoIncrement: false` on every profile,
   and no workflow touches a version. The number is whatever a human last typed.
3. `app.json` promises `autoVerify: true` for Android App Links. Whether that
   promise holds depends on a JSON document served by a **different repository's**
   production deploy.

`scripts/release-preflight.mjs` checks all three.

```bash
npm run release:preflight:offline   # no credentials, no network — runs on every PR
npm run release:preflight           # everything; needs an EAS session or EXPO_TOKEN
gh workflow run release-preflight.yml   # the same full run, in CI
```

The pure rules live in `scripts/release-config/checks.js` and are proved by
`src/__tests__/release-config-checks.test.ts`, which feeds each one a
deliberately broken input and asserts it refuses. A check that has only ever
seen good input is untested.

**No value is ever printed.** The preflight parses `eas env:list` for NAMES only,
uses them purely as a membership test, and prints only names derived from this
repo's own source scan. It never passes `--include-sensitive` or
`--include-file-content`, and it redacts CLI stderr before echoing it.

---

## (A) EAS environment drift

`scripts/release-config/env-contract.js` is the single source of truth. The
**names** are derived from the source — a TypeScript AST walk over `src/` +
`App.tsx` + `index.ts` for `EXPO_PUBLIC_*`, plus a second walk over
`app.config.js` for every `process.env.*` it reads. Add a new read anywhere and
the name appears with no edit. The **disposition** of each name is declared by a
human, because no local check can read EAS's store.

Requirements are scoped **per environment**. `EXPO_PUBLIC_API_ORIGIN` being
absent from `preview`/`development` is correct — a local `.env` supplies it
there — and a flat "required everywhere" set would go permanently red.

Verified against the live store 2026-08-18 (eas-cli 22.0.0): `production` holds
three names, `preview` and `development` hold zero.

### Known gap — Android on preview/development

`GOOGLE_SERVICES_JSON` exists **only** in the `production` environment.
`app.config.js` sets `android.googleServicesFile` from it and falls back to
`./google-services.json`, which is gitignored and absent from a clean checkout.

~~*Mechanism, not an observation* — zero Android builds have ever run on this EAS
project, so there is no empirical data point.~~ An Android build on `preview` or
`development` resolves an environment with no variables and should fail at
**config resolution (build time)**, not at launch.

*Corrected 2026-08-22 — there is an empirical data point now, and the mechanism was
right.* `npx expo prebuild -p android --no-install` on a clean checkout with no
`GOOGLE_SERVICES_JSON` in the environment fails exactly where predicted, in the
config-plugin phase rather than at launch:

```text
[android.dangerous]: withAndroidDangerousBaseMod: Cannot copy google-services.json
```

It fails **late** — the Android project is written first, and only the dangerous mod
throws — so the tree is left holding a half-configured `android/` that a subsequent
command will happily build against. That is the part worth knowing before the first
AAB: the failure is loud, but what it leaves behind is not.

It is registered as a reported gap rather than a requirement: failing every build
for an unexercised path is the false alarm that teaches people to ignore red.
The preflight prints it on every run. To fix, upload the same file to the
`preview` and `development` environments and move those two names out of
`knownGapEnvironments` into `environments`.

Do both halves in the same change. `unregisteredInStore` counts names the store
holds that are not *required* for that environment, and a gap entry is not
required — so uploading the file without moving the registry entry makes
`preview` report `unregisteredInStore=1` while still printing the gap. That is
remediation working, not drift, but it reads like noise.

---

## (B) Build-number collision

Finding as of 2026-08-18 — **closed 2026-08-21**, see (B1) below:

```text
ios      local=28 priorBuilds=2 highestConsumed=28 -> REFUSED
android  local=10300 priorBuilds=0 highestConsumed=none -> ok
```

`app.json` carried `ios.buildNumber` ~~`"28"`~~, and EAS had already produced
builds 27 and 28 (both v1.3.0, `production`). Nothing bumps it, so the next
production build would have shipped a duplicate `CFBundleVersion` and App Store
Connect would have rejected it **at upload — after the build minutes are spent.**
Android was the same defect with no collision yet: `versionCode` sat at
~~`10300`~~ and had simply never been challenged, because no AAB has ever been
uploaded.

Two fixes, owner's call:

- **Immediate:** raise `ios.buildNumber` above `"28"` in `app.json`.
- **Durable:** migrate `eas.json` to `cli.appVersionSource: "remote"` and let EAS
  own the counter. Note that `autoIncrement: true` under the current `"local"`
  source is *not* a CI fix. Expo's own documentation
  ([build-reference/app-versions](https://docs.expo.dev/build-reference/app-versions/),
  Local version source → Limitations) states: "With `autoIncrement`, you need to
  commit your changes on every build if you want the version change to persist.
  This can be difficult to coordinate when building on CI."

  The dynamic config is **not** the obstacle here — `@expo/config` writes a
  version into the static `app.json` and re-reads it through `app.config.js`,
  and ours only overrides `android.googleServicesFile`, so a bump would survive.
  Persistence back to git is the obstacle.

The gate was deliberately left refusing rather than "fixed" by bumping, because
bumping is a release decision and it would have left the gate with nothing to
show it closing. **The owner took that decision on 2026-08-21**: `app.json` now
carries `ios.buildNumber: "29"` and `android.versionCode: 10301`, and the gate
keeps something to show — (B1) below, which is what the bump actually closed.

The durable fix stays open and stays owner's call. `appVersionSource: "remote"`
is deferred until after the first submission: changing who owns the counter in
the middle of getting a build accepted swaps one known problem for an unknown
one.

---

## (B1) Shipped-build floor — the offline oracle

(B) needs `eas build:list`, which needs network and credentials. `--offline` is
the mode CI runs **on every PR**, and it skipped (B) entirely and printed a note
saying so. A gate that only runs in the mode nobody runs is not a gate — that,
not EAS blindness, was the real defect here.

`scripts/release-config/ios-shipped-build-floor` records the highest build number
App Store Connect has **accepted**. Nothing offline can ask ASC, so a human
maintains it. `parseShippedBuildFloor` (`scripts/release-config/checks.js`) reads
it and `checkShippedBuildFloor()` (`scripts/release-preflight.mjs`) compares
`app.json` against it, in **both** modes — it carries something EAS cannot,
namely what was accepted rather than what was merely built.

Three rules, each proved by a refusal in `src/__tests__/release-config-checks.test.ts`:

- **Malformed fails hard.** A hand-maintained file rots, and the dangerous
  failure is not a stale number — it is a corrupted one that lets the gate pass
  while comparing against nothing.
- **Absent is a stated no-op, not a pass.** The run prints `floor=none recorded`
  and adds a note. A silent skip and a passing check look identical from
  outside, and only one of them is honest.
- **One counter, two lanes.** This app and the Capacitor shell share bundle id
  `uk.vettrack.app`, so they share one `CFBundleVersion` counter. Raise the floor
  when App Store Connect **accepts** a build from **either** lane — not on upload,
  and not on a rejection — then raise the other lane's local number above it. A safety net that trips on a number collision during an
  incident is the worst failure mode this file has.

### Forward numbering — decided here, not at submission

Where both lanes actually stand, read from their own files rather than recalled:

| Lane | Local number | Recorded as shipped |
|---|---|---|
| this repo (Expo) | `app.json` — `ios.buildNumber "29"`, `android.versionCode 10301` | `scripts/release-config/ios-shipped-build-floor` = 28 |
| Capacitor shell | `CURRENT_PROJECT_VERSION = 29` in `vettrack/ios/App/App.xcodeproj/project.pbxproj` | `vettrack/ios/.last-shipped-build` = 28 |

**29 is already claimed by the Capacitor lane.** So the acceptance run in
`docs/ota-acceptance.md` — `preview` profile, internal distribution — spends
29 / 10301 and never reaches App Store Connect. `eas build:list` is **not**
filtered by profile, so an internal build consumes the number in the EAS oracle
exactly as a production one does, and permanently.

**The submission build is therefore 30 / 10302.** Nothing has to remember that:
once 29 is consumed, the full run's `checkBuildNumbers()` refuses it unaided.
It is written down so the number is settled before the build minutes are spent
rather than discovered at upload.

**29 / 30 holds only while App Store Connect has not accepted the Capacitor
lane's 29.** It is claimed locally there, not shipped —
`vettrack/ios/.last-shipped-build` is still 28. The moment ASC accepts it, the
floor in this repo becomes 29 and
`checkShippedBuildFloor()` REFUSES `app.json`'s `"29"`, because it requires the
local number to be strictly above the floor. So the two lanes are ordered, not
independent:

| Order | Acceptance (preview) | Submission |
|---|---|---|
| Expo preview first *(the plan)* | 29 / 10301 | 30 / 10302 |
| ASC accepts Capacitor's 29 first | 30 / 10302 | 31 / 10303 |

Either order is safe; only the first is written down elsewhere. If ASC accepts the
Capacitor lane's 29 before the acceptance run, raise the floor here to 29 **and** move
`app.json` to 30 before building, and read every 29/30 in
`docs/ota-acceptance.md` as 30/31. The gate will catch it either way — this note
exists so it is caught before the build minutes, not after.

**The floor mirrors App Store truth, and that truth is recorded twice** — as
`scripts/release-config/ios-shipped-build-floor` here and
`vettrack/ios/.last-shipped-build` in the Capacitor lane. Each lane's gate reads
its own copy (`checkShippedBuildFloor()` here;
`vettrack/scripts/verify-resubmission-static.sh` there), so the two must never hold different numbers.

**The trigger is App Store Connect ACCEPTING a build, not an upload.** The
acceptance run in `docs/ota-acceptance.md` is an internal `preview` build: it
uploads to EAS and permanently consumes the number there, but never reaches App
Store Connect. It must move **neither** shipped-build record. Raising a floor for
a build App Store Connect never saw burns the next number for nothing.

When App Store Connect does accept a build from either lane, three things move
together: set **both** records to the accepted number, then raise the *other*
lane's local number above it. Once this repo ships 30, both records read 30 and
the Capacitor lane goes from 29 to 31. Doing only part of it is what turns a
shared counter into a collision — and updating one record but not the other
re-creates that collision one gate later, because each lane checks its own copy.

---

## (C) Android App Links — standing blocker

`autoVerify: true` on `https://vettrack.uk/equipment` means Android fetches
`https://vettrack.uk/.well-known/assetlinks.json` at install time and links the
app only if that document names `uk.vettrack.app` **and** lists the SHA-256 of
the certificate the installed APK was signed with.

The document today serves exactly one fingerprint: the **Capacitor upload key**
(hardcoded as `UPLOAD_KEY_CERT_FINGERPRINT` in the vettrack repo at
`server/lib/well-known-assetlinks.ts`). A Play-delivered install is re-signed by
Google with the **Play App Signing key**, whose fingerprint is not served. So App
Links cannot verify for any store install, and **no keystore choice in this repo
changes that.**

The Play App Signing certificate does not exist yet — Google generates it at the
first AAB upload, and none has happened. The value is currently unobtainable.
That is why the preflight **reports** this and never fails on it: a gate that
blocks the very upload needed to satisfy it is not a gate.

Consequence while unresolved: a deep link opens the browser instead of the app.
It is not a review rejection and not a launch failure.

### The Play wait-state — what it blocks, and what it does not

The developer account is `danerez5@gmail.com`. It is a **personal** account, which
is what makes `docs/G3-PLAN.md` §7 P5 apply. Its **identity verification is in
flight with Google** (owner report, 2026-08-22; Google quoted days, not weeks).
Nothing in this repo shortens that queue.

The failure mode this table exists to prevent is treating the whole Android lane —
and by extension the whole store push — as blocked, when only one column of it is.

| Blocked until Google approves identity | Not blocked — do it now |
|---|---|
| The first AAB upload | The iOS store section: screenshots, metadata, age rating, privacy manifest |
| The Play App Signing SHA-256, and therefore App Links (steps 2–5 below) | The G3 owner protocol (`docs/g3-results.md` §5) on both devices |
| Recruiting into a track that does not exist yet | Diagnosing the push-subscribe failure (#98) |
| Applying for Android production access | Source control, the 3.0 document, and the tech-debt PRs |

Two things are worth starting **before** approval even though they belong to the
blocked column: lining up twelve people with real Android devices, and writing the
tester-facing instructions. Neither needs a Play account, and both are the part
that actually sets the date — the upload is half an hour, the fourteen days of
genuine use are not.

**Sequence once approval lands:** upload the AAB to `alpha` → Google approves the
release → ≥12 testers opt in → 14 continuous days of genuine use → only then apply
for production access.

### Owner actions, in order

1. **Blocked until Google finishes identity verification** (see the wait-state above). Then upload the first AAB. ~~(internal track is enough)~~ *Corrected 2026-08-22:* internal is enough **for this step** — any upload generates the Play App Signing key. It is **not** enough for the closed-testing requirement in `docs/G3-PLAN.md` §7 P5, which only a **closed** track satisfies. ~~*Corrected later the same day:* the replacement account is **not registered yet**, so account type is not a fact.~~ *Settled 2026-08-22:* the replacement account is `danerez5@gmail.com` and it is **personal**, so P5 applies and the closed track is not merely the safe choice but the required one. Upload to `alpha`; upload to `internal` and the 14-day clock silently never starts.
2. Play Console → your app → **Test and release → Setup → App integrity → App
   signing** → copy the *App signing key certificate* SHA-256 (upper-case,
   colon-separated). The same page emits a ready-made Digital Asset Links JSON
   snippet.
3. In the **vettrack** repo's Railway prod service set
   `ANDROID_PLAY_SIGNING_SHA256=<that SHA-256>` and redeploy.
   `server/lib/well-known-assetlinks.ts` appends it additively; the upload-key
   entry is never dropped. (Its absence today is *why* only one fingerprint is
   served.)
4. Add the fingerprint to `EXPECTED_FINGERPRINTS` in
   `scripts/release-config/android-app-links.js` so the preflight starts
   enforcing it, and delete the blocker.
5. Verify with Google's own checker — no credentials needed:

   ```bash
   curl -sG https://digitalassetlinks.googleapis.com/v1/assetlinks:check \
     --data-urlencode 'source.web.site=https://vettrack.uk' \
     --data-urlencode 'relation=delegate_permission/common.handle_all_urls' \
     --data-urlencode 'target.android_app.package_name=uk.vettrack.app' \
     --data-urlencode 'target.android_app.certificate.sha256_fingerprint=<SHA-256>'
   ```

   A linked pair returns `{"linked": true, ...}`. An unlinked one returns a body
   with **no `linked` field at all** — it does not return `linked: false`, so
   grepping for `false` will mislead you.

### Side note on RN signing

`eas build:list --platform android` returns zero builds, and no release keystore
or `credentials.json` exists on disk, so the RN Android build will be signed by a
newly generated EAS-managed upload key — also not the served fingerprint.
Importing `~/keystores/vettrack-upload.jks` through `eas credentials` would make
locally-installed upload-signed RN builds verify against the file as served
today. It does nothing for store installs, which is the case that matters.

The iOS counterpart is fine: `https://vettrack.uk/.well-known/apple-app-site-association`
returns 200 with `appIDs: ["87F5G378M6.uk.vettrack.app"]` and path `/equipment/*`,
matching `app.json`. The asymmetry is Android-only.

---

## CI wiring

| Where | Trigger | Covers |
|---|---|---|
| `ci.yml` → *Release config (offline half)* | every PR + push to main | env accounting, version-field sanity |
| `release-preflight.yml` | `workflow_dispatch` | (A) env drift, (B) build numbers, (C) app links |

The networked half is **dormant until the owner adds the secret**, and says so
loudly rather than skipping:

```bash
gh secret set EXPO_TOKEN --repo exposwifty31/VetTrack---RN-Migration-
# token from https://expo.dev/settings/access-tokens
```

Without `EXPO_TOKEN` the job **fails** with that command in its output. A "skip
when unauthenticated" branch would skip on every run and report green while
checking nothing.

---

## Verification record

Measured on `feat/w7-config`, 2026-08-18. Both numbers are from real runs, not
arithmetic.

| | Test Suites | Tests |
|---|---|---|
| Before (`154380c^`) | 116 passed | 1137 passed, 2 skipped (1139) |
| After (`154380c`) | 117 passed | 1161 passed, 2 skipped (1163) |

Delta: +1 suite (`src/__tests__/release-config-checks.test.ts`, 23 tests) and +1
test in `manifest-vs-code.test.ts` (`(a-shared-scan)`). `tsc --noEmit` exits 0
and `eslint . --max-warnings=0` exits 0 in both states.

`npm run release:preflight:offline` exits 0. `npm run release:preflight` exits 1
on the real `ios.buildNumber "28"` collision described above — that is the gate
working, not a broken gate.

**Correction.** The commit message on `154380c` states the before-count as
"116 suites / 1146". That number is wrong; the measured figure is 1137 passed /
1139 total, as shown above and as the immediately preceding commit
(`fdfdd605a`-lineage, "116 suites / 1137 tests") independently records. It is
corrected here rather than by amending the commit, because the commit message is
an immutable record and a stale number in one is indistinguishable from a
current one — the same reason `manifest-vs-code.test.ts` carries its CORRECTION
block instead of a quiet deletion.
