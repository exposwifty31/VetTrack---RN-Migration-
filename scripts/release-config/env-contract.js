/**
 * Release-config contract — the ONE place that says which build-time environment
 * variables this app needs, where each one comes from, and how that list is
 * derived from the source rather than hand-kept.
 *
 * WHY THIS FILE EXISTS AS A SHARED MODULE
 * Two consumers need the same facts and must never disagree:
 *   1. src/__tests__/manifest-vs-code.test.ts — the offline cross-artifact suite.
 *   2. scripts/release-preflight.mjs — the CI/release gate that queries EAS.
 * A second copy of the registries in the script is exactly the rot this is meant
 * to prevent: both halves green while asserting different things. The registries
 * therefore live here and the jest suite requires them (see
 * `expoPublicEasEnvironmentRegistry` / `expoPublicIntentionallyUnset`, which
 * reproduce the exact `Record<string, string>` shape that suite consumed before).
 *
 * WHAT IS DERIVED AND WHAT IS DECLARED
 *  - DERIVED (cannot rot): the NAMES. `deriveShippedPublicEnvReads()` walks the
 *    TypeScript AST of shipped source; `deriveConfigEnvReads()` walks app.config.js.
 *    Add a `process.env.EXPO_PUBLIC_NEW_THING` anywhere and the name appears here
 *    with no edit to this file.
 *  - DECLARED (must be written by a human): the DISPOSITION of each name — is it
 *    supplied by an eas.json profile, by an EAS server-side environment, or is
 *    absence the correct state? No local check can read EAS's store, so a human
 *    runs `eas env:list <env>` and records what they saw. The derivation's job is
 *    to make it impossible for a name to exist with NO disposition anywhere.
 *
 * WHY THE REGISTRY IS PER-ENVIRONMENT AND NOT A FLAT SET
 * `EXPO_PUBLIC_API_ORIGIN` being absent from `preview`/`development` is
 * documented-correct (local `.env` supplies it off production). A flat
 * "required everywhere" set would go permanently red on those two environments,
 * which is the false-alarm failure mode the manifest suite spends fifty lines
 * warning against: a safety net that cries wolf burns the signal it exists to
 * carry. Each entry therefore names the environments it is expected in.
 */

const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");

/** Repo root — this file lives at <root>/scripts/release-config/. */
const ROOT = path.resolve(__dirname, "..", "..");

/** The three default EAS environments. `eas env:list` takes exactly these. */
const EAS_ENVIRONMENTS = ["production", "preview", "development"];

// ---------------------------------------------------------------------------
// DECLARED: what supplies each name, and where
// ---------------------------------------------------------------------------

/**
 * Names supplied by EAS's SERVER-SIDE environment store — invisible to every
 * repo-level check, which is precisely why they are written down here.
 *
 * Shape per entry:
 *   environments        — EAS environments the name is expected to be present in.
 *                         `scripts/release-preflight.mjs --env <name>` fails when
 *                         one of these is missing from the live store.
 *   knownGapEnvironments — environments where the name is ABSENT today and that
 *                         absence is a real, understood defect that is not yet
 *                         worth failing a build over (see the note on each). The
 *                         preflight prints these every run under "KNOWN GAP";
 *                         they never affect the exit code, because a gate that is
 *                         permanently red teaches people to ignore red.
 *   why                 — what reads it and what happens when it is missing.
 *
 * Last verified against the live store with `eas env:list <env>` on 2026-08-18
 * (eas-cli 22.0.0, account exposwifty31): production listed 3 names, preview and
 * development listed zero. Re-verify by running `npm run release:preflight`,
 * which performs exactly that comparison and never prints a value.
 */
