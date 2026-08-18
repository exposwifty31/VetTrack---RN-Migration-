/**
 * The measurement-build contract in eas.json (audit finding §5/B5).
 *
 * THE DEFECT THIS RATCHETS AGAINST, STATED AS A MECHANISM
 * `G2MeasureScreen` is the G3 exit-pass measurement surface. It has no other UI
 * entry point: both read sites — `src/navigation/RootNavigator.tsx` (route
 * registration) and `src/screens/menu/menu-routes.ts` (the Menu row) — gate it on
 * `process.env.EXPO_PUBLIC_ENABLE_MEASURE === "true"`. That comparison is STRICT
 * against the literal `"true"`, which is correct and is NOT the defect: `"false"`
 * is a truthy string in JavaScript, so a loose `Boolean(...)` or `!== "false"`
 * test would have leaked the screen into the production build. It does not.
 *
 * The defect was the other half of the pair. eas.json declared the flag in
 * exactly one profile — `production`, set to `"false"` — and nowhere else, so
 * every profile resolved the gate to false and NO profile could produce a
 * measurement build at all. The screen was unreachable everywhere, which makes
 * the G3 exit-pass artifact unproducible.
 *
 * WHY THIS IS A CONFIG TEST AND NOT A RENDER TEST
 * The coercion is already covered behaviourally in
 * `src/screens/menu/__tests__/menu-routes-measure-flag.test.ts`. What no runtime
 * test can see is whether any BUILD PROFILE actually supplies the value the
 * coercion is waiting for — that fact lives only in eas.json, so it is read here
 * as data.
 *
 * WHY `environment` IS ASSERTED TOO, AND WHY IT IS NOT DECORATION
 * A profile that names no `environment` still gets one inferred from its shape
 * (`production` when `distribution: "store"`, `development` when
 * `developmentClient: true`, `preview` otherwise — see the CORRECTION block in
 * manifest-vs-code.test.ts). `scripts/release-config/env-contract.js` records
 * that the `preview` and `development` EAS environments hold ZERO variables as
 * of 2026-08-18, and that `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is the one
 * "ClerkProvider throws on mount without it". So an internal measurement profile
 * with no explicit `environment` would flip the flag and still produce a binary
 * that dies before a single frame could be measured — the same finding, moved.
 * Naming the environment explicitly is what makes the build PRODUCIBLE rather
 * than merely configured.
 */
declare const __dirname: string;
declare const require: (moduleName: string) => unknown;

const fs = require("node:fs") as { readFileSync(file: string, encoding: "utf8"): string };
const path = require("node:path") as {
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
};

const ROOT = path.resolve(__dirname, "..", "..");

type EasProfile = Readonly<{
  distribution?: string;
  environment?: string;
  developmentClient?: boolean;
  env?: Record<string, string>;
  ios?: { env?: Record<string, string> };
  android?: { env?: Record<string, string> };
}>;

const easJson = JSON.parse(fs.readFileSync(path.join(ROOT, "eas.json"), "utf8")) as {
  build: Record<string, EasProfile>;
};
const profiles = Object.entries(easJson.build ?? {});

const MEASURE = "EXPO_PUBLIC_ENABLE_MEASURE";

/**
 * The flag's value for a profile, across the three places eas.json accepts an
 * `env` block. `undefined` means the profile does not declare it at all — which
 * the strict `=== "true"` gate resolves to OFF, exactly like `"false"`.
 */
function measureValueOf(profile: EasProfile): string | undefined {
  return profile.env?.[MEASURE] ?? profile.ios?.env?.[MEASURE] ?? profile.android?.env?.[MEASURE];
}

const measurementProfiles = profiles.filter(([, p]) => measureValueOf(p) === "true");

describe("eas.json measurement-build contract", () => {
  it("parsed real build profiles (guards a vacuous pass from a wrong ROOT)", () => {
    // Every assertion below is a filter over `profiles`. An empty list would let
    // the store-exposure guard pass while checking nothing at all.
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.map(([name]) => name)).toEqual(expect.arrayContaining(["production"]));
  });

  it("at least one NON-store profile enables the measurement screen", () => {
    // The finding itself: with the flag declared only as "false" in production,
    // this list is empty and the G3 exit-pass artifact cannot be built.
    const nonStore = measurementProfiles.filter(([, p]) => p.distribution !== "store");
    expect(nonStore.map(([name]) => name)).not.toEqual([]);
  });

  it("pins the `measure` profile itself, not merely 'some non-store profile'", () => {
    // The assertions above are satisfied by ANY non-store profile with an
    // environment, so a later change could rename, gut or delete `measure`
    // while they all stay green. The artifact this workstream exists to make
    // producible is this profile, so this names it and its required values.
    expect(easJson.build.measure).toMatchObject({
      environment: "production",
      distribution: "internal",
      env: { EXPO_PUBLIC_ENABLE_MEASURE: "true" },
      android: { buildType: "apk" },
    });
  });

  it("every measurement profile names its EAS environment explicitly", () => {
    // Without this the profile's shape infers `preview`, which holds zero
    // variables — no Clerk key, so the binary throws in ClerkProvider on mount.
    const unpinned = measurementProfiles
      .filter(([, p]) => p.environment === undefined)
      .map(([name]) => name);
    expect(unpinned).toEqual([]);
  });

  it("no store-distribution profile enables the measurement screen", () => {
    const leaked = measurementProfiles
      .filter(([, p]) => p.distribution === "store")
      .map(([name]) => name);
    expect(leaked).toEqual([]);
  });

  it("production still declares the flag, and declares it OFF", () => {
    // Declared rather than merely absent: `scripts/release-preflight.mjs` proves
    // every env name the source reads has a disposition, and an eas.json
    // declaration is the cheapest honest one for a store build.
    expect(measureValueOf(easJson.build.production)).toBe("false");
  });
});
