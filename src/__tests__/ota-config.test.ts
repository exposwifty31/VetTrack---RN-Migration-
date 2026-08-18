/**
 * OTA delivery contract — the config that decides whether an update reaches a
 * device, asserted against the manifests as EAS actually resolves them.
 *
 * WHY THIS EXISTS
 * Every failure this guards is SILENT. There is no crash, no red build, no
 * failing request: `eas update` prints an update group id and a runtime version,
 * exits 0, and the bundle reaches nobody. The only symptom is that the fix you
 * shipped never appears on the ward. Four ways to get there:
 *
 *  1. `runtimeVersion` disappears or its policy changes. Under `appVersion` the
 *     runtime is `expo.version`, which nothing in this repo bumps (see
 *     scripts/release-config/checks.js), so builds 27, 28 and 29 would all be
 *     judged mutually compatible and an update built against 29's native code
 *     would be delivered to binaries that cannot run it. Under `nativeVersion`
 *     every release forks a new runtime and strands the previous one, which is
 *     safe and useless. `fingerprint` is the only policy that both delivers and
 *     is safe here.
 *  2. A build profile loses its `channel`. A binary built without one is not
 *     subscribed to anything and can never take an update.
 *  3. `updates.url` drifts from `extra.eas.projectId`. The url is the manifest
 *     endpoint for a specific EAS project; point it at a stale id and the client
 *     polls a project nobody publishes to. Asserted as a RELATIONSHIP rather
 *     than a literal string precisely because the literal is the thing that
 *     rots.
 *  4. app.config.js stops carrying the keys through. It spreads
 *     `...appJson.expo` and overrides only `android`; a refactor that rebuilds
 *     that object field-by-field would drop `runtimeVersion`/`updates` while
 *     app.json still looks correct to a human reading it. So the resolved
 *     config — what EAS reads — is what is asserted, not the raw JSON.
 *
 * This suite deliberately does NOT import expo-updates. That package is not a
 * dependency yet (docs/ota-acceptance.md, P2, is the owner action that adds it),
 * and the config contract is checkable without it.
 *
 * Node access is typed locally at the boundary, matching
 * src/__tests__/manifest-vs-code.test.ts — tsconfig sets `types: ["jest"]`, so
 * neither @types/node globals nor `import ... from "node:fs"` resolve.
 */

declare const __dirname: string;
declare const require: (moduleName: string) => unknown;

const fs = require("node:fs") as {
  readFileSync(file: string, encoding: "utf8"): string;
};
const path = require("node:path") as {
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
};

const ROOT = path.resolve(__dirname, "..", "..");

type UpdatesBlock = {
  url?: string;
  checkAutomatically?: string;
  fallbackToCacheTimeout?: number;
};
type ResolvedAppConfig = {
  runtimeVersion?: string | { policy?: string };
  updates?: UpdatesBlock;
  extra?: { eas?: { projectId?: string } };
  android?: { googleServicesFile?: string };
};

/**
 * The config EAS reads. app.config.js exists, so Expo does NOT auto-merge
 * app.json — it is imported and spread explicitly, and this call is the only
 * honest way to know what survived that spread.
 */
const resolved = (require(path.join(ROOT, "app.config.js")) as () => ResolvedAppConfig)();

const easJson = JSON.parse(fs.readFileSync(path.join(ROOT, "eas.json"), "utf8")) as {
  build: Record<string, { channel?: string }>;
};

describe("runtimeVersion policy", () => {
  it("resolves to the fingerprint policy", () => {
    expect(resolved.runtimeVersion).toEqual({ policy: "fingerprint" });
  });

  it("is not a bare string, which would pin the runtime to a hand-typed value", () => {
    expect(typeof resolved.runtimeVersion).toBe("object");
  });
});

describe("updates block", () => {
  it("points at the manifest endpoint for this project's EAS id", () => {
    const projectId = resolved.extra?.eas?.projectId;
    expect(typeof projectId).toBe("string");
    expect(resolved.updates?.url).toBe(`https://u.expo.dev/${projectId}`);
  });

  it("never checks on its own — a Code Blue app does not swap bundles unattended", () => {
    expect(resolved.updates?.checkAutomatically).toBe("NEVER");
  });

  it("never blocks launch on a network round-trip", () => {
    expect(resolved.updates?.fallbackToCacheTimeout).toBe(0);
  });
});

/**
 * EXHAUSTIVE over eas.json, not a two-row allowlist.
 *
 * The earlier version asserted only that `preview` and `production` carry their
 * channels. That says nothing about any OTHER profile — so a new profile could
 * be added with no channel and this suite would stay green. The very next
 * branch did exactly that (`measure`), and nothing noticed.
 *
 * Channel-less is a legitimate answer, and for two profiles it is the RIGHT
 * one — but it has to be an answer, recorded here, not an omission. Adding a
 * profile to eas.json now fails this test until someone states which case it
 * is, which is the decision the omission was skipping.
 */
const EXPECTED_CHANNELS: Record<string, string | null> = {
  // Dev builds load from the dev server; an update channel is meaningless.
  development: null,
  preview: "preview",
  // A MEASUREMENT artifact must be frozen: an OTA shifting the JS bundle
  // underneath a perf run would silently invalidate the numbers it produced.
  measure: null,
  production: "production",
};

describe("build profile channels", () => {
  // The guard runs FROM eas.json, so a profile added there without an entry
  // above fails here. The map may name a profile eas.json does not have yet —
  // that is a forward declaration, not a failure, and it keeps this contract
  // from coupling to the merge order of a sibling branch.
  it("every profile in eas.json has a recorded channel decision", () => {
    const undecided = Object.keys(easJson.build).filter((p) => !(p in EXPECTED_CHANNELS));
    expect(undecided).toEqual([]);
  });

  it.each(Object.keys(easJson.build))("eas.json build.%s matches its recorded channel", (profile) => {
    expect(easJson.build[profile]?.channel ?? null).toBe(EXPECTED_CHANNELS[profile] ?? null);
  });
});

describe("app.config.js spread", () => {
  it("still applies its android override, so the spread was not bypassed", () => {
    expect(typeof resolved.android?.googleServicesFile).toBe("string");
  });
});
