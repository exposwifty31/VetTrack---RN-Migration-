/**
 * Release-config checks — proved by REFUSAL, not by passing.
 *
 * scripts/release-preflight.mjs is the I/O wrapper; every rule it enforces is a
 * pure function in scripts/release-config/checks.js. That split exists for this
 * file: a check that has only ever seen good input is untested, and the only way
 * to know a gate closes is to push a deliberately broken input through it and
 * watch it refuse.
 *
 * Each block below therefore leads with the RED case — a build number that was
 * already consumed, an assetlinks document that omits our fingerprint, a
 * required variable absent from the store — and only then asserts the healthy
 * one. These run on every PR with no credentials and no network, which is what
 * lets the networked half stay owner-triggered without leaving the PR side bare.
 */

declare const require: (moduleName: string) => unknown;

type EnvComparison = {
  ok: boolean;
  missing: string[];
  satisfied: string[];
  presentCount: number;
  unregisteredCount: number;
};
type BuildVerdict = {
  ok: boolean;
  reason: string | null;
  suggestion: string | null;
  highestPrior: string | null;
};
type AssetlinksVerdict = {
  ok: boolean;
  problems: string[];
  missingFingerprints: { sha256: string; label: string }[];
};

const checks = require("../../scripts/release-config/checks.js") as {
  compareEnvPresence(input: {
    required: string[];
    present: Iterable<string>;
  }): EnvComparison;
  refusesDuplicateBuildNumber(input: {
    platform: string;
    local: string | number;
    prior: (string | number)[];
  }): BuildVerdict;
  assetlinksCoverage(input: {
    servedDoc: unknown;
    packageName: string;
    expected: { sha256: string; label: string }[];
  }): AssetlinksVerdict;
  validateVersionFields(input: {
    buildNumber: unknown;
    versionCode: unknown;
  }): { ok: boolean; problems: string[] };
  compareBuildVersions(a: string | number, b: string | number): number;
};

const appLinks = require("../../scripts/release-config/android-app-links.js") as {
  EXPECTED_FINGERPRINTS: { sha256: string; label: string }[];
  PLAY_APP_SIGNING_BLOCKER: {
    id: string;
    headline: string;
    diagnosis: string[];
    ownerActions: string[];
  };
  autoVerifiedHosts(appJson: unknown): string[];
};

const contract = require("../../scripts/release-config/env-contract.js") as {
  EAS_ENVIRONMENTS: string[];
  EXPECTED_IN_EAS_ENVIRONMENT: Record<
    string,
    { environments: string[]; knownGapEnvironments?: string[]; why: string; gap?: string }
  >;
  INTENTIONALLY_UNSET: Record<string, string>;
  requiredNamesFor(environment: string): string[];
  knownGapsFor(environment: string): { name: string; gap: string }[];
  deriveShippedPublicEnvReads(): { reads: Map<string, string[]>; parseFailures: string[] };
  deriveConfigEnvReads(): { reads: Map<string, string[]>; parseFailures: string[] };
};

// ---------------------------------------------------------------------------
// (A) EAS environment drift
// ---------------------------------------------------------------------------

