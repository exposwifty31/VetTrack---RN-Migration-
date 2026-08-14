import * as ts from "typescript";

/**
 * Manifest-vs-code contract — app.json / eas.json read as DATA, checked against
 * what the shipped source actually does.
 *
 * WHY THIS EXISTS
 * These two manifests and the TypeScript source are three artifacts that no
 * compiler, linter or type-checker cross-checks. A build can be fully green —
 * 1000+ jest tests passing, eslint silent — and still dereference an
 * `EXPO_PUBLIC_*` variable that nobody ever arranged to supply from anywhere,
 * or request a native entitlement no code ever consumes (App Review rejects
 * unjustified capabilities). This suite is the missing cross-artifact checker.
 *
 * DETECTION METHOD — AST PARSE + EXPLICIT ALLOWLIST, NOT A STRING GREP
 * Every fact about the source below is derived from the TypeScript compiler's
 * own AST (`ts.createSourceFile` + `forEachChild`), and every manifest→code
 * mapping comes from the hand-written CAPABILITY_CONSUMERS allowlist further
 * down. A bare `grep -o 'EXPO_PUBLIC_[A-Z_]*' src/` was tried first and is
 * demonstrably wrong: it reports `EXPO_PUBLIC_USE_RN_FETCH`, which appears ONLY
 * inside a doc comment in src/lib/auth-fetch.ts and is never read by any
 * executing code. The AST walk does not report it, because a comment is not a
 * PropertyAccessExpression. Substring matching cannot tell a real dereference
 * from prose about one; that failure mode has bitten this project before.
 *
 * SCOPE OF THE ENV SCAN
 *  - Shipped code only: every .ts/.tsx under src/ that is not a test, plus the
 *    root entry files App.tsx and index.ts (App.tsx dereferences
 *    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and is as much a launch path as src/).
 *  - Test files are excluded on purpose: they assign process.env themselves, so
 *    their reads are not build-time requirements.
 *  - Member access only (`process.env.FOO` / `process.env["FOO"]`). This
 *    deliberately matches Expo's own semantics: the babel transform inlines
 *    `process.env.EXPO_PUBLIC_*` member expressions only. A destructured
 *    `const { EXPO_PUBLIC_FOO } = process.env` is never inlined and would be
 *    undefined at runtime regardless of what eas.json declares — a different
 *    defect, out of scope here.
 *
 * ===========================================================================
 * CORRECTION — AN EARLIER VERSION OF THIS FILE CARRIED A FALSE CLAIM
 * ===========================================================================
 * This file used to contain a `[KNOWN-RED RATCHET]` `it.failing` whose header
 * stated, in substance: "eas.json declares exactly one EXPO_PUBLIC_* variable;
 * four others the shipped code dereferences are declared NOWHERE;
 * EXPO_PUBLIC_API_ORIGIN throws when absent and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
 * makes ClerkProvider throw on mount; the binary HARD-CRASHES AT LAUNCH."
 *
 * THAT CLAIM WAS WRONG. It is written down here rather than quietly deleted,
 * because the evidence it was derived from — eas.json, which really does list
 * one EXPO_PUBLIC_* entry — is still sitting in the repo, and a future reader
 * who only learns "the variables turned out to be fine" will re-derive the same
 * false conclusion the next time they open it.
 *
 * WHY IT WAS WRONG — THE MECHANISM, NOT MERELY THE OBSERVATION
 * `eas.json`'s `build.<profile>.env` is only ONE of two independent sources of
 * build-time environment variables. The other is EAS's SERVER-SIDE environment
 * store, which is a legitimate, first-class mechanism and is not represented in
 * this repository in any form. When a build profile sets no `environment` key —
 * none of ours do — EAS still resolves one from the profile's shape:
 * `production` when `distribution: "store"`, `development` when
 * `developmentClient: true`, `preview` otherwise. It then loads that
 * environment's variables into the build ALONGSIDE the profile's own `env`.
 * Counting EXPO_PUBLIC_* entries in eas.json therefore says nothing whatsoever
 * about what the binary actually receives.
 *
 * THE EVIDENCE THAT KILLS IT — `npx eas config --profile production --platform ios`
 * (run 2026-08-15; eas-cli 21.x) reports, verbatim:
 *
 *   Resolved "production" environment for the build.
 *   Environment variables with visibility "Plain text" and "Sensitive" loaded
 *     from the "production" environment on EAS: EXPO_PUBLIC_API_ORIGIN,
 *     EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.
 *   Environment variables loaded from the "production" build profile "env"
 *     configuration: EXPO_PUBLIC_ENABLE_MEASURE.
 *
 * Both launch-critical variables are supplied to the production build. iOS
 * build 28 (production profile, v1.3.0) was produced on exactly this
 * configuration. There is no launch crash, and there never was one to ratchet
 * against. A ratchet aimed at a non-defect stays red forever, which is how a
 * team learns to ignore red — a false alarm in a safety net is worse than no
 * safety net, because it burns the signal the net exists to carry.
 *
 * WHAT SURVIVES, AND IT IS REAL BUT SMALLER
 * The server-side store is INVISIBLE to every repo-level check. Someone can
 * delete EXPO_PUBLIC_API_ORIGIN from the EAS `production` environment and
 * nothing in this repository notices. That is genuine fragility — but its
 * honest name is "cannot be verified locally", NOT "crashes at launch".
 * Test (a) below converts that invisible dependency into a DECLARED one: every
 * EXPO_PUBLIC_* the shipped code reads must be accounted for in exactly one of
 * an eas.json profile's `env` or a checked-in registry in this file that names
 * what supplies it. A new `process.env.EXPO_PUBLIC_X` registered nowhere fails
 * the build. That is the protection genuinely available to a unit test, and it
 * is a normal `it` — it fails for a real defect, and only for a real defect.
 */

