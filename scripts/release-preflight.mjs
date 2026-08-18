#!/usr/bin/env node
/**
 * Release preflight — makes the release configuration self-checking.
 *
 * Three defects this repo could not previously see, each now a check:
 *
 *   (A) EAS ENVIRONMENT DRIFT. The launch-critical variables are not in this
 *       repository at all; they live in EAS's server-side environment store.
 *       Delete one there and nothing here notices. This queries EAS for the
 *       NAMES an environment holds and fails when a required one is missing.
 *
 *   (B) BUILD-NUMBER COLLISION. eas.json sets appVersionSource "local" with
 *       autoIncrement false on every profile, and no workflow touches a version.
 *       Nothing bumps anything, so a repeat production build ships a duplicate
 *       CFBundleVersion and App Store Connect rejects it at upload — after the
 *       build minutes are spent. This refuses a number EAS already consumed.
 *
 *   (C) ANDROID APP LINKS. autoVerify: true is a promise the served
 *       assetlinks.json has to keep. This fetches it and checks coverage, and
 *       prints the standing Play-App-Signing blocker with the exact owner
 *       commands (see scripts/release-config/android-app-links.js for why that
 *       blocker is reported rather than made fatal).
 *
 * MODES
 *   --offline   Only what needs no network and no credentials: version-field
 *               sanity and env ACCOUNTING (every name the source reads has a
 *               disposition somewhere). This is the PR-side gate.
 *   (default)   Everything above plus the three networked checks.
 *
 * VALUE SAFETY IS STRUCTURAL. `eas env:list` prints plain-text values. This
 * script parses that output for NAMES ONLY, into a Set that is used purely as a
 * membership test, and every name it PRINTS is drawn from this repo's own source
 * scan. No string originating in the EAS store can reach stdout. It never passes
 * --include-sensitive or --include-file-content, and it redacts stderr before
 * echoing it.
 */

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const contract = require("./release-config/env-contract.js");
const checks = require("./release-config/checks.js");
const appLinks = require("./release-config/android-app-links.js");

const ROOT = contract.ROOT;
const OFFLINE = process.argv.includes("--offline");

const failures = [];
const notes = [];
const fail = (line) => failures.push(line);
const say = (line) => process.stdout.write(`${line}\n`);
const section = (title) => say(`\n── ${title} ──`);

const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));

// ---------------------------------------------------------------------------
// Shelling out to eas-cli
// ---------------------------------------------------------------------------

/**
 * Redact before echoing anything the CLI wrote to stderr. `KEY=VALUE` becomes
 * `KEY=<redacted>` and any `Value ...` row is dropped outright, so a diagnostic
 * stays readable ("Not logged in", "Nonexistent flag") without a value ever
 * reaching a CI log.
 */
function redact(text) {
  return String(text ?? "")
    .split("\n")
    .filter((line) => !/^\s*Value\b/.test(line))
    .map((line) => line.replace(/(=)(\S+)/g, "$1<redacted>"))
    .slice(0, 8)
    .join("\n");
}

/**
 * PINNED, not `@latest`. This repo's CI already runs repo-owned binaries
 * (`./node_modules/.bin/expo`, `./node_modules/.bin/patch-package`) rather than
 * resolving a version at run time, and this gate has a stronger reason to
 * follow that rule than they do: `easEnvironmentNames()` parses the CLI's
 * human-readable output with a fixed regex. An unpinned CLI therefore turns a
 * cosmetic upstream format change into a red gate on a commit that changed
 * nothing — the false alarm that teaches people to ignore the gate. 22.0.0 is
 * the version the env contract was verified against (see env-contract.js).
 * Raise both together, deliberately, or not at all.
 */
const EAS_BIN = path.join(ROOT, "node_modules", ".bin", "eas");