describe("(A) EAS environment drift", () => {
  it("REFUSES an environment that is missing a required variable", () => {
    const result = checks.compareEnvPresence({
      required: ["EXPO_PUBLIC_API_ORIGIN", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      present: ["EXPO_PUBLIC_API_ORIGIN"],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
  });

  it("REFUSES an environment holding nothing at all (the deletion case this guards)", () => {
    const result = checks.compareEnvPresence({
      required: ["EXPO_PUBLIC_API_ORIGIN", "GOOGLE_SERVICES_JSON"],
      present: [],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["EXPO_PUBLIC_API_ORIGIN", "GOOGLE_SERVICES_JSON"]);
  });

  it("passes when every required name is present", () => {
    const result = checks.compareEnvPresence({
      required: ["EXPO_PUBLIC_API_ORIGIN"],
      present: ["EXPO_PUBLIC_API_ORIGIN", "SOMETHING_ELSE"],
    });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  /**
   * The load-bearing safety property. `present` is the only input that can carry
   * a string originating in the EAS store, and a mis-parsed multi-line VALUE
   * would arrive through it. Nothing derived from `present` is returned — only a
   * count — so such a string has nowhere to reach a log from.
   */
  it("never returns a name that came from the store, only a count of them", () => {
    const result = checks.compareEnvPresence({
      required: ["EXPO_PUBLIC_API_ORIGIN"],
      present: ["EXPO_PUBLIC_API_ORIGIN", "a-value-shaped-string", "another"],
    });
    const returnedStrings = [...result.missing, ...result.satisfied];
    expect(returnedStrings).not.toContain("a-value-shaped-string");
    expect(returnedStrings).not.toContain("another");
    expect(returnedStrings.every((name) => name === "EXPO_PUBLIC_API_ORIGIN")).toBe(true);
    expect(result.unregisteredCount).toBe(2);
  });

  it("scopes requirements per environment (a flat set would go permanently red on preview)", () => {
    expect(contract.requiredNamesFor("production")).toEqual([
      "EXPO_PUBLIC_API_ORIGIN",
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "GOOGLE_SERVICES_JSON",
    ]);
    expect(contract.requiredNamesFor("preview")).toEqual([]);
    expect(contract.requiredNamesFor("development")).toEqual([]);
  });

  it("records the Android preview/development GOOGLE_SERVICES_JSON gap as a reported, non-fatal gap", () => {
    // Registered so the preflight prints it on every run, and NOT as a
    // requirement, which would fail a build for an unexercised path.
    for (const environment of ["preview", "development"]) {
      expect(contract.knownGapsFor(environment).map((g) => g.name)).toEqual([
        "GOOGLE_SERVICES_JSON",
      ]);
      expect(contract.requiredNamesFor(environment)).not.toContain("GOOGLE_SERVICES_JSON");
    }
    expect(contract.knownGapsFor("production")).toEqual([]);
  });

  it("derives GOOGLE_SERVICES_JSON from app.config.js — the read the EXPO_PUBLIC_-only scan cannot see", () => {
    const configReads = contract.deriveConfigEnvReads();
    expect(configReads.parseFailures).toEqual([]);
    expect([...configReads.reads.keys()]).toContain("GOOGLE_SERVICES_JSON");
    // And it is NOT reachable through the shipped-source scan, which is why it
    // needed a second derivation rather than a wider filter.
    const shippedReads = contract.deriveShippedPublicEnvReads();
    expect([...shippedReads.reads.keys()]).not.toContain("GOOGLE_SERVICES_JSON");
  });
});

// ---------------------------------------------------------------------------
// (B) Build-number collision
// ---------------------------------------------------------------------------

describe("(B) build-number collision", () => {
  it("REFUSES the real defect: buildNumber 28 when EAS already built 27 and 28", () => {
    const verdict = checks.refusesDuplicateBuildNumber({
      platform: "ios",
      local: "28",
      prior: ["28", "27"],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("ALREADY CONSUMED");
    expect(verdict.highestPrior).toBe("28");
  });

  it("REFUSES a number below the highest consumed one, not only an exact repeat", () => {
    const verdict = checks.refusesDuplicateBuildNumber({
      platform: "ios",
      local: "20",
      prior: ["28", "27"],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("not above the highest consumed");
  });

  it("passes once the number is raised above every consumed one", () => {
    const verdict = checks.refusesDuplicateBuildNumber({
      platform: "ios",
      local: "29",
      prior: ["28", "27"],
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBeNull();
  });

  it("compares numerically, not lexicographically (a string compare would pass 9 over 10)", () => {
    // NOT an assertion: `"9" > "10"` is true in JavaScript by definition, so
    // asserting it can never fail — a passing line that proves nothing, in a
    // file whose whole premise is proof-by-refusal. It is the hazard being
    // guarded against, so it belongs in prose. The two assertions below are the
    // ones that can actually go red.
    expect(checks.compareBuildVersions("9", "10")).toBe(-1);
    expect(
      checks.refusesDuplicateBuildNumber({ platform: "ios", local: "9", prior: ["10"] }).ok,
    ).toBe(false);
  });

  it("handles dotted iOS CFBundleVersion strings", () => {
    expect(checks.compareBuildVersions("1.2.10", "1.2.9")).toBe(1);
    expect(checks.compareBuildVersions("1.2", "1.2.0")).toBe(0);
  });

  it("REFUSES a repeated Android versionCode", () => {
    const verdict = checks.refusesDuplicateBuildNumber({
      platform: "android",
      local: 10300,
      prior: [10300],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("versionCode");
  });

  it("passes Android with zero prior builds — the true state today, not a rubber stamp", () => {
    const verdict = checks.refusesDuplicateBuildNumber({
      platform: "android",
      local: 10300,
      prior: [],
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.highestPrior).toBeNull();
  });

  it("REFUSES a missing or non-numeric build number", () => {
    expect(
      checks.refusesDuplicateBuildNumber({ platform: "ios", local: "", prior: ["1"] }).ok,
    ).toBe(false);
    expect(
      checks.refusesDuplicateBuildNumber({ platform: "ios", local: "beta", prior: ["1"] }).ok,
    ).toBe(false);
  });

  it("REFUSES malformed version fields, and accepts the real app.json ones", () => {
    expect(checks.validateVersionFields({ buildNumber: "", versionCode: 1 }).ok).toBe(false);
    expect(checks.validateVersionFields({ buildNumber: "28", versionCode: "10300" }).ok).toBe(
      false,
    );
    // Google Play's documented hard ceiling for versionCode.
    expect(
      checks.validateVersionFields({ buildNumber: "28", versionCode: 2100000001 }).ok,
    ).toBe(false);

    const appJson = require("../../app.json") as {
      expo: { ios: { buildNumber: string }; android: { versionCode: number } };
    };
    expect(
      checks.validateVersionFields({
        buildNumber: appJson.expo.ios.buildNumber,
        versionCode: appJson.expo.android.versionCode,
      }),
    ).toEqual({ ok: true, problems: [] });
  });
});

// ---------------------------------------------------------------------------
// (C) Android App Links
// ---------------------------------------------------------------------------

describe("(C) Android App Links", () => {
  const PACKAGE = "uk.vettrack.app";
  const UPLOAD_KEY = appLinks.EXPECTED_FINGERPRINTS[0];

  /** The document https://vettrack.uk/.well-known/assetlinks.json actually serves. */
  const servedToday = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PACKAGE,
        sha256_cert_fingerprints: [UPLOAD_KEY.sha256],
      },
    },
  ];

  it("REFUSES a document that omits an expected fingerprint — the Play-signing case", () => {
    const playSigningKey = {
      sha256:
        "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
      label: "hypothetical Play App Signing key",
    };
    const verdict = checks.assetlinksCoverage({
      servedDoc: servedToday,
      packageName: PACKAGE,
      expected: [UPLOAD_KEY, playSigningKey],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.missingFingerprints).toEqual([playSigningKey]);
    expect(verdict.problems[0]).toContain("hypothetical Play App Signing key");
  });

  it("REFUSES, rather than CRASHES, when the fingerprint list is not a list", () => {
    // Ultrareview finding 1. `relation` is guarded with Array.isArray sixteen
    // lines above; `sha256_cert_fingerprints` was guarded only against
    // null/undefined, so a served document with that field as a string reached
    // `.map` and threw TypeError. The preflight's try/catch wraps only the
    // fetch and the JSON parse — this call sits outside it, so the gate would
    // have died with a stack trace instead of printing the "fingerprint not
    // served" line it exists to print. A malformed assetlinks document is a
    // REAL failure of exactly the thing being checked; it has to read as one.
    const verdict = checks.assetlinksCoverage({
      servedDoc: [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: PACKAGE,
            sha256_cert_fingerprints: UPLOAD_KEY.sha256, // a bare string, not an array
          },
        },
      ],
      packageName: PACKAGE,
      expected: [UPLOAD_KEY],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.missingFingerprints).toEqual([UPLOAD_KEY]);
  });

  it("REFUSES a document that names a different package", () => {
    const verdict = checks.assetlinksCoverage({
      servedDoc: servedToday,
      packageName: "uk.vettrack.rnmigration",
      expected: [UPLOAD_KEY],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toContain("no statement for package");
  });

  it("REFUSES a document carrying the wrong relation", () => {
    const verdict = checks.assetlinksCoverage({
      servedDoc: [
        {
          relation: ["delegate_permission/common.get_login_creds"],
          target: {
            namespace: "android_app",
            package_name: PACKAGE,
            sha256_cert_fingerprints: [UPLOAD_KEY.sha256],
          },
        },
      ],
      packageName: PACKAGE,
      expected: [UPLOAD_KEY],
    });
    expect(verdict.ok).toBe(false);
  });

  it("REFUSES a body that is not a statement array (an HTML 404 page, say)", () => {
    const verdict = checks.assetlinksCoverage({
      servedDoc: { error: "not found" },
      packageName: PACKAGE,
      expected: [UPLOAD_KEY],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toContain("not a JSON array");
  });

  it("passes on the document served today, and is insensitive to case and colons", () => {
    expect(
      checks.assetlinksCoverage({
        servedDoc: servedToday,
        packageName: PACKAGE,
        expected: [UPLOAD_KEY],
      }).ok,
    ).toBe(true);
    expect(
      checks.assetlinksCoverage({
        servedDoc: [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: PACKAGE,
              sha256_cert_fingerprints: [UPLOAD_KEY.sha256.toLowerCase().replace(/:/g, "")],
            },
          },
        ],
        packageName: PACKAGE,
        expected: [UPLOAD_KEY],
      }).ok,
    ).toBe(true);
  });

  it("derives the autoVerify'd hosts from app.json rather than hard-coding them", () => {
    const appJson = require("../../app.json");
    expect(appLinks.autoVerifiedHosts(appJson)).toEqual(["vettrack.uk"]);
    // An intent filter without autoVerify makes no promise, so it is not checked.
    expect(
      appLinks.autoVerifiedHosts({
        expo: {
          android: {
            intentFilters: [{ data: [{ scheme: "https", host: "example.test" }] }],
          },
        },
      }),
    ).toEqual([]);
  });

  it("carries the Play-signing blocker with the owner's exact retrieval path", () => {
    // The blocker is deliberately NOT fatal: the Play App Signing certificate is
    // created by Google at the first AAB upload, so failing the gate on it would
    // block the very upload that produces it. Its whole value is being printed
    // with a resolution, so assert the resolution is actually there.
    const blocker = appLinks.PLAY_APP_SIGNING_BLOCKER;
    expect(blocker.diagnosis.length).toBeGreaterThan(0);
    expect(blocker.ownerActions.join("\n")).toContain("App integrity");
    expect(blocker.ownerActions.join("\n")).toContain("ANDROID_PLAY_SIGNING_SHA256");
    expect(blocker.ownerActions.join("\n")).toContain("digitalassetlinks.googleapis.com");
  });
});

/**
 * The preflight shells out to eas-cli and parses its human-readable output with
 * a fixed regex. `@latest` would make an upstream formatting change fail the
 * gate on a commit that changed nothing — and a gate that cries wolf is a gate
 * people learn to skip. Pinned deliberately; raise it together with the
 * verification stamp in env-contract.js.
 */
describe("the preflight pins its eas-cli", () => {
  it("never resolves the CLI version at run time", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const source = readFileSync(
      join(__dirname, "..", "..", "scripts", "release-preflight.mjs"),
      "utf8",
    );
    expect(source).not.toContain("eas-cli@latest");
    expect(source).toMatch(/const EAS_CLI_VERSION = "\d+\.\d+\.\d+";/);
  });
});