/**
 * Node access, typed locally at the boundary.
 *
 * tsconfig.json sets `types: ["jest"]` and `moduleResolution: "bundler"` with
 * `customConditions: ["react-native"]`, so neither @types/node's globals nor a
 * plain `import ... from "node:fs"` resolve — `tsc --noEmit` rejects both.
 * Rather than widen the shared tsconfig for one test, the two node builtins and
 * the CJS globals jest injects at runtime are declared here, narrowed to the
 * members used. Those declarations are precisely what keeps this file clean
 * under `tsc` — remove them and the rejections above are what you get back.
 *
 * (An earlier version of this note added that the sibling test
 * src/lib/__tests__/endpoint-drift.test.ts "currently leaves three errors in
 * the typecheck". That is no longer true — `npx tsc --noEmit` exits 0 with zero
 * errors across the project, verified 2026-08-15 — so the count should not be
 * trusted as written. Corrected here for the same reason as the block above: a
 * stale number in a comment is indistinguishable from a current one.)
 */
declare const __dirname: string;
declare const require: (moduleName: string) => unknown;

type Dirent = { name: string; isDirectory(): boolean };
const fs = require("node:fs") as {
  readFileSync(file: string, encoding: "utf8"): string;
  readdirSync(dir: string, options: { withFileTypes: true }): Dirent[];
  existsSync(file: string): boolean;
};
const path = require("node:path") as {
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
  readonly sep: string;
};

const ROOT = path.resolve(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// Manifests, read as data
// ---------------------------------------------------------------------------

type EasProfile = {
  extends?: string;
  env?: Record<string, string>;
  ios?: { env?: Record<string, string> };
  android?: { env?: Record<string, string> };
};

const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8")) as {
  expo: { plugins: (string | [string, ...unknown[]])[] };
};
const easJson = JSON.parse(fs.readFileSync(path.join(ROOT, "eas.json"), "utf8")) as {
  build: Record<string, EasProfile>;
};

/** app.json plugin entries are either "name" or ["name", config]. */
const declaredPlugins: string[] = appJson.expo.plugins.map((entry) =>
  Array.isArray(entry) ? entry[0] : entry,
);

const easProfiles = Object.entries(easJson.build);

/** name -> profiles that declare it, across profile.env and profile.<platform>.env. */
function collectDeclaredEnv(): Map<string, string[]> {
  const declared = new Map<string, string[]>();
  const add = (key: string, where: string) =>
    declared.set(key, [...(declared.get(key) ?? []), where]);
  for (const [profileName, profile] of easProfiles) {
    for (const key of Object.keys(profile.env ?? {})) add(key, profileName);
    for (const platform of ["ios", "android"] as const) {
      for (const key of Object.keys(profile[platform]?.env ?? {})) {
        add(key, `${profileName}.${platform}`);
      }
    }
  }
  return declared;
}

const declaredEnv = collectDeclaredEnv();

// ---------------------------------------------------------------------------
// EXPO_PUBLIC_* accounted for OUTSIDE eas.json (hand-maintained on purpose)
// ---------------------------------------------------------------------------