const EXPECTED_IN_EAS_ENVIRONMENT = {
  EXPO_PUBLIC_API_ORIGIN: {
    environments: ["production"],
    knownGapEnvironments: [],
    why:
      "resolveApiUrl() throws on the first /api/ call without it. Absent from " +
      "preview/development ON PURPOSE — a local .env supplies it there.",
  },
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: {
    environments: ["production"],
    knownGapEnvironments: [],
    why:
      "ClerkProvider throws on mount without it. Same preview/development " +
      "caveat as EXPO_PUBLIC_API_ORIGIN.",
  },
  /**
   * NOT an EXPO_PUBLIC_ variable, and that is the whole point of it being here.
   * The manifest suite's env scan is EXPO_PUBLIC_*-only and covers src/ + App.tsx
   * + index.ts — it does not scan app.config.js at all, so this name was invisible
   * to every check in the repo. Demonstrated 2026-08-18: a probe file reading
   * `process.env.GOOGLE_SERVICES_JSON` left the whole suite green.
   */
  GOOGLE_SERVICES_JSON: {
    environments: ["production"],
    knownGapEnvironments: ["preview", "development"],
    why:
      "app.config.js line 20 sets android.googleServicesFile from it. Type " +
      '"file", visibility SECRET in the production environment.',
    gap:
      "MECHANISM, NOT AN OBSERVATION — zero Android builds have ever run on this " +
      "EAS project, so there is no empirical data point. An Android build on the " +
      "preview or development profile resolves an environment with no variables, " +
      "so this is unset and app.config.js falls back to ./google-services.json — " +
      "which is gitignored and absent from a clean checkout. The build then fails " +
      "at CONFIG RESOLUTION (build-time), not at launch. Fix when an Android " +
      "preview build is first needed: upload the same file to the preview and " +
      "development environments in the EAS dashboard, then move those two names " +
      "out of knownGapEnvironments and into environments.",
  },
};

/**
 * Names whose ABSENCE is the correct default state — nothing supplies them in any
 * profile or any EAS environment, deliberately, and every read site handles unset.
 * Registered explicitly so the accounting stays exhaustive rather than carrying a
 * silent exemption.
 */
const INTENTIONALLY_UNSET = {
  EXPO_PUBLIC_DEV_AUTH: "opt-in, inert when unset — src/lib/dev-auth.ts",
  EXPO_PUBLIC_FRAME_BUDGET_MS:
    "measurement builds only — src/lib/instrumentation/perf.ts",
};

/**
 * The EXPO_PUBLIC_*-only projection of EXPECTED_IN_EAS_ENVIRONMENT, in the exact
 * `Record<string, string>` shape src/__tests__/manifest-vs-code.test.ts consumed
 * when it owned the registry inline.
 *
 * The filter is load-bearing, not cosmetic: that suite's (a-registry-reverse)
 * assertion requires every registered name to be read by SHIPPED SOURCE, and
 * GOOGLE_SERVICES_JSON is read by app.config.js, which that suite does not scan.
 * Handing it the unfiltered registry would fail a passing test for a non-defect.
 */
/** TS parses .tsx, .js and .ts under different grammars; pick by extension. */
function scriptKindFor(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function expoPublicEasEnvironmentRegistry() {
  const out = {};
  for (const [name, entry] of Object.entries(EXPECTED_IN_EAS_ENVIRONMENT)) {
    if (!name.startsWith("EXPO_PUBLIC_")) continue;
    out[name] = `EAS environment: ${entry.environments.join(", ")} only`;
  }
  return out;
}

/** Mirror of the above for INTENTIONALLY_UNSET (all entries are EXPO_PUBLIC_ today). */
function expoPublicIntentionallyUnset() {
  const out = {};
  for (const [name, why] of Object.entries(INTENTIONALLY_UNSET)) {
    if (name.startsWith("EXPO_PUBLIC_")) out[name] = why;
  }
  return out;
}

/** Names that must be present in the live EAS store for `environment`. */
function requiredNamesFor(environment) {
  return Object.entries(EXPECTED_IN_EAS_ENVIRONMENT)
    .filter(([, entry]) => entry.environments.includes(environment))
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Known, understood absences for `environment` — reported, never fatal.
 *
 * NOTE ON THE COUNT THE PREFLIGHT PRINTS. `unregisteredInStore` counts names the
 * live store holds that are not REQUIRED for that environment, and a gap entry is
 * by definition not required. So the moment someone actually fixes a gap — uploads
 * GOOGLE_SERVICES_JSON to `preview`, say — that environment starts reporting
 * `unregisteredInStore=1` while still listing the gap. That is remediation working,
 * not drift. Move the name out of `knownGapEnvironments` into `environments` in the
 * same change and both readings settle.
 */
function knownGapsFor(environment) {
  return Object.entries(EXPECTED_IN_EAS_ENVIRONMENT)
    .filter(([, entry]) => (entry.knownGapEnvironments ?? []).includes(environment))
    .map(([name, entry]) => ({ name, gap: entry.gap ?? entry.why }));
}

// ---------------------------------------------------------------------------
// DERIVED: names the source actually reads
// ---------------------------------------------------------------------------

/**
 * `SourceFile.parseDiagnostics` is @internal and absent from the public type.
 * Read through a narrow cast for the same reason the jest suite does: parser
 * recovery silently DISCARDS every fact after a syntax error, so "no reads
 * found" and "file did not parse" are indistinguishable without checking.
 */
function parseDiagnosticsOf(sourceFile) {
  return sourceFile.parseDiagnostics ?? [];
}

/** True when `node` is `process.env` written as a member expression. */
function isProcessEnv(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  );
}

/** `process.env.FOO = x` and `delete process.env.FOO` are writes, not reads. */
function isWriteTarget(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isDeleteExpression(parent)) return true;
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
}

