/**
 * Release-config checks, as PURE FUNCTIONS.
 *
 * Every rule below takes plain data and returns plain data — no network, no
 * filesystem, no process.exit. scripts/release-preflight.mjs is the thin I/O
 * wrapper that fetches the data and prints the result.
 *
 * WHY THAT SPLIT IS THE POINT
 * A check that has only ever seen good input is untested. Because these are
 * pure, src/__tests__/release-config-checks.test.ts can hand each one a
 * deliberately broken input and assert it REFUSES — the local build number
 * colliding with a consumed one, an assetlinks document missing our fingerprint,
 * a required variable absent from the store. Those refusals run on every PR with
 * no credentials and no network, which is what earns the PR-side check its place
 * while the networked half stays owner-triggered.
 */

// ---------------------------------------------------------------------------
// (A) EAS environment drift
// ---------------------------------------------------------------------------

/**
 * Compare the names an environment MUST have against the names it actually has.
 *
 * VALUE SAFETY IS STRUCTURAL, NOT A CONVENTION. `present` is consumed only as a
 * membership test; nothing derived from it is ever returned. `missing` and
 * `satisfied` are drawn from `required`, which comes from this repo's own source
 * scan. No string that originated in the EAS store can reach a caller, and
 * therefore none can reach a log — even if a multi-line variable VALUE were to
 * be mis-parsed as a name upstream, it has nowhere to go.
 *
 * @param {{ required: string[], present: Iterable<string> }} input
 * @returns {{ ok: boolean, missing: string[], satisfied: string[], presentCount: number, unregisteredCount: number }}
 */
function compareEnvPresence({ required, present }) {
  const presentSet = new Set(present);
  const byName = (a, b) => a.localeCompare(b);
  const missing = required.filter((name) => !presentSet.has(name)).sort(byName);
  const satisfied = required.filter((name) => presentSet.has(name)).sort(byName);
  return {
    ok: missing.length === 0,
    missing,
    satisfied,
    presentCount: presentSet.size,
    // A COUNT, never the names: a name we do not recognise is by definition not
    // in `required`, so printing it would be printing an EAS-derived string.
    unregisteredCount: [...presentSet].filter((n) => !required.includes(n)).length,
  };
}

// ---------------------------------------------------------------------------
// (B) Build-number collision
// ---------------------------------------------------------------------------

/**
 * iOS `CFBundleVersion` is a dotted numeric string ("28", "1.2.3"); Android
 * `versionCode` is a single integer. Compare component-wise so "9" < "10"
 * rather than the lexicographic "9" > "10" a string compare would give.
 *
 * @returns {number} -1 | 0 | 1, or NaN when either side is not a version string.
 */
