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
 * PARSING IS PART OF THE CONTRACT, NOT AN IMPLEMENTATION DETAIL
 * The same argument cuts against a careless AST walk. `ScriptKind` is chosen
 * PER EXTENSION — `.tsx` parses as TSX, everything else as TS — because in a
 * `.ts` file `<string>raw` is a legal type assertion while under TSX it is an
 * unclosed JSX element, and the parser then recovers by discarding the rest of
 * the file. Facts after that point are not reported as missing; they are simply
 * never produced, which is indistinguishable from their not existing. A blanket
 * ScriptKind.TSX was in force here until 2026-08-15 and was demonstrated to
 * swallow a real `process.env.EXPO_PUBLIC_*` read with the whole suite green.
 * Because choosing the right mode is necessary but not sufficient — a genuinely
 * malformed file recovers the same way — every file's `parseDiagnostics` is
 * collected and a non-empty set fails the suite outright.
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
 * THE TABLES MOVED; THE REASONING DID NOT. Both registries now live in
 * scripts/release-config/env-contract.js, because scripts/release-preflight.mjs
 * enforces the same facts against the LIVE EAS store and a second copy here
 * would be precisely the rot this suite exists to catch — two halves green while
 * asserting different things.
 *
 * THE EXPO_PUBLIC_ FILTER BELOW IS LOAD-BEARING, NOT COSMETIC. The shared table
 * also carries GOOGLE_SERVICES_JSON, which app.config.js reads to set
 * android.googleServicesFile. This suite's scan covers src/ + App.tsx + index.ts
 * and does not look at app.config.js at all — demonstrated 2026-08-18, a probe
 * file reading process.env.GOOGLE_SERVICES_JSON left all 14 tests green — so
 * handing the registry in unfiltered would fail (a-registry-reverse) for a
 * non-defect. The preflight is what covers that name.
 *
 * NOTHING IN THIS TEST CAN CONFIRM AN ENTRY. Reading the real store needs
 * network and EAS auth, which do not belong in a unit test. An entry is a
 * written, checked-in statement that a human ran `npx eas env:list <env>` and
 * saw the variable; `npm run release:preflight` is what actually verifies it.
 */
const envContract = require("../../scripts/release-config/env-contract.js") as {
  expoPublicEasEnvironmentRegistry(): Record<string, string>;
  expoPublicIntentionallyUnset(): Record<string, string>;
  deriveShippedPublicEnvReads(): {
    reads: Map<string, string[]>;
    parseFailures: string[];
  };
};

const PROVIDED_BY_EAS_ENVIRONMENT: Record<string, string> =
  envContract.expoPublicEasEnvironmentRegistry();

/**
 * Variables whose ABSENCE is the correct default state. Nothing supplies these
 * in any build profile or any EAS environment, and that is deliberate — every
 * read site already handles unset. Registered explicitly so assertion (a) stays
 * exhaustive rather than carrying a silent exemption. Same shared source, same
 * EXPO_PUBLIC_ projection, for the reason given above.
 */
const INTENTIONALLY_UNSET: Record<string, string> =
  envContract.expoPublicIntentionallyUnset();

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
  /** Files whose parse did NOT come back clean — see the guard test below. */
  parseFailures: string[];
};

/**
 * `SourceFile.parseDiagnostics` is marked `@internal` in TypeScript and is not
 * present on the public `ts.SourceFile` type, so it is read through a narrow
 * boundary cast — the same technique used for the node builtins above, and for
 * the same reason: getting at what is needed without widening anything shared.
 *
 * The public alternative, `ts.createProgram(...).getSyntacticDiagnostics(file)`,
 * was rejected: it needs a real CompilerHost over 200+ files and reports
 * module-resolution failures that have nothing to do with whether a file
 * parsed. The `?? []` makes a future TypeScript that drops the field degrade to
 * "no failures" rather than throwing. Be clear about what that costs: the guard
 * test then passes unconditionally and NOTHING else in this suite notices —
 * the non-vacuity test above checks that files were scanned, not that they
 * parsed, so it cannot cover this. A TypeScript upgrade that removes the field
 * silently retires the guard; re-check this cast when the version moves.
 */