/**
 * Variables supplied by EAS's server-side environment store — the mechanism
 * described in the CORRECTION block at the top of this file.
 *
 * NOTHING IN THIS TEST CAN CONFIRM AN ENTRY HERE. Reading the real store needs
 * network and EAS auth, which do not belong in a unit test. An entry is a
 * written, checked-in statement that a human ran `npx eas env:list <env>` and
 * saw the variable. The value is that a human must do so and record it; the
 * assertion's job is to stop a variable being read with NO statement anywhere.
 *
 * Re-verify with: npx eas env:list production
 */
const PROVIDED_BY_EAS_ENVIRONMENT: Record<string, string> = {
  // "production" EAS environment ONLY. Verified absent from "development" and
  // "preview" — both listed zero variables (eas env:list, 2026-08-15). A
  // dev-client or preview build therefore does NOT receive this, and
  // resolveApiUrl() throws on the first /api/ call. That is expected off
  // production, where .env supplies it locally; it is not a production defect.
  EXPO_PUBLIC_API_ORIGIN: "EAS environment: production only",
  // "production" EAS environment ONLY, same caveat: absent from "development"
  // and "preview" (eas env:list, 2026-08-15).
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "EAS environment: production only",
};

/**
 * Variables whose ABSENCE is the correct default state. Nothing supplies these
 * in any build profile or any EAS environment, and that is deliberate — every
 * read site already handles unset. Registered explicitly so assertion (a) stays
 * exhaustive rather than carrying a silent exemption.
 */
const INTENTIONALLY_UNSET: Record<string, string> = {
  // Opt-in dev-auth seam, inert unless explicitly enabled; resolveDevAuth()
  // additionally gates on __DEV__, so a store build cannot install it. Setting
  // this in a production profile would itself be the defect.
  EXPO_PUBLIC_DEV_AUTH: "opt-in, inert when unset — src/lib/dev-auth.ts",
  // Set by hand only on a G2/G3 measurement build (1000 / measured refresh Hz).
  // getFrameBudgetMs() returns null when unset and the measurement surfaces
  // fail loud rather than guess 60 Hz, so unset is correct off a measure build.
  EXPO_PUBLIC_FRAME_BUDGET_MS:
    "measurement builds only — src/lib/instrumentation/perf.ts",
};

/** name -> the registry accounting for it, for the exactly-one-of check. */
const registeredOutsideEasJson: [string, string][] = [
  ...Object.keys(PROVIDED_BY_EAS_ENVIRONMENT).map(
    (name): [string, string] => [name, "PROVIDED_BY_EAS_ENVIRONMENT"],
  ),
  ...Object.keys(INTENTIONALLY_UNSET).map(
    (name): [string, string] => [name, "INTENTIONALLY_UNSET"],
  ),
];

// ---------------------------------------------------------------------------
// Source facts, derived from the TypeScript AST
// ---------------------------------------------------------------------------

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const isTestFile = (file: string) =>
  file.includes(`${path.sep}__tests__${path.sep}`) || /\.test\.tsx?$/.test(file);

const shippedFiles: string[] = [
  ...collectSourceFiles(path.join(ROOT, "src")).filter((f) => !isTestFile(f)),
  ...["App.tsx", "index.ts"]
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.existsSync(f)),
];

type SourceFacts = {
  /** EXPO_PUBLIC_* name -> repo-relative files that dereference it. */
  envReads: Map<string, string[]>;
  /** Raw, un-normalized module specifiers as written in import/require. */
  importSpecifiers: Map<string, string[]>;
};

/** True when `node` is `process.env` written as a member expression. */
function isProcessEnv(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  );
}

/** `process.env.FOO = x` and `delete process.env.FOO` are writes, not reads. */
function isWriteTarget(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isDeleteExpression(parent)) return true;
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
}

function analyzeSources(files: string[]): SourceFacts {
  const envReads = new Map<string, string[]>();
  const importSpecifiers = new Map<string, string[]>();

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TSX,
    );

    const recordEnv = (name: string) =>
      envReads.set(name, [...new Set([...(envReads.get(name) ?? []), rel])]);
    const recordImport = (specifier: string) =>
      importSpecifiers.set(specifier, [
        ...new Set([...(importSpecifiers.get(specifier) ?? []), rel]),
      ]);

    const visit = (node: ts.Node): void => {
      // process.env.FOO
      if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
        if (!isWriteTarget(node)) recordEnv(node.name.text);
      }
      // process.env["FOO"]
      if (
        ts.isElementAccessExpression(node) &&
        isProcessEnv(node.expression) &&
        node.argumentExpression &&
        ts.isStringLiteralLike(node.argumentExpression)
      ) {
        if (!isWriteTarget(node)) recordEnv(node.argumentExpression.text);
      }
      // import ... from "spec"  /  export ... from "spec"
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        recordImport(node.moduleSpecifier.text);
      }
      // require("spec") / import("spec")
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
        node.arguments.length > 0 &&
        ts.isStringLiteralLike(node.arguments[0]!)
      ) {
        recordImport((node.arguments[0] as ts.StringLiteralLike).text);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return { envReads, importSpecifiers };
}

