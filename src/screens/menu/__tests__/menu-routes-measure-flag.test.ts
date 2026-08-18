/**
 * How `EXPO_PUBLIC_ENABLE_MEASURE` is COERCED (audit finding §5/B5, second half).
 *
 * The sibling suite `menu-routes.test.ts` covers `computeDeveloperEntries` with
 * booleans already in hand. Nothing covered the step BEFORE that — turning the
 * env string into that boolean — and that is where the interesting failure mode
 * lives: `"false"` is a truthy string in JavaScript, so `Boolean(process.env.X)`
 * or `X !== "false"` would expose the G2Measure row on a build that explicitly
 * asked for it to be off. The audit hypothesised exactly that leak; these
 * assertions are what refute it, and what stop a later refactor from creating it.
 *
 * BEHAVIOURAL, NOT A SOURCE-TEXT GUARD. An assertion that the file literally
 * contains `=== "true"` would go red on a perfectly good extraction into a
 * `readBoolEnv()` helper — a gate that is red for non-defects teaches people to
 * ignore red. Reloading the module under a set env exercises the real coercion
 * and survives any refactor that keeps the semantics.
 *
 * OWN FILE ON PURPOSE. These cases mutate `process.env` and call
 * `jest.resetModules()`. Run inside `menu-routes.test.ts` they would leak the
 * variable into its "runtime DEVELOPER_ENTRIES reflects the jest context
 * (__DEV__ true, flag unset)" assertion and break it from a distance.
 *
 * `__DEV__` is true under jest, so DEVELOPER_ENTRIES always carries the debug
 * launchers here. Every assertion is therefore about G2Measure's PRESENCE, never
 * about the whole array.
 *
 * `src/navigation/RootNavigator.tsx:33` gates route registration on the
 * byte-identical expression. It is not re-tested here: rendering a native-stack
 * navigator to observe it would cost a full harness for a duplicate fact.
 */
/**
 * Load a fresh copy of the route map with the flag set to `value` (or unset).
 *
 * The name is written out as a STATIC member access at every site, never
 * `process.env[FLAG]`. Expo's babel transform only rewrites static member
 * expressions, so `expo/no-dynamic-env-var` rejects the computed form — and
 * that rule is guarding the very mechanism under test here, so it is worth
 * obeying rather than silencing.
 */
function developerRoutesWithFlag(value: string | undefined): string[] {
  const previous = process.env.EXPO_PUBLIC_ENABLE_MEASURE;
  if (value === undefined) delete process.env.EXPO_PUBLIC_ENABLE_MEASURE;
  else process.env.EXPO_PUBLIC_ENABLE_MEASURE = value;
  try {
    jest.resetModules();
    const mod = require("../menu-routes") as typeof import("../menu-routes");
    return mod.DEVELOPER_ENTRIES.map((entry) => entry.route);
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_ENABLE_MEASURE;
    else process.env.EXPO_PUBLIC_ENABLE_MEASURE = previous;
    jest.resetModules();
  }
}

describe("EXPO_PUBLIC_ENABLE_MEASURE coercion", () => {
  it('exposes G2Measure for exactly the literal "true"', () => {
    expect(developerRoutesWithFlag("true")).toContain("G2Measure");
  });

  it('does NOT expose G2Measure for "false" — the truthy-string trap', () => {
    // The production profile ships this exact value. A loose check would leak
    // the measurement screen into the store build.
    expect(developerRoutesWithFlag("false")).not.toContain("G2Measure");
  });

  it("does NOT expose G2Measure when the flag is unset", () => {
    // Every profile that declares nothing resolves here.
    expect(developerRoutesWithFlag(undefined)).not.toContain("G2Measure");
  });

  it("does NOT expose G2Measure for other truthy-but-not-true strings", () => {
    for (const value of ["0", "no", "TRUE", "True", " true", "1", "yes"]) {
      expect(developerRoutesWithFlag(value)).not.toContain("G2Measure");
    }
  });

  it('does NOT expose G2Measure for the empty string', () => {
    expect(developerRoutesWithFlag("")).not.toContain("G2Measure");
  });

  it("the debug launchers are unaffected by the flag (guards a vacuous pass)", () => {
    // If the reload ever produced an empty array — a broken require, a wrong
    // path — every `not.toContain` above would pass while asserting nothing.
    for (const value of ["true", "false", undefined]) {
      expect(developerRoutesWithFlag(value)).toContain("StorageDebug");
    }
  });
});