const parseDiagnosticsOf = (sourceFile: ts.SourceFile): readonly ts.Diagnostic[] =>
  (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics ?? [];

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
  const parseFailures: string[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    // A `.ts` file is NOT TSX, and the two grammars genuinely disagree. In .ts,
    // `<string>raw` is a legal type assertion; parsed as TSX the same text is an
    // unclosed JSX element, and everything after it is lost to parser recovery —
    // an EXPO_PUBLIC_* read below that point simply never reaches this walk.
    // Verified: a .ts file holding `<string>raw` followed by
    // `process.env.EXPO_PUBLIC_X` reported ZERO env reads under a blanket
    // ScriptKind.TSX and the whole suite stayed green.
    const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKind,
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

    // Picking the right ScriptKind is necessary but NOT sufficient. Any file
    // that fails to parse for any other reason recovers silently and drops the
    // facts after the error, exactly the same way — so record the failure
    // rather than trusting the walk that ran over the wreckage.
    const diagnostics = parseDiagnosticsOf(sourceFile);
    if (diagnostics.length > 0) {
      const first = ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " ");
      const more = diagnostics.length > 1 ? ` (+${diagnostics.length - 1} more)` : "";
      parseFailures.push(`${rel}: ${first}${more}`);
    }
  }

  return { envReads, importSpecifiers, parseFailures };
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
// Config-plugin-shipping packages, DISCOVERED rather than hand-listed
// ---------------------------------------------------------------------------

/**
 * The allowlist above can only ever check packages someone already thought to
 * put in it. This second layer is derived from the two real artifacts instead —
 * what the code imports, crossed with what the installed package actually ships
 * — so a native package in NEITHER app.json nor CAPABILITY_CONSUMERS is still
 * caught.
 *
 * A package ships an Expo config plugin iff `app.plugin.js` exists at its
 * package root: that is the exact file Expo's own config-plugin resolver looks
 * for when it resolves a bare `"expo-camera"` string in app.json's `plugins`.
 * Shipping one is precisely what makes a package able to inject native config —
 * permission strings, entitlements, Info.plist and manifest edits. A package
 * with no `app.plugin.js` has nothing for app.json to declare, so its absence
 * from app.json cannot produce the missing-native-config defect this guards.
 *
 * `fs.existsSync` follows the pnpm symlink from `node_modules/<pkg>` into
 * `.pnpm/<hash>/node_modules/<pkg>`, so this resolves on this repo's layout.
 */

/** "expo-camera/next" -> "expo-camera"; "@clerk/clerk-expo/x" -> "@clerk/clerk-expo". */
function packageRootOf(specifier: string): string | null {
  // Relative, absolute, and the "@/" -> src/* tsconfig alias are not packages.
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/")
  ) {
    return null;
  }
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
  }
  return segments[0] ?? null;
}

const importedPackages: string[] = [
  ...new Set(
    importedSpecifiers
      .map(packageRootOf)
      .filter((pkg): pkg is string => pkg !== null),
  ),
].sort();

const pluginShippingPackages = importedPackages.filter((pkg) =>
  fs.existsSync(path.join(ROOT, "node_modules", pkg, "app.plugin.js")),
);

const filesImporting = (pkg: string): string[] => [
  ...new Set(
    importedSpecifiers
      .filter((spec) => packageRootOf(spec) === pkg)
      .flatMap((spec) => facts.importSpecifiers.get(spec) ?? []),
  ),
];

/**
 * Packages that ship an `app.plugin.js` but are deliberately NOT declared in
 * app.json. Each entry is a written statement of why that specific plugin is
 * unnecessary — not a blanket exemption, and not "it seems fine".
 */
const PLUGIN_NOT_REQUIRED: Record<string, string> = {
  // Its config plugin is a NO-OP unless given props. withStatusBar() calls
  // resolveProps(props) and returns the config UNCHANGED when that yields
  // undefined, which is exactly what happens with no props; it writes
  // UIStatusBarStyle / android:windowLightStatusBar only when `hidden` or
  // `style` is passed (read from expo-status-bar@57.0.1
  // plugin/build/withStatusBar.js, 2026-08-15). The runtime <StatusBar>
  // component App.tsx imports works independently of the plugin, so declaring
  // it bare in app.json would change nothing in the binary.
  "expo-status-bar":
    "plugin is a no-op without props; runtime <StatusBar> needs no native config",
};