function compareBuildVersions(a, b) {
  // Decimal digits ONLY, then Number. Bare `Number` accepts "0x1E", "1e3" and
  // "" — so `compareBuildVersions("0x1E", "0")` returned 1 and the version-field
  // check called "0x1E" well-formed, while Apple rejects it as CFBundleVersion.
  const parse = (v) =>
    String(v)
      .trim()
      .split(".")
      .map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  const pa = parse(a);
  const pb = parse(b);
  if ([...pa, ...pb].some((n) => !Number.isFinite(n))) return Number.NaN;
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Refuse a build number that a previous build already consumed.
 *
 * WHY THIS GATE EXISTS AT ALL. eas.json sets `cli.appVersionSource: "local"` and
 * every profile has `autoIncrement: false`, and no workflow in this repo touches
 * a version. Nothing bumps anything — so the number in app.json is whatever a
 * human last typed, and re-running a production build ships the same one twice.
 * App Store Connect rejects a duplicate CFBundleVersion at UPLOAD, after the
 * build minutes are already spent.
 *
 * `prior` is the set of `appBuildVersion` values EAS reports for finished or
 * in-flight builds on this platform. Failing builds are included by the caller
 * on purpose: a number consumed by a failed build can still have been uploaded.
 *
 * @param {{ platform: string, local: string|number, prior: (string|number)[] }} input
 * @returns {{ ok: boolean, reason: string|null, suggestion: string|null, highestPrior: string|null }}
 */
function refusesDuplicateBuildNumber({ platform, local, prior }) {
  const label = platform === "android" ? "versionCode" : "buildNumber";
  const localStr = String(local ?? "").trim();

  if (localStr === "") {
    return {
      ok: false,
      reason: `${platform}: no ${label} set in app.json`,
      suggestion: `set expo.${platform === "android" ? "android.versionCode" : "ios.buildNumber"}`,
      highestPrior: null,
    };
  }

  const usable = (prior ?? [])
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter((p) => p !== "" && !Number.isNaN(compareBuildVersions(p, "0")));

  if (usable.length === 0) {
    // No prior builds is a legitimate state (this is true of Android today —
    // zero builds have ever run). Nothing to collide with; pass and say so.
    return { ok: true, reason: null, suggestion: null, highestPrior: null };
  }

  // Seeded explicitly. The `usable.length === 0` guard above already makes the
  // unseeded form unreachable — this is legibility for the next reader and for
  // static analysis, not a live crash being fixed.
  const highestPrior = usable.reduce(
    (hi, p) => (compareBuildVersions(p, hi) > 0 ? p : hi),
    usable[0],
  );
  const cmp = compareBuildVersions(localStr, highestPrior);

  if (Number.isNaN(cmp)) {
    return {
      ok: false,
      reason: `${platform}: ${label} "${localStr}" is not a numeric version string`,
      suggestion: `use a dotted-numeric ${label}`,
      highestPrior,
    };
  }
  if (cmp > 0) {
    return { ok: true, reason: null, suggestion: null, highestPrior };
  }

  const collided = usable.includes(localStr);
  return {
    ok: false,
    reason:
      `${platform}: app.json ${label} "${localStr}" ` +
      (collided
        ? "was ALREADY CONSUMED by an existing EAS build"
        : `is not above the highest consumed ${label} "${highestPrior}"`) +
      ". Nothing in this repo auto-increments it (eas.json: appVersionSource " +
      '"local", autoIncrement false on every profile), so the next production ' +
      "build would ship a duplicate and be rejected at upload.",
    suggestion: `raise ${label} above "${highestPrior}" in app.json, or migrate eas.json to appVersionSource "remote" so EAS owns it`,
    highestPrior,
  };
}

/**
 * Parse the hand-maintained shipped-build floor.
 *
 * WHY A FILE AT ALL. (B) asks EAS which build numbers are consumed, which needs
 * network and credentials — so `--offline`, the mode that runs on every PR,
 * skipped the collision check entirely and printed a note saying so. The gate
 * was unenforced exactly where it runs most often. Nothing offline can ask App
 * Store Connect what it has already accepted, so a human records it here and
 * raises it after every upload, from either release lane (this app and the
 * Capacitor shell share one bundle id, so they share one counter).
 *
 * WHY MALFORMED FAILS HARD. A hand-maintained file rots. The dangerous failure
 * is not a stale number — it is a corrupted one that lets the gate pass while
 * comparing against nothing. "Unreadable" and "no floor recorded" must never
 * look alike: absent is a stated no-op, garbage is a refusal.
 *
 * Accepts `#` comments and blank lines; requires exactly one value line, in the
 * dotted-numeric shape `compareBuildVersions` understands.
 *
 * @param {string|null} raw file contents, or null when the file is absent
 * @returns {{ ok: boolean, floor: string|null, problem: string|null }}
 */
function parseShippedBuildFloor(raw) {
  if (raw == null) {
    // A lane that has never uploaded has no floor. Legitimate — but the caller
    // must print "no floor", not "ok": a silent skip and a pass look identical
    // from outside, and only one of them is honest.
    return { ok: true, floor: null, problem: null };
  }

  const values = String(raw)
    .split("\n")
    // No `$`: without the `m` flag it anchors to end-of-INPUT, so on a string that
    // still contains a newline after a `#` the engine backtracks through every
    // position `.*` consumed — super-linear (sonar javascript:S8786). It also buys
    // nothing, since `.` already excludes newline and `.*` therefore stops at the
    // end of the line on its own. Dropping it is both linear and more correct: the
    // comment is now stripped even if this is ever handed unsplit text.
    .map((line) => line.replace(/#.*/, "").trim())
    .filter((line) => line !== "");

  if (values.length === 0) {
    return {
      ok: false,
      floor: null,
      problem: "shipped-build floor file holds no value (empty or comments only)",
    };
  }
  if (values.length > 1) {
    return {
      ok: false,
      floor: null,
      problem:
        `shipped-build floor file holds ${values.length} values ` +
        `(${values.join(", ")}); it must hold exactly one`,
    };
  }

  const floor = values[0];
  if (Number.isNaN(compareBuildVersions(floor, "0"))) {
    return {
      ok: false,
      floor: null,
      problem: `shipped-build floor "${floor}" is not a dotted-numeric build number`,
    };
  }
  return { ok: true, floor, problem: null };
}

/** Cheap offline sanity on the version fields themselves. */
function validateVersionFields({ buildNumber, versionCode }) {
  const problems = [];
  if (typeof buildNumber !== "string" || buildNumber.trim() === "") {
    problems.push("ios.buildNumber must be a non-empty string");
  } else if (Number.isNaN(compareBuildVersions(buildNumber, "0"))) {
    problems.push(`ios.buildNumber "${buildNumber}" is not dotted-numeric`);
  }
  if (!Number.isInteger(versionCode)) {
    problems.push("android.versionCode must be an integer");
  } else if (versionCode < 1 || versionCode > 2100000000) {
    // Google Play's documented hard ceiling.
    problems.push(`android.versionCode ${versionCode} is outside 1..2100000000`);
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// (C) Android App Links / assetlinks.json
// ---------------------------------------------------------------------------

const APP_LINK_RELATION = "delegate_permission/common.handle_all_urls";

/** Normalize a SHA-256 cert fingerprint for comparison: upper-case, colon-free. */
const normalizeFingerprint = (fp) =>
  String(fp ?? "").toUpperCase().replace(/[^0-9A-F]/g, "");

/**
 * Does the served assetlinks.json actually authorize this app?
 *
 * `autoVerify: true` in app.json means Android fetches
 * https://<host>/.well-known/assetlinks.json at install time and links the app
 * ONLY if the document names our package AND lists the SHA-256 of the
 * certificate the installed APK was signed with. A Play-delivered install is
 * re-signed by Google with the Play App Signing key, so serving the upload key's
 * fingerprint alone is not sufficient for a store install.
 *
 * @param {{ servedDoc: unknown, packageName: string, expected: {sha256: string, label: string}[] }} input
 * @returns {{ ok: boolean, problems: string[], missingFingerprints: {sha256: string, label: string}[] }}
 */
function assetlinksCoverage({ servedDoc, packageName, expected }) {
  const problems = [];
  if (!Array.isArray(servedDoc)) {
    return {
      ok: false,
      problems: ["served assetlinks.json is not a JSON array of statements"],
      missingFingerprints: expected ?? [],
    };
  }

  const ours = servedDoc.filter(
    (stmt) =>
      stmt &&
      typeof stmt === "object" &&
      Array.isArray(stmt.relation) &&
      stmt.relation.includes(APP_LINK_RELATION) &&
      stmt.target?.namespace === "android_app" &&
      stmt.target.package_name === packageName,
  );

  if (ours.length === 0) {
    return {
      ok: false,
      problems: [
        `no statement for package "${packageName}" with relation "${APP_LINK_RELATION}"`,
      ],
      missingFingerprints: expected ?? [],
    };
  }

  // Array.isArray, not `?? []`, and for the same reason `relation` is guarded
  // that way sixteen lines up: a served document is REMOTE input. A field that
  // arrives as a string or an object is a malformed assetlinks file — a real
  // failure of the exact thing this gate checks — and `.map` on it threw
  // TypeError. The preflight's try/catch covers only the fetch and the JSON
  // parse, so that throw escaped as a stack trace instead of the
  // "fingerprint not served" line. Treat a non-array as serving nothing.
  const served = new Set(
    ours.flatMap((stmt) =>
      Array.isArray(stmt.target.sha256_cert_fingerprints)
        ? stmt.target.sha256_cert_fingerprints.map(normalizeFingerprint)
        : [],
    ),
  );
  const missingFingerprints = (expected ?? []).filter(
    (fp) => !served.has(normalizeFingerprint(fp.sha256)),
  );
  for (const fp of missingFingerprints) {
    problems.push(`fingerprint not served — ${fp.label}`);
  }

  return { ok: problems.length === 0, problems, missingFingerprints };
}

module.exports = {
  APP_LINK_RELATION,
  assetlinksCoverage,
  compareBuildVersions,
  compareEnvPresence,
  normalizeFingerprint,
  parseShippedBuildFloor,
  refusesDuplicateBuildNumber,
  validateVersionFields,
};