/**
 * The repo-owned binary, not `npx` — the same rule ci.yml states for `expo` and
 * `patch-package` ("not `npx`, which can fetch an unpinned release and run its
 * scripts"). This gate had the strongest reason of the three to follow it: it
 * runs in a job holding EXPO_TOKEN, so a lifecycle script executing there runs
 * beside a credential. `npm ci --ignore-scripts` now covers eas-cli too, and the
 * lockfile carries an integrity hash for every package in its tree.
 *
 * HONEST COST, measured not assumed: vendoring eas-cli takes `npm audit` from
 * 21 advisories to 33 (+1 low, +9 moderate, +2 high). Those packages were ALWAYS
 * executed — `npx eas-cli@22.0.0` fetches the identical tree — so this does not
 * add runtime risk; it makes existing risk visible to audit and lets
 * --ignore-scripts apply to it. The real cost is that `npm ci` on every CI run
 * now installs a tree only the workflow_dispatch job uses.
 */
function eas(args) {
  const res = spawnSync(EAS_BIN, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
    // No default timeout on spawnSync either; a hung CLI would otherwise sit
    // until the workflow's job cap and report nothing.
    timeout: 5 * 60 * 1000,
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

/**
 * Hard error, never a skip. A "skip when unauthenticated" branch would skip on
 * every CI run today and report green — the fake pass this whole file exists to
 * prevent. The networked half is instead confined to a workflow the owner
 * triggers, and it says exactly what is missing when it cannot run.
 */
function requireCredentials() {
  if (process.env.EXPO_TOKEN) return;
  if (process.env.CI) {
    fail(
      "EXPO_TOKEN is not set, and this run is in CI. The EAS-backed checks " +
        "cannot run without it and are NOT being skipped. Owner: create a token " +
        "at https://expo.dev/settings/access-tokens then\n" +
        "    gh secret set EXPO_TOKEN --repo exposwifty31/VetTrack---RN-Migration-",
    );
    report();
  }
  notes.push(
    "No EXPO_TOKEN: using the local `eas login` session (fine on a workstation).",
  );
}

// ---------------------------------------------------------------------------
// Offline: every name the source reads has a disposition somewhere
// ---------------------------------------------------------------------------

/**
 * Where a derived env name is accounted for — declared in an eas.json profile,
 * expected in the EAS server-side store, deliberately unset, or nowhere at all.
 * Extracted from the reporting loop: as a nested ternary it was both unreadable
 * and the bulk of that function's cognitive complexity (S3358, S3776).
 */
function dispositionOf(name, declared) {
  if (declared.has(name)) return `eas.json ${declared.get(name).join(", ")}`;
  if (name in contract.EXPECTED_IN_EAS_ENVIRONMENT) {
    return `EAS store: ${contract.EXPECTED_IN_EAS_ENVIRONMENT[name].environments.join(", ")}`;
  }
  if (name in contract.INTENTIONALLY_UNSET) return "intentionally unset";
  return "UNACCOUNTED";
}

function checkEnvAccounting() {
  section("env accounting (offline)");

  const shipped = contract.deriveShippedPublicEnvReads();
  const config = contract.deriveConfigEnvReads();
  const parseFailures = [...shipped.parseFailures, ...config.parseFailures];
  if (parseFailures.length > 0) {
    // Parser recovery DISCARDS every fact after a syntax error, so an unparsed
    // file reports zero reads — indistinguishable from a file with none.
    fail(`files did not parse cleanly, so their env reads are unknown: ${parseFailures.join(", ")}`);
  }

  const declared = contract.declaredInEasJson();
  // UNION the file lists, do not overwrite. `new Map([...a, ...b])` keeps only
  // the last value per key, so a name read in BOTH shipped source and
  // app.config.js reported only the app.config.js sites — and the audit line
  // below, whose whole job is to say where each name is read, would have hidden
  // one of them.
  const derived = new Map();
  for (const [name, files] of [...shipped.reads, ...config.reads]) {
    derived.set(name, [...new Set([...(derived.get(name) ?? []), ...files])]);
  }
  if (derived.size === 0) {
    fail("the source scan found ZERO env reads — the walk is broken, not the app");
  }

  const unaccounted = [];
  for (const [name, files] of derived) {
    const accounted =
      declared.has(name) ||
      name in contract.EXPECTED_IN_EAS_ENVIRONMENT ||
      name in contract.INTENTIONALLY_UNSET;
    if (!accounted) {
      unaccounted.push(
        `${name} (read in ${files.join(", ")}) — add it to an eas.json profile's env, ` +
          "or register it in EXPECTED_IN_EAS_ENVIRONMENT / INTENTIONALLY_UNSET " +
          "in scripts/release-config/env-contract.js with a reason",
      );
    }
  }
  for (const line of unaccounted) fail(line);

  const registered = [
    ...Object.keys(contract.EXPECTED_IN_EAS_ENVIRONMENT),
    ...Object.keys(contract.INTENTIONALLY_UNSET),
  ];
  for (const name of registered) {
    if (!derived.has(name)) {
      fail(
        `${name} is registered in env-contract.js but no shipped source or app.config.js ` +
          "reads it — delete the entry, a stale registry stops being trustworthy",
      );
    }
  }

  say(`derived ${derived.size} env name(s) from source; all accounted: ${unaccounted.length === 0}`);
  // Sorted by NAME explicitly: `derived` is a Map, so its entries are
  // [name, files] arrays and a bare .sort() would compare their stringified
  // form. That happens to order correctly today only because the name comes
  // first in the pair (javascript:S2871).
  for (const [name, files] of [...derived].sort(([a], [b]) => a.localeCompare(b))) {
    say(`  ${name.padEnd(36)} ${dispositionOf(name, declared)}   [${files.join(", ")}]`);
  }
}

function checkVersionFields() {
  section("version fields (offline)");
  const res = checks.validateVersionFields({
    buildNumber: appJson.expo?.ios?.buildNumber,
    versionCode: appJson.expo?.android?.versionCode,
  });
  for (const p of res.problems) fail(p);
  say(
    `ios.buildNumber=${appJson.expo?.ios?.buildNumber} ` +
      `android.versionCode=${appJson.expo?.android?.versionCode} -> ${res.ok ? "well-formed" : "INVALID"}`,
  );
}

// ---------------------------------------------------------------------------
// (A) EAS environment drift
// ---------------------------------------------------------------------------

/**
 * NAMES ONLY. `--format long` prints one `Name  <NAME>` row per variable; the
 * returned Set is used exclusively for membership tests and is never printed.
 */
function easEnvironmentNames(environment) {
  const res = eas(["env:list", environment, "--format", "long"]);
  if (!res.ok) {
    fail(
      `eas env:list ${environment} exited ${res.status}. Redacted stderr:\n${redact(res.stderr)}`,
    );
    return null;
  }
  const names = new Set();
  for (const line of res.stdout.split("\n")) {
    const m = /^Name\s+([A-Za-z_]\w*)\s*$/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

function checkEasEnvDrift() {
  section("(A) EAS environment drift");
  for (const environment of contract.EAS_ENVIRONMENTS) {
    const required = contract.requiredNamesFor(environment);
    const present = easEnvironmentNames(environment);
    if (present === null) continue;

    const result = checks.compareEnvPresence({ required, present });
    say(
      `${environment.padEnd(12)} required=${required.length} ` +
        `satisfied=${result.satisfied.length} ` +
        `presentInStore=${result.presentCount} ` +
        `unregisteredInStore=${result.unregisteredCount}`,
    );
    for (const name of result.missing) {
      fail(
        `EAS environment "${environment}" is MISSING ${name} — ` +
          `${contract.EXPECTED_IN_EAS_ENVIRONMENT[name].why} ` +
          `Restore it at https://expo.dev/accounts/${appJson.expo.owner}/projects/${appJson.expo.slug}/environment-variables`,
      );
    }
    for (const gap of contract.knownGapsFor(environment)) {
      notes.push(`KNOWN GAP  ${environment}/${gap.name}: ${gap.gap}`);
    }
  }
}

// ---------------------------------------------------------------------------
// (B) Build-number collision
// ---------------------------------------------------------------------------

/** Page through build:list (its --limit is capped at 50) up to a bounded depth. */
function priorBuildVersions(platform) {
  const collected = [];
  const PAGE = 50;
  for (let page = 0; page < 4; page += 1) {
    const res = eas([
      "build:list",
      "--platform",
      platform,
      "--limit",
      String(PAGE),
      "--offset",
      String(page * PAGE),
      "--json",
      "--non-interactive",
    ]);
    if (!res.ok) {
      fail(
        `eas build:list --platform ${platform} exited ${res.status}. Redacted stderr:\n${redact(res.stderr)}`,
      );
      return null;
    }
    let builds;
    try {
      builds = JSON.parse(res.stdout);
    } catch {
      fail(`eas build:list --platform ${platform} did not return JSON`);
      return null;
    }
    // Same defect class as assetlinksCoverage: the try covers only the parse,
    // so a well-formed JSON object (rather than an array) reached .map and threw
    // outside it. Fixing that one instance and not this sibling is how a class
    // of bug survives a fix.
    if (!Array.isArray(builds)) {
      fail(`eas build:list --platform ${platform} did not return a JSON array`);
      return null;
    }
    collected.push(...builds.map((b) => b.appBuildVersion));
    if (builds.length < PAGE) break;
  }
  return collected;
}

function checkBuildNumbers() {
  section("(B) build-number collision");
  const locals = {
    ios: appJson.expo?.ios?.buildNumber,
    android: appJson.expo?.android?.versionCode,
  };
  for (const platform of ["ios", "android"]) {
    const prior = priorBuildVersions(platform);
    if (prior === null) continue;
    const res = checks.refusesDuplicateBuildNumber({
      platform,
      local: locals[platform],
      prior,
    });
    say(
      `${platform.padEnd(8)} local=${locals[platform]} ` +
        `priorBuilds=${prior.length} highestConsumed=${res.highestPrior ?? "none"} -> ` +
        (res.ok ? "ok" : "REFUSED"),
    );
    if (!res.ok) fail(`${res.reason}\n    Fix: ${res.suggestion}`);
  }
}

// ---------------------------------------------------------------------------
// (C) Android App Links
// ---------------------------------------------------------------------------

async function checkAssetLinks() {
  section("(C) Android App Links (assetlinks.json)");
  const packageName = appJson.expo?.android?.package;
  const hosts = appLinks.autoVerifiedHosts(appJson);
  if (hosts.length === 0) {
    say("no autoVerify'd https intent filter in app.json — nothing to check");
    return;
  }

  for (const host of hosts) {
    const url = `https://${host}/.well-known/assetlinks.json`;
    let servedDoc;
    try {
      // Node's fetch has NO default timeout. A host that accepts the connection
      // and never answers would block until the workflow's 15-minute job cap,
      // producing no result for ANY host. The existing catch reports the abort
      // as a fetch failure.
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        fail(`${url} returned HTTP ${res.status} — autoVerify cannot succeed`);
        continue;
      }
      servedDoc = await res.json();
    } catch (err) {
      fail(`${url} could not be fetched: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const res = checks.assetlinksCoverage({
      servedDoc,
      packageName,
      expected: appLinks.EXPECTED_FINGERPRINTS,
    });
    say(`${url} -> ${res.ok ? "covers every expected fingerprint" : "INCOMPLETE"}`);
    for (const problem of res.problems) fail(`${url}: ${problem}`);
  }

  const b = appLinks.PLAY_APP_SIGNING_BLOCKER;
  say("");
  say(`  BLOCKED (${b.id}) — reported, deliberately NOT fatal:`);
  say(`  ${b.headline}`);
  for (const line of b.diagnosis) say(`    - ${line}`);
  say("  Owner actions:");
  for (const line of b.ownerActions) say(`    ${line}`);
  say(`  Note: ${b.sideNote}`);
}

// ---------------------------------------------------------------------------

function report() {
  if (notes.length > 0) {
    section("notes");
    for (const n of notes) say(`  ${n}`);
  }
  section(failures.length === 0 ? "PASS" : `FAIL (${failures.length})`);
  for (const f of failures) say(`  x ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

async function main() {
  say(`release preflight (${OFFLINE ? "offline" : "full"})`);
  checkEnvAccounting();
  checkVersionFields();
  if (!OFFLINE) {
    requireCredentials();
    checkEasEnvDrift();
    checkBuildNumbers();
    await checkAssetLinks();
  } else {
    notes.push("--offline: EAS env drift, build-number and assetlinks checks were NOT run.");
  }
  report();
}

await main();
