# Release config, and how it checks itself

Three facts govern whether a build reaches a store, and until now none of them
was checkable from this repository:

1. The launch-critical environment variables are **not in this repo at all**.
   They live in EAS's server-side environment store. Delete one there and every
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

*Mechanism, not an observation* — zero Android builds have ever run on this EAS
project, so there is no empirical data point. An Android build on `preview` or
`development` resolves an environment with no variables and should fail at
**config resolution (build time)**, not at launch.

It is registered as a reported gap rather than a requirement: failing every build
for an unexercised path is the false alarm that teaches people to ignore red.
The preflight prints it on every run. To fix, upload the same file to the
`preview` and `development` environments and move those two names out of
`knownGapEnvironments` into `environments`.

---

## (B) Build-number collision

Standing finding, live as of 2026-08-18:

```
ios      local=28 priorBuilds=2 highestConsumed=28 -> REFUSED
android  local=10300 priorBuilds=0 highestConsumed=none -> ok
```

`app.json` carries `ios.buildNumber: "28"`, and EAS has already produced builds
27 and 28 (both v1.3.0, `production`). Nothing bumps it, so the next production
build would ship a duplicate `CFBundleVersion` and App Store Connect would reject
it **at upload — after the build minutes are spent.** Android is the same defect
with no collision yet: `versionCode` is static at `10300` and has simply never
been challenged, because no AAB has ever been uploaded.

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

This gate was deliberately left refusing rather than "fixed" by bumping to 29:
bumping is a release decision, and it would leave the gate with nothing to show
it closing.

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

### Owner actions, in order

1. Upload the first AAB (internal track is enough).
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