const facts = analyzeSources(shippedFiles);

const expoPublicReads = [...facts.envReads.keys()]
  .filter((name) => name.startsWith("EXPO_PUBLIC_"))
  .sort();

// ---------------------------------------------------------------------------
// Capability -> consumer allowlist (hand-maintained on purpose)
// ---------------------------------------------------------------------------

/**
 * Every app.json plugin declares a native capability that ships in the binary
 * and is reviewed by Apple/Google. Each one is mapped HERE, by hand, to the
 * module specifier(s) whose presence in shipped code proves the capability is
 * actually used. This is an explicit allowlist rather than an inferred rule
 * because the plugin name and the runtime consumer are not always the same
 * package — see expo-secure-store below.
 *
 * Match rule: a specifier matches an entry when it is exactly the entry, or a
 * subpath of it ("expo-camera" matches "expo-camera/next"). Entries are
 * therefore as SPECIFIC as the real consumer — listing a bare package where the
 * real proof is a subpath would make the assertion vacuous.
 */
const CAPABILITY_CONSUMERS: Record<string, readonly string[]> = {
  "react-native-nfc-manager": ["react-native-nfc-manager"],
  "expo-camera": ["expo-camera"],
  // NOT consumed directly. Clerk's token cache is the only thing in this app
  // that writes the keychain, and it does so through expo-secure-store. The
  // entry is the exact "@clerk/clerk-expo/token-cache" subpath, NOT the bare
  // "@clerk/clerk-expo" package: the bare package is imported anyway for
  // ClerkProvider, so matching at package level would keep passing even if the
  // token cache were removed and the entitlement left stranded.
  "expo-secure-store": ["expo-secure-store", "@clerk/clerk-expo/token-cache"],
  "expo-web-browser": ["expo-web-browser"],
  "expo-font": ["expo-font", "@expo-google-fonts/rubik"],
  "expo-splash-screen": ["expo-splash-screen"],
  "expo-notifications": ["expo-notifications"],
};

const importedSpecifiers = [...facts.importSpecifiers.keys()];

function consumersFor(plugin: string): { specifier: string; files: string[] }[] {
  const accepted = CAPABILITY_CONSUMERS[plugin] ?? [];
  return importedSpecifiers
    .filter((spec) =>
      accepted.some((entry) => spec === entry || spec.startsWith(`${entry}/`)),
    )
    .map((spec) => ({ specifier: spec, files: facts.importSpecifiers.get(spec) ?? [] }));
}

// ---------------------------------------------------------------------------