/**
 * Collect `process.env.NAME` / `process.env["NAME"]` READS from `files`.
 *
 * Member access only, matching Expo's own babel transform, which inlines member
 * expressions and nothing else — a destructured `const { EXPO_PUBLIC_X } =
 * process.env` is never inlined and is a different defect, out of scope here.
 *
 * ScriptKind is chosen PER EXTENSION. In a `.ts` file `<string>raw` is a legal
 * type assertion; parsed as TSX the same text is an unclosed JSX element and the
 * parser discards the remainder of the file. That exact mistake was live in the
 * jest suite until 2026-08-15 and swallowed a real read with everything green.
 *
 * @returns {{ reads: Map<string, string[]>, parseFailures: string[] }}
 */
function collectEnvReads(files, { filter = () => true } = {}) {
  const reads = new Map();
  const parseFailures = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const scriptKind = scriptKindFor(file);
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKind,
    );
    if (parseDiagnosticsOf(sourceFile).length > 0) parseFailures.push(rel);

    const record = (name, node) => {
      if (!filter(name)) return;
      if (isWriteTarget(node)) return;
      reads.set(name, [...new Set([...(reads.get(name) ?? []), rel])]);
    };

    const visit = (node) => {
      if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
        record(node.name.text, node);
      } else if (
        ts.isElementAccessExpression(node) &&
        isProcessEnv(node.expression) &&
        node.argumentExpression &&
        ts.isStringLiteralLike(node.argumentExpression)
      ) {
        record(node.argumentExpression.text, node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return { reads, parseFailures };
}

const isTestFile = (file) =>
  file.includes(`${path.sep}__tests__${path.sep}`) || /\.test\.tsx?$/.test(file);

function collectSourceFiles(dir, out = []) {
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

/**
 * EXPO_PUBLIC_* read by SHIPPED code: every non-test .ts/.tsx under src/, plus
 * the root entry files App.tsx and index.ts. Tests are excluded because they
 * assign process.env themselves, so their reads are not build-time requirements.
 */
function deriveShippedPublicEnvReads() {
  const files = [
    ...collectSourceFiles(path.join(ROOT, "src")).filter((f) => !isTestFile(f)),
    ...["App.tsx", "index.ts"]
      .map((f) => path.join(ROOT, f))
      .filter((f) => fs.existsSync(f)),
  ];
  return collectEnvReads(files, {
    filter: (name) => name.startsWith("EXPO_PUBLIC_"),
  });
}

/**
 * EVERY `process.env.*` read by the Expo config itself (app.config.js). Not
 * filtered to EXPO_PUBLIC_*: the config runs in Node at build time, so a
 * non-public name there is a legitimate — and, as GOOGLE_SERVICES_JSON shows,
 * build-fatal — dependency that the EXPO_PUBLIC_*-only scan cannot see.
 */
function deriveConfigEnvReads() {
  const files = ["app.config.js"]
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.existsSync(f));
  return collectEnvReads(files);
}

/** name -> eas.json profiles declaring it, across profile.env and profile.<platform>.env. */
function declaredInEasJson() {
  const easJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, "eas.json"), "utf8"),
  );
  const declared = new Map();
  const add = (key, where) =>
    declared.set(key, [...(declared.get(key) ?? []), where]);
  for (const [profileName, profile] of Object.entries(easJson.build ?? {})) {
    for (const key of Object.keys(profile.env ?? {})) add(key, profileName);
    for (const platform of ["ios", "android"]) {
      for (const key of Object.keys(profile[platform]?.env ?? {})) {
        add(key, `${profileName}.${platform}`);
      }
    }
  }
  return declared;
}

module.exports = {
  ROOT,
  EAS_ENVIRONMENTS,
  EXPECTED_IN_EAS_ENVIRONMENT,
  INTENTIONALLY_UNSET,
  expoPublicEasEnvironmentRegistry,
  expoPublicIntentionallyUnset,
  requiredNamesFor,
  knownGapsFor,
  deriveShippedPublicEnvReads,
  deriveConfigEnvReads,
  declaredInEasJson,
};
