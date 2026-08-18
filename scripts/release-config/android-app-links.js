/**
 * Android App Links registry + the standing blocker, in one place.
 *
 * app.json declares `autoVerify: true` on the https://vettrack.uk/equipment
 * intent filter. That is a promise Android checks at install time: it fetches
 * https://vettrack.uk/.well-known/assetlinks.json and links the app only if the
 * document names our package AND lists the SHA-256 of the certificate the
 * INSTALLED APK was signed with.
 *
 * THE BLOCKER, STATED HONESTLY (see PLAY_APP_SIGNING_BLOCKER below): the served
 * file today carries exactly one fingerprint — the Capacitor UPLOAD key — and a
 * Play-delivered install is re-signed by Google with a different key whose
 * fingerprint is not served. So App Links cannot verify for any store install,
 * and no choice of keystore in this repo changes that.
 *
 * WHY THE BLOCKER IS REPORTED AND NEVER FATAL. The Play App Signing certificate
 * is CREATED BY GOOGLE at the first AAB upload — it does not exist yet. Failing
 * the release gate on it would block the very upload that produces it. A gate
 * that cannot be satisfied is not a gate; it is a permanent red light people
 * learn to walk through. It is printed on every run instead, with the exact
 * commands, so it cannot be missed and cannot be mistaken for a passing state.
 */

/**
 * Fingerprints the served document is EXPECTED to carry today. Not a wish list —
 * an entry here means "this certificate signs a build that exists, so the file
 * must authorize it". A missing one is a real, actionable failure.
 */
const EXPECTED_FINGERPRINTS = [
  {
    sha256:
      "93:34:4C:4B:9F:2D:22:CC:61:DA:0C:35:71:CF:98:E5:85:22:A3:0A:CA:B8:98:17:2A:28:E7:FC:9F:82:5C:83",
    label:
      "Capacitor upload key (~/keystores/vettrack-upload.jks) — hardcoded as " +
      "UPLOAD_KEY_CERT_FINGERPRINT in the vettrack repo at " +
      "server/lib/well-known-assetlinks.ts",
  },
];

/**
 * The standing blocker. Everything here is the diagnosis a future reader needs,
 * emitted by the preflight itself rather than filed in a document they would
 * have to know exists. docs/release-config.md mirrors it.
 */
const PLAY_APP_SIGNING_BLOCKER = {
  id: "play-app-signing-sha256",
  headline:
    "Android App Links cannot verify for ANY Play-delivered install of uk.vettrack.app.",
  diagnosis: [
    "app.json sets autoVerify: true on https://vettrack.uk/equipment.",
    "https://vettrack.uk/.well-known/assetlinks.json serves ONE fingerprint: the",
    "  Capacitor UPLOAD key. Google re-signs every Play-delivered install with the",
    "  Play App Signing key, whose fingerprint is NOT in that file.",
    "The Play App Signing certificate does not exist yet: no AAB has ever been",
    "  uploaded for this package, and Google generates that key at first upload.",
    "So the value is currently unobtainable — this is a sequencing blocker, not a",
    "  misconfiguration, and nothing in either repo can pre-empt it.",
    "Consequence while unresolved: a deep link opens the browser instead of the app.",
    "  It is NOT a store-review rejection and NOT a launch failure.",
  ],
  ownerActions: [
    "1. Upload the first AAB (any track, internal is enough).",
    "2. Play Console -> your app -> Test and release -> Setup -> App integrity ->",
    "   App signing -> copy the 'App signing key certificate' SHA-256 fingerprint",
    "   (upper-case, colon-separated). The same page also emits a ready-made",
    "   Digital Asset Links JSON snippet.",
    "3. In the VETTRACK repo's Railway prod service set:",
    "     ANDROID_PLAY_SIGNING_SHA256=<that SHA-256>",
    "   (server/lib/well-known-assetlinks.ts appends it additively; the upload-key",
    "   entry is never dropped) and redeploy.",
    "4. Add the same fingerprint to EXPECTED_FINGERPRINTS in this file so the",
    "   preflight starts enforcing it, and delete this blocker.",
    "5. Verify with Google's own checker (no credentials needed):",
    "     curl -sG https://digitalassetlinks.googleapis.com/v1/assetlinks:check \\",
    "       --data-urlencode 'source.web.site=https://vettrack.uk' \\",
    "       --data-urlencode 'relation=delegate_permission/common.handle_all_urls' \\",
    "       --data-urlencode 'target.android_app.package_name=uk.vettrack.app' \\",
    "       --data-urlencode 'target.android_app.certificate.sha256_fingerprint=<SHA-256>'",
    "   A linked pair returns {\"linked\": true, ...}; an unlinked one returns a body",
    "   with NO \"linked\" field at all (it does not return linked:false).",
  ],
  sideNote:
    "Separately: `eas build:list --platform android` returns zero builds and no " +
    "release keystore or credentials.json exists on disk, so the RN Android build " +
    "will be signed by a NEWLY GENERATED EAS-managed upload key — also not the " +
    "served fingerprint. Importing ~/keystores/vettrack-upload.jks via " +
    "`eas credentials` would make locally-installed upload-signed RN builds verify " +
    "against the file as served today. It does nothing for store installs, which " +
    "is the case that matters.",
};

/** autoVerify'd https hosts declared in app.json, derived rather than hard-coded. */
function autoVerifiedHosts(appJson) {
  const filters = appJson?.expo?.android?.intentFilters ?? [];
  const hosts = new Set();
  for (const filter of filters) {
    if (filter?.autoVerify !== true) continue;
    for (const datum of filter.data ?? []) {
      if (datum?.scheme === "https" && datum?.host) hosts.add(datum.host);
    }
  }
  return [...hosts].sort((a, b) => a.localeCompare(b));
}

module.exports = {
  EXPECTED_FINGERPRINTS,
  PLAY_APP_SIGNING_BLOCKER,
  autoVerifiedHosts,
};