// ---------------------------------------------------------------------------

describe("manifest-vs-code contract", () => {
  it("the source scan found real files and real facts (guards a silently-empty walk)", () => {
    // Without this, a broken ROOT or glob would make every assertion below pass
    // vacuously by scanning zero files.
    expect(shippedFiles.length).toBeGreaterThan(50);
    expect(expoPublicReads.length).toBeGreaterThan(0);
    expect(importedSpecifiers).toContain("react-native");
  });

  it("every shipped file parsed cleanly (parser recovery silently drops every fact after the error)", () => {
    // A recovered parse is the quiet version of a broken scan: the walk still
    // runs, still reports facts, and simply omits everything past the error —
    // so assertions below pass on an incomplete picture rather than failing.
    // This is the same argument as the header's "a comment is not a
    // PropertyAccessExpression", carried one step further: a fact the parser
    // never produced is indistinguishable from a fact that does not exist.
    expect(facts.parseFailures).toEqual([]);
  });

  it("parseDiagnosticsOf still reads a real TypeScript field (guards the `?? []` degradation)", () => {
    // The guard above is only as good as the internal field it reads. If a
    // TypeScript upgrade drops `parseDiagnostics`, `parseDiagnosticsOf` returns
    // [] for EVERY file, `facts.parseFailures` is always empty, and that guard
    // passes unconditionally — a test that silently stops testing.
    //
    // The reader's own comment already names this and says "re-check this cast
    // when the version moves". That depends on a human remembering. This probe
    // does not: it parses a source that CANNOT parse and requires a diagnostic,
    // so the upgrade breaks HERE, loudly, instead of retiring the guard quietly.
    const unparseable = ts.createSourceFile(
      "probe.ts",
      "const = ;",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    expect(parseDiagnosticsOf(unparseable).length).toBeGreaterThan(0);
  });

  it("the config-plugin discovery found real packages (guards a vacuous Layer-2 pass)", () => {
    // A wrong ROOT or a missing node_modules would discover zero
    // plugin-shipping packages and make (b-derived) below pass without checking
    // anything — the same vacuous-pass failure mode the source-scan guard above
    // exists for. Both named packages ship an app.plugin.js and are imported by
    // shipped code, so this is a fact about the repo, not about the assertion.
    expect(pluginShippingPackages).toEqual(
      expect.arrayContaining(["expo-camera", "react-native-nfc-manager"]),
    );
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

  it("(a-shared-scan) the shared env-contract scan reports exactly what this suite's scan reports", () => {
    // scripts/release-config/env-contract.js re-implements the AST walk so the
    // CI preflight can run it outside jest, and two implementations of one fact
    // is a rot risk in its own right. This is the assertion that keeps them one
    // fact: if it fails they have diverged, and the fix is the divergence, never
    // a relaxation here. (The registries themselves are NOT duplicated — they
    // are imported from that module above.)
    const shared = envContract.deriveShippedPublicEnvReads();
    expect(shared.parseFailures).toEqual([]);
    expect([...shared.reads.keys()].sort()).toEqual([...expoPublicReads].sort());
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
   * The hard capability check — ONE of the two directions. Paired with the
   * allowlist-completeness test above, these two assert: every app.json plugin
   * is mapped to a named consumer AND that consumer is really imported by
   * shipped code. That is the manifest→code direction only. The code→manifest
   * direction — shipped code imports a native package that app.json never
   * declares — is NOT covered by this test or the one above, and is checked by
   * (b-reverse) and (b-derived) below; an earlier version of this header
   * claimed the pair covered "the capability contract" and overstated it.
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

  /**
   * The MIRROR of (b), and the defect (b) structurally cannot see. (b) iterates
   * `declaredPlugins`, so DELETING a declaration makes (b) — and the
   * allowlist-completeness test — pass trivially by having one fewer thing to
   * check. Verified: removing the `expo-camera` entry from app.json while
   * expo-camera stayed imported left the entire suite green.
   *
   * The runtime consequence is invisible to every other check in this repo. The
   * JS module still resolves and still imports, so nothing fails at build time;
   * the config plugin simply never runs, so the permission strings,
   * entitlements and Info.plist / manifest edits it would have injected are
   * absent from the binary. The app then fails on device the first time it
   * touches the capability — a camera prompt with no NSCameraUsageDescription
   * is an immediate iOS crash.
   *
   * This layer is keyed on CAPABILITY_CONSUMERS, which lets it see aliases:
   * `expo-secure-store` is never imported directly in this app, only
   * `@clerk/clerk-expo/token-cache` is, so the import-derived (b-derived) below
   * cannot require its declaration. This one can. The two are complementary,
   * not redundant.
   */
  it("(b-reverse) every allowlisted capability whose consumer is imported is declared in app.json", () => {
    const undeclared = Object.keys(CAPABILITY_CONSUMERS)
      .filter((plugin) => !declaredPlugins.includes(plugin))
      .map((plugin) => ({ plugin, consumers: consumersFor(plugin) }))
      .filter(({ consumers }) => consumers.length > 0)
      .map(
        ({ plugin, consumers }) =>
          `${plugin} (consumed via ${consumers.map((c) => c.specifier).join(", ")} in ${consumers.flatMap((c) => c.files).join(", ")}, but app.json declares no such plugin — its config plugin never runs and its native config is missing from the binary)`,
      );
    expect(undeclared).toEqual([]);
  });

  /**
   * The hole CodeRabbit flagged in its own proposal: a reverse check keyed only
   * on CAPABILITY_CONSUMERS cannot see a package that is in neither artifact.
   * This closes it by DERIVING the candidate set instead of hand-listing it —
   * every imported package that actually ships an `app.plugin.js` must be
   * declared in app.json or carry a written reason it needs no declaration.
   * Adding `expo-location` to package.json, importing it, and never touching
   * app.json now fails here with no allowlist edit required.
   *
   * WHAT IS STILL NOT COVERED, stated rather than inherited silently:
   *  - A plugin-shipping package consumed ONLY by native or config-plugin code
   *    with no JS import is invisible to an import-derived scan. That is the
   *    same deliberate gap (b) documents above, and the same answer applies:
   *    it surfaces as a failure a human must justify in writing.
   *  - A declaration that is PRESENT but mis-parameterized — wrong permission
   *    string, wrong channel id — passes every check here. This suite proves a
   *    capability is declared and used, never that its config is correct.
   */
  it("(b-derived) every imported package shipping a config plugin is declared in app.json or registered as not needing one", () => {
    const undeclared = pluginShippingPackages
      .filter((pkg) => !declaredPlugins.includes(pkg))
      .filter((pkg) => !(pkg in PLUGIN_NOT_REQUIRED))
      .map(
        (pkg) =>
          `${pkg} (imported by ${filesImporting(pkg).join(", ")} and ships node_modules/${pkg}/app.plugin.js, but app.json declares no plugin for it — add it to app.json plugins, or register it in PLUGIN_NOT_REQUIRED with the reason its plugin is unnecessary)`,
      );
    expect(undeclared).toEqual([]);
  });

  it("(b-derived-registry) every PLUGIN_NOT_REQUIRED entry is still an imported plugin-shipping package", () => {
    // Same staleness rule as (a-registry-reverse). An entry excusing a package
    // that is no longer imported, or that no longer ships a config plugin, is a
    // standing exemption for a situation that stopped existing — which is how a
    // registry quietly turns into a blanket exemption list.
    const stale = Object.keys(PLUGIN_NOT_REQUIRED)
      .filter((pkg) => !pluginShippingPackages.includes(pkg))
      .map(
        (pkg) =>
          `${pkg} (registered in PLUGIN_NOT_REQUIRED but ${importedPackages.includes(pkg) ? "no longer ships an app.plugin.js" : "is no longer imported by shipped code"} — delete the entry)`,
      );
    expect(stale).toEqual([]);
  });
});