describe("manifest-vs-code contract", () => {
  it("the source scan found real files and real facts (guards a silently-empty walk)", () => {
    // Without this, a broken ROOT or glob would make every assertion below pass
    // vacuously by scanning zero files.
    expect(shippedFiles.length).toBeGreaterThan(50);
    expect(expoPublicReads.length).toBeGreaterThan(0);
    expect(importedSpecifiers).toContain("react-native");
  });

  it("no eas.json build profile uses `extends` (env resolution below assumes none)", () => {
    // collectDeclaredEnv() reads each profile's own env blocks and does not walk
    // an inheritance chain. If a profile ever gains `extends`, an inherited
    // declaration would be invisible here and produce a WRONG failure verdict —
    // so break loudly on the assumption instead.
    const withExtends = easProfiles
      .filter(([, profile]) => profile.extends !== undefined)
      .map(([name, profile]) => `${name} extends ${profile.extends}`);
    expect(withExtends).toEqual([]);
  });

  /**
   * The env ratchet. A variable the shipped code dereferences with NO statement
   * anywhere about what supplies it is a real defect, and this fails hard on it.
   *
   * It deliberately does NOT require an eas.json declaration: as the CORRECTION
   * block in the file header records, that was the earlier false premise —
   * EAS's server-side environment store is a second, legitimate source that
   * eas.json never mentions. Requiring eas.json would fail on correctly-
   * configured variables, which is exactly the false alarm this replaced.
   *
   * What it does require is that SOMEONE WROTE DOWN the answer, in one of the
   * two registries above. That is the whole protection available here: the repo
   * now states in code which variables it expects EAS to provide, so the
   * invisible dependency is at least a declared one.
   */
  it("(a) every EXPO_PUBLIC_* read by shipped code is accounted for — eas.json profile env, or a registry naming what supplies it", () => {
    const unaccounted = expoPublicReads
      .filter(
        (name) =>
          !declaredEnv.has(name) &&
          !(name in PROVIDED_BY_EAS_ENVIRONMENT) &&
          !(name in INTENTIONALLY_UNSET),
      )
      .map(
        (name) =>
          `${name} (read in ${facts.envReads.get(name)!.join(", ")}) — declare it in an eas.json build profile's env, or register it in PROVIDED_BY_EAS_ENVIRONMENT / INTENTIONALLY_UNSET with a reason`,
      );
    expect(unaccounted).toEqual([]);
  });

  it("(a-exclusive) every EXPO_PUBLIC_* is accounted for in exactly ONE place (a stale registry entry silently lies)", () => {
    // Someone later adds a registered variable to eas.json: without this, the
    // now-wrong registry entry survives forever and keeps asserting that EAS
    // supplies something the repo itself declares.
    const doubled = registeredOutsideEasJson
      .filter(([name]) => declaredEnv.has(name))
      .map(
        ([name, registry]) =>
          `${name} (declared in eas.json ${declaredEnv.get(name)!.join(", ")} AND registered in ${registry} — delete the registry entry)`,
      );
    const inBothRegistries = Object.keys(PROVIDED_BY_EAS_ENVIRONMENT)
      .filter((name) => name in INTENTIONALLY_UNSET)
      .map(
        (name) =>
          `${name} (in PROVIDED_BY_EAS_ENVIRONMENT and INTENTIONALLY_UNSET — it is either supplied or deliberately unset, not both)`,
      );
    expect([...doubled, ...inBothRegistries]).toEqual([]);
  });

  it("(a-registry-reverse) every registered EXPO_PUBLIC_* is still read by shipped code", () => {
    // Mirror of (a-reverse) for the hand-written registries: a variable whose
    // last read site was deleted leaves an entry claiming EAS must keep
    // supplying it. Stale entries are how a registry stops being trustworthy.
    const stale = registeredOutsideEasJson
      .filter(([name]) => !expoPublicReads.includes(name))
      .map(
        ([name, registry]) =>
          `${name} (registered in ${registry}, read by no shipped code — delete the entry)`,
      );
    expect(stale).toEqual([]);
  });

  it("(a-reverse) every EXPO_PUBLIC_* declared in eas.json is actually read by shipped code", () => {
    const dead = [...declaredEnv.keys()]
      .filter((name) => name.startsWith("EXPO_PUBLIC_"))
      .filter((name) => !expoPublicReads.includes(name))
      .map((name) => `${name} (declared in ${declaredEnv.get(name)!.join(", ")}, read nowhere)`);
    expect(dead).toEqual([]);
  });

  it("every app.json plugin has an entry in the CAPABILITY_CONSUMERS allowlist", () => {
    // The ratchet: adding a native capability to app.json without deciding what
    // in the code justifies it fails here, before it reaches App Review.
    const unmapped = declaredPlugins.filter((p) => !(p in CAPABILITY_CONSUMERS));
    expect(unmapped).toEqual([]);
  });

  /**
   * The hard capability check. Paired with the allowlist-completeness test
   * above, the two together assert: every app.json plugin is mapped to a named
   * consumer AND that consumer is really imported by shipped code.
   *
   * NO EXEMPTION LIST, deliberately. A capability whose only consumer is native
   * or config-plugin code with no JS import is a real possibility, and this
   * assertion will fail on it — that failure is the point: it forces a human to
   * write down why the entitlement is justified before App Review asks. If such
   * a capability ever lands, add an explicit exemption constant HERE with a
   * per-entry written justification and check it in this assertion. Do not
   * downgrade this to a console warning: a version of this file did exactly
   * that in a parallel "(c)" test, and the resulting assertion — which
   * re-derived its expectation from its own input — could not fail under any
   * sabotage, including deleting a real consumer import. It was removed.
   */
  it("(b) every native capability declared in app.json has a code consumer", () => {
    const orphaned = declaredPlugins
      .filter((plugin) => plugin in CAPABILITY_CONSUMERS)
      .filter((plugin) => consumersFor(plugin).length === 0)
      .map(
        (plugin) =>
          `${plugin} (no import of ${CAPABILITY_CONSUMERS[plugin]!.join(" | ")})`,
      );
    expect(orphaned).toEqual([]);
  });
});
